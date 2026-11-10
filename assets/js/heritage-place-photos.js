/* LCNDA — 📍 Images de lieux : « Où a-t-elle été prise ? » (serveur : lib/place_photos.php ; styles : assets/css/place-photos.css).
 * Construit sur ce qui existait : les médias (une seule place pour les images, media.place_id), la fiche de carte postale
 * (heritage-postcards.js : éditeur, lieu montré, angle de vue), le comparateur de photos (heritage-photo-compare.js : fondu,
 * rideau ; ici avec deux repères par photo et l'ajustement à la main de la photo d'aujourd'hui), les 🤝 demandes d'entraide
 * et les ✉️ petites annonces (la demande d'aide est créée dans ces outils), le menu de choix des lieux, la fenêtre unique des
 * images, la fiche d'un village et la monographie de commune, la Carte (crochets ext.mapSetup / ext.mapDraw).
 * Ajouté :
 *  - « 📍 Où a-t-elle été prise ? » (visionneuse, fiche de carte postale, listes) : une ou plusieurs hypothèses de lieu —
 *    lieu de la base et/ou point, OU zone (cercle, polygone), rue, adresse, direction (cône), certitude K8, pourquoi, auteur ;
 *    une seule retenue ; date de prise de vue (C4), sorte, éditeur ou photographe ; « 🪟 Comparer avec aujourd'hui » ;
 *    « 🙋 Demander de l'aide » ; les réponses reviennent comme hypothèses avec leur auteur (↶ Annuler) ;
 *  - Listes → « 📍 Images de lieux » (H10 : lieu, rue, époque, certitude, sorte, sans lieu) ;
 *  - le bloc « 🖼 Images du lieu » (fiche d'un village, monographie) : rangées par rue et par époque, avec la carte ;
 *  - le calque « 📍 Images de lieux » de la Carte ;
 *  - la lecture pour d'autres outils : LCNDA_EXT.placePhotos.list(filtres) / .geojson(filtres) (docs/UI.md).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || A();
    const S = () => A().state;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const write = body => api('place_photo_write', {}, {method: 'POST', body});
    const toast = (...a) => A().toast(...a);
    const plural = (n, a, b) => (A().plural ? A().plural(n, a, b) : `${n} ${n > 1 ? b : a}`);
    const KEY = 'listes:place_images';
    /** certitude → [libellé, couleur K8] : vert certain, bleu probable, gris possible, jaune à vérifier */
    const CERT = {certain: ['Certain', 'green'], probable: ['Probable', 'blue'], possible: ['Possible', 'grey'], verify: ['À vérifier', 'yellow']};
    const CERT_COLOR = {certain: '#1a7f37', probable: '#1f6feb', possible: '#6e7781', verify: '#bf8700'};
    const KINDS = {postcard: '🏞 Carte postale', photo: '📷 Photo ancienne', engraving: '✒️ Gravure, dessin', plan: '🗺 Plan', painting: '🖼 Tableau', other: '❔ Autre'};
    const certBadge = c => (UI().badge ? UI().badge((CERT[c] || CERT.possible)[0], (CERT[c] || CERT.possible)[1]) : esc((CERT[c] || CERT.possible)[0]));
    const placeText = pl => (pl ? [pl.name, pl.county && pl.county !== pl.name ? pl.county : ''].filter(Boolean).join(', ') : '');
    const dirName = b => { if (b == null || b === '') return ''; const n = ((Number(b) % 360) + 360) % 360; return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(n / 45) % 8]; };
    const guessWhere = g => [placeText(g.place), g.street, g.address].filter(Boolean).join(' · ')
        || (g.zone ? (g.zone.type === 'circle' ? `Zone : cercle de ${Math.round(g.zone.r)} m` : `Zone : ${g.zone.pts.length} points`) : g.lat != null ? `Point ${Number(g.lat).toFixed(5)}, ${Number(g.lon).toFixed(5)}` : 'Lieu à préciser');
    const thumb = (src, alt = '') => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '<span class="ui-card-ico">📍</span>');

    /* ═════════ La lecture (aussi pour les autres outils : couche de la Carte, cartes personnalisées) ═════════ */
    const FILTER_KEYS = ['place_id', 'street', 'from', 'to', 'certainty', 'unplaced', 'bbox', 'all', 'limit', 'media_id'];
    /** list({place_id, street, from, to, certainty: ['certain', …] | 'certain,probable', unplaced, bbox: [s, w, n, e], all, limit}) → {items, total, streets} */
    async function list(filters = {}) {
        const q = {};
        for (const k of FILTER_KEYS) {
            let v = filters[k]; if (v == null || v === '' || v === false) continue;
            if (Array.isArray(v)) v = v.join(','); if (v === true) v = 1;
            q[k] = String(v);
        }
        return api('place_photos', q);
    }
    /** geojson(filtres) → FeatureCollection : un point par image (l'hypothèse retenue, ou toutes avec all:true), les zones en Polygon */
    async function geojson(filters = {}) {
        const d = await list(filters), feats = [];
        for (const it of d.items || []) {
            const gs = filters.all ? (it.guesses?.length ? it.guesses : it.retained ? [it.retained] : []) : it.retained ? [it.retained] : [];
            for (const g of gs) {
                if (!g.at) continue;
                const props = {media_id: it.media_id, guess_id: g.id || 0, title: it.title, thumb: it.thumb, src: it.src, kind: it.kind, year: it.year, date_text: it.date_text, author: it.author,
                    certainty: g.certainty, retained: !!g.retained, street: g.street, place: g.place ? {id: g.place.id, name: g.place.name} : null, bearing: g.bearing, fov: g.fov, why: g.why};
                feats.push({type: 'Feature', geometry: {type: 'Point', coordinates: [g.at.lon, g.at.lat]}, properties: props});
                if (g.zone?.type === 'polygon') feats.push({type: 'Feature', geometry: {type: 'Polygon', coordinates: [[...g.zone.pts.map(([la, lo]) => [lo, la]), [g.zone.pts[0][1], g.zone.pts[0][0]]]]}, properties: {...props, zone: 'polygon'}});
                if (g.zone?.type === 'circle') feats.push({type: 'Feature', geometry: {type: 'Point', coordinates: [g.zone.lon, g.zone.lat]}, properties: {...props, zone: 'circle', radius_m: g.zone.r}});
            }
        }
        return {type: 'FeatureCollection', features: feats};
    }
    const listeners = new Set();
    const changed = () => { listeners.forEach(fn => { try { fn(); } catch (_) {} }); document.dispatchEvent(new CustomEvent('lcnda:place-photos-changed')); refreshAll(); };

    /* ═════════ Petite carte : points, zones (cercle, polygone), cônes de la vue ; outils de dessin ═════════ */
    const TILE = 256;
    const X = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z;
    const Y = (lat, z) => { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** z; };
    const LON = (x, z) => x / (TILE * 2 ** z) * 360 - 180;
    const LAT = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (TILE * 2 ** z)))) * 180 / Math.PI;
    const mPerPx = (lat, z) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** z;
    const bg = () => { try { const v = A().mapBackgroundValue?.(A().readDesignSettings?.().mapBackground) || 'bw'; return v === 'grid' ? 'bw' : v; } catch (_) { return 'bw'; } };
    const tileUrl = (z, x, y) => { try { return A().mapTileUrl?.(bg(), z, x, y) || ''; } catch (_) { return ''; } };
    const bearingOf = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r); return (Math.atan2(y, x) / r + 360) % 360; };
    const distM = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 6371000 * 2 * Math.asin(Math.sqrt(a)); };
    const originOf = g => (g.lat != null ? [Number(g.lat), Number(g.lon)] : g.zone?.type === 'circle' ? [g.zone.lat, g.zone.lon] : g.zone?.type === 'polygon' ? [g.zone.pts.reduce((s, p) => s + p[0], 0) / g.zone.pts.length, g.zone.pts.reduce((s, p) => s + p[1], 0) / g.zone.pts.length] : g.at ? [g.at.lat, g.at.lon] : g.place?.lat != null ? [g.place.lat, g.place.lon] : null);

    /** svg d'une hypothèse (zone, point, cône) dans le repère de la vue */
    function guessSvg(g, z, left, top, {draft = false, faded = false, label = ''} = {}) {
        const c = draft ? '#d1242f' : (CERT_COLOR[g.certainty] || '#1f6feb'), px = (la, lo) => [X(lo, z) - left, Y(la, z) - top];
        let s = '';
        const cls = `pp-g${g.retained ? ' is-retained' : ''}${draft ? ' is-draft' : ''}${faded ? ' is-faded' : ''}`;
        if (g.zone?.type === 'circle') { const [x, y] = px(g.zone.lat, g.zone.lon), r = g.zone.r / mPerPx(g.zone.lat, z); s += `<circle class="pp-zone" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(3, r).toFixed(1)}" style="--c:${c}"/>`; }
        if (g.zone?.type === 'polygon' && g.zone.pts.length) s += `<polygon class="pp-zone" points="${g.zone.pts.map(([la, lo]) => px(la, lo).map(v => v.toFixed(1)).join(',')).join(' ')}" style="--c:${c}"/>`;
        const o = originOf(g);
        if (o) {
            const [x, y] = px(o[0], o[1]);
            if (g.bearing != null) {
                const half = (Number(g.fov) || 60) / 2, L = 70, a1 = (Number(g.bearing) - half - 90) * Math.PI / 180, a2 = (Number(g.bearing) + half - 90) * Math.PI / 180;
                s += `<path class="pp-cone" d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + L * Math.cos(a1)).toFixed(1)} ${(y + L * Math.sin(a1)).toFixed(1)} A${L} ${L} 0 0 1 ${(x + L * Math.cos(a2)).toFixed(1)} ${(y + L * Math.sin(a2)).toFixed(1)} Z" style="--c:${c}"/>`;
            }
            if (g.lat != null || (!g.zone && (g.place || g.at))) s += `<circle class="pp-pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${g.retained ? 8 : 6}" style="--c:${c}"/>`;
            if (label) s += `<text class="pp-lab" x="${(x + 10).toFixed(1)}" y="${(y - 9).toFixed(1)}">${esc(label)}</text>`;
        }
        return `<g class="${cls}" data-pp-g="${Number(g.id) || 0}">${s}</g>`;
    }

    function miniMap(el, {guesses = [], height = 300, onClick = null} = {}) {
        const st = {lat: 46.6, lon: 2.4, z: 5, guesses, draft: null, tool: '', poly: []};
        el.classList.add('pp-map'); el.style.height = height + 'px';
        el.innerHTML = `<div class="pp-map-tiles"></div><svg class="pp-map-svg" aria-hidden="true"></svg><div class="pp-map-zoom"><button type="button" data-ppz="1" aria-label="Zoomer" title="Zoomer">＋</button><button type="button" data-ppz="-1" aria-label="Dézoomer" title="Dézoomer">−</button></div><div class="pp-map-hint" hidden></div>`;
        const tiles = el.querySelector('.pp-map-tiles'), svg = el.querySelector('svg'), hint = el.querySelector('.pp-map-hint');
        const view = () => { const w = el.clientWidth, h = el.clientHeight; return {w, h, left: X(st.lon, st.z) - w / 2, top: Y(st.lat, st.z) - h / 2}; };
        function draw() {
            if (!el.isConnected) return;
            const {w, h, left, top} = view(); if (!w || !h) { requestAnimationFrame(draw); return; }
            const n = 2 ** st.z; let t = '';
            for (let x = Math.floor(left / TILE); x <= Math.floor((left + w) / TILE); x++) for (let y = Math.floor(top / TILE); y <= Math.floor((top + h) / TILE); y++) {
                if (y < 0 || y >= n) continue; const u = tileUrl(st.z, ((x % n) + n) % n, y); if (!u) continue;
                t += `<img src="${esc(u)}" alt="" draggable="false" referrerpolicy="no-referrer" style="left:${Math.round(x * TILE - left)}px;top:${Math.round(y * TILE - top)}px">`;
            }
            tiles.innerHTML = t;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const editing = st.draft ? Number(st.draft.id) || -1 : 0;
            let s = st.guesses.filter(g => Number(g.id) !== editing).map((g, i) => guessSvg(g, st.z, left, top, {faded: !!st.draft, label: st.guesses.length > 1 ? String(i + 1) : ''})).join('');
            if (st.draft) s += guessSvg(st.draft, st.z, left, top, {draft: true});
            if (st.tool === 'polygon' && st.poly.length) s += `<polyline class="pp-poly-draft" points="${st.poly.map(([la, lo]) => `${(X(lo, st.z) - left).toFixed(1)},${(Y(la, st.z) - top).toFixed(1)}`).join(' ')}"/>${st.poly.map(([la, lo]) => `<circle class="pp-vtx" cx="${(X(lo, st.z) - left).toFixed(1)}" cy="${(Y(la, st.z) - top).toFixed(1)}" r="4"/>`).join('')}`;
            svg.innerHTML = s;
        }
        const at = e => { const r = el.getBoundingClientRect(), {left, top} = view(); return [LAT(top + e.clientY - r.top, st.z), LON(left + e.clientX - r.left, st.z)]; };
        let drag = null;
        el.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('button')) return;
            drag = {x: e.clientX, y: e.clientY, moved: false, cx: X(st.lon, st.z), cy: Y(st.lat, st.z), circle: st.tool === 'circle' ? at(e) : null};
            if (drag.circle && st.draft) { st.draft.zone = {type: 'circle', lat: drag.circle[0], lon: drag.circle[1], r: 150}; st.draft.lat = st.draft.lon = null; draw(); }
            el.setPointerCapture?.(e.pointerId);
        });
        el.addEventListener('pointermove', e => {
            if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (!drag.moved) return;
            if (drag.circle && st.draft) { const [la, lo] = at(e); st.draft.zone = {type: 'circle', lat: drag.circle[0], lon: drag.circle[1], r: Math.max(5, Math.min(50000, Math.round(distM(drag.circle[0], drag.circle[1], la, lo))))}; draw(); return; }
            st.lon = LON(drag.cx - dx, st.z); st.lat = LAT(drag.cy - dy, st.z); draw();
        });
        el.addEventListener('pointerup', e => {
            const d = drag; drag = null; if (!d) return;
            if (d.circle) { api_.changed?.(); return; }
            if (d.moved) return;
            const [la, lo] = at(e); clickAt(la, lo);
        });
        el.addEventListener('dblclick', e => { if (st.tool === 'polygon') { e.preventDefault(); closePoly(); } });
        function clickAt(la, lo) {
            const g = st.draft;
            if (g && st.tool === 'point') { g.lat = la; g.lon = lo; g.zone = null; draw(); api_.changed?.(); return; }
            if (g && st.tool === 'polygon') { st.poly.push([la, lo]); draw(); say(`⬠ ${st.poly.length} point${st.poly.length > 1 ? 's' : ''} : clique les autres coins, puis double-clic (ou « ✓ Fermer la zone »).`); return; }
            if (g && st.tool === 'dir') { const o = originOf(g); if (!o) { say('🧭 Pose d’abord un point, une zone ou un lieu : la direction part de là.'); return; } g.bearing = Math.round(bearingOf(o[0], o[1], la, lo)); if (g.fov == null) g.fov = 60; draw(); api_.changed?.(); return; }
            onClick?.(la, lo);
        }
        function closePoly() {
            if (!st.draft) return;
            if (st.poly.length < 3) { say('⬠ Une zone a besoin d’au moins 3 points.'); return; }
            st.draft.zone = {type: 'polygon', pts: st.poly.slice()}; st.draft.lat = st.draft.lon = null; st.poly = []; draw(); api_.changed?.(); say('');
        }
        const say = txt => { hint.hidden = !txt; hint.textContent = txt || ''; };
        const zoomAt = dz => { st.z = Math.max(3, Math.min(19, st.z + dz)); draw(); };
        el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(), {w, h, left, top} = view(), px = e.clientX - r.left, py = e.clientY - r.top, la = LAT(top + py, st.z), lo = LON(left + px, st.z); st.z = Math.max(3, Math.min(19, st.z + (e.deltaY < 0 ? 1 : -1))); st.lon = LON(X(lo, st.z) - px + w / 2, st.z); st.lat = LAT(Y(la, st.z) - py + h / 2, st.z); draw(); }, {passive: false});
        el.querySelectorAll('[data-ppz]').forEach(b => b.addEventListener('click', () => zoomAt(Number(b.dataset.ppz))));
        function fit(list = st.guesses.concat(st.draft ? [st.draft] : [])) {
            const pts = [];
            list.forEach(g => { if (g.zone?.type === 'polygon') pts.push(...g.zone.pts); else if (g.zone?.type === 'circle') { const d = g.zone.r / 111000; pts.push([g.zone.lat - d, g.zone.lon - d], [g.zone.lat + d, g.zone.lon + d]); } const o = originOf(g); if (o) pts.push(o); });
            if (!pts.length) return false;
            const las = pts.map(p => p[0]), los = pts.map(p => p[1]), w = el.clientWidth || 420, h = el.clientHeight || height;
            let z = 17; for (; z > 3; z--) { if (X(Math.max(...los), z) - X(Math.min(...los), z) <= w * 0.7 && Y(Math.min(...las), z) - Y(Math.max(...las), z) <= h * 0.7) break; }
            st.z = z; st.lat = (Math.max(...las) + Math.min(...las)) / 2; st.lon = (Math.max(...los) + Math.min(...los)) / 2; draw(); return true;
        }
        const api_ = {state: st, draw, fit, say, closePoly,
            setGuesses(gs) { st.guesses = gs || []; draw(); },
            setDraft(g) { st.draft = g; st.poly = []; draw(); },
            setTool(t) { st.tool = t; st.poly = []; el.dataset.tool = t || ''; say({point: '📍 Clique l’endroit d’où la vue a été prise (ou ce qu’elle montre).', circle: '◯ Clique le centre et glisse pour le rayon.', polygon: '⬠ Clique les coins de la zone, puis double-clic.', dir: '🧭 Clique vers où regarde la photo.'}[t] || ''); draw(); },
            center(la, lo, z) { st.lat = la; st.lon = lo; if (z) st.z = z; draw(); }};
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(el);
        draw();
        return api_;
    }

    /* ═════════ « 📍 Où a-t-elle été prise ? » ═════════ */
    async function open(mediaId, {place = null, answer = null} = {}) {
        let D;
        try { D = await api('place_photo', {media_id: Number(mediaId)}); } catch (e) { toast(e.message, 'error'); return null; }
        const it = () => D.item;
        const dlg = ext.openDialog({eyebrow: 'IMAGE DE LIEU', title: '📍 Où a-t-elle été prise ?', wide: true, body: `<div class="pp-dlg" data-pp-dlg="${Number(mediaId)}">
            <div class="pp-left">
                <button type="button" class="pp-photo" data-pp-zoom title="Voir l’image en grand">${it().src ? `<img src="${esc(it().src)}" alt="${esc(it().title)}">` : '<span>📷</span>'}</button>
                <p class="pp-title"><b>${esc(it().title)}</b> <small class="pp-saved" data-ui-status aria-live="polite"></small></p>
                <div class="pp-info">
                    <label>Sorte<select name="pp_kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${it().kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Date de prise de vue<input name="pp_date" data-ui-date="nocal" maxlength="120" value="${esc(it().date_text || '')}" placeholder="vers 1905, entre 1900 et 1910…"></label>
                    <label class="pp-span">Éditeur ou photographe<input name="pp_author" maxlength="300" value="${esc(it().author || '')}" placeholder="Éd. Lévy et fils, ND Phot., studio Nadar…"></label>
                    <label class="pp-span">Notes<textarea name="pp_notes" rows="2" maxlength="8000" placeholder="Ce qu’on voit : enseignes, clocher, légende imprimée…">${esc(it().notes || '')}</textarea></label>
                </div>
                <div class="pp-actions">
                    <button type="button" class="button small" data-pp-cmp title="Une photo d’aujourd’hui prise du même endroit : rideau à faire glisser, fondu, recalage">🪟 Comparer avec aujourd’hui</button>
                    <button type="button" class="button small secondary" data-pp-ask title="Une demande d’entraide (forum, Geneanet, Facebook) ou une petite annonce, avec l’image, tes pistes et tes questions">🙋 Demander de l’aide</button>
                    ${ext.tresors?.open ? '<button type="button" class="button small secondary" data-pp-date title="Les Trésors : dater une vieille photo d’après le support, le carton, les vêtements">📷 Dater la photo</button>' : ''}
                </div>
                <div class="pp-today" data-pp-today></div>
                <div class="pp-asks" data-pp-asks></div>
            </div>
            <div class="pp-right">
                <div data-pp-map></div>
                <div class="pp-ghead"><h3>Hypothèses de lieu</h3><button type="button" class="button small" data-pp-new>＋ Ajouter une hypothèse</button></div>
                <div data-pp-edit></div>
                <div class="pp-guesses" data-pp-guesses></div>
            </div></div>`});
        const root = dlg.querySelector('.pp-dlg'), $ = s => root.querySelector(s);
        const map = miniMap($('[data-pp-map]'), {guesses: it().guesses, height: 280});
        const status = s => { const el = $('[data-ui-status]'); if (!el) return; if (UI().savedStatus) UI().savedStatus(el, s); else el.textContent = s === 'saved' ? '✓ Enregistré' : ''; };
        const reset = item => { D.item = item; drawGuesses(); drawToday(); map.setGuesses(item.guesses); changed(); };

        /* ── ce qu'on sait de l'image : gardé à chaque changement (K2) ── */
        let infoTimer = 0;
        const saveInfo = async () => {
            const f = k => root.querySelector(`[name="${k}"]`)?.value ?? '';
            status('saving');
            try { const r = await write({op: 'info', media_id: it().media_id, kind: f('pp_kind'), date_text: f('pp_date'), author: f('pp_author'), notes: f('pp_notes')}); D.item = r.item; status('saved'); changed(); }
            catch (e) { status('error'); toast(e.message, 'error', {retry: saveInfo}); }
        };
        root.querySelector('.pp-info').addEventListener('input', () => { clearTimeout(infoTimer); infoTimer = setTimeout(saveInfo, 700); });
        root.querySelector('.pp-info').addEventListener('change', () => { clearTimeout(infoTimer); infoTimer = setTimeout(saveInfo, 50); });

        /* ── les hypothèses ── */
        function drawGuesses() {
            const gs = it().guesses || [], box = $('[data-pp-guesses]');
            box.innerHTML = gs.length ? gs.map((g, i) => `<article class="pp-guess${g.retained ? ' is-retained' : ''}" data-pp-gid="${g.id}">
                    <span class="pp-num" style="--c:${CERT_COLOR[g.certainty] || '#1f6feb'}">${i + 1}</span>
                    <div class="pp-guess-main"><div class="pp-guess-top">${certBadge(g.certainty)}${g.retained ? ' <span class="pp-star" title="L’hypothèse retenue : c’est le lieu de l’image partout dans l’app">★ Retenue</span>' : ''}</div>
                        <b>${esc(guessWhere(g))}</b>
                        ${g.zone ? `<small class="muted">${g.zone.type === 'circle' ? `◯ Zone : cercle de ${Math.round(g.zone.r)} m` : `⬠ Zone dessinée (${g.zone.pts.length} points)`}</small>` : ''}
                        ${g.bearing != null ? `<small class="muted">🧭 Vue vers le ${esc(dirName(g.bearing))} (${Math.round(g.bearing)}°)</small>` : ''}
                        ${g.why ? `<p class="pp-why">${esc(g.why)}</p>` : ''}
                        <small class="muted">${[esc([g.author ? `Proposé par ${g.author}` : '', g.origin && g.origin !== 'me' ? g.origin_label : ''].filter(Boolean).join(' · ')), g.updated_at && UI().when ? UI().when(g.updated_at, {label: 'Modifié'}) : ''].filter(Boolean).join(' · ')}</small></div>
                    <div class="pp-guess-act">${g.retained ? '' : `<button type="button" class="icon-button small" data-pp-retain="${g.id}" title="Retenir cette hypothèse" aria-label="Retenir cette hypothèse">☆</button>`}
                        <button type="button" class="icon-button small" data-pp-edit-g="${g.id}" title="Modifier" aria-label="Modifier">✎</button>
                        <button type="button" class="icon-button small" data-pp-del="${g.id}" title="Supprimer" aria-label="Supprimer">🗑</button></div></article>`).join('')
                : (A().empty ? A().empty('Pas encore d’hypothèse : où crois-tu qu’elle a été prise ?', {icon: '📍', action: {label: '＋ Ajouter une hypothèse', attrs: 'data-empty-click="[data-pp-new]"'}}) : '');
        }

        /* ── l'éditeur d'une hypothèse (dans la fenêtre) ── */
        function editGuess(g, {ans = null} = {}) {
            const v = {id: 0, certainty: 'probable', retained: !(it().guesses || []).length, ...(g || {})};
            const draft = {id: v.id || -1, lat: v.lat ?? null, lon: v.lon ?? null, zone: v.zone ? JSON.parse(JSON.stringify(v.zone)) : null, bearing: v.bearing ?? null, fov: v.fov ?? null, place: v.place || null, certainty: v.certainty, at: v.at || null};
            const box = $('[data-pp-edit]'), pl = v.place || (place && !g ? place : null);
            if (pl && !g) draft.place = pl;
            box.innerHTML = `<div class="pp-gform" role="group" aria-label="Hypothèse de lieu">
                <h4>${ans ? '📨 Réponse reçue → nouvelle hypothèse' : v.id ? '✎ Modifier l’hypothèse' : '＋ Nouvelle hypothèse'}</h4>
                ${ans ? `<label>Qui a répondu ?<input name="author" maxlength="160" value="${esc(v.author || '')}" placeholder="Pseudo du forum, nom du lecteur…" required></label>` : ''}
                <div><span class="pk-lab">Lieu</span>${P().pickerField({name: 'place_id', kind: 'place', value: pl ? {id: pl.id, title: pl.name, name: pl.name, kind: 'place', short: pl.county || ''} : null})}</div>
                <div class="pp-tools" role="group" aria-label="Sur la carte"><span class="pk-lab">Sur la carte</span>
                    <div class="segmented">${[['point', '📍 Point'], ['circle', '◯ Cercle'], ['polygon', '⬠ Zone'], ['dir', '🧭 Direction']].map(([k, l]) => `<button type="button" data-pp-tool="${k}">${l}</button>`).join('')}</div>
                    <button type="button" class="button small secondary" data-pp-closepoly hidden>✓ Fermer la zone</button>
                    <small class="ui-hint" data-pp-geo></small><button type="button" class="link-button" data-pp-cleargeo>× Retirer le point, la zone et la direction</button></div>
                <div class="pp-grid"><label>Rue<input name="street" maxlength="200" list="pp-streets" value="${esc(v.street || '')}" placeholder="Grande-Rue, place de l’Église…"></label>
                    <label>Adresse<input name="address" maxlength="400" value="${esc(v.address || '')}" placeholder="12, à l’angle de la rue du Moulin…"></label>
                    <label data-pp-fovrow>Ouverture du cône<input type="number" name="fov" min="5" max="180" step="5" data-unit="°" value="${esc(v.fov ?? 60)}"></label></div>
                <datalist id="pp-streets">${(D.streets || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
                <div><span class="pk-lab">Certitude</span><div class="pp-cert" role="radiogroup" aria-label="Certitude">${Object.entries(CERT).map(([k, [l, kind]]) => `<label class="pp-cert-opt is-${kind}"><input type="radio" name="certainty" value="${k}" ${v.certainty === k ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>
                <label>Pourquoi ? <small class="muted">(les indices)</small><textarea name="why" rows="3" maxlength="4000" placeholder="L’enseigne « Café du Commerce », le clocher à bulbe, la légende imprimée, l’éditeur local…">${esc(v.why || '')}</textarea></label>
                ${ans ? '' : `<label>Proposé par <small class="muted">(vide = toi)</small><input name="author" maxlength="160" value="${esc(v.author || '')}"></label>`}
                <label class="checkbox-line"><input type="checkbox" name="retained" ${v.retained ? 'checked' : ''}> ★ C’est l’hypothèse retenue (le lieu de l’image partout dans l’app)</label>
                <div class="pp-gform-act"><button type="button" class="button secondary" data-pp-cancel>Annuler</button><button type="button" class="button" data-pp-gsave>${v.id ? 'Enregistrer l’hypothèse' : 'Ajouter l’hypothèse'}</button></div></div>`;
            // pas de <form> ici : la fenêtre en est déjà un (les formulaires ne s'emboîtent pas)
            const form = box.querySelector('.pp-gform');
            form.elements = new Proxy({}, {get: (_, k) => form.querySelector(`[name="${String(k)}"]`)});
            const values = () => { const o = {}; form.querySelectorAll('[name]').forEach(i => { if ((i.type === 'radio' || i.type === 'checkbox') && !i.checked) return; o[i.name] = i.value; }); return o; };
            form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=radio])')) { e.preventDefault(); submit(); } });
            map.setDraft(draft);
            const paintGeo = () => {
                const parts = [draft.lat != null ? `📍 ${draft.lat.toFixed(5)}, ${draft.lon.toFixed(5)}` : '', draft.zone ? (draft.zone.type === 'circle' ? `◯ cercle de ${draft.zone.r} m` : `⬠ zone de ${draft.zone.pts.length} points`) : '', draft.bearing != null ? `🧭 vers le ${dirName(draft.bearing)} (${draft.bearing}°)` : ''].filter(Boolean);
                form.querySelector('[data-pp-geo]').textContent = parts.length ? parts.join(' · ') : 'Rien sur la carte : choisis un outil, puis clique la carte.';
                form.querySelector('[data-pp-fovrow]').hidden = draft.bearing == null;
            };
            map.changed = paintGeo; paintGeo();
            if (!map.fit()) { if (pl?.lat != null) map.center(Number(pl.lat), Number(pl.lon), 14); }
            form.addEventListener('click', e => {
                const t = e.target.closest('[data-pp-tool]');
                if (t) { const on = map.state.tool !== t.dataset.ppTool; map.setTool(on ? t.dataset.ppTool : ''); form.querySelectorAll('[data-pp-tool]').forEach(b => b.classList.toggle('is-active', on && b === t)); form.querySelector('[data-pp-closepoly]').hidden = !(on && t.dataset.ppTool === 'polygon'); return; }
                if (e.target.closest('[data-pp-closepoly]')) { map.closePoly(); return; }
                if (e.target.closest('[data-pp-cleargeo]')) { draft.lat = draft.lon = draft.bearing = null; draft.zone = null; map.draw(); paintGeo(); return; }
                if (e.target.closest('[data-pp-cancel]')) { closeEditor(); return; }
                if (e.target.closest('[data-pp-gsave]')) submit();
            });
            form.addEventListener('picker-change', e => { if (e.detail?.name !== 'place_id') return; const x = e.detail.item; draft.place = x && !x.free ? {id: Number(x.id), name: x.title || x.name, lat: x.lat ?? x.latitude ?? null, lon: x.lon ?? x.longitude ?? null} : null; if (draft.place?.lat != null && draft.lat == null && !draft.zone) map.center(Number(draft.place.lat), Number(draft.place.lon), 14); map.draw(); });
            form.querySelector('[name=fov]')?.addEventListener('input', e => { draft.fov = Number(e.target.value) || 60; map.draw(); });
            async function submit() {
                const fv = values();
                if (ans && !String(fv.author || '').trim()) return UI().fail(form.elements.author, 'Qui a répondu ? Donne un nom ou un pseudo.');
                if (!Number(fv.place_id) && draft.lat == null && !draft.zone) return UI().fail(form.querySelector('.pk-input') || form.elements.street, 'Choisis un lieu, ou pose un point ou une zone sur la carte.');
                const body = {media_id: it().media_id, id: v.id || 0, place_id: Number(fv.place_id) || 0, lat: draft.lat, lon: draft.lon, zone: draft.zone, street: fv.street, address: fv.address,
                    bearing: draft.bearing, fov: draft.bearing != null ? Number(fv.fov) || 60 : null, certainty: fv.certainty || 'probable', why: fv.why, author: fv.author || '', retained: !!form.elements.retained.checked};
                const btn = form.querySelector('[data-pp-gsave]'); btn.disabled = true;
                try {
                    if (ans) {
                        const r = await write({...body, op: 'answer', ask_type: ans.type, ask_id: ans.id || 0});
                        reset(r.item); closeEditor();
                        A().undoToast(`Réponse de ${fv.author} notée comme hypothèse`, {undo: async () => { const u = await write({op: 'answer_undo', ...r.undo}); if (u.item) reset(u.item); }});
                    } else {
                        const r = await write({...body, op: 'guess'});
                        reset(r.item); closeEditor(); toast(v.id ? 'Enregistré' : 'Hypothèse ajoutée.', 'success');
                    }
                } catch (err) { if (!UI().showFormError?.(err, form.closest('form') || form)) toast(err.message, 'error'); }
                finally { btn.disabled = false; }
            }
            box.scrollIntoView?.({block: 'nearest'});
        }
        function closeEditor() { $('[data-pp-edit]').innerHTML = ''; map.setDraft(null); map.setTool(''); map.changed = null; }

        /* ── comparer avec aujourd'hui ── */
        function drawToday() {
            const t = it().today, box = $('[data-pp-today]');
            box.innerHTML = t ? `<div class="pp-today-row"><img src="${esc(t.thumb)}" alt=""><span><small class="muted">Photo d’aujourd’hui</small><br><b>${esc(t.title || 'Photo d’aujourd’hui')}</b></span><button type="button" class="icon-button small" data-pp-today-change title="Changer la photo d’aujourd’hui" aria-label="Changer">🖼</button><button type="button" class="icon-button small" data-pp-today-rm title="Retirer la photo d’aujourd’hui" aria-label="Retirer">×</button></div>` : '';
        }
        async function pickToday() {
            const ret = it().retained;
            const b = await P().openMediaPicker?.({types: ['image'], eyebrow: 'HIER ET AUJOURD’HUI', title: 'La photo d’aujourd’hui', intro: `Une photo prise du même endroit${ret ? ` (${guessWhere(ret)})` : ''}, aujourd’hui. Importe-la si elle n’est pas encore dans tes médias.`, okLabel: 'Comparer'});
            if (!b) return null;
            if (Number(b.id) === Number(it().media_id)) { toast('C’est la même image : choisis une photo d’aujourd’hui.', 'error'); return null; }
            const r = await write({op: 'info', media_id: it().media_id, today_media_id: Number(b.id)}); reset(r.item); return r.item.today;
        }
        async function compare() {
            try {
                let t = it().today; if (!t) t = await pickToday(); if (!t) return;
                if (!ext.openPhotoCompare) return toast('Le comparateur de photos n’est pas encore chargé.', 'error');
                const cid = it().comparison_id;
                await ext.openPhotoCompare({...(cid ? {id: cid} : {a: it().media_id, b: t.id}), purpose: 'place', onSaved: async c => { if (Number(c.id) !== Number(it().comparison_id)) { const r = await write({op: 'info', media_id: it().media_id, comparison_id: c.id}); D.item = r.item; } }});
            } catch (e) { toast(e.message, 'error'); }
        }

        /* ── demandes d'aide et réponses ── */
        function drawAsks() {
            const asks = D.asks || [], box = $('[data-pp-asks]');
            const st = {draft: 'Brouillon', posted: 'Publiée', answered: 'Réponse reçue', solved: 'Résolue', abandoned: 'Abandonnée', ready: 'Prête à envoyer', sent: 'Envoyée', published: 'Publiée', closed: 'Terminée', refused: 'Refusée'};
            box.innerHTML = `<h4>🙋 Demandes d’aide</h4>${asks.length ? `<ul class="pp-asklist">${asks.map(a => `<li><span>${a.type === 'press_ad' ? '✉️' : '🤝'} ${esc(a.label)}${a.where ? ` <small class="muted">· ${esc(a.where)}</small>` : ''} ${UI().badge ? UI().badge(st[a.status] || a.status, a.status) : ''}</span>
                    <span class="pp-askact"><button type="button" class="button small secondary" data-pp-answer="${a.type}:${a.id}" title="Une réponse reçue devient une nouvelle hypothèse, avec son auteur">📨 Noter une réponse</button><button type="button" class="icon-button small" data-pp-askopen="${a.type}:${a.id}" title="Ouvrir dans ${a.type === 'press_ad' ? 'Petites annonces' : 'Demandes d’entraide'}" aria-label="Ouvrir">↗</button></span></li>`).join('')}</ul>`
                : (A().empty ? A().empty('Aucune demande pour cette image.', {icon: '🙋'}) : '')}
                <button type="button" class="link-button" data-pp-answer="forum:0">📨 Noter une réponse venue d’ailleurs (forum, courrier, visite…)</button>`;
        }
        async function reloadAsks() { try { const d = await api('place_photo', {media_id: it().media_id}); D.asks = d.asks; drawAsks(); } catch (_) {} }

        root.addEventListener('click', async e => {
            const t = e.target.closest('button'); if (!t || !root.contains(t)) return;
            if (t.hasAttribute('data-pp-zoom')) { if (A().openLightbox) A().openLightbox([{id: it().media_id, filename: it().filename, title: it().title, media_type: 'image'}], 0, true); return; }
            if (t.hasAttribute('data-pp-new')) { editGuess(null); return; }
            if (t.dataset.ppEditG) { editGuess((it().guesses || []).find(g => g.id === Number(t.dataset.ppEditG))); return; }
            if (t.dataset.ppRetain) {
                try { const r = await write({op: 'retain', id: Number(t.dataset.ppRetain)}); reset(r.item);
                    A().undoToast('Hypothèse retenue : c’est maintenant le lieu de l’image', {undo: r.previous ? async () => { const u = await write({op: 'retain', id: r.previous}); reset(u.item); } : null});
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (t.dataset.ppDel) {
                try { const r = await write({op: 'delete_guess', id: Number(t.dataset.ppDel)}); reset(r.item);
                    A().undoToast('Hypothèse supprimée', {undo: async () => { const u = await write({op: 'restore_guess', snapshot: r.snapshot}); reset(u.item); }});
                } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (t.hasAttribute('data-pp-cmp')) { compare(); return; }
            if (t.hasAttribute('data-pp-today-change')) { try { await pickToday(); } catch (err) { toast(err.message, 'error'); } return; }
            if (t.hasAttribute('data-pp-today-rm')) { const before = it().today?.id; try { const r = await write({op: 'info', media_id: it().media_id, today_media_id: 0, comparison_id: 0}); reset(r.item); A().undoToast('Photo d’aujourd’hui retirée (elle reste dans les Médias)', {undo: async () => { const u = await write({op: 'info', media_id: it().media_id, today_media_id: before}); reset(u.item); }}); } catch (err) { toast(err.message, 'error'); } return; }
            if (t.hasAttribute('data-pp-ask')) { ask(it(), {after: reloadAsks}); return; }
            if (t.hasAttribute('data-pp-date')) { dlg.close(); ext.tresors.open('dater-photo'); return; }
            if (t.dataset.ppAnswer) { const [type, id] = t.dataset.ppAnswer.split(':'); editGuess(null, {ans: {type, id: Number(id)}}); return; }
            if (t.dataset.ppAskopen) { const [type, id] = t.dataset.ppAskopen.split(':'); dlg.close(); openAsk(type, Number(id)); }
        });
        drawGuesses(); drawToday(); drawAsks();
        map.fit() || (place?.lat != null && map.center(Number(place.lat), Number(place.lon), 13));
        if (answer) editGuess(null, {ans: answer});
        else if (!(it().guesses || []).length) editGuess(null);
        return dlg;
    }
    function openAsk(type, id) {
        const st = S();
        if (type === 'help_request') { st.hEdit = {list: 'help_requests', id}; st.listType = 'help_requests'; }
        else st.listType = 'press_ads';
        A().setModule('listes');
    }

    /** « 🙋 Demander de l'aide pour situer cette image » : créée dans 🤝 Demandes d'entraide ou ✉️ Petites annonces */
    function ask(item, {after = null} = {}) {
        const dlg = ext.openDialog({eyebrow: 'DEMANDER DE L’AIDE', title: '🙋 Demander de l’aide pour situer cette image', wide: true, submitLabel: 'Créer la demande',
            body: `<div class="pp-askform"><div class="pp-ask-side">${item.src ? `<img src="${esc(item.src)}" alt="">` : ''}
                    <a class="button small secondary" href="${esc(item.src)}" download="${esc((item.title || 'image').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80))}${esc((item.filename.match(/\.\w+$/) || [''])[0])}">⤓ Télécharger l’image</a>
                    <p class="ui-hint">Joins l’image à ton message : sur un forum, une page Facebook ou dans le courriel au journal.</p></div>
                <div class="pp-ask-main">
                    <fieldset class="pp-where"><legend>Où demander ?</legend>
                        <label class="checkbox-line"><input type="radio" name="where" value="help_request" checked> 🤝 Une demande d’entraide <small class="muted">(texte prêt à coller sur un forum, l’entraide Geneanet ou un groupe Facebook)</small></label>
                        <label class="checkbox-line"><input type="radio" name="where" value="press_ad"> ✉️ Une petite annonce dans un journal <small class="muted">(prix calculé dans « Petites annonces »)</small></label></fieldset>
                    <label data-pp-fmt>Forme du texte<select name="format"><option value="forum">Forum (message complet)</option><option value="geneanet">Entraide Geneanet</option><option value="facebook">Groupe Facebook (plus court)</option></select></label>
                    <label>Ta question, avec tes mots <small class="muted">(facultatif)</small><textarea name="question" rows="2" maxlength="2000" placeholder="Je pense à Saint-Martin, mais le clocher ne ressemble pas…"></textarea></label>
                    <label>Le texte (modifiable)<textarea name="message" rows="12" maxlength="20000"></textarea></label>
                    <div class="pp-ask-copy"><button type="button" class="button small secondary" data-pp-copy>📋 Copier le texte</button><small class="ui-hint">Les hypothèses et leurs indices sont repris tout seuls. Rien n’est envoyé par l’app : tu colles le texte toi-même.</small></div>
                </div></div>`,
            onOpen: d => {
                const f = d.querySelector('form');
                let edited = false, seq = 0;
                const fill = async () => {
                    if (edited) return; const my = ++seq, where = f.querySelector('[name=where]:checked').value;
                    d.querySelector('[data-pp-fmt]').hidden = where !== 'help_request';
                    try { const r = await api('place_photo_help_text', {media_id: item.media_id, format: where === 'press_ad' ? 'annonce' : f.elements.format.value, question: f.elements.question.value}); if (my === seq && !edited) f.elements.message.value = where === 'press_ad' ? r.short : r.message; } catch (e) { toast(e.message, 'error'); }
                };
                f.elements.message.addEventListener('input', () => { edited = true; });
                f.addEventListener('change', e => { if (e.target.name === 'where' || e.target.name === 'format') { edited = false; fill(); } });
                let qt = 0; f.elements.question.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(fill, 400); });
                d.querySelector('[data-pp-copy]').addEventListener('click', async () => {
                    try { await navigator.clipboard.writeText(f.elements.message.value); toast('Texte copié : colle-le sur le forum ou le groupe, avec l’image.'); }
                    catch (_) { f.elements.message.select(); document.execCommand('copy'); toast('Texte copié.'); }
                });
                fill();
            },
            onSubmit: async form => {
                const fv = A().formObject(form);
                if (!String(fv.message || '').trim()) return UI().fail(form.elements.message, 'Le texte de la demande est vide.');
                const r = await write({op: 'ask', media_id: item.media_id, where: fv.where, format: fv.format, question: fv.question, message: fv.message});
                const where = r.type === 'press_ad' ? '✉️ Petites annonces' : '🤝 Demandes d’entraide';
                toast(`Demande créée dans ${where} : les réponses reçues se notent ici (📨 Noter une réponse).`, 'success');
                after?.(r);
                return true;
            }});
        return dlg;
    }

    /* ═════════ Listes → 📍 Images de lieux (H10) ═════════ */
    let LD = null;
    ext.lists.place_images = async token => {
        try { LD = await list({all: 1}); } catch (e) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(e.message, {icon: '⛔'})}</section>`; return; }
        if (token !== S().workspaceToken) return;
        drawList();
    };
    function drawList() {
        const ws = A().$('#workspace'), U = UI();
        const lb = U.listBarState?.(KEY) || {}, fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const sort = lb.sort || 'recent', view = U.viewOf ? U.viewOf(KEY, 'cards') : 'cards';
        const all = LD?.items || [];
        const f = lb.f || {}, words = fold(lb.q).split(/\s+/).filter(Boolean);
        const decades = [...new Set(all.map(i => i.decade).filter(Boolean))].sort();
        const shown = all.filter(it => words.every(w => fold([it.title, it.author, it.date_text, it.notes, ...(it.guesses || []).flatMap(g => [placeText(g.place), g.street, g.address, g.why, g.author])].join(' ')).includes(w))
            && (!f.place?.id || (it.guesses || []).concat(it.retained ? [it.retained] : []).some(g => Number(g.place?.id) === Number(f.place.id)))
            && (!f.street || (it.guesses || []).some(g => fold(g.street) === fold(f.street)))
            && (!f.decade?.length || f.decade.includes(String(it.decade)))
            && (!f.cert?.length || (it.guesses || []).concat(it.retained && !it.guesses?.length ? [it.retained] : []).some(g => f.cert.includes(g.certainty)))
            && (!f.kind?.length || f.kind.includes(it.kind))
            && (!f.state || (f.state === 'unplaced' ? !it.placed : it.placed)));
        let rows = shown;
        if (sort === 'year') rows = [...shown].sort((a, b) => (a.year || 9999) - (b.year || 9999));
        else if (sort === 'street') rows = [...shown].sort((a, b) => (a.street || '￿').localeCompare(b.street || '￿', 'fr') || (a.year || 9999) - (b.year || 9999));
        else if (U.sortItems) rows = U.sortItems(shown, sort, {name: x => x.title, date: x => x.updated_at || ''});
        const item = it => {
            const r = it.retained;
            return {thumb: thumb(it.thumb, it.title), name: it.title, open: `data-pp-open="${it.media_id}"`,
                lines: [r ? '📍 ' + guessWhere(r) : 'Pas encore situé', [it.kind_label, it.date_text, it.author].filter(Boolean).join(' · ')],
                badges: [r ? {text: (CERT[r.certainty] || CERT.possible)[0], kind: (CERT[r.certainty] || CERT.possible)[1]} : {text: 'Sans lieu', kind: 'yellow'}, it.n_guesses > 1 ? {text: `${it.n_guesses} hypothèses`, kind: 'grey'} : null, it.today ? {text: 'Hier / aujourd’hui', kind: 'grey'} : null].filter(Boolean),
                when: it.updated_at || '', whenLabel: 'Modifié',
                menu: [`<button type="button" data-pp-open="${it.media_id}">📍 Où a-t-elle été prise ?</button>`, r?.at ? `<button type="button" data-pp-onmap="${it.media_id}">🗺 Voir sur la carte</button>` : '', `<button type="button" data-pp-askm="${it.media_id}">🙋 Demander de l’aide</button>`].filter(Boolean),
                actions: view === 'cards' ? '' : `<button type="button" class="icon-button small" data-pp-open="${it.media_id}" title="Où a-t-elle été prise ?" aria-label="Où a-t-elle été prise ?">📍</button>`};
        };
        const groupKey = it => (sort === 'street' ? (it.street || 'Rue pas encore notée') : sort === 'year' ? (it.decade ? `Années ${it.decade}` : 'Date inconnue') : '');
        let body = '';
        if (!all.length) body = A().emptyState({icon: '📍', text: 'Aucune image de lieu pour l’instant', hint: 'Cartes postales, photos anciennes, gravures, plans : choisis une image et dis où elle a été prise (une ou plusieurs hypothèses, avec leur certitude).', action: {label: '＋ Ajouter une image', attrs: 'data-pp-add'}});
        else if (!rows.length) body = A().emptyState({icon: '🔍', text: 'Aucune image ne correspond', hint: 'Change les mots cherchés ou retire un filtre.'});
        else if (groupKey(rows[0])) {
            const groups = []; rows.forEach(r => { const k = groupKey(r); const g = groups.at(-1); if (g && g.k === k) g.items.push(r); else groups.push({k, items: [r]}); });
            body = groups.map(g => `<h3 class="pp-group">${sort === 'street' ? '🛣' : '🕰'} ${esc(g.k)} <small class="muted">${plural(g.items.length, 'image', 'images')}</small></h3>${U.itemsHtml(view, g.items.map(item))}`).join('');
        } else body = U.itemsHtml ? U.itemsHtml(view, rows.map(item)) : '';
        const header = U.pageHeader ? U.pageHeader({title: 'Images de lieux', icon: '📍', where: 'Listes · Médias et documents',
            help: 'Cartes postales, photos anciennes, gravures et plans : où ils ont été pris (une ou plusieurs hypothèses avec leur certitude), rangés par rue et par époque, à comparer avec aujourd’hui.',
            primary: '<button type="button" class="button" data-pp-add>＋ Ajouter une image</button>', actions: ['<button type="button" class="button secondary" data-pp-map>🗺 Voir sur la carte</button>']}) : '<h2>📍 Images de lieux</h2>';
        ws.innerHTML = `<section class="page pp-page">${header}${all.length ? '<div data-pp-bar></div>' : ''}<div class="pp-list">${body}</div></section>`;
        const slot = ws.querySelector('[data-pp-bar]');
        if (slot && U.listBar) {
            const cnt = (fn, k) => all.filter(i => fn(i) === k).length;
            const bar = U.listBar({key: KEY, search: {placeholder: 'Chercher… (titre, lieu, rue, éditeur, indices)'},
                filters: [{id: 'place', label: 'Lieu', type: 'place', chipPrefix: 'À'},
                    {id: 'street', label: 'Rue', type: 'select', options: [['', 'Toutes les rues'], ...(LD.streets || []).map(s => [s, s, `Rue : ${s}`])], dflt: ''},
                    {id: 'decade', label: 'Époque', type: 'check', options: decades.map(d => [String(d), `Années ${d}`, `Années ${d}`, cnt(i => i.decade, d)])},
                    {id: 'cert', label: 'Certitude', type: 'check', options: Object.entries(CERT).map(([k, [l]]) => [k, l, l, all.filter(i => (i.guesses || []).some(g => g.certainty === k)).length])},
                    {id: 'kind', label: 'Sorte', type: 'check', options: Object.entries(KINDS).filter(([k]) => cnt(i => i.kind, k)).map(([k, l]) => [k, l, l, cnt(i => i.kind, k)])},
                    {id: 'state', label: 'Situées', type: 'radio', options: [['', 'Toutes'], ['placed', 'Situées'], ['unplaced', 'Sans lieu']], dflt: ''}],
                view: {dflt: 'cards', what: 'images', onChange: () => drawList()},
                sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A'], ['street', 'Par rue'], ['year', 'Par époque']], value: sort},
                onChange: (b, {what}) => { U.setSort?.(KEY, b.sort); if (what !== 'view') drawList(); }});
            bar.setCount(`${plural(rows.length, 'image', 'images')}${rows.length !== all.length ? ` sur ${all.length}` : ''}`);
            slot.replaceWith(bar);
        }
    }
    async function addImage(place = null) {
        const m = await P().openMediaPicker?.({types: ['image'], eyebrow: 'IMAGES DE LIEUX', title: 'Une image d’un lieu', intro: 'Une carte postale, une photo ancienne, une gravure, un plan… (importe-la si elle n’est pas encore dans tes médias).', okLabel: 'Situer cette image'});
        if (m) open(m.id, {place});
    }
    function refreshAll() {
        if (S()?.module === 'listes' && S().listType === 'place_images') list({all: 1}).then(d => { LD = d; if (S().listType === 'place_images') drawList(); }).catch(() => {});
        document.querySelectorAll('[data-pli-host]').forEach(h => { h.dataset.pliDone = ''; fillHost(h); });
        if (S()?.module === 'carte' && layerOn()) { MD = null; loadLayer(); }
    }
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-pp-open], [data-pp-add], [data-pp-map], [data-pp-onmap], [data-pp-askm]');
        if (!t || t.closest('.pp-dlg')) return;
        if (t.dataset.ppOpen) { e.preventDefault(); const host = t.closest('[data-pli-host]'); open(Number(t.dataset.ppOpen), {place: host ? hostPlace(host) : null}); return; }
        if (t.hasAttribute('data-pp-add')) { const host = t.closest('[data-pli-host]'); addImage(host ? hostPlace(host) : null); return; }
        if (t.hasAttribute('data-pp-map')) { showOnMap(null); return; }
        if (t.dataset.ppOnmap) { const it = (LD?.items || []).find(x => x.media_id === Number(t.dataset.ppOnmap)); showOnMap(it); return; }
        if (t.dataset.ppAskm) { const it = (LD?.items || []).find(x => x.media_id === Number(t.dataset.ppAskm)); if (it) ask(it); }
    });
    const hostPlace = h => (Number(h.dataset.pliPlace) ? {id: Number(h.dataset.pliPlace), name: h.dataset.pliName || '', lat: h.dataset.pliLat ? Number(h.dataset.pliLat) : null, lon: h.dataset.pliLon ? Number(h.dataset.pliLon) : null} : null);
    function showOnMap(it) {
        setLayer(true);
        const st = S(), at = it?.retained?.at;
        if (at) { st.mapCenter = {lat: Number(at.lat), lon: Number(at.lon)}; st.mapZoom = Math.max(Number(st.mapZoom) || 6, 15); st.mapKeepCenter = true; }
        if (st.mapMode === 'photos' || st.mapMode === 'cemetery') st.mapMode = 'standard';
        A().setModule('carte');
    }

    /* ═════════ Le bloc « 🖼 Images du lieu » (fiche d'un village, monographie de commune) ═════════ */
    async function fillHost(h) {
        if (h.dataset.pliDone === '1') return; h.dataset.pliDone = '1';
        const pl = hostPlace(h);
        let items = [];
        if (pl) { try { items = (await list({place_id: pl.id})).items || []; } catch (_) { items = []; } }
        if (!h.isConnected) return;
        const by = new Map();
        items.forEach(it => { const k = it.street || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
        const streets = [...by.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'fr'));
        const tile = it => `<button type="button" class="pp-tile" data-pp-open="${it.media_id}" title="Où a-t-elle été prise ?">${thumb(it.thumb, it.title)}<span><b>${esc(it.title)}</b><small class="muted">${esc([it.date_text || (it.decade ? `années ${it.decade}` : ''), it.retained ? (CERT[it.retained.certainty] || CERT.possible)[0].toLowerCase() : 'sans lieu'].filter(Boolean).join(' · '))}</small></span></button>`;
        const add = pl ? '<button type="button" class="button small secondary" data-pp-add>＋ Ajouter une image</button>' : '';
        h.innerHTML = `<section class="maintenance-panel pp-block"><div class="h-panel-head"><h3>🖼 Images du lieu${items.length ? ` <small class="muted">(${items.length})</small>` : ''}</h3>${items.length ? add : ''}</div>
            ${items.length ? `<div class="pp-block-grid"><div class="pp-block-list">${streets.map(s => {
                const its = by.get(s).sort((a, b) => (a.year || 9999) - (b.year || 9999)), dec = new Map();
                its.forEach(it => { const k = it.decade || 0; if (!dec.has(k)) dec.set(k, []); dec.get(k).push(it); });
                return `<div class="pp-street"><h4>🛣 ${esc(s || 'Rue pas encore notée')}</h4>${[...dec.entries()].map(([d, xs]) => `<div class="pp-epoch"><span class="pp-epoch-lab">${d ? `Années ${d}` : 'Date inconnue'}</span><div class="pp-tiles">${xs.map(tile).join('')}</div></div>`).join('')}</div>`;
            }).join('')}</div><div class="pp-block-map" data-pli-map></div></div>`
                : (A().empty ? A().empty(pl ? 'Aucune image de ce lieu : cartes postales, photos anciennes, gravures…' : 'Ce lieu n’est pas encore dans ta base.', {icon: '🖼', action: pl ? {label: '＋ Ajouter une image', attrs: 'data-pp-add'} : null}) : '')}</section>`;
        const mh = h.querySelector('[data-pli-map]');
        if (mh) {
            const gs = items.map(it => it.retained ? {...it.retained, id: it.media_id} : null).filter(Boolean);
            const mm = miniMap(mh, {guesses: gs, height: 320});
            requestAnimationFrame(() => { if (!mm.fit() && pl?.lat != null) mm.center(pl.lat, pl.lon, 14); });
        }
    }
    const scan = root => root.querySelectorAll?.('[data-pli-host]:not([data-pli-done="1"])').forEach(fillHost);
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-pli-host]')) fillHost(n); scan(n); } }).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ Le calque « 📍 Images de lieux » de la Carte ═════════ */
    const LAYER_KEY = 'lcnda-map-place-photos';
    const layerOn = () => { try { return localStorage.getItem(LAYER_KEY) === '1'; } catch (_) { return false; } };
    const setLayer = on => { try { localStorage.setItem(LAYER_KEY, on ? '1' : '0'); } catch (_) {} };
    let MD = null, mdLoading = null;
    const loadLayer = () => (mdLoading = mdLoading || list({}).then(d => { MD = d.items || []; mdLoading = null; A().drawMap?.(); }).catch(() => { mdLoading = null; }));
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage || strip.querySelector('[data-pp-layer]')) return;
        const layer = document.createElement('div'); layer.id = 'pp-layer'; layer.className = 'pp-layer';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const b = document.createElement('button'); b.type = 'button'; b.dataset.ppLayer = '1'; b.className = `button small ${layerOn() ? '' : 'secondary'}`; b.textContent = '📍 Images de lieux';
        b.title = 'Montrer les cartes postales, photos anciennes et gravures à l’endroit où elles ont été prises (zones, direction de la vue)'; b.setAttribute('aria-pressed', String(layerOn()));
        strip.insertBefore(b, strip.querySelector('.spacer') || strip.querySelector('#map-reset'));
        b.addEventListener('click', () => { setLayer(!layerOn()); b.classList.toggle('secondary', !layerOn()); b.setAttribute('aria-pressed', String(layerOn())); if (layerOn() && !MD) loadLayer(); A().drawMap?.(); });
        if (layerOn() && !MD) loadLayer();
        layer.addEventListener('click', e => { const m = e.target.closest('[data-pp-pin]'); if (!m) return; e.stopPropagation(); open(Number(m.dataset.ppPin)); });
        layer.addEventListener('pointerdown', e => { if (e.target.closest('[data-pp-pin]')) e.stopPropagation(); });
    });
    ext.mapDraw.push(({left, top, z, width, height}) => {
        const layer = document.getElementById('pp-layer'); if (!layer) return;
        if (!layerOn() || !MD) { layer.innerHTML = ''; return; }
        const items = MD.filter(it => it.retained?.at);
        const svg = items.map(it => guessSvg({...it.retained, retained: false}, z, left, top)).join('');
        const pins = items.map(it => { const x = X(it.retained.at.lon, z) - left, y = Y(it.retained.at.lat, z) - top; if (x < -60 || y < -60 || x > width + 60 || y > height + 60) return '';
            return `<button type="button" class="pp-pin" data-pp-pin="${it.media_id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--c:${CERT_COLOR[it.retained.certainty] || '#1f6feb'}" title="${esc(it.title)} — ${esc(guessWhere(it.retained))} (${esc((CERT[it.retained.certainty] || CERT.possible)[0].toLowerCase())})">${thumb(it.thumb, it.title)}</button>`; }).join('');
        layer.innerHTML = `<svg class="pp-layer-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">${svg}</svg>${pins}`;
    });

    /* ═════════ Les portes d'entrée : visionneuse, fiche de carte postale ═════════ */
    const lbItem = () => { const st = A()?.state; return st?.lightboxMedia?.[st.lightboxIndex] || null; };
    const isImage = m => !!m && (A().normalizedMediaType?.(m) || m.media_type) === 'image';
    function lightboxButton() {
        const bar = document.querySelector('#lightbox .lightbox-actions'); if (!bar) return;
        let b = bar.querySelector('#place-photo-media');
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'place-photo-media'; b.className = 'button secondary'; b.textContent = '📍 Où a-t-elle été prise ?';
            b.title = 'Une ou plusieurs hypothèses de lieu (lieu, point, zone, direction, certitude), comparer avec aujourd’hui, demander de l’aide';
            bar.insertBefore(b, bar.querySelector('#compare-media') || bar.firstChild);
            b.addEventListener('click', () => { const m = lbItem(); if (!isImage(m)) return toast('Choisis une image.', 'error'); open(Number(m.id)); });
        }
        b.hidden = !isImage(lbItem());
    }
    const watchLb = () => { const c = document.getElementById('lightbox-counter'); if (!c) return setTimeout(watchLb, 500); new MutationObserver(lightboxButton).observe(c, {childList: true, characterData: true, subtree: true}); lightboxButton(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchLb); else watchLb();

    // au catalogue des listes (même point d'enregistrement que les autres modules)
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === 'place_images')) app.defaultListTypes.push(['place_images', '04e2', 'Images de lieux']);
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);

    ext.placePhotos = {list, geojson, get: id => api('place_photo', {media_id: Number(id)}), open, ask, addImage, miniMap,
        onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); }, CERT, KINDS};
})();
