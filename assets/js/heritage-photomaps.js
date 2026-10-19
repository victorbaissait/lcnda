/* LCNDA — 📸 Cartes de photos : des cartes à soi où l'on pose des photos et des vidéos, à un endroit et à une date.
 *  - Cartes (module Carte) → mode « 📸 Cartes de photos » : choisir une carte ou « Toutes mes cartes », créer, modifier ;
 *  - Listes → « Cartes de photos » (barre H10, Liste | Fiches avec une mosaïque, ＋ Nouvelle carte, suppression ↶ Annuler) ;
 *  - widget « 📸 Carte de photos » (tableau de bord, onglets à soi) et bloc de Fiches ;
 *  - ajout depuis la base (openMediaPicker, plusieurs, images et vidéos) ou par import (E4 « 📁 Glisse… ») : le GPS et la
 *    date de prise de vue sont lus par le serveur (lib/photomaps.php) ; sans GPS → tiroir « À placer » (glisser sur la carte
 *    ou choisir un lieu de la base) ; on corrige en glissant le repère (« ↶ Annuler », « ↺ Revenir au GPS ») ;
 *  - vignettes rondes ou carrées, grappes avec leur nombre, ▶ et durée des vidéos, filtre Tout / 📷 Photos / 🎬 Vidéos,
 *    « le trajet » dans l'ordre du temps ; la frise (heritage-photomaps-time.js) : histogramme, période choisie à la souris,
 *    zoom des siècles aux secondes, ▶ Lecture avec un pas au choix (« 1 mois 12 j 3 h »), fenêtre cumulative ou glissante.
 * Fichiers : assets/css/photomaps.css, lib/photomaps.php. Chargé après app.js, app-ui.js, app-picker.js, app-media-picker.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || {};
    const T = window.LCNDA_PMTIME;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['dashboard', 'dashboardConfig', 'lists']) ext[k] = ext[k] || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = body => api('photomap_write', {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const store = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const thumbUrl = it => `api.php?action=photomap_thumb&m=${Number(it.media_id)}&v=${encodeURIComponent(it.tv || '')}`;
    const mediaUrl = it => `media/${encodeURIComponent(it.filename || '')}`;
    const dur = s => { s = Math.round(Number(s) || 0); if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
    const COLORS = ['#0066cc', '#cc4700', '#2f8f5b', '#7a47db', '#c0392b', '#a07a00', '#00838f', '#d6336c', '#555555'];
    const color = c => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '#0066cc');
    const SRC_LABEL = {gps: '🛰 par le GPS du fichier', manual: '✋ posée à la main', place: '📍 par un lieu de la base', '': 'pas encore placée'};
    const tzLabel = tz => (!tz ? '' : tz === 'UTC' ? 'heure universelle (UTC)' : tz.startsWith('~') ? `fuseau estimé d’après la position (UTC${tz.slice(1)})` : `UTC${tz}`);

    /* ═════════════════ Le moteur de carte (tuiles, grappes, trajet) ═════════════════ */
    const CELL = 84, ZMIN = 2, ZMAX = 19;
    function createMap(stage, o) {
        stage.classList.add('pm-stage');
        stage.innerHTML = `<div class="pm-tiles map-tiles" aria-hidden="true"></div><svg class="pm-track" aria-hidden="true"></svg><div class="pm-markers"></div>
            <div class="pm-zoom"><button type="button" class="icon-button" data-pmz="1" aria-label="Zoomer" title="Zoomer">＋</button><button type="button" class="icon-button" data-pmz="-1" aria-label="Dézoomer" title="Dézoomer">−</button><button type="button" class="icon-button" data-pmz="fit" aria-label="Tout voir" title="Tout voir">⤢</button></div>
            <div class="pm-now" hidden></div><div class="pm-tile-note" hidden>Fond de carte indisponible (pas d’Internet ?) : les photos restent à leur place.</div>`;
        const tilesEl = stage.querySelector('.pm-tiles'), svg = stage.querySelector('.pm-track'), mk = stage.querySelector('.pm-markers');
        const m = {z: 6, lat: 46.6, lon: 2.4, bg: o.bg || 'bw', points: [], track: false, trackColor: null, shape: o.shape || 'round', editable: !!o.editable, colorOf: o.colorOf || (() => '#0066cc')};
        const tiles = new Map(), marks = new Map();
        const bgClass = () => { stage.className = `${stage.className.replace(/\bmap-bg-\S+/g, '').trim()} map-bg-${m.bg}`; };
        bgClass();
        let raf = 0, tileErr = 0;
        const X = (lon, z) => A().lngToX(lon, z), Y = (lat, z) => A().latToY(lat, z);
        const box = () => ({w: stage.clientWidth || 600, h: stage.clientHeight || 400});
        const origin = () => { const {w, h} = box(); return {left: X(m.lon, m.z) - w / 2, top: Y(m.lat, m.z) - h / 2, w, h}; };
        m.toLatLon = (sx, sy) => { const {left, top} = origin(); return {lat: A().yToLat(top + sy, m.z), lon: ((A().xToLng(left + sx, m.z) + 540) % 360) - 180}; };
        m.schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
        function drawTiles(left, top, w, h) {
            const z = m.z, n = 2 ** z, want = new Set();
            if (m.bg !== 'grid') {
                for (let x = Math.floor(left / 256); x <= Math.floor((left + w) / 256); x++) for (let y = Math.floor(top / 256); y <= Math.floor((top + h) / 256); y++) {
                    if (y < 0 || y >= n) continue;
                    const key = `${z}/${x}/${y}`; want.add(key);
                    let img = tiles.get(key);
                    if (!img) {
                        img = document.createElement('img'); img.className = 'map-tile'; img.alt = ''; img.draggable = false; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
                        img.addEventListener('error', () => { img.style.visibility = 'hidden'; if (++tileErr > 3) stage.querySelector('.pm-tile-note').hidden = false; }, {once: true});
                        img.src = A().mapTileUrl(m.bg, z, ((x % n) + n) % n, y); tiles.set(key, img); tilesEl.appendChild(img);
                    }
                    img.style.transform = `translate(${Math.round(x * 256 - left)}px,${Math.round(y * 256 - top)}px)`;
                }
            }
            tiles.forEach((img, key) => { if (!want.has(key)) { img.remove(); tiles.delete(key); } });
        }
        /** les grappes : une grille de CELL px en coordonnées du monde (stable quand on déplace la carte) */
        function clusters(left, top, w, h) {
            const z = m.z, cells = new Map();
            for (const p of m.points) {
                if (p._z !== z) { p._wx = X(p.lon, z); p._wy = Y(p.lat, z); p._z = z; }
                const sx = p._wx - left, sy = p._wy - top;
                if (sx < -CELL || sy < -CELL || sx > w + CELL || sy > h + CELL) continue;
                const key = `${Math.floor(p._wx / CELL)}:${Math.floor(p._wy / CELL)}`;
                let c = cells.get(key);
                if (!c) cells.set(key, c = {key, list: [], sx: 0, sy: 0});
                c.list.push(p); c.sx += sx; c.sy += sy;
            }
            return [...cells.values()].map(c => ({...c, x: c.sx / c.list.length, y: c.sy / c.list.length, rep: c.list[0]}));
        }
        function markerHtml(c) {
            const it = c.rep.it, n = c.list.length, vid = it.kind === 'video';
            return `<img src="${esc(thumbUrl(it))}" alt="" loading="lazy" draggable="false" onerror="this.classList.add('is-broken')">${vid ? `<span class="pm-play" aria-hidden="true">▶</span>${it.dur ? `<span class="pm-dur">${esc(dur(it.dur))}</span>` : ''}` : ''}${n > 1 ? `<span class="pm-count">${n.toLocaleString('fr-FR')}</span>` : ''}`;
        }
        function draw() {
            const {left, top, w, h} = origin();
            drawTiles(left, top, w, h);
            const cs = clusters(left, top, w, h), want = new Set();
            for (const c of cs) {
                const k = `${c.key}|${c.list.length}|${c.rep.it.id}`; want.add(k);
                let el = marks.get(k);
                if (!el) {
                    el = document.createElement('button'); el.type = 'button';
                    el.className = `pm-mk is-${m.shape}${c.rep.it.kind === 'video' ? ' is-video' : ''}${c.list.length > 1 ? ' is-cluster' : ''}${m.editable && c.list.length === 1 ? ' is-movable' : ''}`;
                    el.innerHTML = markerHtml(c); el._c = c;
                    el.setAttribute('aria-label', c.list.length > 1 ? `${c.list.length} photos et vidéos ici : clic pour les séparer` : `${c.rep.it.title || 'Photo'}${c.rep.it.date_text ? ' — ' + c.rep.it.date_text : ''}`);
                    el.title = c.list.length > 1 ? `${plural(c.list.length, 'élément')} : clic pour zoomer` : [c.rep.it.title, c.rep.it.date_text, c.rep.it.caption].filter(Boolean).join(' — ');
                    marks.set(k, el); mk.appendChild(el);
                }
                el._c = c;
                el.style.setProperty('--c', m.colorOf(c.rep.it));
                el.style.transform = `translate(${Math.round(c.x)}px,${Math.round(c.y)}px)`;
            }
            marks.forEach((el, k) => { if (!want.has(k) && el !== dragging?.el) { el.remove(); marks.delete(k); } });
            drawTrack(left, top, w, h);
        }
        function drawTrack(left, top, w, h) {
            if (!m.track) { svg.innerHTML = ''; return; }
            const groups = new Map();
            m.points.filter(p => p.t != null).forEach(p => { const g = m.trackColor ? m.colorOf(p.it) : 'one'; (groups.get(g) || groups.set(g, []).get(g)).push(p); });
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h);
            let html = '';
            groups.forEach((pts, g) => {
                if (pts.length < 2) return;
                pts.sort((a, b) => a.t - b.t);
                const z = m.z, d = pts.slice(0, 6000).map((p, i) => { if (p._z !== z) { p._wx = X(p.lon, z); p._wy = Y(p.lat, z); p._z = z; } return `${i ? 'L' : 'M'}${(p._wx - left).toFixed(1)} ${(p._wy - top).toFixed(1)}`; }).join('');
                html += `<path d="${d}" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="8 5" opacity=".85" stroke="${esc(g === 'one' ? '#cc4700' : g)}"></path>`;
            });
            svg.innerHTML = html;
        }
        m.setPoints = (pts, {track = m.track, trackColor = false} = {}) => { m.points = pts; m.track = track; m.trackColor = trackColor; mk.innerHTML = ''; marks.clear(); m.schedule(); };
        m.setBg = bg => { m.bg = bg || 'bw'; bgClass(); tilesEl.innerHTML = ''; tiles.clear(); tileErr = 0; stage.querySelector('.pm-tile-note').hidden = true; m.schedule(); };
        m.setShape = s => { m.shape = s === 'square' ? 'square' : 'round'; mk.innerHTML = ''; marks.clear(); m.schedule(); };
        m.zoomAt = (dz, sx, sy) => {
            const nz = Math.max(ZMIN, Math.min(ZMAX, m.z + dz)); if (nz === m.z) return;
            const {w, h} = box(); sx ??= w / 2; sy ??= h / 2;
            const at = m.toLatLon(sx, sy);
            m.z = nz;
            const cx = X(at.lon, nz) - (sx - w / 2), cy = Y(at.lat, nz) - (sy - h / 2);
            m.lon = A().xToLng(cx, nz); m.lat = Math.max(-85, Math.min(85, A().yToLat(cy, nz)));
            o.onView?.(); m.schedule();
        };
        m.fit = (pts = m.points) => {
            const ok = pts.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
            if (!ok.length) { m.z = 5; m.lat = 46.6; m.lon = 2.4; m.schedule(); return; }
            let la = ok.map(p => p.lat).sort((a, b) => a - b), lo = ok.map(p => p.lon).sort((a, b) => a - b);
            if (ok.length > 40) { const a = Math.floor(ok.length * .02), b = Math.ceil(ok.length * .98) - 1; la = la.slice(a, b + 1); lo = lo.slice(a, b + 1); } // quelques photos très loin ne réduisent pas tout
            const [minLa, maxLa, minLo, maxLo] = [la[0], la[la.length - 1], lo[0], lo[lo.length - 1]], {w, h} = box();
            m.lat = (minLa + maxLa) / 2; m.lon = (minLo + maxLo) / 2; m.z = ZMIN;
            for (let z = 16; z >= ZMIN; z--) { if (Math.abs(X(maxLo, z) - X(minLo, z)) <= w - 100 && Math.abs(Y(minLa, z) - Y(maxLa, z)) <= h - 100) { m.z = z; break; } }
            o.onView?.(); m.schedule();
        };
        m.setView = v => { if (v && Number.isFinite(v.z)) { m.z = v.z; m.lat = v.lat; m.lon = v.lon; m.schedule(); } };
        m.view = () => ({z: m.z, lat: m.lat, lon: m.lon});
        m.showNow = text => { const n = stage.querySelector('.pm-now'); n.hidden = !text; n.textContent = text || ''; };
        /* déplacer la carte, zoomer (molette, boutons, deux doigts), cliquer, glisser un repère */
        let pan = null, dragging = null, lastWheel = 0;
        stage.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('.pm-zoom')) return;
            const el = e.target.closest('.pm-mk');
            if (el) { dragging = {el, x: e.clientX, y: e.clientY, moved: false, c: el._c}; el.setPointerCapture(e.pointerId); return; }
            pan = {x: e.clientX, y: e.clientY, lat: m.lat, lon: m.lon, moved: false}; stage.setPointerCapture(e.pointerId); stage.classList.add('is-panning');
        });
        stage.addEventListener('pointermove', e => {
            if (dragging) {
                const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
                if (!dragging.moved && Math.hypot(dx, dy) > 5) { if (!(m.editable && dragging.c.list.length === 1)) { pan = {x: dragging.x, y: dragging.y, lat: m.lat, lon: m.lon, moved: true}; dragging = null; stage.classList.add('is-panning'); return; } dragging.moved = true; dragging.el.classList.add('is-dragging'); }
                if (dragging.moved) { const r = stage.getBoundingClientRect(); dragging.el.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`; }
                return;
            }
            if (!pan) return;
            const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (Math.hypot(dx, dy) > 3) pan.moved = true;
            const cx = X(pan.lon, m.z) - dx, cy = Y(pan.lat, m.z) - dy;
            m.lon = A().xToLng(cx, m.z); m.lat = Math.max(-85, Math.min(85, A().yToLat(cy, m.z))); m.schedule();
        });
        const up = e => {
            stage.classList.remove('is-panning');
            if (dragging) {
                const d = dragging; dragging = null; d.el.classList.remove('is-dragging');
                if (d.moved) { const r = stage.getBoundingClientRect(), ll = m.toLatLon(e.clientX - r.left, e.clientY - r.top); o.onMove?.(d.c.rep.it, ll.lat, ll.lon); m.schedule(); return; }
                const c = d.c;
                if (c.list.length > 1) {
                    const la = c.list.map(p => p.lat), lo = c.list.map(p => p.lon), spread = Math.max(...la) - Math.min(...la) + Math.max(...lo) - Math.min(...lo);
                    if (spread > 1e-7 && m.z < ZMAX) { const before = m.z; m.fit(c.list); if (m.z <= before) { m.z = before; m.zoomAt(2, c.x, c.y); } return; }
                }
                o.onOpen?.(c.rep.it, c.list.map(p => p.it));
                return;
            }
            if (pan && pan.moved) o.onView?.();
            pan = null;
        };
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { pan = null; dragging = null; stage.classList.remove('is-panning'); });
        stage.addEventListener('contextmenu', e => { const el = e.target.closest('.pm-mk'); if (el && el._c.list.length === 1 && o.onEdit) { e.preventDefault(); o.onEdit(el._c.rep.it); } });
        stage.addEventListener('wheel', e => { e.preventDefault(); const now = Date.now(); if (now - lastWheel < 120) return; lastWheel = now; const r = stage.getBoundingClientRect(); m.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
        stage.addEventListener('dblclick', e => { if (e.target.closest('.pm-mk,.pm-zoom')) return; const r = stage.getBoundingClientRect(); m.zoomAt(1, e.clientX - r.left, e.clientY - r.top); });
        stage.querySelector('.pm-zoom').addEventListener('click', e => { const b = e.target.closest('[data-pmz]'); if (!b) return; if (b.dataset.pmz === 'fit') m.fit(); else m.zoomAt(Number(b.dataset.pmz)); });
        stage.tabIndex = 0;
        stage.addEventListener('keydown', e => { const k = {'+': 1, '=': 1, '-': -1}[e.key]; if (k) { e.preventDefault(); m.zoomAt(k); } });
        let pinch = 0;
        UI().bindPinch?.(stage, (f, x, y) => { pinch += Math.log2(f); if (Math.abs(pinch) >= .7) { const r = stage.getBoundingClientRect(); m.zoomAt(pinch > 0 ? 1 : -1, x - r.left, y - r.top); pinch = 0; } });
        new ResizeObserver(() => m.schedule()).observe(stage);
        m.stage = stage;
        return m;
    }

    /* ═════════════════ La frise : histogramme, période, zoom, lecture pas à pas ═════════════════ */
    const TIME_KEY = 'lcnda-photomaps-time';
    const QUICK_STEPS = [['1 h', '1 heure'], ['1 j', '1 jour'], ['1 sem', '1 semaine'], ['1 mois', '1 mois'], ['1 an', '1 an'], ['10 ans', '10 ans']];
    const SPEEDS = [['0.5', '½ pas par seconde'], ['1', '1 pas par seconde'], ['2', '2 pas par seconde'], ['4', '4 pas par seconde'], ['8', '8 pas par seconde'], ['20', '20 pas par seconde']];
    function createTimeline(host, {onChange, compact = false} = {}) {
        const saved = {group: 'auto', step: '1 mois', win: 'cumul', winText: '1 an', speed: '2', ...store.get(TIME_KEY, {})};
        const tl = {times: [], undated: 0, view: null, sel: null, play: null, playing: false, group: saved.group, step: T.parseStep(saved.step)?.step || {mo: 1}, stepText: saved.step,
            win: ['cumul', 'step', 'custom'].includes(saved.win) ? saved.win : 'cumul', winText: saved.winText, winStep: T.parseStep(saved.winText)?.step || {y: 1}, speed: SPEEDS.some(([v]) => Number(v) === Number(saved.speed)) ? Number(saved.speed) : 2};
        const remember = () => store.set(TIME_KEY, {group: tl.group, step: tl.stepText, win: tl.win, winText: tl.winText, speed: String(tl.speed)});
        host.classList.add('pm-time');
        host.innerHTML = `<div class="pm-time-row">
                <span class="pm-time-play"><button type="button" class="icon-button" data-tl="prev" title="Pas précédent" aria-label="Pas précédent">⏮</button><button type="button" class="button small" data-tl="play">▶ Lecture</button><button type="button" class="icon-button" data-tl="next" title="Pas suivant" aria-label="Pas suivant">⏭</button></span>
                ${compact ? '' : `<label class="pm-time-step"><span>Pas</span><span class="pm-step-box"><input type="text" data-tl="step" value="${esc(tl.stepText)}" spellcheck="false" autocomplete="off" aria-describedby="pm-step-help" placeholder="1 mois 12 j 3 h"><small class="pm-step-help" data-tl="stephelp" aria-live="polite"></small></span></label>
                <span class="pm-quick" role="group" aria-label="Pas rapides">${QUICK_STEPS.map(([v, l]) => `<button type="button" class="pm-chip" data-tl-quick="${esc(v)}" title="Avancer de ${esc(l)}">${esc(v)}</button>`).join('')}</span>
                <label class="pm-time-win"><span>Fenêtre</span><select data-tl="win"><option value="cumul">cumulative (tout ce qui précède reste)</option><option value="step">glissante : la largeur du pas</option><option value="custom">glissante : une durée au choix…</option></select></label>
                <span class="pm-step-box" data-tl="winbox" hidden><input type="text" data-tl="wintext" value="${esc(tl.winText)}" spellcheck="false" autocomplete="off" aria-label="Largeur de la fenêtre"><small class="pm-step-help" data-tl="winhelp"></small></span>
                <label class="pm-time-speed"><span>Vitesse</span><select data-tl="speed">${SPEEDS.map(([v, l]) => `<option value="${v}" ${Number(v) === tl.speed ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label class="pm-time-group"><span>Regrouper</span><select data-tl="group"><option value="auto">selon le zoom</option><option value="h">par heure</option><option value="d">par jour</option><option value="mo">par mois</option><option value="y">par année</option></select></label>`}
                <span class="pm-time-info" data-tl="info"></span><button type="button" class="link-button" data-tl="clear" hidden>Tout effacer</button>
            </div>
            <div class="pm-hist" data-tl="hist" tabindex="0" aria-label="Frise : glisse pour choisir une période, molette pour zoomer, double-clic pour tout voir"><svg></svg></div>`;
        const $ = s => host.querySelector(s), svg = $('[data-tl=hist] svg'), hist = $('[data-tl=hist]');
        if (!compact) { $('[data-tl=win]').value = tl.win; $('[data-tl=group]').value = tl.group; }
        const domain = () => { if (!tl.times.length) return null; const a = tl.times[0], b = tl.times[tl.times.length - 1], pad = Math.max(T.HOUR, (b - a) * .03); return [a - pad, b + pad]; };
        const lower = v => { let lo = 0, hi = tl.times.length; while (lo < hi) { const md = (lo + hi) >> 1; if (tl.times[md] < v) lo = md + 1; else hi = md; } return lo; };
        const countIn = (a, b) => lower(b) - lower(a);
        const winStart = p => (tl.win === 'cumul' ? -Infinity : T.addStep(p, tl.win === 'step' ? tl.step : tl.winStep, -1));
        /** l'élément daté t est-il montré ? (null : pas de date) */
        tl.accepts = t => {
            if (t == null) return !tl.sel && tl.play == null;
            if (tl.sel && (t < tl.sel[0] || t > tl.sel[1])) return false;
            if (tl.play != null && (t > tl.play || t <= winStart(tl.play))) return false;
            return true;
        };
        tl.prec = () => { const u = tl.step; return u.h || u.mi || u.s ? 'time' : u.d || u.w ? 'day' : u.mo ? 'month' : 'year'; };
        function paintInfo() {
            const info = $('[data-tl=info]');
            const shown = tl.times.filter(t => tl.accepts(t)).length;
            let txt = '';
            if (!tl.times.length) txt = tl.undated ? `${plural(tl.undated, 'élément')} sans date : écris une date (✎) pour les voir dans le temps.` : 'Aucune date pour l’instant.';
            else if (tl.sel) txt = `Du ${T.label(tl.sel[0], 'time')} au ${T.label(tl.sel[1], 'time')} · ${plural(shown, 'élément')}`;
            else txt = `${plural(tl.times.length, 'élément daté', 'éléments datés')}${tl.undated ? ` · ${tl.undated} sans date` : ''} · glisse sur la frise pour choisir une période`;
            info.textContent = txt;
            $('[data-tl=clear]').hidden = !tl.sel && tl.play == null;
            $('[data-tl=play]').textContent = tl.playing ? '⏸ Pause' : '▶ Lecture';
            $('[data-tl=play]').disabled = $('[data-tl=prev]').disabled = $('[data-tl=next]').disabled = !tl.times.length;
        }
        function paint() {
            const w = Math.max(200, hist.clientWidth || 600), h = compact ? 46 : 74, axis = 18, top = 4;
            const d = domain();
            if (!d) { svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.innerHTML = `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="pm-hist-empty">Pas de date à montrer</text>`; paintInfo(); return; }
            if (!tl.view) tl.view = d.slice();
            const [v0, v1] = tl.view, span = v1 - v0, px = t => (t - v0) / span * w;
            let unit = T.bucketUnit(tl.group, span);
            if (span / (unit[0] === 'y' ? 365.2 * T.DAY * unit[1] : unit[0] === 'mo' ? 30.4 * T.DAY * unit[1] : { s: T.SEC, mi: T.MIN, h: T.HOUR, d: T.DAY, w: 7 * T.DAY }[unit[0]] * unit[1]) > 1200) unit = T.unitFor(span, 300); // trop de barres : plus gros
            const buckets = []; let b = T.floorTo(v0, unit);
            for (let i = 0; b < v1 && i < 3000; i++) { const nb = T.nextTick(b, unit); buckets.push([b, nb, countIn(b, nb)]); b = nb; }
            const max = Math.max(1, ...buckets.map(x => x[2])), bh = h - axis - top;
            const tickU = T.unitFor(span, Math.max(3, Math.floor(w / 90)));
            let s = buckets.map(([a, z, n]) => { if (!n) return ''; const x0 = Math.max(0, px(a)), x1 = Math.min(w, px(z)), hh = Math.max(2, n / max * bh); const on = !tl.sel || (z > tl.sel[0] && a < tl.sel[1]); const past = tl.play == null || a <= tl.play;
                return `<rect class="pm-hbar${on ? '' : ' is-off'}${past ? '' : ' is-future'}" x="${x0.toFixed(1)}" y="${(top + bh - hh).toFixed(1)}" width="${Math.max(1, x1 - x0 - (x1 - x0 > 4 ? 1 : 0)).toFixed(1)}" height="${hh.toFixed(1)}"><title>${esc(T.tickLabel(a, unit))} : ${plural(n, 'élément')}</title></rect>`; }).join('');
            s += `<line class="pm-axis" x1="0" x2="${w}" y1="${h - axis + .5}" y2="${h - axis + .5}"></line>`;
            s += T.ticks(v0, v1, tickU).map(t => `<line class="pm-tick" x1="${px(t).toFixed(1)}" x2="${px(t).toFixed(1)}" y1="${h - axis}" y2="${h - axis + 4}"></line><text class="pm-tick-l" x="${(px(t) + 3).toFixed(1)}" y="${h - 5}">${esc(T.tickLabel(t, tickU))}</text>`).join('');
            if (tl.sel) { const a = px(tl.sel[0]), z = px(tl.sel[1]); s = `<rect class="pm-sel" x="${a.toFixed(1)}" y="0" width="${Math.max(2, z - a).toFixed(1)}" height="${h - axis}"></rect><rect class="pm-sel-h" data-h="0" x="${(a - 4).toFixed(1)}" y="0" width="8" height="${h - axis}"></rect><rect class="pm-sel-h" data-h="1" x="${(z - 4).toFixed(1)}" y="0" width="8" height="${h - axis}"></rect>` + s; }
            if (tl.play != null) { const x = px(tl.play), ws = winStart(tl.play); if (Number.isFinite(ws)) s = `<rect class="pm-win" x="${px(ws).toFixed(1)}" y="0" width="${Math.max(1, x - px(ws)).toFixed(1)}" height="${h - axis}"></rect>` + s; s += `<line class="pm-head" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${h - axis}"></line>`; }
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('height', h); svg.innerHTML = s;
            paintInfo();
        }
        tl.setTimes = (times, undated) => { tl.times = times.slice().sort((a, b) => a - b); tl.undated = undated; const d = domain(); if (d && (!tl.view || tl.view[1] < d[0] || tl.view[0] > d[1])) tl.view = d.slice(); if (!d) tl.view = null; paint(); };
        tl.setSel = sel => { tl.sel = sel; paint(); onChange?.(); };
        const changed = () => { paint(); onChange?.(); };
        const start = () => (tl.sel ? tl.sel[0] : tl.times[0]);
        const end = () => (tl.sel ? tl.sel[1] : tl.times[tl.times.length - 1]);
        let timer = 0;
        function stop() { tl.playing = false; clearInterval(timer); timer = 0; }
        function step(dir) {
            if (!tl.times.length) return false;
            if (tl.play == null) tl.play = dir > 0 ? start() : end();
            else tl.play = T.addStep(tl.play, tl.step, dir);
            if (!Number.isFinite(tl.play)) { tl.play = null; stop(); changed(); return false; } // pas impossible : on s'arrête
            let done = false;
            if (tl.play >= end()) { tl.play = end(); done = dir > 0; }
            if (tl.play < start()) tl.play = start();
            if (tl.view && (tl.play < tl.view[0] || tl.play > tl.view[1])) { const sp = tl.view[1] - tl.view[0]; tl.view = [tl.play - sp / 2, tl.play + sp / 2]; }
            changed();
            return !done;
        }
        function play() {
            if (tl.playing) { stop(); paint(); return; }
            if (!tl.times.length) return;
            if (tl.play == null || tl.play >= end()) tl.play = null;
            tl.playing = true; step(1);
            timer = setInterval(() => { if (!host.isConnected) { stop(); return; } if (!step(1)) { stop(); paint(); } }, 1000 / tl.speed);
            paint();
        }
        tl.stop = stop;
        host.addEventListener('click', e => {
            const b = e.target.closest('[data-tl],[data-tl-quick]'); if (!b) return;
            const k = b.dataset.tl;
            if (k === 'play') play();
            else if (k === 'next') { stop(); step(1); }
            else if (k === 'prev') { stop(); step(-1); }
            else if (k === 'clear') { stop(); tl.play = null; tl.sel = null; changed(); }
            else if (b.dataset.tlQuick) { const inp = $('[data-tl=step]'); inp.value = b.dataset.tlQuick; inp.dispatchEvent(new Event('input', {bubbles: true})); }
        });
        const stepHelp = (inp, help, set) => {
            const r = T.parseStep(inp.value);
            help.className = `pm-step-help${r ? (r.ok ? ' is-ok' : ' is-warn') : ''}`;
            help.textContent = !r ? '' : r.ok ? `✓ Compris : ${r.label}` : `⚠️ ${r.error.charAt(0).toUpperCase()}${r.error.slice(1)}`;
            if (r?.ok) set(r.step);
        };
        if (!compact) {
            const si = $('[data-tl=step]'), wi = $('[data-tl=wintext]');
            si.addEventListener('input', () => stepHelp(si, $('[data-tl=stephelp]'), st => { tl.step = st; tl.stepText = si.value; remember(); if (tl.play != null) changed(); }));
            wi.addEventListener('input', () => stepHelp(wi, $('[data-tl=winhelp]'), st => { tl.winStep = st; tl.winText = wi.value; remember(); if (tl.play != null) changed(); }));
            [si, wi].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } }));
            stepHelp(si, $('[data-tl=stephelp]'), () => {}); stepHelp(wi, $('[data-tl=winhelp]'), () => {});
            $('[data-tl=winbox]').hidden = tl.win !== 'custom';
            host.addEventListener('change', e => {
                const k = e.target.dataset?.tl;
                if (k === 'win') { tl.win = e.target.value; $('[data-tl=winbox]').hidden = tl.win !== 'custom'; remember(); changed(); }
                if (k === 'speed') { tl.speed = SPEEDS.some(([v]) => Number(v) === Number(e.target.value)) ? Number(e.target.value) : 2; remember(); if (tl.playing) { stop(); play(); } }
                if (k === 'group') { tl.group = e.target.value; remember(); paint(); }
            });
        }
        /* la souris sur la frise : glisser = choisir une période ; poignées = l'ajuster ; molette = zoomer ; double-clic = tout voir */
        let drag = null;
        const tAt = e => { const r = hist.getBoundingClientRect(); return tl.view[0] + (e.clientX - r.left) / r.width * (tl.view[1] - tl.view[0]); };
        hist.addEventListener('pointerdown', e => {
            if (!tl.view || e.button !== 0) return;
            const hnd = e.target.closest?.('.pm-sel-h'), r = hist.getBoundingClientRect(), onAxis = e.clientY - r.top > r.height - 18;
            drag = hnd ? {mode: 'h', h: Number(hnd.dataset.h)} : onAxis ? {mode: 'pan', x: e.clientX, view: tl.view.slice()} : {mode: 'sel', a: tAt(e), moved: false};
            hist.setPointerCapture(e.pointerId);
        });
        hist.addEventListener('pointermove', e => {
            if (!drag) return;
            if (drag.mode === 'pan') { const r = hist.getBoundingClientRect(), dt = (e.clientX - drag.x) / r.width * (drag.view[1] - drag.view[0]); tl.view = [drag.view[0] - dt, drag.view[1] - dt]; paint(); return; }
            const t = tAt(e);
            if (drag.mode === 'h') { const s = tl.sel.slice(); s[drag.h] = t; s.sort((a, b) => a - b); tl.sel = s; paint(); return; }
            if (Math.abs(t - drag.a) > (tl.view[1] - tl.view[0]) / 200) { drag.moved = true; tl.sel = [Math.min(drag.a, t), Math.max(drag.a, t)]; paint(); }
        });
        hist.addEventListener('pointerup', () => {
            if (!drag) return;
            const d = drag; drag = null;
            if (d.mode === 'sel' && !d.moved) { if (tl.sel) { tl.sel = null; changed(); } return; }
            if (d.mode !== 'pan') { stop(); if (tl.play != null && tl.sel && (tl.play < tl.sel[0] || tl.play > tl.sel[1])) tl.play = null; changed(); }
        });
        hist.addEventListener('wheel', e => { if (!tl.view) return; e.preventDefault(); const t = tAt(e), k = e.deltaY < 0 ? 1 / 1.35 : 1.35, d = domain(), full = d[1] - d[0]; let a = t - (t - tl.view[0]) * k, z = t + (tl.view[1] - t) * k; if (z - a < 60 * T.SEC) return; if (z - a > full * 1.2) { [a, z] = d; } tl.view = [a, z]; paint(); }, {passive: false});
        hist.addEventListener('dblclick', () => { tl.view = domain(); paint(); });
        hist.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'k') { e.preventDefault(); play(); } if (e.key === 'ArrowRight') { e.preventDefault(); stop(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); step(-1); } });
        new ResizeObserver(() => paint()).observe(hist);
        tl.paint = paint;
        return tl;
    }

    /* ═════════════════ Données ═════════════════ */
    async function load(mapId) {
        if (mapId === 'all') { const r = await api('photomap_all'); return {all: true, map: null, maps: r.maps || [], items: r.items || []}; }
        const r = await api('photomap', {id: Number(mapId)});
        return {all: false, map: r.map, maps: [r.map], items: r.items || []};
    }
    const toMedia = it => ({id: it.media_id, title: it.title || it.caption || '', filename: it.filename, thumbnail: it.thumbnail, media_type: it.kind === 'video' ? 'video' : (it.media_type || 'image'), description: it.description || '', date_text: it.date_text || '', duration_seconds: it.dur || null});
    function decorate(items) { items.forEach(it => { const ti = T.itemTime(it); it._t = ti ? ti.t : null; it._exact = !!ti?.exact; }); items.sort((a, b) => (a._t ?? Infinity) - (b._t ?? Infinity) || a.pos - b.pos || a.id - b.id); return items; }

    /* ═════════════════ L'écran d'une carte (ou de toutes) ═════════════════ */
    /**
     * mount(host, {mapId, embed, config, onBack}) : dessine la carte de photos dans host.
     *  embed : version widget (pas d'édition, frise courte) ; config : {type: 'all'|'image'|'video', period: 'texte C4', track, height}
     */
    async function mount(host, opts = {}) {
        const embed = !!opts.embed, cfg = opts.config || {};
        host.innerHTML = UI().spinner ? UI().spinner('Chargement de la carte…') : '<p class="muted">Chargement…</p>';
        let data;
        try { data = await load(opts.mapId || 'all'); }
        catch (e) { host.innerHTML = A().empty(e.status === 404 ? 'Cette carte de photos n’existe plus.' : e.message); return null; }
        if (!host.isConnected) return null;
        decorate(data.items);
        const editable = !embed && !kiosk() && !data.all;
        const mapColor = new Map(data.maps.map((mp, i) => [mp.id, color(mp.color || COLORS[i % COLORS.length])]));
        const V = {type: embed ? (cfg.type || 'all') : store.get('lcnda-photomaps-type', 'all'), hidden: new Set(store.get('lcnda-photomaps-hidden', [])), track: embed ? !!cfg.track : (data.all ? store.get('lcnda-photomaps-track-all', false) : !!data.map?.show_track)};
        if (embed && cfg.period) { const p = T.parseDate(cfg.period); if (p) V.period = [p.from, p.to]; }
        const mp = data.map || {name: 'Toutes mes cartes', color: '#0066cc', shape: store.get('lcnda-photomaps-shape', 'round'), background: ''};
        const bgOf = () => A().mapBackgroundValue?.(mp.background || A().readDesignSettings?.().mapBackground) || 'bw';
        const shape = data.all ? store.get('lcnda-photomaps-shape', 'round') : (mp.shape || 'round');
        const counts = () => { const its = data.items.filter(it => !data.all || !V.hidden.has(it.map_id)); return {all: its.length, image: its.filter(i => i.kind === 'image').length, video: its.filter(i => i.kind === 'video').length}; };
        const head = embed ? '' : `<header class="page-header pm-head" style="--pm-c:${esc(color(mp.color))}"><div><span class="eyebrow">${data.all ? 'CARTES DE PHOTOS · TOUTES' : 'CARTE DE PHOTOS'}</span><h2><span class="pm-dot" aria-hidden="true"></span>📸 ${esc(mp.name || 'Carte sans nom')}</h2>
                ${!data.all ? `<p class="pm-sub">${[mp.description ? esc(mp.description) : '', mp.period_text ? `🗓 ${esc(mp.period_text)}` : '', mp.person_id ? `👤 <button type="button" class="link-button" data-pm="person">${esc(mp.person_name || 'la personne')}</button>` : '', mp.investigation_id ? `🔍 <button type="button" class="link-button" data-pm="inv">${esc(mp.investigation_title || 'l’enquête')}</button>` : ''].filter(Boolean).join(' · ')}</p>` : `<p class="pm-sub">Les photos et vidéos de toutes tes cartes, une couleur par carte. Coche ou décoche les cartes dans la légende.</p>`}</div>
                <div class="page-actions">${editable ? '<button type="button" class="button" data-pm="pick">＋ Photos de l’app</button><button type="button" class="button secondary" data-pm="import">📁 Importer…</button><button type="button" class="button secondary" data-pm="edit">✎ Modifier</button>' : ''}<button type="button" class="button secondary" data-pm="export">⤓ Exporter</button>${opts.onBack ? '<button type="button" class="button secondary" data-pm="back">← Mes cartes</button>' : ''}</div></header>`;
        host.innerHTML = `<section class="pm-screen${embed ? ' is-embed' : ''}" style="--pm-c:${esc(color(mp.color))}">${head}
            <div class="pm-bar">
                <span class="pm-filters" role="group" aria-label="Sorte">${[['all', 'Tout'], ['image', '📷 Photos'], ['video', '🎬 Vidéos']].map(([k, l]) => `<button type="button" class="pm-filter" data-pm-type="${k}">${l} <b data-pm-n="${k}"></b></button>`).join('')}</span>
                ${embed ? '' : `<span class="segmented pm-shape" role="group" aria-label="Forme des vignettes"><button type="button" data-pm-shape="round" title="Vignettes rondes">◯</button><button type="button" data-pm-shape="square" title="Vignettes carrées">▢</button></span>
                <label class="pm-switch"><input type="checkbox" data-pm="track" ${V.track ? 'checked' : ''}> <span>Le trajet</span></label>
                <label class="pm-bg">Fond <select data-pm="bg">${A().mapBackgroundSelectHtml?.(bgOf()) || ''}</select></label>`}
                <span class="pm-visible" data-pm="visible"></span>
                ${embed ? `<button type="button" class="button small secondary" data-pm="open">↗ Ouvrir</button>` : ''}
            </div>
            <div class="pm-main"><div class="pm-stage-host" style="${embed ? `height:${Math.max(220, Math.min(1200, Number(cfg.height) || 380))}px` : ''}"></div>${embed ? '' : '<aside class="pm-side" data-pm="side"></aside>'}</div>
            <div data-pm="time"></div>
            ${editable ? '<div data-pm="drop"></div><div data-pm="progress"></div>' : ''}
        </section>`;
        const root = host.querySelector('.pm-screen'), $ = s => root.querySelector(s);
        const map = createMap($('.pm-stage-host'), {bg: bgOf(), shape, editable, colorOf: it => data.all ? (mapColor.get(it.map_id) || '#0066cc') : color(mp.color),
            onOpen: (it) => openViewer(it), onMove: (it, lat, lon) => moveItem(it, lat, lon, 'manual'), onEdit: editable ? it => editItem(it) : null,
            onView: () => { if (!embed) store.set(viewKey, map.view()); }});
        const viewKey = `lcnda-photomaps-view:${data.all ? 'all' : mp.id}`;
        const tl = createTimeline($('[data-pm=time]'), {compact: embed, onChange: () => refresh(false)});
        if (V.period) tl.sel = V.period;
        let shownList = [];
        function visibleItems() {
            return data.items.filter(it => (V.type === 'all' || it.kind === V.type) && (!data.all || !V.hidden.has(it.map_id)));
        }
        function refresh(retime = true) {
            const base = visibleItems();
            if (retime) tl.setTimes(base.filter(it => it._t != null).map(it => it._t), base.filter(it => it._t == null).length);
            shownList = base.filter(it => tl.accepts(it._t));
            const placed = shownList.filter(it => it.lat != null && it.lon != null);
            map.setPoints(placed.map(it => ({it, lat: it.lat, lon: it.lon, t: it._t})), {track: V.track, trackColor: data.all});
            map.showNow(tl.play != null ? T.label(tl.play, tl.prec()) : '');
            const c = counts();
            Object.entries(c).forEach(([k, n]) => { const b = root.querySelector(`[data-pm-n="${k}"]`); if (b) b.textContent = `(${n.toLocaleString('fr-FR')})`; });
            root.querySelectorAll('[data-pm-type]').forEach(b => b.classList.toggle('is-active', b.dataset.pmType === V.type));
            root.querySelectorAll('[data-pm-shape]').forEach(b => b.classList.toggle('is-active', b.dataset.pmShape === map.shape));
            const unplaced = base.filter(it => it.lat == null).length;
            $('[data-pm=visible]').textContent = `${plural(placed.length, 'sur la carte', 'sur la carte')}${unplaced ? ` · ${unplaced} à placer` : ''}`;
            if (!embed) paintSide();
        }
        /* la colonne : légende (toutes), tiroir « À placer », tous les éléments */
        let sideTab = 'todo';
        function paintSide() {
            const side = $('[data-pm=side]'); if (!side) return;
            const base = visibleItems(), todo = base.filter(it => it.lat == null), list = sideTab === 'todo' ? todo : shownList;
            const legend = data.all ? `<div class="pm-legend"><b>Légende</b>${data.maps.length ? data.maps.map(m2 => `<label class="checkbox-line"><input type="checkbox" data-pm-leg="${m2.id}" ${V.hidden.has(m2.id) ? '' : 'checked'}><span class="pm-legdot" style="background:${esc(mapColor.get(m2.id))}"></span><span class="pm-legname">${esc(m2.name)}</span><small>${(m2.photos || 0) + (m2.videos || 0)}</small></label>`).join('') : '<p class="muted">Aucune carte encore.</p>'}<span class="pm-legall"><button type="button" class="link-button" data-pm="legall">Tout cocher</button> · <button type="button" class="link-button" data-pm="legnone">Tout décocher</button></span></div>` : '';
            side.innerHTML = `${legend}<div class="segmented pm-sidetabs"><button type="button" data-pm-tab="todo" class="${sideTab === 'todo' ? 'is-active' : ''}">À placer (${todo.length})</button><button type="button" data-pm-tab="all" class="${sideTab === 'all' ? 'is-active' : ''}">Affichés (${shownList.length})</button></div>
                ${sideTab === 'todo' && todo.length && editable ? '<p class="pm-hint">Glisse une vignette sur la carte, ou 📍 pour choisir un lieu de ta base.</p>' : ''}
                <ol class="pm-drawer">${list.slice(0, 300).map(it => `<li class="pm-row" data-pm-item="${it.id}">
                    <span class="pm-rthumb${it.kind === 'video' ? ' is-video' : ''}${editable && it.lat == null ? ' is-grab' : ''}" data-pm-grab="${it.id}" title="${editable && it.lat == null ? 'Glisse-moi sur la carte' : 'Ouvrir'}"><img src="${esc(thumbUrl(it))}" alt="" loading="lazy" draggable="false" onerror="this.classList.add('is-broken')">${it.kind === 'video' ? `<i>▶</i>` : ''}</span>
                    <span class="pm-rtxt"><button type="button" class="link-button" data-pm-open="${it.id}">${esc(it.title || it.caption || 'Sans titre')}</button><small>${esc(it.date_text || 'sans date')}${it._t != null && !it._exact && it.date_text ? ' · sans heure' : ''}${data.all ? ` · ${esc(data.maps.find(m2 => m2.id === it.map_id)?.name || '')}` : ''}</small></span>
                    ${editable ? `<span class="pm-ract">${it.lat == null ? `<button type="button" class="icon-button" data-pm-place="${it.id}" title="Choisir un lieu de la base" aria-label="Choisir un lieu">📍</button>` : `<button type="button" class="icon-button" data-pm-goto="${it.id}" title="Voir sur la carte" aria-label="Voir sur la carte">🎯</button>`}<button type="button" class="icon-button" data-pm-edit="${it.id}" title="Modifier : date, légende, personnes, lieu" aria-label="Modifier">✎</button></span>` : (it.lat != null ? `<span class="pm-ract"><button type="button" class="icon-button" data-pm-goto="${it.id}" title="Voir sur la carte" aria-label="Voir sur la carte">🎯</button></span>` : '')}
                </li>`).join('')}</ol>${list.length > 300 ? `<p class="muted">… et ${list.length - 300} autres (choisis une période sur la frise pour les voir).</p>` : ''}
                ${!list.length ? `<p class="muted pm-empty">${sideTab === 'todo' ? (base.length ? 'Tout est placé ✓' : (editable ? 'Carte vide : « ＋ Photos de l’app » ou glisse des fichiers ci-dessous.' : 'Rien sur cette carte pour l’instant.')) : 'Rien à afficher avec ces filtres.'}</p>` : ''}`;
        }
        const byId = id => data.items.find(it => it.id === Number(id));
        function openViewer(it) {
            const ordered = shownList.filter(x => x.lat != null || x === it);
            const list = ordered.length ? ordered : [it];
            const idx = Math.max(0, list.indexOf(it));
            if (A().openLightbox) A().openLightbox(list.map(toMedia), idx, kiosk());
            else window.open(mediaUrl(it), '_blank', 'noopener');
        }
        async function update(it, body, silent = false) {
            const r = await post({op: 'update_item', id: it.id, ...body});
            if (r.item) { Object.assign(it, r.item); decorate([it]); data.items = decorate(data.items); }
            if (!silent) refresh();
            return r.item;
        }
        async function moveItem(it, lat, lon, src) {
            const before = {lat: it.lat, lon: it.lon, src: it.src};
            try { await update(it, {lat, lon, src}); }
            catch (e) { toast(e.message, 'error'); refresh(); return; }
            const back = () => update(it, before.lat == null ? {lat: null, lon: null} : {lat: before.lat, lon: before.lon, src: before.src});
            A().undoToast?.(before.lat == null ? `« ${it.title || 'Photo'} » posée sur la carte` : `« ${it.title || 'Photo'} » déplacée${it.gps ? ' (la position GPS d’origine est gardée : ✎ → « ↺ Revenir au GPS »)' : ''}`,
                {undo: back, redo: () => update(it, {lat, lon, src})});
        }
        /* glisser une vignette du tiroir sur la carte (souris ou doigt) */
        let ghost = null;
        root.addEventListener('pointerdown', e => {
            const g = e.target.closest('[data-pm-grab]'); if (!g || !editable) return;
            const it = byId(g.dataset.pmGrab); if (!it || it.lat != null) return;
            e.preventDefault();
            ghost = {it, x: e.clientX, y: e.clientY, el: null, moved: false, id: e.pointerId}; g.setPointerCapture(e.pointerId);
        });
        root.addEventListener('pointermove', e => {
            if (!ghost) return;
            if (!ghost.moved && Math.hypot(e.clientX - ghost.x, e.clientY - ghost.y) > 4) {
                ghost.moved = true; ghost.el = document.createElement('div'); ghost.el.className = `pm-ghost pm-mk is-${map.shape}`; ghost.el.innerHTML = `<img src="${esc(thumbUrl(ghost.it))}" alt="">`; document.body.appendChild(ghost.el);
                map.stage.classList.add('is-drop-target');
            }
            if (ghost.el) ghost.el.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        });
        root.addEventListener('pointerup', e => {
            if (!ghost) return;
            const g = ghost; ghost = null; g.el?.remove(); map.stage.classList.remove('is-drop-target');
            if (!g.moved) { openViewer(g.it); return; }
            const r = map.stage.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            const ll = map.toLatLon(e.clientX - r.left, e.clientY - r.top);
            moveItem(g.it, ll.lat, ll.lon, 'manual');
        });
        async function placeFromBase(it) {
            const pl = await P().openPicker?.({kind: 'place', title: `Où a été prise « ${it.title || 'cette photo'} » ?`});
            if (!pl) return;
            const lat = Number(pl.lat), lon = Number(pl.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) { try { await update(it, {place_id: pl.id}); } catch (_) {} toast(`« ${pl.title} » n’a pas de coordonnées : glisse la photo sur la carte à la main.`, 'error'); return; }
            try { await update(it, {place_id: pl.id}, true); } catch (e) { toast(e.message, 'error'); return; }
            await moveItem(it, lat, lon, 'place');
        }
        root.addEventListener('click', async e => {
            const b = e.target.closest('button,[data-pm-leg]'); if (!b) return;
            const d = b.dataset;
            if (d.pmType) { V.type = d.pmType; if (!embed) store.set('lcnda-photomaps-type', V.type); refresh(); return; }
            if (d.pmShape) { map.setShape(d.pmShape); if (data.all) store.set('lcnda-photomaps-shape', d.pmShape); else if (editable) { try { await post({op: 'save_map', ...mapBody(mp), shape: d.pmShape}); mp.shape = d.pmShape; } catch (x) { toast(x.message, 'error'); } } refresh(false); return; }
            if (d.pmTab) { sideTab = d.pmTab; paintSide(); return; }
            if (d.pmOpen) { const it = byId(d.pmOpen); if (it) openViewer(it); return; }
            if (d.pmEdit) { const it = byId(d.pmEdit); if (it) editItem(it); return; }
            if (d.pmPlace) { const it = byId(d.pmPlace); if (it) placeFromBase(it); return; }
            if (d.pmGoto) { const it = byId(d.pmGoto); if (it && it.lat != null) { map.z = Math.max(map.z, 15); map.lat = it.lat; map.lon = it.lon; map.schedule(); } return; }
            const k = d.pm;
            if (k === 'legall') { V.hidden.clear(); store.set('lcnda-photomaps-hidden', []); refresh(); }
            if (k === 'legnone') { data.maps.forEach(m2 => V.hidden.add(m2.id)); store.set('lcnda-photomaps-hidden', [...V.hidden]); refresh(); }
            if (k === 'pick') addFromBase();
            if (k === 'import') chooseFiles();
            if (k === 'edit') editMap(mp, saved => { if (saved) reload(); });
            if (k === 'export') exportMap();
            if (k === 'back') opts.onBack?.();
            if (k === 'open') { S().mapMode = 'photos'; S().photomapId = opts.mapId || 'all'; store.set('lcnda-photomaps-current', S().photomapId); A().persistUiState?.(); A().setModule('carte'); }
            if (k === 'person' && mp.person_id) A().openPersonById?.(mp.person_id);
            if (k === 'inv' && mp.investigation_id) { S().currentInvestigationId = mp.investigation_id; S().enquetesTab = 'enquetes'; A().setModule('enquetes'); }
        });
        root.addEventListener('change', async e => {
            const t = e.target;
            if (t.dataset.pmLeg) { const id = Number(t.dataset.pmLeg); if (t.checked) V.hidden.delete(id); else V.hidden.add(id); store.set('lcnda-photomaps-hidden', [...V.hidden]); refresh(); return; }
            if (t.dataset.pm === 'track') { V.track = t.checked; if (data.all) store.set('lcnda-photomaps-track-all', V.track); else if (editable) { try { await post({op: 'save_map', ...mapBody(mp), show_track: V.track}); mp.show_track = V.track; } catch (x) { toast(x.message, 'error'); } } refresh(false); }
            if (t.dataset.pm === 'bg') { map.setBg(A().mapBackgroundValue(t.value)); if (editable) { try { await post({op: 'save_map', ...mapBody(mp), background: t.value}); mp.background = t.value; } catch (x) { toast(x.message, 'error'); } } }
        });
        /* ajouter : depuis la base (fenêtre unique), ou des fichiers de l'ordinateur (E4) */
        async function addFromBase() {
            const list = await P().openMediaPicker?.({multiple: true, types: ['image', 'video'], eyebrow: 'CARTE DE PHOTOS', title: `Ajouter à « ${mp.name} »`, okLabel: 'Poser sur la carte', person: mp.person_id || null,
                intro: 'Les photos et vidéos qui ont des coordonnées GPS se placent toutes seules ; les autres vont dans « À placer ».'});
            if (!list?.length) return;
            try {
                const r = await post({op: 'add_media', map_id: mp.id, media_ids: list.map(x => x.id)});
                toast(addedText(r.added?.length || 0, r.placed, r.unplaced, r.already, r.skipped));
                await reload();
            } catch (x) { toast(x.message, 'error'); }
        }
        function chooseFiles() { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*,video/*,.heic,.heif,.mov'; i.addEventListener('change', () => { if (i.files.length) upload([...i.files]); }); i.click(); }
        async function upload(files, drop = null) {
            const prog = $('[data-pm=progress]');
            let done = 0, placed = 0, unplaced = 0; const refused = [];
            const batches = []; let cur = [], size = 0;
            files.forEach(f => { if (cur.length && (cur.length >= 8 || size + f.size > 60 * 1024 * 1024)) { batches.push(cur); cur = []; size = 0; } cur.push(f); size += f.size; });
            if (cur.length) batches.push(cur);
            for (const batch of batches) {
                prog.innerHTML = `<div class="ui-spinner" role="status"><span class="ui-spin" aria-hidden="true"></span><span>Import : ${done} / ${files.length}… (le GPS et la date de prise de vue sont lus)</span></div>`;
                const fd = new FormData(); batch.forEach(f => fd.append('files[]', f, f.name)); fd.append('map_id', String(mp.id)); fd.append('csrf', S().csrf || '');
                if (drop) { fd.append('drop_lat', String(drop.lat)); fd.append('drop_lon', String(drop.lon)); }
                try {
                    const res = await fetch('api.php?action=photomap_upload', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf || ''}});
                    const r = await res.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!res.ok || r.error) throw new Error(r.error || `Erreur ${res.status}`);
                    done += r.imported?.length || 0; placed += r.placed || 0; unplaced += r.unplaced || 0; refused.push(...(r.refused || []));
                } catch (x) { refused.push(...batch.map(f => ({name: f.name, reason: x.message}))); }
            }
            prog.innerHTML = refused.length ? (UI().notice ? UI().notice('warn', `Pas importé : ${refused.slice(0, 6).map(r => `${r.name} (${r.reason})`).join(' · ')}${refused.length > 6 ? ` … et ${refused.length - 6} autres` : ''}`) : '') : '';
            if (done) toast(addedText(done, placed, unplaced));
            await reload();
        }
        if (editable) {
            const z = UI().dropZone ? UI().dropZone({accept: 'image/*,video/*,.heic,.heif,.mov', text: '', hint: 'Plusieurs à la fois. Ils entrent dans les médias de l’app ; ceux qui ont des coordonnées GPS se placent tout seuls. Tu peux aussi les glisser directement à leur place sur la carte.', onFiles: f => upload(f)}) : null;
            if (z) { z.querySelector('.ui-drop-txt').innerHTML = '📁 <b>Glisse ici</b> des photos et des vidéos, <b>colle-les</b> (⌘V) ou <b>choisis-les</b> sur l’ordinateur'; $('[data-pm=drop]').appendChild(z); }
            UI().bindFileDrop?.(map.stage, files => { /* posés là où on les lâche s'ils n'ont pas de GPS */ upload(files, map.lastDrop || null); }, {accept: 'image/*,video/*,.heic,.heif,.mov', paste: false});
            map.stage.addEventListener('drop', e => { const r = map.stage.getBoundingClientRect(); map.lastDrop = map.toLatLon(e.clientX - r.left, e.clientY - r.top); }, true);
        }
        /* ✎ un élément : date (C4, heure comprise), légende, personnes, lieu, position */
        function editItem(it) {
            if (!ext.openDialog) return;
            const tz = tzLabel(it.tz);
            const body = `<div class="pm-edit"><div class="pm-edit-pic">${it.kind === 'video' ? `<video src="${esc(mediaUrl(it))}" controls preload="metadata"></video>` : `<img src="${esc(thumbUrl(it))}" alt="">`}<small>${esc(it.title || '')}</small></div>
                <div class="pm-edit-f"><label>Date <input type="text" name="date_text" data-ui-date value="${esc(it.date_text)}" placeholder="14 juillet 2023 à 10 h 22, vers 1950…"></label>
                <p class="pm-note">${it.taken ? `🕘 Heure exacte${it.date_src === 'exif' ? ' lue dans le fichier' : ''} : <b>${esc(T.label(T.isoToT(it.taken), 'time'))}</b>, heure locale de prise de vue${tz ? ` (${esc(tz)})` : ''}.` : 'Sans heure, la photo est placée à midi de son jour sur la frise (au milieu de sa période si la date est vague). Ajoute l’heure si tu la connais : « 7 mai 1925 à 14 h 30 ».'}</p>
                <label>Légende <textarea name="caption" rows="2" maxlength="1000">${esc(it.caption)}</textarea></label>
                <div><span class="pk-lab">Personnes sur la photo</span>${P().pickerField?.({name: 'pm_people', kind: 'person', multiple: true, value: it.people.map(p => ({id: p.id, title: p.name}))}) || ''}</div>
                <div><span class="pk-lab">Lieu de la base</span>${P().pickerField?.({name: 'pm_place', kind: 'place', value: it.place_id ? {id: it.place_id, title: it.place_name || 'Lieu'} : null}) || ''}</div>
                <label class="checkbox-line"><input type="checkbox" name="use_place"> Poser la photo sur ce lieu</label>
                <p class="pm-note">Position : ${it.lat == null ? 'pas encore placée (dans « À placer »)' : `${esc(SRC_LABEL[it.src] || '')} — ${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}`}${it.gps ? `<br>🛰 GPS d’origine gardé : ${it.gps[0].toFixed(5)}, ${it.gps[1].toFixed(5)}` : ''}</p>
                <div class="pm-edit-acts">${it.gps && it.src !== 'gps' ? '<button type="button" class="button small secondary" data-pme="gps">↺ Revenir au GPS</button>' : ''}${it.lat != null ? '<button type="button" class="button small secondary" data-pme="unplace">Remettre dans « À placer »</button>' : ''}<button type="button" class="button small secondary danger" data-pme="remove">Retirer de la carte</button></div></div></div>`;
            const dlg = ext.openDialog({eyebrow: 'CARTE DE PHOTOS', title: `✎ ${it.title || 'Photo'}`, wide: true, body, submitLabel: 'Enregistrer',
                onOpen: dl => dl.addEventListener('click', async e => {
                    const a = e.target.closest('[data-pme]')?.dataset.pme; if (!a) return;
                    e.preventDefault(); dl.close();
                    if (a === 'gps') { const before = {lat: it.lat, lon: it.lon, src: it.src}; try { const r = await post({op: 'reset_gps', id: it.id}); Object.assign(it, r.item); decorate([it]); refresh(); A().undoToast?.('Revenue à sa position GPS', {undo: () => update(it, before), redo: async () => { const r2 = await post({op: 'reset_gps', id: it.id}); Object.assign(it, r2.item); refresh(); }}); } catch (x) { toast(x.message, 'error'); } }
                    if (a === 'unplace') moveItemOff(it);
                    if (a === 'remove') removeItems([it]);
                }),
                onSubmit: async form => {
                    const f = new FormData(form), dt = String(f.get('date_text') || '').trim();
                    if (dt && !T.parseDate(dt)) { toast('Date incomprise : écris par exemple « 14 juillet 2023 », « 7 mai 1925 à 14 h 30 », « vers 1950 ».', 'error'); return false; }
                    const people = String(f.get('pm_people') || '').split(',').map(Number).filter(Boolean), placeId = Number(f.get('pm_place')) || null;
                    await update(it, {date_text: dt, caption: String(f.get('caption') || ''), people, place_id: placeId}, true);
                    if (form.elements.use_place?.checked && placeId) {
                        const r = await api('picker_search', {kind: 'place', ids: String(placeId)}).catch(() => null);
                        const pl = r?.groups?.flatMap(g => g.items || []).find(x => Number(x.id) === placeId);
                        if (pl && Number.isFinite(Number(pl.lat)) && Number(pl.lat)) await moveItem(it, Number(pl.lat), Number(pl.lon), 'place');
                        else toast('Ce lieu n’a pas de coordonnées : glisse la photo sur la carte.', 'error');
                    }
                    refresh();
                    toast('✓ Enregistré');
                }});
            return dlg;
        }
        async function moveItemOff(it) { const before = {lat: it.lat, lon: it.lon, src: it.src}; try { await update(it, {lat: null, lon: null}); A().undoToast?.('Remise dans « À placer »', {undo: () => update(it, before), redo: () => update(it, {lat: null, lon: null})}); } catch (x) { toast(x.message, 'error'); } }
        async function removeItems(list) {
            const ids = list.map(x => x.id);
            try { await post({op: 'remove_items', ids}); } catch (x) { toast(x.message, 'error'); return; }
            data.items = data.items.filter(x => !ids.includes(x.id)); refresh();
            A().undoToast?.(list.length === 1 ? `« ${list[0].title || 'Photo'} » retirée de la carte (elle reste dans les médias)` : `${list.length} éléments retirés de la carte`, {undo: async () => { await post({op: 'restore_items', ids}); await reload(); }, redo: async () => { await post({op: 'remove_items', ids}); await reload(); }});
        }
        async function reload() {
            const v = map.view(), sel = tl.sel;
            try { const nd = await load(opts.mapId || 'all'); data.items = decorate(nd.items); data.maps = nd.maps; if (nd.map) Object.assign(mp, nd.map); } catch (x) { toast(x.message, 'error'); return; }
            map.setView(v); tl.sel = sel; refresh();
        }
        /* ⤓ E3 : la carte en image (fond, trajet, vignettes) */
        function exportMap() {
            const sub = () => (tl.sel ? `Du ${T.label(tl.sel[0])} au ${T.label(tl.sel[1])}` : (mp.period_text || ''));
            const toMedia = async (blob, filename) => { try { await P().importMediaFile(new File([blob], filename, {type: blob.type}), ['image']); toast('Une copie est rangée dans les médias.'); } catch (x) { toast(`Copie dans les médias impossible : ${x.message}`, 'error'); } };
            const run = async o => {
                const blob = await renderPng(map, o.format === 'jpg' ? 'image/jpeg' : 'image/png', mp.name, sub());
                const fn = o.filename || `carte-de-photos.${o.format === 'jpg' ? 'jpg' : 'png'}`;
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
                if (o.saveCopy && P().importMediaFile) await toMedia(blob, fn);
            };
            if (!UI().openExportDialog) return run({format: 'png'}).catch(x => toast(x.message, 'error'));
            UI().openExportDialog({title: `Carte de photos « ${mp.name} »`, defaultName: mp.name || 'carte-de-photos', quality: false, saveCopy: !kiosk() && !!P().importMediaFile,
                info: 'La carte telle qu’elle est à l’écran : fond, trajet et vignettes. Si le fond vient d’Internet et refuse d’être copié, l’image est faite sans lui.',
                preview: async () => { try { return URL.createObjectURL(await renderPng(map, 'image/jpeg', mp.name, sub())); } catch (_) { return null; } },
                formats: [{id: 'png', run}, {id: 'jpg', run}, {id: 'print', run: async () => { const blob = await renderPng(map, 'image/png', mp.name, ''); const u = URL.createObjectURL(blob); const w = window.open('', '_blank'); if (w) { w.document.write(`<title>${esc(mp.name)}</title><img src="${u}" style="max-width:100%" onload="print()">`); w.document.close(); } }}]});
        }
        // vue gardée, sinon tout voir
        const sv = embed ? null : store.get(viewKey, null);
        if (sv && Number.isFinite(sv.z)) map.setView(sv);
        refresh();
        if (!sv || embed) map.fit(map.points.length ? map.points : []);
        if (opts.focusItem) { const it = byId(opts.focusItem); if (it) editItem(it); }
        return {map, tl, data, reload, root};
    }
    const addedText = (n, placed, unplaced, already = 0, skipped = 0) => [`${plural(n, 'élément ajouté', 'éléments ajoutés')}`, placed ? `${placed} placé${placed > 1 ? 's' : ''} par le GPS` : '', unplaced ? `${unplaced} à placer` : '', already ? `${already} déjà sur la carte` : '', skipped ? `${skipped} ignoré${skipped > 1 ? 's' : ''} (ni photo ni vidéo)` : ''].filter(Boolean).join(' · ');

    /** l'image de la carte (canvas) : tuiles si elles se laissent copier, trajet, vignettes */
    async function renderPng(map, type, title, sub) {
        const st = map.stage, w = st.clientWidth, h = st.clientHeight, k = 2;
        const cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k; const c = cv.getContext('2d'); c.scale(k, k);
        c.fillStyle = '#e8ecef'; c.fillRect(0, 0, w, h);
        const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; setTimeout(() => res(null), 6000); });
        const sr = st.getBoundingClientRect();
        const draw = async (els, fn) => { for (const el of els) { const r = el.getBoundingClientRect(); const im = await loadImg(el.currentSrc || el.src); if (im) { try { fn(im, r.left - sr.left, r.top - sr.top, r.width, r.height); } catch (_) {} } } };
        await draw([...st.querySelectorAll('.pm-tiles img')], (im, x, y, ww, hh) => c.drawImage(im, x, y, ww, hh));
        try { c.getImageData(0, 0, 1, 1); } catch (_) { c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, w, h); c.fillStyle = '#e8ecef'; c.fillRect(0, 0, w, h); const cv2 = cv; void cv2; } // fond qui refuse d'être copié : sans lui
        const svg = st.querySelector('.pm-track');
        if (svg?.innerHTML) { const s = new XMLSerializer().serializeToString(svg); const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)); if (im) c.drawImage(im, 0, 0, w, h); }
        for (const el of st.querySelectorAll('.pm-mk')) {
            const r = el.getBoundingClientRect(), x = r.left - sr.left, y = r.top - sr.top, s = r.width, col = getComputedStyle(el).getPropertyValue('--c').trim() || '#0066cc';
            const im = await loadImg(el.querySelector('img')?.src || '');
            c.save(); c.beginPath(); if (el.classList.contains('is-round')) c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); else c.rect(x, y, s, s);
            c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3; c.strokeStyle = col; c.stroke(); c.clip();
            if (im) { const q = Math.max(s / im.width, s / im.height); c.drawImage(im, x + (s - im.width * q) / 2, y + (s - im.height * q) / 2, im.width * q, im.height * q); }
            c.restore();
            const n = el.querySelector('.pm-count')?.textContent; if (n) { c.fillStyle = col; c.beginPath(); c.arc(x + s - 4, y + 4, 10, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 10px Arial'; c.textAlign = 'center'; c.fillText(n, x + s - 4, y + 8); }
            if (el.classList.contains('is-video')) { c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(x + s / 2, y + s / 2, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = '10px Arial'; c.textAlign = 'center'; c.fillText('▶', x + s / 2 + 1, y + s / 2 + 4); }
        }
        c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(0, 0, w, sub ? 46 : 30); c.fillStyle = '#111'; c.textAlign = 'left'; c.font = 'bold 16px Arial'; c.fillText(`📸 ${title || ''}`, 10, 21); if (sub) { c.font = '12px Arial'; c.fillText(sub, 10, 38); }
        return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('la carte est cachée ou trop petite pour en faire une image'))), type, .92));
    }

    /* ═════════════════ Créer, modifier une carte ═════════════════ */
    const mapBody = m => ({id: m.id, name: m.name, description: m.description || '', color: m.color, period_text: m.period_text || '', background: m.background || '', shape: m.shape || 'round', show_track: !!m.show_track, person_id: m.person_id || null, investigation_id: m.investigation_id || null});
    function editMap(m, done) {
        if (!ext.openDialog) return;
        m = m || {name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], shape: 'round'};
        const bg = m.background || '';
        ext.openDialog({eyebrow: 'CARTE DE PHOTOS', title: m.id ? `✎ ${m.name}` : '＋ Nouvelle carte de photos', wide: true, submitLabel: m.id ? 'Enregistrer' : 'Créer la carte',
            body: `<div class="form-grid pm-form"><label class="span-2">Nom <input name="name" required maxlength="160" value="${esc(m.name)}" placeholder="Vacances en Bretagne 1978, La maison de Lucie…"></label>
                <label class="span-2">Description <textarea name="description" rows="3" maxlength="4000">${esc(m.description || '')}</textarea></label>
                <label>Couleur <input type="color" name="color" value="${esc(color(m.color))}"></label>
                <label>Période <small>(facultatif)</small><input type="text" name="period_text" data-ui-date value="${esc(m.period_text || '')}" placeholder="juillet 1978, entre 1950 et 1960…"></label>
                <label>Fond de carte <select name="background"><option value="">celui de l’app</option>${A().mapBackgroundSelectHtml?.(bg) || ''}</select></label>
                <label>Vignettes <select name="shape"><option value="round" ${m.shape !== 'square' ? 'selected' : ''}>rondes</option><option value="square" ${m.shape === 'square' ? 'selected' : ''}>carrées</option></select></label>
                <label class="checkbox-line span-2"><input type="checkbox" name="show_track" ${m.show_track ? 'checked' : ''}> Montrer le trajet (les photos reliées dans l’ordre du temps)</label>
                <div><span class="pk-lab">Liée à une personne <small>(facultatif)</small></span>${P().pickerField?.({name: 'person_id', kind: 'person', value: m.person_id ? {id: m.person_id, title: m.person_name || ''} : null}) || ''}</div>
                <div><span class="pk-lab">Liée à une enquête <small>(facultatif)</small></span>${P().pickerField?.({name: 'investigation_id', kind: 'investigation', value: m.investigation_id ? {id: m.investigation_id, title: m.investigation_title || ''} : null}) || ''}</div></div>`,
            onOpen: dl => { if (!bg) dl.querySelector('[name=background]').value = ''; },
            onDelete: m.id ? async () => { await deleteMap(m, () => done?.(false, true)); return true; } : null,
            onSubmit: async form => {
                const f = new FormData(form), pt = String(f.get('period_text') || '').trim();
                if (pt && !T.parseDate(pt)) { toast('Période incomprise : écris par exemple « juillet 1978 », « 1950 », « entre 1950 et 1960 ».', 'error'); return false; }
                const r = await post({op: 'save_map', id: m.id || 0, name: f.get('name'), description: f.get('description'), color: f.get('color'), period_text: pt, background: f.get('background') || '',
                    shape: f.get('shape'), show_track: !!form.elements.show_track.checked, person_id: Number(f.get('person_id')) || null, investigation_id: Number(f.get('investigation_id')) || null});
                toast('✓ Enregistré');
                done?.(r.map);
            }});
    }
    async function deleteMap(m, after) {
        try { await post({op: 'delete_map', id: m.id}); } catch (x) { toast(x.message, 'error'); return; }
        A().undoToast?.(`Carte « ${m.name} » supprimée (les photos restent dans les médias)`, {undo: async () => { await post({op: 'restore_map', id: m.id}); await after?.('undo'); }, redo: async () => { await post({op: 'delete_map', id: m.id}); await after?.('redo'); }});
        await after?.('delete');
    }

    /* ═════════════════ Cartes (module Carte) : le mode « 📸 Cartes de photos » ═════════════════ */
    let current = null;
    function currentId() { const v = S().photomapId ?? store.get('lcnda-photomaps-current', 'all'); return v === 'all' || !Number(v) ? 'all' : Number(v); }
    function setCurrent(id) { S().photomapId = id; store.set('lcnda-photomaps-current', id); }
    // ⚙️ les pastilles en haut de l'outil : {mode: 'recent' | 'old' | 'manual', count: 1–12, ids: [cartes choisies, dans l'ordre]}
    function pillPrefs() {
        const v = store.get('lcnda-photomaps-pills', {}) || {};
        return {mode: ['recent', 'old', 'manual'].includes(v.mode) ? v.mode : 'recent', count: Math.max(1, Math.min(12, Math.round(Number(v.count)) || 5)),
            ids: Array.isArray(v.ids) ? [...new Set(v.ids.map(Number).filter(x => Number.isInteger(x) && x > 0))].slice(0, 40) : []};
    }
    function pillSettings(maps, after) {
        const pr = pillPrefs(), r = (v, l, hint) => `<label class="radio-line"><input type="radio" name="mode" value="${v}" ${pr.mode === v ? 'checked' : ''}> <span><b>${l}</b> <small class="muted">${hint}</small></span></label>`;
        ext.openDialog({eyebrow: 'CARTES DE PHOTOS', title: '⚙️ Les cartes en pastilles', submitLabel: 'Enregistrer',
            body: `<div class="pm-pillset"><p class="muted">Les cartes qui ont leur pastille en haut de l’outil. Les autres restent dans « 🔍 autres cartes… », et la carte affichée garde toujours la sienne.</p>
                ${r('recent', 'Les plus récentes', '(les dernières modifiées)')}${r('old', 'Les plus anciennes', '(les premières créées)')}${r('manual', 'Choisies à la main', '(dans l’ordre où tu les ajoutes)')}
                <label class="ui-range" data-pps="count"><span class="ui-range-lab">Nombre de pastilles</span><input type="range" name="count" min="1" max="12" step="1" value="${pr.count}" data-default="5"></label>
                <div data-pps="manual"><span class="pk-lab">Mes cartes en pastilles</span>${P().pickerField?.({name: 'ids', kind: 'photomap', multiple: true, value: pr.ids.filter(id => maps.some(m => m.id === id))}) || ''}</div></div>`,
            onOpen: dl => { const sync = () => { const m = dl.querySelector('[name=mode]:checked')?.value; dl.querySelector('[data-pps=count]').hidden = m === 'manual'; dl.querySelector('[data-pps=manual]').hidden = m !== 'manual'; }; dl.querySelectorAll('[name=mode]').forEach(x => x.addEventListener('change', sync)); sync(); },
            onSubmit: form => {
                const f = new FormData(form);
                store.set('lcnda-photomaps-pills', {mode: f.get('mode'), count: Number(f.get('count')), ids: String(f.get('ids') || '').split(',').map(Number).filter(Boolean)});
                toast('✓ Enregistré'); after?.();
            }});
    }
    async function renderCarte(token) {
        const ws = A().$('#workspace');
        ws.innerHTML = '<nav class="pm-pick" aria-label="Mes cartes de photos"></nav><section class="pm-carte"></section>';
        const host = ws.querySelector('.pm-carte');
        current?.tl?.stop?.();
        // en haut de l'outil : toutes les cartes en pastilles (aussi dans la colonne de gauche, mais tout en bas)
        api('photomaps').then(r => {
            const nav = ws.querySelector('.pm-pick'); if (!nav || !nav.isConnected) return;
            const maps = r.maps || [], cur = currentId(), n = m => (m.photos || 0) + (m.videos || 0);
            // quelles cartes ont leur pastille : réglage ⚙️ (les plus récentes, les plus anciennes ou choisies à la main) ; les autres par le menu de choix
            const pr = pillPrefs(), byDate = k => (a, b) => String(a[k] || '').localeCompare(String(b[k] || '')) || a.id - b.id;
            let shown;
            if (pr.mode === 'manual') shown = pr.ids.map(id => maps.find(m => m.id === id)).filter(Boolean);
            else { const sorted = pr.mode === 'old' ? [...maps].sort(byDate('created_at')) : [...maps].sort(byDate('updated_at')).reverse(); shown = maps.length > pr.count + 1 ? sorted.slice(0, pr.count) : sorted; }
            if (cur !== 'all' && !shown.some(m => m.id === cur)) { const c = maps.find(m => m.id === cur); if (c) shown = [c, ...shown]; } // celle affichée garde toujours sa pastille
            const more = maps.length - shown.length;
            nav.innerHTML = `<span class="pm-filters" role="group" aria-label="Carte affichée"><button type="button" class="pm-filter${cur === 'all' ? ' is-active' : ''}" data-pmp="all">🗺 Toutes mes cartes <b>${maps.length}</b></button>${shown.map(m => `<button type="button" class="pm-filter${cur === m.id ? ' is-active' : ''}" data-pmp="${Number(m.id)}"><span class="pm-legdot" style="background:${esc(color(m.color))}" aria-hidden="true"></span> ${esc(m.name)} <b>${n(m)}</b></button>`).join('')}${more > 0 ? `<button type="button" class="pm-filter" data-pmp-more>🔍 ${plural(more, 'autre carte', 'autres cartes')}…</button>` : ''}</span><button type="button" class="icon-action" data-pmp-set title="Quelles cartes en pastilles ?" aria-label="Régler les pastilles des cartes">⚙️</button>${kiosk() ? '' : '<button type="button" class="button small secondary" data-pmp-new>＋ Nouvelle carte</button>'}`;
            nav.addEventListener('click', async e => {
                if (e.target.closest('[data-pmp-set]')) { pillSettings(maps, () => renderCarte(++S().workspaceToken)); return; }
                const b = e.target.closest('[data-pmp]');
                if (b) { setCurrent(b.dataset.pmp === 'all' ? 'all' : Number(b.dataset.pmp)); A().renderSidebar(); renderCarte(++S().workspaceToken); return; }
                if (e.target.closest('[data-pmp-more]')) { // le menu de choix unique, sorte « photomap »
                    const it = await P().openPicker?.({kind: 'photomap', title: 'Choisir une carte de photos'});
                    if (it?.id) { setCurrent(Number(it.id)); A().renderSidebar(); renderCarte(++S().workspaceToken); }
                    return;
                }
                if (e.target.closest('[data-pmp-new]')) editMap(null, m => { if (m) { setCurrent(m.id); A().renderSidebar(); renderCarte(++S().workspaceToken); } });
            });
        }).catch(() => {});
        current = await mount(host, {mapId: currentId()});
        if (token !== undefined && token !== S().workspaceToken) current?.tl?.stop?.();
    }
    async function renderCarteSidebar(content) {
        const box = document.createElement('div'); box.className = 'pm-sidebar';
        box.innerHTML = '<div class="section-label">📸 Cartes de photos</div><div class="side-menu" data-pms-list><p class="muted">Chargement…</p></div>' + (kiosk() ? '' : '<div class="page-actions compact"><button type="button" class="button small" data-pms-new>＋ Nouvelle carte</button></div>');
        content.appendChild(box);
        let maps = [];
        try { maps = (await api('photomaps')).maps || []; } catch (_) {}
        const cur = currentId();
        box.querySelector('[data-pms-list]').innerHTML = `<button type="button" class="side-item ${cur === 'all' ? 'is-active' : ''}" data-pms="all"><span>🗺</span><strong>Toutes mes cartes</strong></button>` + maps.map(m => `<button type="button" class="side-item ${cur === m.id ? 'is-active' : ''}" data-pms="${m.id}"><span class="pm-legdot" style="background:${esc(color(m.color))}"></span><strong>${esc(m.name)}</strong><small>${(m.photos || 0) + (m.videos || 0)}</small></button>`).join('');
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-pms]');
            if (b) { setCurrent(b.dataset.pms === 'all' ? 'all' : Number(b.dataset.pms)); A().renderSidebar(); renderCarte(++S().workspaceToken); return; }
            if (e.target.closest('[data-pms-new]')) editMap(null, m => { if (m) { setCurrent(m.id); A().renderSidebar(); renderCarte(++S().workspaceToken); } });
        });
    }

    /* ═════════════════ Listes → « Cartes de photos » (barre H10) ═════════════════ */
    const LIST_KEY = 'listes:photo_maps';
    const SORTS = [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A'], ['count', 'Le plus de photos'], ['period', 'Par période']];
    const mosaic = m => (m.thumbs?.length ? `<span class="pm-mosaic n${Math.min(4, m.thumbs.length)}">${m.thumbs.slice(0, 4).map(t => `<img src="api.php?action=photomap_thumb&m=${Number(t.media_id)}&v=${esc(t.tv)}" alt="" loading="lazy" onerror="this.classList.add('is-broken')">`).join('')}</span>` : '<span class="pm-mosaic is-empty">📸</span>');
    const periodOf = m => m.period_text || (m.from ? (m.from.slice(0, 4) === m.to.slice(0, 4) ? m.from.slice(0, 4) : `${m.from.slice(0, 4)} – ${m.to.slice(0, 4)}`) : '');
    ext.lists.photo_maps = async token => {
        const ws = A().$('#workspace'), cur = () => token === undefined || token === S().workspaceToken;
        ws.innerHTML = `<section class="page pm-list">${UI().spinner ? UI().spinner('Chargement…') : ''}</section>`;
        let maps = [];
        try { maps = (await api('photomaps')).maps || []; } catch (e) { ws.innerHTML = `<section class="page">${A().empty(e.message)}</section>`; return; }
        if (!cur() || S().module !== 'listes') return;
        ws.innerHTML = `<section class="page pm-list"><header class="page-header"><div><span class="eyebrow">LISTES · CARTES DE PHOTOS</span><h2>📸 Cartes de photos</h2><p>Des cartes à toi où tu poses des photos et des vidéos à leur place, avec leur date : un voyage, une maison, un quartier, la vie d’une personne. Les fichiers qui ont des coordonnées GPS se placent tout seuls.</p></div>
            <div class="page-actions">${kiosk() ? '' : '<button type="button" class="button" data-pml="new">＋ Nouvelle carte</button>'}<button type="button" class="button secondary" data-pml="all">🗺 Toutes mes cartes</button></div></header><div data-pml-bar></div><div data-pml-body></div><div data-pml-more></div></section>`;
        const page = ws.querySelector('.pm-list'), body = page.querySelector('[data-pml-body]');
        let st = {q: '', filters: {}, sort: 'recent'}, view = 'cards', limit = 40;
        const filtered = () => {
            const f = st.filters || {}, q = fold(st.q);
            let l = maps.filter(m => (!q || fold(`${m.name} ${m.description} ${m.period_text} ${m.person_name} ${m.investigation_title}`).includes(q))
                && (!f.what || (f.what === 'video' ? m.videos > 0 : f.what === 'todo' ? m.unplaced > 0 : f.what === 'empty' ? !(m.photos + m.videos) : true))
                && (!f.linked || (f.linked === 'person' ? m.person_id : m.investigation_id)));
            if (st.sort === 'count') l = [...l].sort((a, b) => (b.photos + b.videos) - (a.photos + a.videos));
            else if (st.sort === 'period') l = [...l].sort((a, b) => String(a.from || '9999').localeCompare(String(b.from || '9999')));
            else l = UI().sortItems ? UI().sortItems(l, st.sort, {name: m => m.name, date: m => m.updated_at || m.created_at}) : l;
            return l;
        };
        const item = m => ({cls: 'pm-li', attrs: `data-pml-id="${m.id}" style="--pm-c:${esc(color(m.color))}"`, name: m.name, open: `data-pml-open="${m.id}"`, thumb: mosaic(m),
            lines: [`${plural(m.photos || 0, 'photo')} · ${plural(m.videos || 0, 'vidéo')}${m.unplaced ? ` · ${m.unplaced} à placer` : ''}`, periodOf(m) ? `🗓 ${periodOf(m)}` : 'Pas encore de date', [m.person_id ? `👤 ${m.person_name}` : '', m.investigation_id ? `🔍 ${m.investigation_title}` : ''].filter(Boolean).join(' · '), m.description ? String(m.description).slice(0, 160) : ''].filter(Boolean),
            date: m.updated_at ? `Modifiée le ${new Date(String(m.updated_at).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}` : '',
            actions: kiosk() ? '' : `<button type="button" class="button small secondary" data-pml-edit="${m.id}">✎ Modifier</button><button type="button" class="icon-button" data-pml-del="${m.id}" title="Supprimer la carte (les photos restent dans les médias)" aria-label="Supprimer">🗑</button>`});
        const draw = () => {
            const l = filtered();
            bar.setCount?.(l.length, 'carte');
            if (!maps.length) { body.innerHTML = A().emptyState ? A().emptyState({icon: '📸', text: 'Aucune carte de photos pour l’instant', hint: 'Crée une carte, puis ajoute des photos de l’app ou importe-les : celles qui ont des coordonnées GPS se placent toutes seules.', action: kiosk() ? null : {label: '＋ Nouvelle carte', attrs: 'data-pml="new"'}}) : A().empty('Aucune carte de photos pour l’instant'); page.querySelector('[data-pml-more]').innerHTML = ''; return; }
            body.innerHTML = l.length ? (UI().itemsHtml ? UI().itemsHtml(view, l.slice(0, limit).map(item)) : '') : '<p class="muted">Rien ne correspond : retire un filtre ou change la recherche.</p>';
            const more = page.querySelector('[data-pml-more]'); more.innerHTML = '';
            if (l.length > limit && UI().moreButton) more.appendChild(UI().moreButton({remaining: l.length - limit, step: 40, feminine: true, onClick: () => { limit += 40; draw(); }}));
        };
        const bar = UI().listBar({key: LIST_KEY, search: {placeholder: 'Chercher une carte… (ex. Bretagne, 1978, Lucie)'},
            filters: [{id: 'what', label: 'Contenu', type: 'radio', options: [['', 'Toutes'], ['video', 'Avec des vidéos', 'Avec des vidéos'], ['todo', 'Avec des photos à placer', 'À placer'], ['empty', 'Vides', 'Vides']], value: ''},
                {id: 'linked', label: 'Liée à', type: 'radio', options: [['', 'Peu importe'], ['person', '👤 une personne', 'Liées à une personne'], ['investigation', '🔍 une enquête', 'Liées à une enquête']], value: ''}],
            view: {what: 'cartes', dflt: 'cards', onChange: v => { view = v; draw(); }}, sort: {options: SORTS, value: 'recent'},
            onChange: (b, {what}) => { st = b; if (what !== 'view') { limit = 40; draw(); } }});
        st = bar.state; view = bar.state.view || view;
        page.querySelector('[data-pml-bar]').replaceWith(bar);
        draw();
        const refresh = async () => { try { maps = (await api('photomaps')).maps || []; } catch (_) {} if (page.isConnected) draw(); };
        const open = id => { S().mapMode = 'photos'; setCurrent(id); A().persistUiState?.(); A().setModule('carte'); };
        page.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const d = b.dataset;
            if (d.pml === 'new') return editMap(null, m => { if (m) open(m.id); });
            if (d.pml === 'all') return open('all');
            if (d.pmlOpen) return open(Number(d.pmlOpen));
            if (d.pmlEdit) { const m = maps.find(x => x.id === Number(d.pmlEdit)); if (m) editMap(m, () => refresh()); return; }
            if (d.pmlDel) { const m = maps.find(x => x.id === Number(d.pmlDel)); if (m) deleteMap(m, () => refresh()); }
        });
    };

    /* ═════════════════ Widget « 📸 Carte de photos » (tableau de bord, onglets à soi) et bloc de Fiches ═════════════════ */
    const wcfg = w => ({mapId: null, mapName: '', type: 'all', period: '', track: false, height: 380, ...(w?.config || w || {})});
    const configHtml = c => `<fieldset class="pm-wcfg"><legend>Carte de photos</legend>
        <div data-pmw-pk><span class="pk-lab">Carte <small>(vide = toutes mes cartes)</small></span>${P().pickerField?.({name: 'pmw_map', hiddenName: false, kind: 'photomap', value: c.mapId ? {id: Number(c.mapId), title: c.mapName || 'Carte'} : null, placeholder: 'Toutes mes cartes (ou cherche une carte…)'}) || ''}<input type="hidden" data-pmw="map" value="${esc(c.mapId || '')}"><input type="hidden" data-pmw="mapname" value="${esc(c.mapName || '')}"></div>
        <label>Montrer <select data-pmw="type"><option value="all">tout</option><option value="image" ${c.type === 'image' ? 'selected' : ''}>📷 les photos</option><option value="video" ${c.type === 'video' ? 'selected' : ''}>🎬 les vidéos</option></select></label>
        <label>Période <small>(facultatif)</small><input type="text" data-pmw="period" data-ui-date value="${esc(c.period || '')}" placeholder="entre 1975 et 1980, juillet 2023…"></label>
        <label>Hauteur <select data-pmw="height">${[[280, 'petite'], [380, 'moyenne'], [560, 'grande']].map(([v, l]) => `<option value="${v}" ${Number(c.height) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="checkbox-line"><input type="checkbox" data-pmw="track" ${c.track ? 'checked' : ''}> Montrer le trajet</label></fieldset>`;
    document.addEventListener('picker-change', e => { const box = e.target.closest?.('[data-pmw-pk]'); if (!box) return; box.querySelector('[data-pmw=map]').value = e.detail.item?.id || ''; box.querySelector('[data-pmw=mapname]').value = e.detail.item?.title || ''; });
    const readConfig = ed => ({mapId: Number(ed.querySelector('[data-pmw=map]')?.value) || null, mapName: ed.querySelector('[data-pmw=mapname]')?.value || '', type: ed.querySelector('[data-pmw=type]')?.value || 'all',
        period: ed.querySelector('[data-pmw=period]')?.value?.trim() || '', height: Number(ed.querySelector('[data-pmw=height]')?.value) || 380, track: !!ed.querySelector('[data-pmw=track]')?.checked});
    /** pose la carte dans un élément (widget, bloc de Fiches) */
    ext.photomapEmbed = (el, config) => { const c = wcfg(config); return mount(el, {mapId: c.mapId || 'all', embed: true, config: c}); };
    ext.photomapConfigHtml = configHtml;
    ext.photomapConfigRead = readConfig;
    ext.dashboardConfig.photomap_widget = {html: w => configHtml(wcfg(w)), read: readConfig};
    ext.dashboard.photomap_widget = {render: (index, widget, span) => {
        const c = wcfg(widget), id = 'pmw-' + Math.random().toString(36).slice(2, 9);
        setTimeout(() => { const el = document.getElementById(id); if (el && !el.dataset.done) { el.dataset.done = '1'; ext.photomapEmbed(el, c); } }, 0);
        return A().card(index, `📸 ${c.mapId ? (c.mapName || 'Carte de photos') : 'Toutes mes cartes de photos'}`, '', `<div class="pm-widget" id="${id}"></div>`, span);
    }};
    // au catalogue des widgets (même point d'enregistrement que les autres modules : la liste de l'app)
    const reg = () => {
        const app = A(); if (!app) return false;
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'photomap_widget')) app.defaultDashboardBlocks.push(['photomap_widget', '📸 Carte de photos']);
        if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.photomap_widget = '12';
        if (app.dashboardWidgetInfo) app.dashboardWidgetInfo.photomap_widget = 'Une de tes cartes de photos (ou toutes), avec ses vignettes, la période et le filtre photos / vidéos que tu choisis. Un clic sur une photo ouvre la visionneuse.';
        if (app.defaultListTypes && !app.defaultListTypes.some(x => x[0] === 'photo_maps')) app.defaultListTypes.push(['photo_maps', '25b', 'Cartes de photos']);
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);

    window.LCNDA_PHOTOMAPS = {mount, createMap, createTimeline, renderCarte, renderCarteSidebar, editMap, deleteMap, load, currentId, setCurrent, renderPng};
})();
