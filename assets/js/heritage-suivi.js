/* LCNDA — 🐾 Suivi des animaux (maquette validée docs/design/animaux-suivi.html, S1 à S19).
 * L'onglet du menu du haut « 🐾 Suivi des animaux » (caché au départ) : le MÊME moteur de widgets que le Tableau de bord
 * (app-tableau-de-bord.js), avec ses pages à lui (genealogie-suivi-blocks, app.js : dashboardSpace) ; chaque page de l'un
 * ou de l'autre peut contenir n'importe quel widget. Ici : les blocs du suivi (sv_…), l'en-tête et les pages (filtre
 * espèce / site par page), le ⋯ d'un bloc (📌 Mettre aussi dans le tableau de bord, ⧉, ⛶), les réglages gardés tout de
 * suite (K2), la carte des observations (points datés, reliés, ▶ rejouer), la fenêtre « Nouvelle observation »
 * (retrouver l'animal par ses bagues ou un n°, lecture douteuse « 7[K|X] »), l'import GPS (K13), les chiffres et les
 * exports, la liste « 🐾 Recensement » (Listes), les fiches « 🏞 Site de suivi » et « 👥 Groupe ».
 * La fiche d'un animal (onglets Marques, Observations, Santé, Groupe, Trajets) : heritage-suivi-fiche.js.
 * Le moteur sans écran (lecteurs GPX/KML/CSV, scores, géographie) : app-suivi-core.js. Serveur : lib/suivi.php.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['dashboard', 'dashboardConfig', 'lists']) ext[k] = ext[k] || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER, C = () => window.LCNDA_SUIVI;
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const plural = (n, w, p) => (A()?.plural ? A().plural(n, w, p) : `${n} ${w}`);
    const fmtN = n => Number(n || 0).toLocaleString('fr-FR');
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const RO = () => document.body.classList.contains('is-kiosk');
    const pad = n => String(n).padStart(2, '0');
    const clone = v => JSON.parse(JSON.stringify(v ?? null));
    const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const MONTHS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayIso = () => isoOf(new Date());
    const tIso = t => isoOf(new Date(t * 1000));
    const tTime = t => { const d = new Date(t * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const timeFr = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? `${Number(m[1])} h ${m[2]}` : String(t || ''); };
    function dateFr(iso, long = false) {
        const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(iso || '')); if (!m) return String(iso || '');
        if (!m[2]) return m[1];
        const mo = Number(m[2]) - 1; if (!m[3]) return `${long ? MONTHS_L[mo] : MONTHS[mo]} ${m[1]}`;
        return `${Number(m[3]) === 1 ? '1ᵉʳ' : Number(m[3])} ${long ? MONTHS_L[mo] : MONTHS[mo]} ${m[1]}`;
    }
    const daysSince = iso => { if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return null; return Math.floor((Date.parse(todayIso()) - Date.parse(String(iso).slice(0, 10))) / 864e5); };
    function whenShort(iso, time = '') {
        const d = daysSince(iso), tt = time ? ` ${timeFr(time)}` : '';
        if (d === 0) return `auj.${tt}`; if (d === 1) return `hier${tt}`;
        if (d != null && iso.slice(0, 4) === todayIso().slice(0, 4)) return dateFr(iso).replace(/ \d{4}$/, '');
        return dateFr(iso);
    }
    function ago(iso) {
        const d = daysSince(iso); if (d == null) return iso ? dateFr(iso) : '';
        if (d < 1) return 'aujourd’hui'; if (d < 60) return plural(d, 'jour'); if (d < 730) return `${Math.round(d / 30.4)} mois`; return plural(Math.round(d / 365.25), 'an');
    }
    const kmText = k => k == null ? '' : k < 1 ? `${Math.round(k * 1000)} m` : `${k.toLocaleString('fr-FR', {maximumFractionDigits: k < 10 ? 1 : 0})} km`;
    const COLORS = ['#055dff', '#e8590c', '#7b3fb5', '#1a8a3a', '#d7262e', '#0aa2a8', '#b8860b', '#c2185b', '#455a64', '#6d4c41'];

    /* ═════════ Les données (une seule demande pour tous les blocs, gardée 3 s) ═════════ */
    let cache = null, cacheAt = 0, pending = null;
    function overview(force = false) {
        if (!force && cache && Date.now() - cacheAt < 3000) return Promise.resolve(cache);
        if (pending) return pending;
        pending = api('suivi', {op: 'overview'}).then(d => { cache = d; cacheAt = Date.now(); pending = null; return d; }).catch(e => { pending = null; throw e; });
        return pending;
    }
    const invalidate = () => { cache = null; };
    async function write(op, body = {}) { const r = await api('suivi_write', {}, {method: 'POST', body: {op, ...body}}); invalidate(); return r?.result ?? r; }
    /** Après une écriture : l'écran affiché est redessiné (Suivi, tableau de bord, liste, fiche d'un animal) */
    async function refreshView() {
        invalidate(); const st = A().state;
        if (st.module === 'dashboard' || st.module === 'suivi') return A().renderDashboard();
        if (st.module === 'listes' && st.listType === 'recensement') return ext.lists.recensement(++st.workspaceToken);
        if (st.module === 'listes' && st.listType === 'pets' && st.hPet) return ext.lists.pets(++st.workspaceToken);
        if (st.module === 'listes') return A().renderList?.();
    }
    const animalById = (D, id) => (D?.animals || []).find(a => a.id === Number(id)) || null;
    const speciesIcon = sp => (ext.speciesIcon ? ext.speciesIcon(sp) : '🐾');
    const profileOf = a => C().profileOf(a || {});
    /** Le dernier passage connu (observation ou point GPS) */
    function lastSeen(a) {
        const o = a?.last_obs; let best = o?.iso ? {iso: o.iso, time: o.time, place: o.place || o.place_text, lat: o.lat, lon: o.lon, src: o.source} : null;
        if (a?.gps?.t1) { const iso = tIso(a.gps.t1); if (!best || iso >= best.iso) best = {iso, time: tTime(a.gps.t1), place: 'position GPS', lat: a.gps_last?.lat, lon: a.gps_last?.lon, src: 'gps'}; }
        return best;
    }
    const sitesOf = D => Object.fromEntries((D?.sites || []).map(s => [s.id, s]));
    const placeOfObs = (o, D) => (o.site_id && sitesOf(D)[o.site_id]?.name) || o.place || o.place_text || (Number.isFinite(o.lat) ? `${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}` : '');

    /* ═════════ Petits morceaux communs (pastilles, bagues, animal) ═════════ */
    const REL = {full: ['Lue en entier', 'green'], partial: ['Lecture partielle', 'yellow'], colors: ['Couleurs seules', 'yellow'], doubt: ['Doute', 'red'], metal: ['Bague métal lue', 'green'], photo: ['Photo-identifié', 'green']};
    function relBadge(o) {
        if (o?.source === 'gps') return badge('GPS', 'grey');
        const r = REL[o?.reliability]; return r ? badge(r[0], r[1]) : '';
    }
    /** « lecture : 7[K|X] (doute) » */
    function readingText(o) {
        if (!o?.reading) return '';
        const r = C().parseReading(o.reading);
        return `lecture : ${r.text}${r.doubtful ? ' (doute)' : r.unknown || r.partial ? ' (pas tout lu)' : ''}`;
    }
    const HS = () => Object.fromEntries(C().HEALTH_STATES.map(([k, l, c]) => [k, [l, c]]));
    const healthBadge = s => { const h = HS()[s]; return h ? badge(h[0], h[1]) : ''; };
    /** Les bagues de couleur en petit : deux colonnes (patte gauche, patte droite), haut et bas */
    function ringsMini(colors, {big = false} = {}) {
        if (!colors) return '';
        const ring = r => r ? `<i class="${r.metal ? 'is-metal' : ''}" style="background:${esc(r.metal ? '#c0c4c8' : r.color || '#fff')}"${r.code ? ` title="${esc(r.code)}"` : ''}>${big && r.code ? `<b style="color:${esc(r.code_color || '#111')}">${esc(r.code)}</b>` : ''}</i>` : '<i class="is-none"></i>';
        return `<span class="sv-rings${big ? ' is-big' : ''}" title="${esc(C().comboText(colors))}">${['L', 'R'].map(l => `<span>${(colors[l] || [null, null]).map(ring).join('')}</span>`).join('')}</span>`;
    }
    /** La vignette d'un animal : sa photo, sinon ses bagues, sinon le rond orange 🐾 (comme le menu de choix) */
    function animalThumb(a, size = 34) {
        if (a?.media && A().mediaThumbHtml) return `<span class="sv-thumb" style="--sv-s:${size}px">${A().mediaThumbHtml(a.media)}</span>`;
        const rings = C().ringsOf(a || {});
        if (rings) return `<span class="sv-thumb is-rings" style="--sv-s:${size}px">${ringsMini(rings)}</span>`;
        return `<span class="sv-thumb is-ico" style="--sv-s:${size}px" aria-hidden="true">${speciesIcon(a?.species)}</span>`;
    }
    const animalLink = (a, extra = '') => a ? `<button type="button" class="sv-pet-link" data-sv-pet="${a.id}">${esc(a.title)}${extra}</button>` : '<span class="muted">sans fiche</span>';
    const codeOf = a => { const r = C().ringsOf(a || {}); if (r) return C().comboText(r); const m = (a?.marks || []).find(x => !x.end_iso && !x.end_date && x.code); return m ? `${C().MARKS[m.kind]?.label || 'Marque'} ${m.code}` : ''; };

    /* ═════════ La carte (fond de carte de l'app, points datés, trajets, contours ; glisser, ＋ −, ▶ rejouer) ═════════ */
    const MAP_KEY = 'genealogie-suivi-map';
    const mapPrefs = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch (_) { return {}; } };
    const saveMapPrefs = p => { try { localStorage.setItem(MAP_KEY, JSON.stringify({...mapPrefs(), ...p})); } catch (_) {} };
    function defaultBg() {
        const p = mapPrefs(); if (p.bg) return A().mapBackgroundValue ? A().mapBackgroundValue(p.bg) : p.bg;
        if (document.documentElement.dataset.theme === 'dark') return 'dark';
        try { return A().mapBackgroundValue(JSON.parse(localStorage.getItem('genealogie-design') || '{}').mapBackground); } catch (_) { return 'light'; }
    }
    /**
     * mapView(hôte, {series: [{name, color, line, dashed, numbered, points: [{lat, lon, t, html}]}], polygons: [{coords, color, label}], home, height, wheel, onClick})
     * → {draw, setTime(t), fit, setSeries(series), setBg(bg)}
     */
    function mapView(host, o = {}) {
        const app = A();
        host.innerHTML = `<div class="sv-map" style="height:${Number(o.height) || 300}px" data-ctx-off><div class="sv-map-tiles"></div><svg class="sv-map-svg" xmlns="http://www.w3.org/2000/svg"></svg>
            <div class="sv-map-zoom"><button type="button" class="icon-button small" data-z="1" aria-label="Rapprocher">＋</button><button type="button" class="icon-button small" data-z="-1" aria-label="Éloigner">−</button><button type="button" class="icon-button small" data-z="0" aria-label="Tout voir">⤢</button></div>
            <div class="sv-map-pop" hidden></div></div>`;
        const root = host.firstElementChild, tilesEl = root.querySelector('.sv-map-tiles'), svg = root.querySelector('svg'), pop = root.querySelector('.sv-map-pop');
        let series = o.series || [], polygons = o.polygons || [], bg = o.bg || defaultBg(), z = 12, cx = 0, cy = 0, T = null;
        const W = () => root.clientWidth || 600, H = () => root.clientHeight || 300;
        const all = () => [...series.flatMap(s => s.points), ...polygons.flatMap(p => p.coords.map(c => ({lat: c[0], lon: c[1]}))), ...(o.home ? [o.home] : [])].filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
        function fit() {
            const pts = all(); if (!pts.length) { z = 5; cx = app.lngToX(2.35, z); cy = app.latToY(46.6, z); return; }
            z = 2;
            for (let k = 17; k >= 2; k--) { const xs = pts.map(p => app.lngToX(p.lon, k)), ys = pts.map(p => app.latToY(p.lat, k)); if (Math.max(...xs) - Math.min(...xs) <= W() - 70 && Math.max(...ys) - Math.min(...ys) <= H() - 70) { z = k; break; } }
            if (pts.length === 1) z = Math.min(z, 15);
            const xs = pts.map(p => app.lngToX(p.lon, z)), ys = pts.map(p => app.latToY(p.lat, z));
            cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        }
        const px = (lat, lon) => [app.lngToX(lon, z) - (cx - W() / 2), app.latToY(lat, z) - (cy - H() / 2)];
        function draw() {
            const w = W(), h = H(), left = cx - w / 2, top = cy - h / 2, world = 2 ** z;
            let tiles = '';
            if (bg !== 'grid') for (let tx = Math.floor(left / 256); tx <= Math.floor((left + w) / 256); tx++) for (let ty = Math.floor(top / 256); ty <= Math.floor((top + h) / 256); ty++) {
                if (ty < 0 || ty >= world) continue;
                tiles += `<img alt="" draggable="false" referrerpolicy="no-referrer" src="${esc(app.mapTileUrl(bg, z, ((tx % world) + world) % world, ty))}" style="left:${Math.round(tx * 256 - left)}px;top:${Math.round(ty * 256 - top)}px">`;
            }
            tilesEl.innerHTML = tiles;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h);
            let out = '';
            polygons.forEach(pg => { if (pg.coords.length < 2) return; const pts = pg.coords.map(c => px(c[0], c[1]).map(v => v.toFixed(1)).join(',')).join(' '); out += `<polygon points="${pts}" fill="${esc(pg.color || '#1a8a3a')}" fill-opacity=".14" stroke="${esc(pg.color || '#1a8a3a')}" stroke-width="2" stroke-dasharray="${pg.dashed === false ? '' : '6 4'}"><title>${esc(pg.label || '')}</title></polygon>`; });
            series.forEach((s, si) => {
                const pts = s.points.filter(p => Number.isFinite(p.lat) && (T == null || p.t == null || p.t <= T));
                if (s.line && pts.length > 1) out += `<polyline points="${pts.map(p => px(p.lat, p.lon).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${esc(s.color)}" stroke-width="${s.gps ? 2.2 : 2.5}" stroke-opacity=".9" ${s.dashed ? 'stroke-dasharray="7 5"' : ''} stroke-linejoin="round"/>`;
                pts.forEach((p, i) => {
                    if (s.gps && i !== pts.length - 1 && i !== 0) return;
                    const [x, y] = px(p.lat, p.lon); if (x < -30 || y < -30 || x > w + 30 || y > h + 30) return;
                    const col = p.color || s.color, n = s.numbered ? (p.n ?? i + 1) : '';
                    out += `<g class="sv-map-pt" data-s="${si}" data-i="${s.points.indexOf(p)}" tabindex="0" role="button" aria-label="${esc(p.title || s.name)}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n !== '' ? 9 : 6}" fill="${n !== '' ? '#fff' : esc(col)}" stroke="${esc(col)}" stroke-width="${n !== '' ? 2.5 : 2}"/>${n !== '' ? `<text x="${x.toFixed(1)}" y="${(y + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${esc(col)}">${n}</text>` : ''}</g>`;
                });
            });
            if (o.home && Number.isFinite(o.home.lat)) { const [x, y] = px(o.home.lat, o.home.lon); out += `<text x="${x.toFixed(1)}" y="${(y + 7).toFixed(1)}" text-anchor="middle" font-size="20">🏠</text>`; }
            svg.innerHTML = out;
        }
        root.addEventListener('click', e => {
            const zb = e.target.closest('[data-z]');
            if (zb) { const d = Number(zb.dataset.z); if (!d) fit(); else zoomBy(d, W() / 2, H() / 2); draw(); return; }
            const g = e.target.closest('.sv-map-pt');
            if (g) { const p = series[g.dataset.s]?.points[g.dataset.i]; if (p?.html) { pop.innerHTML = `<button type="button" class="icon-button small sv-map-pop-x" aria-label="Fermer">×</button>${p.html}`; pop.hidden = false; const r = root.getBoundingClientRect(), gr = g.getBoundingClientRect(); pop.style.left = `${Math.max(4, Math.min(W() - 270, gr.left - r.left + 14))}px`; pop.style.top = `${Math.max(4, Math.min(H() - 120, gr.top - r.top - 10))}px`; } return; }
            if (e.target.closest('.sv-map-pop-x')) { pop.hidden = true; return; }
            if (e.target.closest('.sv-map-pop')) return;
            pop.hidden = true;
            if (o.onClick && !moved) { const r = root.getBoundingClientRect(), x = e.clientX - r.left + cx - W() / 2, y = e.clientY - r.top + cy - H() / 2; const lon = x / (256 * 2 ** z) * 360 - 180, n = Math.PI - 2 * Math.PI * y / (256 * 2 ** z), lat = 180 / Math.PI * Math.atan(.5 * (Math.exp(n) - Math.exp(-n))); o.onClick({lat, lon}); }
        });
        function zoomBy(d, ax, ay) { const nz = Math.max(2, Math.min(19, z + d)); if (nz === z) return; const k = 2 ** (nz - z); const wx = cx - W() / 2 + ax, wy = cy - H() / 2 + ay; cx = wx * k - ax + W() / 2; cy = wy * k - ay + H() / 2; z = nz; }
        let drag = null, moved = false;
        root.addEventListener('pointerdown', e => { if (e.target.closest('button, .sv-map-pt, .sv-map-pop')) return; drag = {x: e.clientX, y: e.clientY, cx, cy}; moved = false; });
        window.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; cx = drag.cx - dx; cy = drag.cy - dy; requestAnimationFrame(draw); });
        window.addEventListener('pointerup', () => { drag = null; setTimeout(() => { moved = false; }, 0); });
        root.addEventListener('dblclick', e => { const r = root.getBoundingClientRect(); zoomBy(1, e.clientX - r.left, e.clientY - r.top); draw(); });
        if (o.wheel) root.addEventListener('wheel', e => { e.preventDefault(); const r = root.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); draw(); }, {passive: false});
        fit(); draw();
        return {draw, fit: () => { fit(); draw(); }, setTime: t => { T = t; draw(); }, setSeries: (s, p) => { series = s; if (p) polygons = p; draw(); }, setBg: b => { bg = b; draw(); }, root};
    }
    /** ▶ Rejouer : les points apparaissent dans l'ordre (curseur du temps, vitesse) */
    function replayBar(host, t0, t1, onTime) {
        if (!(t1 > t0)) { host.innerHTML = ''; return null; }
        host.innerHTML = `<div class="sv-replay"><button type="button" class="button small" data-play>▶ Rejouer</button><small class="muted">${esc(dateFr(tIso(t0)))}</small><input type="range" min="${t0}" max="${t1}" step="60" value="${t1}" aria-label="Le temps" data-ui-off><small class="muted">${esc(dateFr(tIso(t1)))}</small><b data-at>${esc(dateFr(tIso(t1)))}</b>
            <select data-speed aria-label="Vitesse"><option value="3600">1 heure par seconde</option><option value="86400" selected>1 jour par seconde</option><option value="604800">1 semaine par seconde</option><option value="2592000">1 mois par seconde</option></select></div>`;
        const r = host.querySelector('input'), b = host.querySelector('[data-play]'), at = host.querySelector('[data-at]'); let timer = null;
        const set = v => { r.value = v; const d = new Date(v * 1000); at.textContent = `${dateFr(tIso(v))}${t1 - t0 < 3 * 86400 ? `, ${timeFr(tTime(v))}` : ''}`; onTime(v >= t1 ? null : Number(v)); void d; };
        const stop = () => { clearInterval(timer); timer = null; b.textContent = '▶ Rejouer'; };
        r.addEventListener('input', () => { stop(); set(Number(r.value)); });
        b.addEventListener('click', () => {
            if (timer) return stop();
            let v = Number(r.value) >= t1 ? t0 : Number(r.value); b.textContent = '⏸ Pause';
            timer = setInterval(() => { if (!host.isConnected) return stop(); v += Number(host.querySelector('[data-speed]').value) / 10; if (v >= t1) { set(t1); stop(); return; } set(v); }, 100);
        });
        return {stop};
    }
    const tOf = o => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(o.iso || ''); if (!m) return null; const t = /^(\d{2}):(\d{2})$/.exec(o.time || '') || [0, 12, 0]; return Math.round(new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]).getTime() / 1000); };
    function obsPopup(o, a, D) {
        return `<b>${esc(speciesIcon(a?.species))} ${esc(a?.title || 'Animal sans fiche')}</b><br>${esc(o.iso ? dateFr(o.iso, true) : o.date)}${o.time ? `, ${esc(timeFr(o.time))}` : ''}<br>📍 ${esc(placeOfObs(o, D))}${o.behaviors?.length ? ` · ${esc(o.behaviors.map(b => (C().BEHAVIORS[b] || b).replace(/^\S+\s/, '')).join(', '))}` : ''}${o.count ? ` (${o.count})` : ''}<br>${relBadge(o)} ${o.reading ? `<small class="muted">${esc(readingText(o))}</small>` : ''}<br><button type="button" class="link-button" data-sv-obs="${o.id}">↗ Ouvrir l’observation</button>`;
    }
    /** Les séries de la carte : une par animal (observations datées, numérotées dans l'ordre) + trajets GPS */
    async function mapSeries(D, animals, obs, {link = true, gps = true, by = 'animal', from = 0} = {}) {
        const series = [], ids = new Set(animals.map(a => a.id));
        const byPet = new Map();
        obs.filter(o => o.pet_id && ids.has(o.pet_id) && Number.isFinite(o.lat)).forEach(o => { if (!byPet.has(o.pet_id)) byPet.set(o.pet_id, []); byPet.get(o.pet_id).push(o); });
        const years = [...new Set(obs.map(o => (o.iso || '').slice(0, 4)).filter(Boolean))].sort();
        animals.forEach((a, i) => {
            const list = (byPet.get(a.id) || []).slice().sort((x, y) => (tOf(x) || 0) - (tOf(y) || 0));
            if (!list.length) return;
            const color = COLORS[i % COLORS.length];
            series.push({key: a.id, name: a.title, color, line: link, dashed: true, numbered: link, points: list.map((o, k) => ({lat: o.lat, lon: o.lon, t: tOf(o), n: k + 1, title: `${a.title} · n° ${k + 1}`, color: by === 'year' ? COLORS[years.indexOf((o.iso || '').slice(0, 4)) % COLORS.length] : color, html: `${obsPopup(o, a, D).replace('</b>', ` · n° ${k + 1}</b>`)}`}))});
        });
        if (gps) {
            const withGps = animals.filter(a => a.gps?.n);
            const res = await Promise.all(withGps.slice(0, 12).map(a => api('suivi', {op: 'gps', pet_id: a.id, from, max: 3000}).catch(() => null)));
            res.forEach((r, i) => { if (!r?.points?.length) return; const a = withGps[i], color = COLORS[animals.indexOf(a) % COLORS.length]; series.push({key: 'g' + a.id, name: `${a.title} · balise GPS`, color, line: true, gps: true, points: r.points.map(p => ({t: p[0], lat: p[1], lon: p[2], html: `<b>📡 ${esc(a.title)}</b><br>${esc(dateFr(tIso(p[0]), true))}, ${esc(timeFr(tTime(p[0])))}`}))}); });
        }
        return series;
    }
    const sitePolygons = (D, ids = null) => (D.sites || []).filter(s => (s.outline || []).length > 2 && (!ids || ids.includes(s.id))).map(s => ({coords: s.outline, color: '#1a8a3a', label: s.name}));

    /* ═════════ Ce que montre un bloc : ses animaux, sa période — ou ceux de sa page (filtre espèce / site) ═════════ */
    function pageFilter() { const st = A().state; if (st.module !== 'suivi') return {}; try { return A().currentDashboardPage()?.filter || {}; } catch (_) { return {}; } }
    function scope(D, widget, {period = ''} = {}) {
        const cfg = widget?.config || {}, pf = pageFilter();
        const pets = (Array.isArray(cfg.pets) ? cfg.pets : []).map(Number).filter(Boolean);
        const species = pets.length ? '' : (cfg.species || pf.species || ''), taxon = pets.length ? '' : String(cfg.taxon || pf.taxon || '').toLowerCase(), site = Number(cfg.site || (pets.length ? 0 : pf.site) || 0);
        let animals = (D.animals || []).filter(a => a.tracked);
        if (pets.length) animals = animals.filter(a => pets.includes(a.id));
        if (species) animals = animals.filter(a => a.species === species || profileOf(a) === species);
        if (taxon) animals = animals.filter(a => String(a.taxon).toLowerCase().includes(taxon));
        const per = cfg.period || period;
        const from = per === '7' ? isoOf(new Date(Date.now() - 7 * 864e5)) : per === '30' ? isoOf(new Date(Date.now() - 30 * 864e5)) : per === 'year' ? `${new Date().getFullYear()}-01-01` : per === 'range' ? (cfg.from || '') : '';
        const ids = new Set(animals.map(a => a.id));
        let obs = (D.observations || []).filter(o => (o.pet_id ? ids.has(o.pet_id) : !pets.length && !species && !taxon) && (!from || (o.iso || '') >= from) && (!site || o.site_id === site));
        if (site) { const seen = new Set(obs.map(o => o.pet_id)); animals = animals.filter(a => seen.has(a.id)); }
        const health = (D.health || []).filter(h => ids.has(h.pet_id));
        return {animals, obs, health, from, site, per, fromT: from ? Math.round(Date.parse(from) / 1000) : 0};
    }
    const PERIOD_TXT = {'7': '7 jours', '30': '30 jours', year: 'cette année', all: '', range: 'période choisie'};
    const titleOf = (widget, dflt) => { const t = String(widget?.config?.title || '').trim() || dflt; return A().state.module === 'dashboard' ? `🐾 ${t}` : t; };
    const card = (index, widget, dflt, count, body, span, actions = '') => A().card(index, titleOf(widget, dflt), count, body, span, actions);

    /* ═════════ Les blocs (widgets) ═════════ */
    const WIDGETS = [
        ['sv_map', 'Carte des observations', '🗺', '8', 'Les passages datés sur la carte, reliés dans l’ordre si tu veux, avec les trajets GPS ; ⛶ en grand pour rejouer le temps.'],
        ['sv_recent', 'Dernières observations', '👁', '6', 'Quand, où, qui a été vu, et si la bague a été bien lue.'],
        ['sv_animals', 'Animaux suivis', '🐾', '8', 'Les animaux suivis en vignettes, avec la dernière fois qu’on les a vus.'],
        ['sv_gps_day', 'Trajet GPS du jour', '📡', '6', 'La journée (ou la nuit) d’un animal qui porte une balise ou un collier GPS.'],
        ['sv_stats', 'Chiffres', '📊', '4', 'Animaux vus par mois, distance parcourue, zone fréquentée, jamais revus.'],
        ['sv_counts', 'Comptages d’un site', '🔢', '6', 'Les comptages datés d’un site (dortoir, nids…) et leur courbe.'],
        ['sv_missing', 'Animaux à retrouver', '⏳', '6', 'Les animaux pas revus depuis un certain nombre de jours.'],
        ['sv_find', 'Retrouver par bague ou puce', '🔖', '4', 'Une case pour retrouver un animal par ses couleurs, un code gravé, une bague métal, une puce, un tatouage ou une boucle.'],
        ['sv_import', 'Import GPS rapide', '⤒', '4', 'Déposer un fichier GPX, KML ou CSV d’une balise ou d’un collier.'],
        ['sv_meteo', 'Météo du jour d’observation', '🌦', '4', 'Le temps qu’il faisait le jour de la dernière observation (si la Météo d’autrefois est installée).'],
        ['sv_health', '🩺 Suivi vétérinaire et état', '🩺', '12', 'L’état de chacun d’un coup d’œil, les derniers soins et les causes de blessures.'],
        ['sv_groups', '👥 Groupes', '👥', '6', 'Les groupes, meutes, troupes ou pods suivis, leurs membres et leurs rôles.'],
    ];
    const LIMITS = {sv_recent: 6, sv_missing: 6, sv_animals: 8, sv_health: 8};
    function registerWidgets() {
        const app = A(); if (!app?.defaultDashboardBlocks) return;
        WIDGETS.forEach(([k, l, , w, info]) => {
            if (!app.defaultDashboardBlocks.some(x => x[0] === k)) app.defaultDashboardBlocks.push([k, l]);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[k] = w;
            if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[k] = info;
        });
        if (app.defaultDashboardBlockLimits) Object.assign(app.defaultDashboardBlockLimits, LIMITS);
        if (app.defaultListTypes && !app.defaultListTypes.some(x => x[0] === 'recensement')) app.defaultListTypes.push(['recensement', '27', '🐾 Recensement']);
    }
    registerWidgets(); document.addEventListener('DOMContentLoaded', registerWidgets, {once: true});
    const W0 = (type, width, config = {}) => ({id: `${type}-defaut`, type, width, limit: LIMITS[type] || 0, config});
    /** S2 : la disposition de départ (carte ⅔ + recherche ⅓, deux blocs ½, animaux ⅔ + chiffres ⅓) */
    ext.suivi = ext.suivi || {};
    ext.suivi.defaultPages = () => [{id: 'pg_suivi', name: 'Vue générale', icon: '🐾', filter: {}, widgets: [W0('sv_map', '8', {period: '30', link: true, gps: true}), W0('sv_find', '4'), W0('sv_recent', '6'), W0('sv_missing', '6', {days: 30}), W0('sv_animals', '8'), W0('sv_stats', '4')]}];
    /** Les blocs proposés pour une nouvelle page, selon l'espèce */
    function proposedWidgets(profile) {
        const id = t => `${t}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, w = (t, width, config = {}) => ({id: id(t), type: t, width, limit: LIMITS[t] || 0, config});
        if (profile === 'oiseau') return [w('sv_map', '8', {period: '30', link: true}), w('sv_find', '4'), w('sv_recent', '6'), w('sv_missing', '6', {days: 30}), w('sv_counts', '6'), w('sv_stats', '6')];
        if (profile === 'compagnie') return [w('sv_gps_day', '8'), w('sv_health', '4'), w('sv_map', '6', {gps: true}), w('sv_recent', '6')];
        if (profile === 'marin') return [w('sv_map', '8', {link: true}), w('sv_find', '4'), w('sv_recent', '6'), w('sv_groups', '6'), w('sv_stats', '12')];
        if (profile === 'primate' || profile === 'sauvage') return [w('sv_groups', '6'), w('sv_health', '6'), w('sv_recent', '6'), w('sv_missing', '6', {days: 30}), w('sv_map', '12')];
        return [w('sv_health', '12'), w('sv_missing', '6', {days: 30}), w('sv_recent', '6'), w('sv_map', '12')];
    }
    const load = () => overview().catch(() => null);
    const noData = () => A().empty('Le suivi n’a pas pu se charger.', {icon: '⚠️'});
    const pick = (D, w) => scope(D, w);
    const D_ = {};
    ext.dashboard.sv_map = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Carte des observations', '', noData(), span);
        const s = scope(D, widget, {period: '30'}), per = PERIOD_TXT[s.per] ?? '';
        const legend = s.animals.slice(0, 8).map((a, i) => `<span class="sv-leg"><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(a.title)}</span>`).join('');
        return card(index, widget, 'Carte des observations', per ? `<span class="sv-per">${esc(per)}</span>` : '', `<div class="sv-map-host" data-sv-map-widget="${esc(widget.id)}"></div><div class="sv-legend">${legend || A().empty('Aucun passage sur cette période.', {icon: '🗺'})}</div>`, span, `<button type="button" class="icon-action" data-sv-big="${esc(widget.id)}" title="Voir en grand" aria-label="Voir en grand">⛶</button>`);
    }};
    ext.dashboard.sv_recent = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Dernières observations', '', noData(), span);
        const s = pick(D, widget), lim = Math.max(1, Number(widget.limit) || 6);
        const gpsRows = s.animals.filter(a => a.gps?.t1 && (!s.from || tIso(a.gps.t1) >= s.from)).map(a => ({gps: true, iso: tIso(a.gps.t1), time: tTime(a.gps.t1), pet_id: a.id, source: 'gps', place: 'dernière position GPS', id: 0}));
        const rows = [...s.obs, ...gpsRows].sort((x, y) => `${y.iso} ${y.time}`.localeCompare(`${x.iso} ${x.time}`));
        const html = rows.slice(0, lim).map(o => { const a = animalById(D, o.pet_id); return `<div class="sv-row"${o.id ? ` data-sv-obs="${o.id}" role="button" tabindex="0"` : a ? ` data-sv-pet="${a.id}" role="button" tabindex="0"` : ''}><b class="sv-when">${esc(whenShort(o.iso, o.time))}</b><span class="sv-what">${o.gps ? '📡' : esc(speciesIcon(a?.species))} ${esc(a?.title || (o.count ? `${o.count} sans bague` : 'Animal sans fiche'))} · ${esc(placeOfObs(o, D))}</span>${relBadge(o)}</div>`; }).join('');
        const more = rows.length > lim ? `<button type="button" class="link-button sv-more" data-sv-more="${esc(widget.id)}">Voir les ${Math.min(20, rows.length - lim)} suivantes ↓</button>` : '';
        return card(index, widget, 'Dernières observations', '', rows.length ? `<div class="sv-rows">${html}</div>${more}` : A().empty('Aucune observation pour l’instant.', {icon: '👁', action: RO() ? null : {label: '＋ Nouvelle observation', attrs: 'data-sv-new-obs'}}), span);
    }};
    ext.dashboard.sv_missing = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Animaux à retrouver', '', noData(), span);
        const days = Math.max(1, Number(widget.config?.days) || 30), s = pick(D, widget), lim = Math.max(1, Number(widget.limit) || 6);
        const rows = s.animals.filter(a => !a.deceased).map(a => ({a, l: lastSeen(a)})).filter(x => !x.l || (daysSince(x.l.iso) ?? 9999) >= days).sort((x, y) => (x.l?.iso || '').localeCompare(y.l?.iso || ''));
        const html = rows.slice(0, lim).map(({a, l}) => `<div class="sv-row" data-sv-pet="${a.id}" role="button" tabindex="0"><span class="sv-what"><b>${esc(a.title)}</b>${l?.place ? ` · ${esc(l.place)}` : ''}</span>${badge(l ? ago(l.iso) : 'jamais vu', (daysSince(l?.iso) ?? 999) > 90 ? 'grey' : 'yellow')}${RO() ? '' : `<button type="button" class="icon-button small" data-sv-new-obs="${a.id}" title="Je viens de le revoir : ＋ Nouvelle observation" aria-label="＋ Nouvelle observation">＋</button>`}</div>`).join('');
        return card(index, widget, 'Animaux à retrouver', `<span class="sv-per">pas revus depuis ${esc(plural(days, 'jour'))}</span>`, rows.length ? `<div class="sv-rows">${html}</div>` : A().empty('Tous ont été revus récemment.', {icon: '✓'}), span);
    }};
    ext.dashboard.sv_animals = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Animaux suivis', '', noData(), span);
        const s = pick(D, widget), lim = Math.max(1, Number(widget.limit) || 8);
        const tiles = s.animals.map(a => ({a, l: lastSeen(a)})).sort((x, y) => (y.l?.iso || '').localeCompare(x.l?.iso || '')).slice(0, lim).map(({a, l}) => `<button type="button" class="sv-tile" data-sv-pet="${a.id}">${animalThumb(a, 46)}<b>${a.gps?.n ? '📡 ' : ''}${esc(a.title)}</b><small class="muted">${l ? `${l.src === 'gps' ? 'GPS · ' : 'vu '}${esc(whenShort(l.iso))}` : 'pas encore vu'}</small></button>`).join('');
        return card(index, widget, 'Animaux suivis', s.animals.length, s.animals.length ? `<div class="sv-tiles">${tiles}</div>` : A().empty('Aucun animal suivi pour l’instant.', {icon: '🐾', hint: 'Ouvre la fiche d’un animal (Listes → Animaux) et ajoute-lui une marque ou une observation.', action: RO() ? null : {label: '＋ Nouvelle observation', attrs: 'data-sv-new-obs'}}), span);
    }};
    ext.dashboard.sv_stats = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Chiffres', '', noData(), span);
        const s = pick(D, widget), y = new Date().getFullYear(), m = new Date().getMonth();
        const per = Array.from({length: 12}, (_, i) => new Set(s.obs.filter(o => (o.iso || '').startsWith(`${y}-${pad(i + 1)}`) && o.pet_id).map(o => o.pet_id)));
        s.animals.filter(a => a.gps?.n).forEach(a => { for (let i = 0; i < 12; i++) { const a0 = Date.UTC(y, i, 1) / 1000, a1 = Date.UTC(y, i + 1, 1) / 1000; if (a.gps.t0 < a1 && a.gps.t1 >= a0) per[i].add(a.id); } });
        const max = Math.max(1, ...per.map(x => x.size));
        const bars = per.map((x, i) => `<span class="sv-bar${i === m ? ' is-now' : ''}" title="${esc(MONTHS_L[i])} : ${x.size}"><i style="height:${Math.round(4 + 56 * x.size / max)}px"></i><small>${MONTHS[i][0].toUpperCase()}</small></span>`).join('');
        const most = s.animals.slice().sort((p, q) => (q.obs_count + (q.gps?.n ? 1 : 0)) - (p.obs_count + (p.gps?.n ? 1 : 0)))[0];
        return card(index, widget, 'Chiffres', '', `<p class="muted sv-small">${esc(MONTHS[0])} → ${esc(MONTHS[m])} ${y} · animaux vus par mois</p><div class="sv-bars">${bars}</div>
            <div class="sv-kpis"><div><small>Ce mois</small><b>${esc(plural(per[m].size, 'animal', 'animaux'))}</b></div><div><small>Observations</small><b>${fmtN(s.obs.length)}</b></div>${most ? `<div><small>Le plus suivi</small><b>${esc(most.title)}</b></div>` : ''}</div>`, span, `<button type="button" class="icon-action" data-sv-big="${esc(widget.id)}" title="Voir en grand" aria-label="Voir en grand">⛶</button>`);
    }};
    ext.dashboard.sv_find = {load, render: (index, widget, span, D) => card(index, widget, 'Retrouver par bague ou puce', '', `<div data-sv-find="${esc(widget.id)}"><input type="search" placeholder="Chercher… (« 7K », « vert rouge », n° de puce)" data-sv-find-q aria-label="Code, couleurs ou numéro"><div class="sv-find-res" aria-live="polite"></div><p class="muted sv-small">Couleurs (« vert rouge »), code gravé, bague métal, puce, tatouage, boucle. « ? » = pas lu, [K|X] = j’hésite.</p></div>`, span)};
    ext.dashboard.sv_gps_day = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Trajet GPS du jour', '', noData(), span);
        const s = pick(D, widget), a = animalById(D, widget.config?.pet) || s.animals.filter(x => x.gps?.n).sort((p, q) => q.gps.t1 - p.gps.t1)[0];
        if (!a?.gps?.n) return card(index, widget, 'Trajet GPS du jour', '', A().empty('Aucun trajet GPS pour l’instant.', {icon: '📡', action: RO() ? null : {label: '⤒ Importer un trajet…', attrs: 'data-sv-import'}}), span);
        return card(index, widget, 'Trajet GPS du jour', `<span class="sv-per">${esc(a.title)}</span>`, `<div class="sv-map-host" data-sv-gpsday="${a.id}" data-t1="${a.gps.t1}" data-home="${esc(JSON.stringify(a.home ? {lat: a.home.lat, lon: a.home.lon} : null))}"></div><div class="sv-gps-sum muted" data-sv-gpsday-sum></div>`, span);
    }};
    ext.dashboard.sv_counts = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, 'Comptages d’un site', '', noData(), span);
        const site = (D.sites || []).find(x => x.id === Number(widget.config?.site || pageFilter().site)) || (D.sites || [])[0];
        if (!site) return card(index, widget, 'Comptages d’un site', '', A().empty('Aucun site de suivi pour l’instant.', {icon: '🏞', action: RO() ? null : {label: '＋ Nouveau site', attrs: 'data-sv-site-new'}}), span);
        const counts = (D.counts || []).filter(c => c.site_id === site.id).sort((x, y) => (y.iso || '').localeCompare(x.iso || ''));
        return card(index, widget, 'Comptages d’un site', `<span class="sv-per">${esc(site.name)}</span>`, `${countsCurve(counts)}${counts.length ? `<div class="sv-rows">${counts.slice(0, 4).map(c => `<div class="sv-row" data-sv-site="${site.id}" role="button" tabindex="0"><b class="sv-when">${esc(whenShort(c.iso, c.time))}</b><span class="sv-what">${esc(COUNT_WHAT[c.what] || c.what_text || c.what)}</span><b>${fmtN(c.number)} ${esc(c.unit)}</b></div>`).join('')}</div>` : A().empty('Aucun comptage.', {icon: '🔢'})}`, span, `<button type="button" class="button small secondary" data-sv-site="${site.id}">↗ Le site</button>`);
    }};
    ext.dashboard.sv_import = {load: () => Promise.resolve(null), render: (index, widget, span) => card(index, widget, 'Import GPS rapide', '', RO() ? A().empty('Mode consultation : rien à importer.', {icon: '🔒'}) : `<div class="sv-drop" data-sv-dropzone="${esc(widget.id)}"></div>`, span)};
    ext.dashboard.sv_meteo = {load, render: (index, widget, span, D) => {
        const on = !!ext.meteo;
        if (!on) return card(index, widget, 'Météo du jour d’observation', '', `<div class="sv-off is-disabled" title="La Météo d’autrefois n’est pas installée dans cette app.">🌦 Pas de météo : la Météo d’autrefois n’est pas installée.</div>`, span);
        const s = D ? pick(D, widget) : null, o = s?.obs.find(x => Number.isFinite(x.lat) && /^\d{4}-\d{2}-\d{2}$/.test(x.iso || ''));
        if (!o) return card(index, widget, 'Météo du jour d’observation', '', A().empty('Aucune observation datée et placée.', {icon: '🌦'}), span);
        const a = animalById(D, o.pet_id);
        return card(index, widget, 'Météo du jour d’observation', '', `<p class="sv-small"><b>${esc(a?.title || 'Observation')}</b> · ${esc(dateFr(o.iso, true))}${o.time ? `, ${esc(timeFr(o.time))}` : ''} · ${esc(placeOfObs(o, D))}</p><div data-sv-meteo="${o.id}" data-lat="${o.lat}" data-lon="${o.lon}" data-date="${esc(o.iso)}" data-time="${esc(o.time)}">${UI().spinner ? UI().spinner('La météo…') : '…'}</div>`, span);
    }};
    ext.dashboard.sv_health = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, '🩺 Suivi vétérinaire et état', '', noData(), span);
        const s = pick(D, widget), lim = Math.max(1, Number(widget.limit) || 8), bad = !!widget.config?.onlyBad;
        let rows = s.animals.filter(a => a.health).map(a => ({a, h: a.health}));
        if (bad) rows = rows.filter(r => ['blesse', 'malade', 'soins'].includes(r.h.state));
        rows.sort((x, y) => (y.h.iso || '').localeCompare(x.h.iso || ''));
        const full = !/span-(3|4)\b/.test(span);
        const table = rows.length ? `<div class="data-table-wrap"><table class="data-table sv-health-table"><thead><tr><th>Animal</th><th>État</th><th>Dernier événement</th>${full ? '<th>Pourquoi</th><th>Soigné par</th><th>Suite</th>' : ''}</tr></thead><tbody>${rows.slice(0, lim).map(({a, h}) => `<tr data-sv-pet="${a.id}" data-sv-tab="health"><td>${esc(speciesIcon(a.species))} ${animalLink(a)}</td><td>${healthBadge(h.state)}</td><td><b>${esc(dateFr(h.iso || h.date))}</b><br><small class="muted">${esc([h.what_text || (C().HEALTH_WHAT.find(x => x[0] === h.what_kind)?.[1] || '').replace(/^\S+\s/, ''), h.weight_g != null ? weightText(h.weight_g) : ''].filter(Boolean).join(' · '))}</small></td>${full ? `<td>${esc(C().CAUSES[h.cause] || h.cause_text || '—')}</td><td>${esc(h.carer || '—')}</td><td><small>${esc(h.outcome === 'relache' ? `relâché ${h.outcome_date ? 'le ' + h.outcome_date : ''}` : h.outcome === 'mort' ? `mort ${h.outcome_date ? 'le ' + h.outcome_date : ''}` : h.care || '—')}</small></td>` : ''}</tr>`).join('')}</tbody></table></div>` : A().empty(bad ? 'Tout le monde va bien.' : 'Aucun événement de santé pour l’instant.', {icon: '🩺', action: RO() ? null : {label: '＋ Événement de santé', attrs: 'data-sv-health-new'}});
        return card(index, widget, '🩺 Suivi vétérinaire et état', plural(rows.length, 'animal', 'animaux'), table + (full ? causesBars(s.health) : ''), span, RO() ? '' : '<button type="button" class="button small" data-sv-health-new>＋ Événement de santé</button>');
    }};
    ext.dashboard.sv_groups = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, '👥 Groupes', '', noData(), span);
        const groups = D.groups || [], members = D.members || [];
        const html = groups.map(g => { const cur = members.filter(m => m.group_id === g.id && !m.end_date); const lead = cur.find(m => /alpha|matriarche|dominant/i.test(m.role)); const la = lead && animalById(D, lead.pet_id);
            return `<div class="sv-row" data-sv-group="${g.id}" role="button" tabindex="0"><span class="sv-what"><b>👥 ${esc(g.name)}</b> <small class="muted">${esc([g.kind, g.species].filter(Boolean).join(' · '))}</small></span>${la ? `<small>${esc(lead.role)} : ${esc(la.title)}</small>` : ''}${badge(plural(cur.length, 'membre'), 'blue')}</div>`; }).join('');
        return card(index, widget, '👥 Groupes', groups.length, groups.length ? `<div class="sv-rows">${html}</div>` : A().empty('Aucun groupe pour l’instant.', {icon: '👥', action: RO() ? null : {label: '＋ Nouveau groupe', attrs: 'data-sv-group-new'}}), span);
    }};
    const weightText = g => g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', {maximumFractionDigits: 2})} kg` : `${Math.round(g)} g`;
    function causesBars(health, {title = 'Causes de blessures les plus fréquentes'} = {}) {
        const n = {}; health.filter(h => h.cause).forEach(h => { n[h.cause] = (n[h.cause] || 0) + 1; });
        const list = Object.entries(n).sort((a, b) => b[1] - a[1]); if (!list.length) return '';
        const max = list[0][1];
        return `<div class="sv-causes"><h4>${esc(title)}</h4>${list.map(([k, v]) => `<div class="sv-cause"><span>${esc(C().CAUSES[k] || k)}</span><i style="width:${Math.round(100 * v / max)}%"></i><b>${v}</b></div>`).join('')}</div>`;
    }
    const COUNT_WHAT = {dortoir: '💤 Dortoir', nids: '🪺 Nids occupés', poussins: '🐣 Poussins bagués', groupe: '👥 Groupe', passage: '🕊 Passage', jeunes: '🍼 Jeunes', autre: '✎ Autre'};
    function countsCurve(counts) {
        const byWhat = {}; counts.forEach(c => { if (c.number != null && /^\d{4}-\d{2}/.test(c.iso || '')) (byWhat[c.what] = byWhat[c.what] || []).push(c); });
        const best = Object.entries(byWhat).sort((a, b) => b[1].length - a[1].length)[0]; if (!best || best[1].length < 2) return '';
        const pts = best[1].slice().sort((a, b) => a.iso.localeCompare(b.iso)), W = 300, H = 70, t0 = Date.parse(pts[0].iso.slice(0, 10)), t1 = Date.parse(pts[pts.length - 1].iso.slice(0, 10)) || t0 + 1, mx = Math.max(...pts.map(p => p.number)) || 1;
        const xy = pts.map(p => [8 + (Date.parse(p.iso.slice(0, 10)) - t0) / Math.max(1, t1 - t0) * (W - 16), H - 8 - p.number / mx * (H - 20)]);
        return `<svg class="sv-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe des comptages"><polyline fill="none" stroke="var(--blue-bright)" stroke-width="2.5" points="${xy.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>${xy.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--blue-bright)"><title>${esc(dateFr(pts[i].iso))} : ${pts[i].number}</title></circle>`).join('')}<text x="8" y="12" font-size="11" fill="currentColor">${esc((COUNT_WHAT[best[0]] || best[0]).replace(/^\S+\s/, ''))} · ${mx}</text></svg>`;
    }

    /* ═════════ Réglage d'un bloc (✎, K2 : chaque changement gardé tout de suite) ═════════ */
    const periodSeg = cur => `<div class="segmented sv-seg" role="radiogroup">${[['7', '7 jours'], ['30', '30 jours'], ['year', 'Cette année'], ['all', 'Tout']].map(([v, l]) => `<label class="${(cur || 'all') === v ? 'is-active' : ''}"><input type="radio" name="svper" value="${v}" ${(cur || 'all') === v ? 'checked' : ''} data-sv-cfg="period">${l}</label>`).join('')}</div>`;
    function cfgHtml(w) {
        const c = w.config || {}, t = w.type, uid = `svw_${w.id}`.replace(/[^a-z0-9_]/gi, '_');
        const f = (label, html) => `<div class="sv-cfg-row"><span class="sv-cfg-lab">${esc(label)}</span><div>${html}</div></div>`;
        let h = f('Titre', `<input type="text" data-sv-cfg="title" value="${esc(c.title || '')}" placeholder="${esc((WIDGETS.find(x => x[0] === t) || [, ''])[1])}" maxlength="80">`);
        if (!['sv_import', 'sv_find', 'sv_gps_day', 'sv_counts', 'sv_groups'].includes(t)) h += f('Animaux', `${P().pickerField({name: '', hiddenName: false, kind: 'pet', multiple: true, value: (c.pets || []).map(Number)})}<small class="muted">vide = tous${A().state.module === 'suivi' ? ' (ceux de la page)' : ''}</small>`);
        if (t === 'sv_gps_day') h += f('Animal', P().pickerField({name: '', hiddenName: false, kind: 'pet', value: Number(c.pet) || null}));
        if (['sv_map', 'sv_recent', 'sv_stats', 'sv_counts', 'sv_animals', 'sv_health'].includes(t)) h += f('Site', `<span data-sv-cfg-site>${P().pickerField({name: '', hiddenName: false, kind: 'tsite', value: Number(c.site) || null})}</span>`);
        if (['sv_map', 'sv_recent', 'sv_stats'].includes(t)) h += f('Période', periodSeg(c.period || (t === 'sv_map' ? '30' : 'all')).replace(/name="svper"/g, `name="${uid}"`));
        if (t === 'sv_map') h += f('Options', `${UI().toggleHtml('Relier les points dans l’ordre', {checked: c.link !== false, attrs: 'data-sv-cfg="link"'})}${UI().toggleHtml('Montrer les trajets GPS', {checked: c.gps !== false, attrs: 'data-sv-cfg="gps"'})}`);
        if (t === 'sv_missing') h += f('Pas revus depuis', `<input type="number" min="1" max="3650" data-unit="jours" data-sv-cfg="days" value="${Number(c.days) || 30}">`);
        if (t === 'sv_health') h += f('Options', UI().toggleHtml('Seulement ceux qui ne vont pas bien', {checked: !!c.onlyBad, attrs: 'data-sv-cfg="onlyBad"'}));
        return `<div class="sv-cfg" data-sv-cfg-box>${h}<button type="button" class="button small secondary" data-sv-cfg-reset>↺ Remettre comme au départ</button></div>`;
    }
    function cfgRead(ed) {
        const box = ed.querySelector('[data-sv-cfg-box]'); if (!box) return {};
        const out = {}, v = k => box.querySelector(`[data-sv-cfg="${k}"]`);
        if (v('title')) out.title = v('title').value.trim().slice(0, 80);
        const pks = [...box.querySelectorAll('.pk')];
        pks.forEach(pk => { const val = P().pickerValue(pk), kind = pk.dataset.picker || ''; if (/pet/.test(kind) && Array.isArray(val)) out.pets = val.map(Number).filter(Boolean); else if (/pet/.test(kind)) out.pet = Number(val) || 0; else if (/tsite/.test(kind)) out.site = Number(val) || 0; });
        const per = box.querySelector('[data-sv-cfg="period"]:checked'); if (per) out.period = per.value;
        ['link', 'gps', 'onlyBad'].forEach(k => { if (v(k)) out[k] = v(k).checked; });
        if (v('days')) out.days = Math.max(1, Math.min(3650, Number(v('days').value) || 30));
        return out;
    }
    WIDGETS.forEach(([k]) => { ext.dashboardConfig[k] = {html: cfgHtml, read: cfgRead}; });
    /** K2 : un bloc du suivi se règle sans « Enregistrer » ; « ✓ Enregistré » dans le haut du dos du bloc */
    function bindEditors(ws) {
        ws.querySelectorAll('.dashboard-widget[data-widget-type^="sv_"] [data-dashboard-widget-editor]').forEach(ed => {
            if (ed.dataset.svBound) return; ed.dataset.svBound = '1';
            const id = ed.dataset.dashboardWidgetEditor;
            const head = ed.querySelector('.dashboard-widget-back-title'); head?.insertAdjacentHTML('beforeend', '<span class="ui-ph-saved sv-saved" hidden>✓ Enregistré</span>');
            const save = () => {
                const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === id); if (!w) return;
                w.width = ed.querySelector('.block-widths [aria-pressed="true"]')?.dataset.blockWidth || w.width;
                const lim = ed.querySelector('[data-dashboard-widget-limit]'); if (lim) w.limit = Math.max(1, Math.min(80, Number(lim.value) || w.limit || 6));
                w.config = {...(w.config || {}), ...cfgRead(ed)};
                A().saveDashboardBlockSettings(s);
                const sv = ed.querySelector('.sv-saved'); if (sv) { sv.hidden = false; clearTimeout(sv._t); sv._t = setTimeout(() => { sv.hidden = true; }, 2500); }
                const card0 = ed.closest('.dashboard-widget'); if (card0) { card0.className = card0.className.replace(/\bspan-\d+\b/, `span-${w.width}`); }
            };
            ed.addEventListener('input', e => { if (e.target.closest('.pk-search, .pk-input')) return; save(); });
            ed.addEventListener('change', e => { if (e.target.closest('.pk-input')) return; save(); });
            ed.addEventListener('picker-change', save);
            ed.addEventListener('click', e => {
                if (e.target.closest('[data-block-width]')) setTimeout(save, 0);
                const seg = e.target.closest('.sv-seg label'); if (seg) { seg.parentElement.querySelectorAll('label').forEach(l => l.classList.toggle('is-active', l === seg)); }
                if (e.target.closest('[data-sv-cfg-reset]')) { const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === id); if (!w) return; const before = clone(w.config); w.config = {}; A().saveDashboardBlockSettings(s); A().undoToast?.('Réglages du bloc remis comme au départ.', {undo: async () => { const s2 = A().dashboardBlockSettings(), w2 = s2.widgets.find(x => x.id === id); if (w2) { w2.config = before; A().saveDashboardBlockSettings(s2); } await A().renderDashboard(); }}); A().renderDashboard(); }
            });
        });
    }

    /* ═════════ En-tête du Suivi, ses pages (C5), le filtre de la page ═════════ */
    ext.suivi.headerHtml = (page, pages) => {
        const f = page.filter || {}, sp = f.species ? (ext.speciesLabel?.(f.species) || f.species) : '';
        const filterTxt = [f.taxon || sp, f.siteTitle || (f.site ? 'un site' : '')].filter(Boolean);
        return `${UI().pageHeader({where: `Suivi des animaux · Page « ${page.name || 'Page'} »`, icon: page.icon || '🐾', title: page.name || 'Suivi des animaux',
            help: 'Tes animaux suivis, ce qu’on a vu d’eux et leurs trajets.',
            primary: RO() ? '' : '<button type="button" class="button" data-sv-new-obs>＋ Nouvelle observation</button>',
            actions: RO() ? [] : ['<button type="button" class="button secondary" data-sv-import>⤒ Importer un trajet…</button>'],
            more: ['<button type="button" data-sv-census>🐾 Recensement</button>', '<button type="button" data-sv-stats-big>📊 Chiffres</button>', ...(RO() ? [] : ['<button type="button" data-sv-share>📤 Partager…</button>', '<button type="button" data-sv-receive>⤒ Recevoir un suivi partagé…</button>', '<button type="button" data-sv-page-new>＋ Nouvelle page</button>', '<button type="button" data-sv-site-new>＋ Nouveau site de suivi</button>', '<button type="button" data-sv-group-new>＋ Nouveau groupe</button>', '<button type="button" data-sv-reorder>⠿ Réordonner les widgets</button>'])]})}
            <div class="sv-pagebar"><div class="segmented sv-pages" role="tablist">${pages.map(p => `<button type="button" role="tab" draggable="${RO() ? 'false' : 'true'}" data-dash-page="${esc(p.id)}" data-sv-page="${esc(p.id)}" class="${p.id === page.id ? 'is-active' : ''}" aria-selected="${p.id === page.id}">${esc(p.icon || '🐾')} ${esc(p.name || 'Page')}</button>`).join('')}</div>${RO() ? '' : `<button type="button" class="button small secondary" data-sv-page-new>＋ Nouvelle page</button><button type="button" class="icon-button small" data-sv-page-more="${esc(page.id)}" title="La page « ${esc(page.name)} »" aria-label="Plus d’actions">⋯</button>`}</div>
            ${filterTxt.length ? `<div class="sv-pagefilter">${esc(page.icon || '🐾')} Cette page montre seulement : <b>${esc(filterTxt.join(' · '))}</b>${f.site ? '' : ' · tous les sites'}. Tous ses blocs s’y règlent d’office (un bloc peut garder son propre choix).${RO() ? '' : ` <button type="button" class="link-button" data-sv-page-filter="${esc(page.id)}">✎ Changer</button>`}</div>` : ''}`;
    };
    function pagesWork() { const {pages, defaultPage} = A().dashboardPages(); return {pages: clone(pages), defaultPage}; }
    function savePages(pages, defaultPage, message, after) {
        const keys = ['genealogie-suivi-blocks'];
        const r = A().undoLocalChange(message, keys, () => A().saveDashboardPages(pages, defaultPage), async () => { await A().renderDashboard(); A().renderSidebar?.(); after?.(); });
        setTimeout(() => { A().renderDashboard(); A().renderSidebar?.(); }, 0);
        return r;
    }
    const SPECIES_OPTS = () => [['', 'Toutes les espèces'], ...['oiseau', 'chat', 'chien', 'cheval', 'ferme', 'poisson', 'reptile', 'sauvage', 'marin', 'lapin', 'rongeur', 'autre'].map(k => [k, `${speciesIcon(k)} ${(ext.speciesLabel?.(k) || k).split(/[ ,(]/)[0]}`])];
    function pageDialog(page = null) {
        const isNew = !page, f = page?.filter || {};
        let siteTitle = f.siteTitle || '';
        ext.openDialog({onOpen: d => d.addEventListener('picker-change', e => { siteTitle = e.detail.item?.title || ''; }),eyebrow: 'SUIVI DES ANIMAUX', title: isNew ? 'Nouvelle page' : `Espèce et site de la page « ${page.name} »`,
            body: `<div class="form-grid sv-form">${isNew ? `<label>Nom de la page<input name="name" required maxlength="40" placeholder="Corneilles, Hérissons, Chats du quartier…"></label><label>Icône<input name="icon" maxlength="8" value="🐾" placeholder="🐦"></label>` : ''}
                <label>Espèce<select name="species">${SPECIES_OPTS().map(([k, l]) => `<option value="${esc(k)}" ${f.species === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Nom de l’espèce (facultatif)<input name="taxon" maxlength="80" value="${esc(f.taxon || '')}" placeholder="Corneille noire, Hérisson d’Europe…"></label>
                <div class="sv-span2"><span class="pk-lab">Site</span>${P().pickerField({name: 'site', kind: 'tsite', value: Number(f.site) || null})}<small class="muted">vide = tous les sites</small></div></div>
                ${isNew ? '<p class="muted">La page part de blocs proposés pour cette espèce ; tu pourras en ajouter, en retirer et les ranger.</p>' : ''}`,
            onSubmit: form => {
                const v = new FormData(form), name = String(v.get('name') || '').trim();
                if (isNew && !name) return UI().fail(form.elements.name, 'Donne un nom à la page.');
                const pk = form.querySelector('.pk'), it = pk ? P().pickerValue(pk) : null;
                const filter = {species: String(v.get('species') || ''), taxon: String(v.get('taxon') || '').trim().slice(0, 80), site: Number(it) || 0, siteTitle: Number(it) ? siteTitle : ''};
                const W = pagesWork();
                if (isNew) {
                    const prof = filter.species ? C().guessProfile(filter.species, filter.taxon) : 'oiseau';
                    const id = 'pg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                    W.pages.push({id, name: name.slice(0, 40), icon: String(v.get('icon') || '🐾').trim().slice(0, 8) || '🐾', filter, widgets: proposedWidgets(prof)});
                    A().state.suiviPage = id; savePages(W.pages, W.defaultPage, `Page « ${name} » créée.`);
                } else {
                    const p = W.pages.find(x => x.id === page.id); if (p) p.filter = filter;
                    savePages(W.pages, W.defaultPage, 'Espèce et site de la page enregistrés.');
                }
            }});
    }
    function pageMenu(anchor, pageId, ev = null) {
        const W = pagesWork(), p = W.pages.find(x => x.id === pageId); if (!p) return;
        const others = W.pages.filter(x => x.id !== pageId);
        const items = [
            {icon: '✎', label: 'Renommer', run: async () => { const n = await A().askText({title: 'Renommer la page', value: p.name, okLabel: 'Enregistrer'}); if (n == null || !n.trim()) return; p.name = n.trim().slice(0, 40); savePages(W.pages, W.defaultPage, 'Page renommée.'); }},
            {icon: '🐾', label: 'Changer l’icône', run: async () => { const n = await A().askText({title: 'Icône de la page', message: 'Un émoji : 🐦 🦔 🐈 🐬 🐺…', value: p.icon || '🐾', okLabel: 'Enregistrer'}); if (n == null) return; p.icon = n.trim().slice(0, 8) || '🐾'; savePages(W.pages, W.defaultPage, 'Icône changée.'); }},
            {icon: '🐾', label: 'Espèce et site par défaut…', run: () => pageDialog(p)},
            '-',
            {icon: '⧉', label: 'Dupliquer la page', run: () => { const id = 'pg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); W.pages.splice(W.pages.indexOf(p) + 1, 0, {...clone(p), id, name: `${p.name} (copie)`.slice(0, 40), widgets: (p.widgets || []).map(w => ({...clone(w), id: `${w.type}-${Math.random().toString(36).slice(2, 10)}`}))}); savePages(W.pages, W.defaultPage, 'Page dupliquée.'); }},
            {icon: '⭐', label: 'Page affichée à l’ouverture', disabled: W.defaultPage === pageId, run: () => savePages(W.pages, pageId, `« ${p.name} » s’affichera à l’ouverture.`)},
            '-',
            {icon: '🗑', label: 'Supprimer la page', danger: true, disabled: !others.length, run: () => { const np = others; savePages(np, W.defaultPage === pageId ? np[0].id : W.defaultPage, `Page « ${p.name} » supprimée (ses blocs, pas les animaux).`); if (A().state.suiviPage === pageId) A().state.suiviPage = ''; }},
        ];
        return ev ? UI().contextMenu(ev, items, {title: `Page « ${p.name} »`}) : UI().menuAt(anchor, items, {title: `Page « ${p.name} »`});
    }
    /** Le ⋯ d'un bloc (et son clic droit) : Régler, Voir en grand, Dupliquer, 📌 Mettre aussi dans le tableau de bord, Copier vers une autre page, Supprimer */
    function widgetMenu(anchor, widgetId, ev = null) {
        const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === widgetId); if (!w) return;
        const card0 = document.querySelector(`[data-dashboard-widget="${CSS.escape(widgetId)}"]`);
        const W = pagesWork(), cur = A().currentDashboardPage();
        const items = [
            {icon: '✎', label: 'Régler', run: () => card0?.querySelector('[data-edit-dashboard-widget]')?.click()},
            {icon: '⛶', label: 'Voir en grand', run: () => openBig(w)},
            {icon: '⧉', label: 'Dupliquer', run: () => { A().undoLocalChange('Bloc dupliqué.', [A().state.module === 'suivi' ? 'genealogie-suivi-blocks' : 'genealogie-dashboard-blocks'], () => { const s2 = A().dashboardBlockSettings(), i = s2.widgets.findIndex(x => x.id === widgetId); s2.widgets.splice(i + 1, 0, A().dashboardNewWidget(w.type, {...clone(w), id: undefined})); A().saveDashboardBlockSettings(s2); }, () => A().renderDashboard()); A().renderDashboard(); }},
            {icon: '📌', label: 'Mettre aussi dans le tableau de bord', run: () => pinToDashboard(w)},
            ...(W.pages.length > 1 ? [{icon: '📄', label: 'Copier vers une autre page…', run: () => copyToPage(w, cur.id)}] : []),
            '-',
            {icon: '🗑', label: 'Supprimer', danger: true, run: () => card0?.querySelector('[data-delete-dashboard-widget]')?.click()},
        ];
        const title = (WIDGETS.find(x => x[0] === w.type) || [, A().dashboardWidgetLabel?.(w.type) || 'Bloc'])[1];
        return ev ? UI().contextMenu(ev, items, {title}) : UI().menuAt(anchor, items, {title});
    }
    function pinToDashboard(w) {
        const st = A().state;
        A().undoLocalChange('✓ Bloc mis dans le tableau de bord, page « Vue d’ensemble »', ['genealogie-dashboard-blocks'], () => A().dashboardSpaceDo('', () => {
            const keep = st.dashboardPage; st.dashboardPage = A().dashboardPages().defaultPage;
            try { const s = A().dashboardBlockSettings(); s.widgets.push(A().dashboardNewWidget(w.type, {...clone(w), id: undefined})); A().saveDashboardBlockSettings(s); } finally { st.dashboardPage = keep; }
        }));
    }
    async function copyToPage(w, curId) {
        const W = pagesWork(), others = W.pages.filter(p => p.id !== curId);
        const box = document.createElement('div');
        UI().menuAt(document.querySelector(`[data-dashboard-widget="${CSS.escape(w.id)}"] [data-dash-widget-more]`) || document.body, others.map(p => ({icon: p.icon || '🐾', label: p.name, run: () => { p.widgets = [...(Array.isArray(p.widgets) ? p.widgets : []), A().dashboardNewWidget(w.type, {...clone(w), id: undefined})]; savePages(W.pages, W.defaultPage, `Bloc copié vers « ${p.name} ».`); }})), {title: 'Copier vers la page…'});
        void box;
    }
    function bindPageBar(ws) {
        const bar = ws.querySelector('.sv-pages'); if (!bar || RO()) return;
        let from = null;
        bar.addEventListener('contextmenu', e => { const b = e.target.closest('[data-sv-page]'); if (!b) return; pageMenu(null, b.dataset.svPage, e); }); // K14 : UI.contextMenu
        bar.addEventListener('dragstart', e => { from = e.target.closest('[data-sv-page]')?.dataset.svPage || null; try { e.dataTransfer.setData('text/plain', 'p'); } catch (_) {} });
        bar.addEventListener('dragover', e => { if (from) e.preventDefault(); });
        bar.addEventListener('drop', e => { e.preventDefault(); const to = e.target.closest('[data-sv-page]')?.dataset.svPage; if (!from || !to || from === to) return; const W = pagesWork(), i = W.pages.findIndex(p => p.id === from), j = W.pages.findIndex(p => p.id === to); const [m] = W.pages.splice(i, 1); W.pages.splice(j, 0, m); from = null; savePages(W.pages, W.defaultPage, 'Pages rangées.'); });
    }

    /* ═════════ Après le dessin (Suivi ou tableau de bord) : cartes, recherche, import, météo, ⋯, K2 ═════════ */
    ext.suivi.afterRender = async (ws, {space} = {}) => {
        if (!ws) return;
        bindEditors(ws);
        if (space === 'suivi') bindPageBar(ws);
        ws.querySelectorAll('[data-dash-widget-more]').forEach(b => { if (b.dataset.svBound) return; b.dataset.svBound = '1'; b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); widgetMenu(b, b.dataset.dashWidgetMore); }); });
        if (space === 'suivi') ws.querySelectorAll('.dashboard-widget').forEach(c => { if (c.dataset.svCtx) return; c.dataset.svCtx = '1'; c.addEventListener('contextmenu', e => { if (e.shiftKey || e.target.closest('input, textarea, .sv-map')) return; e.stopPropagation(); widgetMenu(null, c.dataset.dashboardWidget, e); }); }); // K14 : UI.contextMenu
        const hosts = [...ws.querySelectorAll('[data-sv-map-widget], [data-sv-gpsday], [data-sv-find], [data-sv-dropzone], [data-sv-meteo]')];
        if (!hosts.length) return;
        const D = await overview().catch(() => null); if (!D) return;
        const settings = A().dashboardBlockSettings?.() || {widgets: []};
        for (const h of ws.querySelectorAll('[data-sv-map-widget]')) {
            const w = settings.widgets.find(x => x.id === h.dataset.svMapWidget) || {config: {}}, s = scope(D, w, {period: '30'});
            const series = await mapSeries(D, s.animals, s.obs, {link: w.config?.link !== false, gps: w.config?.gps !== false, from: s.fromT});
            if (!h.isConnected) continue;
            mapView(h, {series, polygons: sitePolygons(D, s.site ? [s.site] : null), height: 260});
        }
        for (const h of ws.querySelectorAll('[data-sv-gpsday]')) gpsDay(h, animalById(D, h.dataset.svGpsday));
        ws.querySelectorAll('[data-sv-find]').forEach(box => bindFind(box, D));
        ws.querySelectorAll('[data-sv-dropzone]').forEach(z => { if (z.dataset.svBound || !UI().dropZone) return; z.dataset.svBound = '1'; z.appendChild(UI().dropZone({accept: '.gpx,.kml,.csv,.tsv,.txt,.json,.geojson', multiple: false, text: '📁 Glisse ici un trajet (GPX, KML, CSV), colle-le (⌘V) ou choisis-le', hint: 'Balises de la faune sauvage (Movebank…) ou colliers (Tractive, Weenect, Invoxia, Kippy…).', onFiles: f => importGps({files: f})})); });
        ws.querySelectorAll('[data-sv-meteo]').forEach(async el => {
            try { const r = await api('meteo_point', {lat: el.dataset.lat, lon: el.dataset.lon, date: el.dataset.date, time: el.dataset.time || '', detail: '0'});
                if (!r.installed) { el.innerHTML = '<div class="sv-off is-disabled" title="Aucun fichier de météo installé.">🌦 Pas encore de fichiers de météo : Réglages → Météo d’autrefois.</div>'; return; }
                const res = r.result || {};
                if (!res.ok) { el.innerHTML = A().empty(res.why === 'out' ? 'Pas de météo pour ce lieu (hors des données installées).' : 'Pas de relevé connu pour ce jour-là près d’ici.', {icon: '🌦'}); return; }
                const lk = ext.meteo.look ? ext.meteo.look(res) : {icon: '🌦', title: 'Météo trouvée', desc: ''};
                el.innerHTML = `<p class="sv-meteo-say">${esc(lk.icon)} <b>${esc(lk.title)}</b>${res.day?.tx != null ? ` · ${esc(res.day.tn ?? '?')} / ${esc(res.day.tx)} °C` : ''}</p>${lk.desc ? `<p class="sv-small">${esc(lk.desc)}</p>` : ''}${ext.meteo.badge ? ext.meteo.badge(res) : ''}`;
            } catch (e) { el.innerHTML = A().empty(`Météo indisponible : ${e.message}`, {icon: '🌦'}); }
        });
    };
    /** S13 : la journée (ou la nuit) d'un animal : trajet, plus loin de la maison, temps dehors */
    async function gpsDay(host, a) {
        if (!a) return;
        const t1 = Number(a.gps?.t1) || 0, r = await api('suivi', {op: 'gps', pet_id: a.id, from: t1 - 36 * 3600, to: t1, max: 3000}).catch(() => null);
        if (!r?.points?.length || !host.isConnected) return;
        const trips = C().splitTrips(r.points, 120), trip = trips[trips.length - 1] || {points: r.points, t0: r.points[0][0], t1, km: C().pathKm(r.points)};
        const home = a.home && Number.isFinite(a.home.lat) ? a.home : null, far = C().farthest(trip.points, home);
        mapView(host, {series: [{name: a.title, color: '#e8590c', line: true, gps: true, points: trip.points.map(p => ({t: p[0], lat: p[1], lon: p[2]}))}], polygons: [{coords: C().hull(trip.points).hull, color: '#e8590c', label: 'zone fréquentée'}], home, height: 220});
        const sum = host.parentElement.querySelector('[data-sv-gpsday-sum]');
        if (sum) sum.innerHTML = `${esc(dateFr(tIso(trip.t0)))} · sortie ${esc(timeFr(tTime(trip.t0)))} · rentrée ${esc(timeFr(tTime(trip.t1)))} · <b>${esc(kmText(trip.km))}</b> parcourus${home ? ` · plus loin : <b>${esc(kmText(far.km))}</b> de la maison` : ''} · ${esc(plural(trip.points.length, 'point'))}`;
    }
    /** S2 bloc 🔖 : retrouver par bague ou puce (couleurs en mots, code, numéro) */
    function bindFind(box, D) {
        if (box.dataset.svBound) return; box.dataset.svBound = '1';
        const q = box.querySelector('[data-sv-find-q]'), res = box.querySelector('.sv-find-res');
        const run = () => {
            const t = q.value.trim(); if (!t) { res.innerHTML = ''; return; }
            const words = t.toLowerCase().split(/\s+/), keys = [];
            words.forEach(w => { const c = C().RING_COLORS.find(r => r[1] === w || r[0] === w || r[1].startsWith(w + ' ')); if (c) keys.push(c[0]); });
            const rest = words.filter(w => !C().RING_COLORS.some(r => r[1] === w || r[0] === w || r[1].split(' ')[0] === w)).join('');
            let list;
            if (keys.length && !rest) list = (D.animals || []).filter(a => { const r = C().ringsOf(a); if (!r) return false; const have = ['L', 'R'].flatMap(l => (r[l] || []).map(C().ringKey)); return keys.every(k => have.includes(k)); }).map(a => ({animal: a, pct: 100}));
            else {
                const isNum = /\d{5,}|…|\.\.\./.test(rest);
                list = C().candidates(D.animals || [], isNum ? {number: rest} : {reading: rest});
                const byName = (D.animals || []).filter(a => a.title.toLowerCase().includes(t.toLowerCase()) && !list.some(c => c.animal.id === a.id)).map(a => ({animal: a, pct: null}));
                list = [...list, ...byName];
            }
            res.innerHTML = list.length ? `<small class="muted">${esc(plural(list.length, 'animal trouvé', 'animaux trouvés'))}</small>${list.slice(0, 8).map(c => `<button type="button" class="sv-find-row" data-sv-pet="${c.animal.id}">${animalThumb(c.animal, 30)}<span><b>${esc(c.animal.title)}</b><small class="muted">${esc(codeOf(c.animal))}</small></span>${c.pct != null && c.pct < 100 ? `<small>${c.pct} %</small>` : ''}</button>`).join('')}` : A().empty(`Aucun animal pour « ${t} ».`, {icon: '🔍'});
        };
        q.addEventListener('input', run);
    }

    /* ═════════ ⛶ En grand : la carte (S8), les chiffres (S11), ou le bloc ═════════ */
    async function openBig(w) {
        if (w.type === 'sv_map') return openBigMap(w);
        if (w.type === 'sv_stats') return openStats(w);
        const D = await overview(), def = ext.dashboard[w.type];
        const html = def ? def.render('', {...w, width: '12'}, 'span-12', D) : '';
        const dlg = ext.openDialog({eyebrow: 'SUIVI DES ANIMAUX', title: titleOf(w, (WIDGETS.find(x => x[0] === w.type) || [, 'Bloc'])[1]), wide: true, body: `<div class="sv-big">${html}</div>`});
        ext.suivi.afterRender(dlg, {});
    }
    async function openBigMap(w = {config: {}}, preset = {}) {
        const D = await overview(), s = scope(D, w, {period: 'all'});
        let chosen = preset.pets || s.animals.map(a => a.id), link = w.config?.link !== false, by = 'animal';
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-xl sv-bigmap'; dlg.dataset.noFoot = ''; dlg.dataset.ownClose = '1'; // ne fait que montrer : pas de « Fermer sans enregistrer ? »
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">SUIVI DES ANIMAUX · EN GRAND</span><h2>🗺 Carte des observations</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="sv-bigmap-body"><div class="sv-bigmap-bar"><span class="sv-chips" data-chips></span><span class="sv-add-pet">${P().pickerField({name: '', hiddenName: false, kind: 'pet', placeholder: '＋ Ajouter un animal…'})}</span>
            ${UI().toggleHtml('Relier les points dans l’ordre', {checked: link, attrs: 'data-link'})}<div class="segmented" role="radiogroup"><button type="button" class="is-active" data-by="animal">Par animal</button><button type="button" data-by="year">Par année</button></div>
            <select data-bg aria-label="Fond de carte">${A().mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml(defaultBg()) : ''}</select></div>
            <div class="sv-map-host" data-big></div><div class="sv-legend" data-legend></div><div data-replay></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => dlg.close()));
        dlg.showModal();
        let view = null, rep = null;
        const draw = async () => {
            const animals = (D.animals || []).filter(a => chosen.includes(a.id));
            dlg.querySelector('[data-chips]').innerHTML = animals.map((a, i) => `<span class="sv-chip" style="--c:${COLORS[i % COLORS.length]}"><i></i>${esc(a.title)} (${fmtN(a.obs_count + (a.gps?.n || 0))})<button type="button" class="icon-button small" data-rm="${a.id}" aria-label="Retirer ${esc(a.title)}">×</button></span>`).join('');
            const series = await mapSeries(D, animals, D.observations || [], {link, by});
            const host = dlg.querySelector('[data-big]');
            if (!view) view = mapView(host, {series, polygons: sitePolygons(D), height: Math.max(320, Math.min(620, innerHeight - 300)), wheel: true}); else view.setSeries(series);
            const ts = series.flatMap(x => x.points.map(p => p.t)).filter(Number.isFinite);
            rep?.stop(); rep = replayBar(dlg.querySelector('[data-replay]'), Math.min(...ts), Math.max(...ts), t => view.setTime(t));
            dlg.querySelector('[data-legend]').innerHTML = `<b>Légende</b> ${series.map(x => `<span class="sv-leg"><i style="background:${x.color}"></i>${esc(x.name)}${x.gps ? '' : ' · observations (n° = ordre)'}</span>`).join('')}${link ? ' · - - - relié dans l’ordre' : ''}`;
        };
        dlg.addEventListener('click', e => {
            const rm = e.target.closest('[data-rm]'); if (rm) { chosen = chosen.filter(id => id !== Number(rm.dataset.rm)); draw(); return; }
            const b = e.target.closest('[data-by]'); if (b) { by = b.dataset.by; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); draw(); }
        });
        dlg.querySelector('[data-link]').addEventListener('change', e => { link = e.target.checked; draw(); });
        dlg.querySelector('[data-bg]').addEventListener('change', e => { saveMapPrefs({bg: e.target.value}); view?.setBg(e.target.value); });
        dlg.querySelector('.sv-add-pet').addEventListener('picker-change', e => { const id = Number(e.detail.value); if (id && !chosen.includes(id)) { chosen.push(id); draw(); } P().pickerSet(e.target.closest('.pk'), null); });
        draw();
    }
    /** S11 : les chiffres (combien, où, depuis quand, quelle distance, zone fréquentée, jamais revus, causes) + ⤓ Exporter ▾ */
    async function openStats(w = {config: {}}) {
        const D = await overview(); let who = 'all', delay = 182;
        const dlg = document.createElement('dialog'); dlg.className = 'modal modal-l sv-stats'; dlg.dataset.noFoot = ''; dlg.dataset.ownClose = '1';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">SUIVI DES ANIMAUX · CHIFFRES</span><h2>📊 Chiffres</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="sv-stats-body"><div class="sv-stats-bar"><div class="segmented" data-who></div><button type="button" class="button small secondary" data-export>⤓ Exporter ▾</button></div><div data-out>${UI().spinner ? UI().spinner('Les chiffres…') : ''}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => dlg.close())); dlg.showModal();
        const s0 = scope(D, w);
        dlg.querySelector('[data-who]').innerHTML = [['all', 'Tous les animaux'], ...s0.animals.slice(0, 6).map(a => [String(a.id), a.title]), ...(D.sites || []).slice(0, 3).map(x => ['s' + x.id, '🏞 ' + x.name])].map(([k, l]) => `<button type="button" data-k="${esc(k)}" class="${k === who ? 'is-active' : ''}">${esc(l)}</button>`).join('');
        const draw = async () => {
            const site = who.startsWith('s') ? Number(who.slice(1)) : 0, pet = /^\d+$/.test(who) ? Number(who) : 0;
            const s = scope(D, {config: {...(w.config || {}), pets: pet ? [pet] : w.config?.pets, site: site || w.config?.site}});
            const observers = new Set(s.obs.map(o => o.observer_id ? 'p' + o.observer_id : o.observer).filter(Boolean));
            const dates = s.obs.map(o => o.iso).filter(Boolean).sort();
            const gpsAnimals = s.animals.filter(a => a.gps?.n).slice(0, 8);
            const tracks = await Promise.all(gpsAnimals.map(a => api('suivi', {op: 'gps', pet_id: a.id, max: 20000}).then(r => ({a, pts: r.points || []})).catch(() => ({a, pts: []}))));
            const far = tracks.map(t => ({a: t.a, km: C().pathKm(t.pts), t0: t.pts[0]?.[0], t1: t.pts[t.pts.length - 1]?.[0]})).sort((x, y) => y.km - x.km)[0];
            const zoneOf = pet ? animalById(D, pet) : s.animals.slice().sort((x, y) => y.obs_count - x.obs_count)[0];
            const zonePts = zoneOf ? [...s.obs.filter(o => o.pet_id === zoneOf.id && Number.isFinite(o.lat)).map(o => [0, o.lat, o.lon]), ...(tracks.find(t => t.a.id === zoneOf.id)?.pts || [])] : [];
            const zone = C().hull(zonePts);
            const y = new Date().getFullYear(); const per = Array.from({length: 12}, (_, i) => new Set(s.obs.filter(o => (o.iso || '').startsWith(`${y}-${pad(i + 1)}`) && o.pet_id).map(o => o.pet_id)).size);
            const mx = Math.max(1, ...per);
            const bySite = {}; s.obs.forEach(o => { const k = placeOfObs(o, D) || '?'; bySite[k] = (bySite[k] || 0) + 1; });
            const sites = Object.entries(bySite).sort((a, b) => b[1] - a[1]).slice(0, 8), smx = sites[0]?.[1] || 1;
            const never = s.animals.map(a => ({a, l: lastSeen(a)})).filter(x => x.a.deceased || !x.l || (daysSince(x.l.iso) ?? 0) >= delay).sort((p, q) => (p.l?.iso || '').localeCompare(q.l?.iso || ''));
            dlg.querySelector('[data-out]').innerHTML = `<div class="sv-kpis is-big"><div><b>${fmtN(s.animals.length)}</b><small>animaux suivis</small></div><div><b>${fmtN(s.obs.length)}</b><small>observations · ${esc(plural(observers.size, 'observateur'))}</small></div>
                <div><b>${esc(dates[0] ? dateFr(dates[0]) : '—')}</b><small>première observation${dates.length ? ` · dernière : ${esc(dateFr(dates[dates.length - 1]))}` : ''}</small></div><div><b>${esc(far?.km ? kmText(far.km) : '—')}</b><small>${far?.km ? `parcourus par ${esc(far.a.title)} (${esc(dateFr(tIso(far.t0)))} → ${esc(dateFr(tIso(far.t1)))})` : 'pas de trajet GPS'}</small></div></div>
                <div class="sv-stats-grid"><section><h4>Animaux vus par mois · ${y}</h4><div class="sv-bars is-big">${per.map((v, i) => `<span class="sv-bar" title="${esc(MONTHS_L[i])} : ${v}"><i style="height:${Math.round(4 + 90 * v / mx)}px"></i><small>${MONTHS[i][0].toUpperCase()}</small></span>`).join('')}</div></section>
                <section><h4>Par site · observations</h4>${sites.map(([k, v]) => `<div class="sv-cause"><span>${esc(k)}</span><i style="width:${Math.round(100 * v / smx)}%"></i><b>${v}</b></div>`).join('') || A().empty('Aucune observation.', {icon: '📍'})}</section>
                <section><h4>Zone fréquentée${zoneOf ? ` · ${esc(zoneOf.title)}` : ''}</h4>${zone.hull.length > 2 ? `<div class="sv-map-host" data-zone></div><p><b>≈ ${esc(zone.km2 < 1 ? `${(zone.km2 * 100).toLocaleString('fr-FR', {maximumFractionDigits: 1})} ha` : `${zone.km2.toLocaleString('fr-FR', {maximumFractionDigits: 1})} km²`)}</b> <small class="muted">enveloppe des points vus</small></p>` : A().empty('Il faut au moins 3 points pour une zone.', {icon: '▱'})}</section>
                <section><h4>Jamais revus depuis… <select data-delay aria-label="Délai">${[[91, '3 mois'], [182, '6 mois'], [365, '1 an'], [730, '2 ans']].map(([v, l]) => `<option value="${v}" ${v === delay ? 'selected' : ''}>${l}</option>`).join('')}</select></h4>${never.length ? never.map(({a, l}) => `<div class="sv-row" data-sv-pet="${a.id}" role="button" tabindex="0"><span class="sv-what"><b>${esc(a.title)}</b>${l?.place ? ` · ${esc(l.place)}` : ''}</span><small>${a.deceased ? '† mort' : l ? `${esc(dateFr(l.iso))} · ${esc(ago(l.iso))}` : 'jamais vu'}</small></div>`).join('') : A().empty('Tous ont été revus.', {icon: '✓'})}</section></div>
                ${causesBars(s.health)}`;
            const zh = dlg.querySelector('[data-zone]'); if (zh) mapView(zh, {series: [{name: zoneOf.title, color: '#055dff', points: zonePts.filter(p => p[0] === 0).map(p => ({lat: p[1], lon: p[2]}))}], polygons: [{coords: zone.hull, color: '#055dff', label: 'zone fréquentée'}], height: 180});
            dlg.querySelector('[data-delay]')?.addEventListener('change', e => { delay = Number(e.target.value); draw(); });
        };
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-who] [data-k]'); if (b) { who = b.dataset.k; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b)); draw(); } });
        dlg.querySelector('[data-export]').addEventListener('click', e => exportMenu(e.currentTarget, () => { const pet = /^\d+$/.test(who) ? Number(who) : 0; return scope(D, {config: {pets: pet ? [pet] : null, site: who.startsWith('s') ? Number(who.slice(1)) : 0}}); }, D));
        draw();
    }

    /* ═════════ ⤓ Exporter ▾ : CSV, Movebank (CSV), GPX / KML (trajets), 🧮 Ouvrir dans le tableur ═════════ */
    function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = A().safeExportFilename ? A().safeExportFilename(name) : name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    function obsRows(D, obs) {
        const head = ['Date', 'Heure', 'Animal', 'Espèce', 'Lieu', 'Latitude', 'Longitude', 'Ce qu’il faisait', 'Nombre', 'Lecture', 'Fiabilité', 'Vu par', 'Source', 'Note'];
        return [head, ...obs.map(o => { const a = animalById(D, o.pet_id); return [o.iso || o.date, timeFr(o.time), a?.title || '', a?.taxon || (a ? ext.speciesLabel?.(a.species) || a.species : ''), placeOfObs(o, D), o.lat ?? '', o.lon ?? '', (o.behaviors || []).map(b => (C().BEHAVIORS[b] || b).replace(/^\S+\s/, '')).join(', '), o.count ?? '', o.reading, (REL[o.reliability] || [''])[0], o.observer, o.source, o.note]; })];
    }
    async function tracksOf(D, animals) {
        const res = await Promise.all(animals.filter(a => a.gps?.n).slice(0, 30).map(a => api('suivi', {op: 'gps', pet_id: a.id, max: 20000}).then(r => ({name: a.title, tag: (a.marks || []).find(m => /gps|satellite|vhf|transmitter/.test(m.kind))?.code || '', taxon: a.sci_name || a.taxon || '', points: r.points || []})).catch(() => null)));
        const tracks = res.filter(t => t?.points.length);
        // les observations placées de chaque animal comptent aussi comme un trajet (dans l'ordre)
        animals.forEach(a => { const pts = (D.observations || []).filter(o => o.pet_id === a.id && Number.isFinite(o.lat)).map(o => [tOf(o), o.lat, o.lon, null]).filter(p => p[0]).sort((x, y) => x[0] - y[0]); if (pts.length) tracks.push({name: `${a.title} · observations`, tag: '', taxon: a.sci_name || a.taxon || '', points: pts}); });
        return tracks;
    }
    function exportMenu(anchor, getScope, D) {
        const name = 'Suivi des animaux';
        UI().menuAt(anchor, [
            {icon: '📄', label: 'CSV (observations)', run: () => { const s = getScope(); download(`${name} — observations.csv`, C().toCSV(obsRows(D, s.obs)), 'text/csv;charset=utf-8'); }},
            {icon: '📡', label: 'Movebank (CSV)', run: async () => { const s = getScope(), t = await tracksOf(D, s.animals); if (!t.length) return toast('Aucun point placé à exporter.'); download(`${name} — movebank.csv`, C().toMovebank(t), 'text/csv;charset=utf-8'); }},
            {icon: '📍', label: 'GPX (trajets)', run: async () => { const s = getScope(), t = await tracksOf(D, s.animals); if (!t.length) return toast('Aucun trajet à exporter.'); download(`${name}.gpx`, C().toGPX(t), 'application/gpx+xml'); }},
            {icon: '📍', label: 'KML (trajets)', run: async () => { const s = getScope(), t = await tracksOf(D, s.animals); if (!t.length) return toast('Aucun trajet à exporter.'); download(`${name}.kml`, C().toKML(t), 'application/vnd.google-earth.kml+xml'); }},
            '-',
            {icon: '🧮', label: 'Ouvrir dans le tableur', run: () => { const s = getScope(); if (!ext.openRowsInSheet) return toast('Le tableur n’est pas chargé.', 'error'); ext.openRowsInSheet({name: `${name} — observations`, rows: obsRows(D, s.obs)}); }},
        ], {title: '⤓ Exporter'});
    }
    ext.suivi.exportMenu = exportMenu;

    /* ═════════ S7 : la fenêtre « Nouvelle observation » ═════════ */
    const SEEN_EMPTY = () => ({L: [null, null], R: [null, null]});
    /** Les pattes dessinées : 4 places de bague, cliquées une à une (couleur de base, ?, ∅, ou une autre couleur par C2) */
    function legsSvg(seen, cur) {
        const slot = (leg, i, x, y) => { const v = seen[leg][i], on = cur && cur[0] === leg && cur[1] === i; const fill = v === 'none' || v == null ? 'none' : v === '?' ? 'url(#svq)' : v === 'metal' ? '#c0c4c8' : (C().colorInfo(v)?.[2] || v);
            return `<g class="sv-slot${on ? ' is-on' : ''}" data-slot="${leg}${i}" role="button" tabindex="0" aria-label="${leg === 'L' ? 'Patte gauche' : 'Patte droite'}, ${i ? 'en bas' : 'en haut'}"><rect x="${x}" y="${y}" width="30" height="26" rx="3" fill="${esc(fill)}" stroke="${on ? 'var(--blue-bright)' : 'currentColor'}" stroke-width="${on ? 3 : 1.5}" stroke-dasharray="${v == null ? '4 3' : ''}"/>${v === '?' ? `<text x="${x + 15}" y="${y + 18}" text-anchor="middle" font-size="14" font-weight="700">?</text>` : v === 'none' ? `<text x="${x + 15}" y="${y + 18}" text-anchor="middle" font-size="13">∅</text>` : ''}</g>`; };
        return `<svg class="sv-legs" viewBox="0 0 220 190" role="group" aria-label="Les pattes de l’oiseau, vu de dos"><defs><pattern id="svq" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#999" stroke-width="1.5"/></pattern></defs>
            <path d="M30 6 Q110 70 190 6" fill="currentColor" opacity=".85"/><line x1="62" y1="40" x2="62" y2="150" stroke="currentColor" stroke-width="6"/><line x1="158" y1="40" x2="158" y2="150" stroke="currentColor" stroke-width="6"/>
            <path d="M62 150 l-22 18 M62 150 l22 18 M62 150 v20 M158 150 l-22 18 M158 150 l22 18 M158 150 v20" stroke="currentColor" stroke-width="4" fill="none"/>
            ${slot('L', 0, 47, 52)}${slot('L', 1, 47, 98)}${slot('R', 0, 143, 52)}${slot('R', 1, 143, 98)}<text x="62" y="186" text-anchor="middle" font-size="10">gauche</text><text x="158" y="186" text-anchor="middle" font-size="10">droite</text></svg>`;
    }
    /** Les caractères du code lu : un clic change sûr → pas lu (?) → j'hésite entre… */
    function charsHtml(raw) {
        const r = C().parseReading(raw);
        return r.chars.length ? `<div class="sv-chars" aria-label="Chaque caractère du code">${r.chars.map((c, i) => `<button type="button" class="sv-char ${c === null ? 'is-unknown' : c.length > 1 ? 'is-doubt' : ''}" data-char="${i}" title="${c === null ? 'Pas lu : clique pour dire « j’hésite entre… »' : c.length > 1 ? 'J’hésite : clique pour dire que c’est sûr' : 'Sûr : clique pour dire « pas lu »'}">${c === null ? '?' : esc(c.join('|'))}</button>`).join('')}<small class="muted">un clic : sûr → pas lu → j’hésite entre…</small></div>` : '';
    }
    async function openObservation({petId = 0, obs = null, profile = '', siteId = 0} = {}) {
        if (RO()) return toast('Mode consultation : rien à modifier.');
        const D = await overview(true).catch(() => ({animals: []}));
        const a0 = animalById(D, obs?.pet_id || petId);
        let prof = profile || (a0 ? profileOf(a0) : 'oiseau');
        const detail = obs?.reading_detail || {};
        const seen = detail.colors ? {L: [...(detail.colors.L || [null, null])], R: [...(detail.colors.R || [null, null])]} : SEEN_EMPTY();
        let cur = ['R', 1], chosen = obs?.pet_id || petId || 0, reading = obs?.reading || '', number = detail.number || '', lastCands = [];
        const beh = new Set(obs?.behaviors || []);
        const now = new Date(), dflt = `${now.getDate()} ${MONTHS_L[now.getMonth()]} ${now.getFullYear()}`;
        const profOpts = Object.entries(C().PROFILES).map(([k, p]) => `<option value="${k}" ${k === prof ? 'selected' : ''}>${p.icon} ${esc(p.label)}</option>`).join('');
        const dlg = ext.openDialog({eyebrow: '👁 OBSERVATION', title: obs ? 'Modifier l’observation' : 'Nouvelle observation',
            body: `<div class="sv-obs">
                <div class="sv-obs-2"><div><span class="pk-lab">Quand</span><div class="sv-when-row"><input name="date" data-ui-date value="${esc(obs?.date || dflt)}" required aria-label="Date"><input name="time" data-ui-time value="${esc(obs?.time || `${pad(now.getHours())}:${pad(now.getMinutes())}`)}" aria-label="Heure"></div></div>
                <div><span class="pk-lab">Où</span>${P().pickerField({name: 'place_id', kind: 'place', value: obs?.place_id || null})}<div class="sv-where-tools"><button type="button" class="button small secondary" data-geo>📍 Ma position</button><small class="muted" data-latlon>${obs && Number.isFinite(obs.lat) ? `${obs.lat.toFixed(5)}, ${obs.lon.toFixed(5)}` : ''}</small></div><input type="hidden" name="lat" value="${obs?.lat ?? ''}"><input type="hidden" name="lon" value="${obs?.lon ?? ''}"></div></div>
                <div class="sv-obs-2"><div><span class="pk-lab">Site de suivi (facultatif)</span>${P().pickerField({name: 'site_id', kind: 'tsite', value: obs?.site_id || siteId || null})}</div><div><span class="pk-lab">L’animal</span><span data-pet-field>${P().pickerField({name: 'pet_id', kind: 'pet', value: chosen || null})}</span></div></div>
                <fieldset class="sv-find-box"><legend>Retrouver l’animal · selon l’espèce : <select name="profile" data-prof aria-label="Espèce">${profOpts}</select></legend><div data-finder></div></fieldset>
                <div class="sv-obs-2"><div><span class="pk-lab">Ce qu’il faisait</span><div class="sv-beh" data-beh></div></div>
                <div><label>Nombre vus<input type="number" name="count" min="0" max="10000000" value="${obs?.count ?? ''}" data-unit="${esc(C().PROFILES[prof]?.unit || 'animaux')}"></label>
                <span class="pk-lab">Avec qui</span>${P().pickerField({name: 'with', kind: 'pet', multiple: true, value: obs?.with || []})}</div></div>
                <div data-sea></div>
                <div class="sv-obs-2"><div><span class="pk-lab">Vu par</span>${P().pickerField({name: 'observer', kind: 'person', allowFree: true, value: obs?.observer_id || (obs?.observer ? 'txt:' + obs.observer : null)})}</div>
                <div><span class="pk-lab">Photo ou son</span>${P().mediaField({name: 'media_id', types: ['image', 'audio', 'video'], value: obs?.media_id || null})}</div></div>
                <div class="sv-obs-2"><div><span class="pk-lab">Lecture de la bague</span><div data-rel></div></div><label>Note<textarea name="note" rows="2" maxlength="4000">${esc(obs?.note || '')}</textarea></label></div>
                <input type="hidden" name="source" value="${esc(obs?.source || 'manuel')}"></div>`,
            onSubmit: async form => {
                const v = new FormData(form);
                if (!String(v.get('date') || '').trim()) return UI().fail(form.elements.date, 'Dis quand tu l’as vu.');
                const petVal = Number(form.elements.pet_id?.value) || 0;
                const rel = currentRel();
                const body = {id: obs?.id || 0, pet_id: petVal, date: v.get('date'), time: v.get('time'), place_id: Number(v.get('place_id')) || 0, site_id: Number(v.get('site_id')) || 0,
                    lat: v.get('lat'), lon: v.get('lon'), behaviors: [...beh], count: v.get('count'), with: String(v.get('with') || '').split(',').map(Number).filter(Boolean),
                    observer: String(v.get('observer') || ''), media_id: Number(v.get('media_id')) || 0, note: v.get('note'), source: v.get('source') || 'manuel',
                    reading: prof === 'oiseau' ? C().parseReading(reading).text : number, reading_detail: {chars: C().parseReading(prof === 'oiseau' ? reading : number).chars, colors: seen, number}, reliability: rel,
                    sea: {depth_m: v.get('depth_m'), group_size: v.get('group_size'), surface: v.get('surface'), camera: v.get('camera')}};
                if (!body.place_id && body.lat === '' && !body.site_id) return UI().fail(form.elements.place_id, 'Dis où tu l’as vu (un lieu, un site, ou 📍 Ma position).');
                await write('save_obs', body);
                toast(obs ? 'Observation enregistrée.' : 'Observation créée.', 'success');
                refreshView();
            }});
        const form = dlg.querySelector('form');
        const drawBeh = () => { const list = [...new Set([...(C().PROFILES[prof]?.behaviors || []), ...beh])]; form.querySelector('[data-beh]').innerHTML = list.map(k => `<button type="button" class="sv-tag${beh.has(k) ? ' is-on' : ''}" data-b="${esc(k)}" aria-pressed="${beh.has(k)}">${esc(C().BEHAVIORS[k] || k)}</button>`).join('') + '<button type="button" class="sv-tag" data-b-other>＋ Autre…</button>'; };
        const drawSea = () => { const p = C().PROFILES[prof] || {}; form.querySelector('[data-sea]').innerHTML = p.sea ? `<fieldset class="sv-sea"><legend>🌊 En mer</legend><label>Profondeur<input type="number" name="depth_m" min="0" max="12000" data-unit="m" value="${esc(obs?.sea?.depth_m ?? '')}"></label><label>Taille du groupe<input type="number" name="group_size" min="0" max="100000" value="${esc(obs?.sea?.group_size ?? '')}"></label><label>Comportement en surface<input name="surface" maxlength="120" value="${esc(obs?.sea?.surface || '')}" placeholder="sauts, souffles, nage lente…"></label></fieldset>` : p.camtrap ? `<fieldset class="sv-sea"><legend>📷 Piège photo</legend><label class="checkbox-line"><input type="checkbox" data-camtrap ${obs?.source === 'piege' ? 'checked' : ''}> Vu par un piège photo</label><label>Piège n°<input name="camera" maxlength="120" value="${esc(obs?.sea?.camera || '')}"></label></fieldset>` : ''; form.querySelector('[data-camtrap]')?.addEventListener('change', e => { form.elements.source.value = e.target.checked ? 'piege' : 'manuel'; }); };
        function currentRel() { return prof === 'oiseau' ? C().reliability({reading, colors: seen, tie: lastCands[0]?.tie}) : number ? (/[?\[…*]/.test(number) || number.includes('...') ? 'partial' : 'full') : ''; }
        const drawRel = () => { const r = currentRel(), pr = C().parseReading(prof === 'oiseau' ? reading : number); form.querySelector('[data-rel]').innerHTML = r ? `${badge(REL[r][0], REL[r][1])} <small class="muted">${pr.chars.length ? `lecture : ${esc(pr.text)}${pr.doubtful ? ' (doute)' : ''} · ` : ''}mise toute seule d’après ce que tu as cliqué</small>` : '<small class="muted">Rien de lu pour l’instant.</small>'; };
        function drawCands() {
            const box = form.querySelector('[data-cands]'); if (!box) return;
            const lat = Number(form.elements.lat.value), lon = Number(form.elements.lon.value);
            const cands = C().candidates(D.animals || [], prof === 'oiseau' ? {reading, colors: seen, lat: Number.isFinite(lat) && form.elements.lat.value !== '' ? lat : undefined, lon, iso: todayIso()} : {number, lat: undefined});
            lastCands = cands;
            const any = prof === 'oiseau' ? reading || ['L', 'R'].some(l => seen[l].some(v => v != null)) : number;
            box.innerHTML = !any ? '<small class="muted">Clique les bagues vues ou tape le code : l’app propose les animaux qui correspondent.</small>' : `<p class="sv-cands-h"><b>${esc(plural(cands.length, 'animal correspond', 'animaux correspondent'))}</b> · les plus probables d’abord (couleurs, code, vus près d’ici)</p>${cands.slice(0, 6).map(c => `<button type="button" class="sv-cand${c.animal.id === chosen ? ' is-on' : ''}" data-cand="${c.animal.id}">${animalThumb(c.animal, 30)}<span><b>${esc(c.animal.title)}</b><small class="muted">${esc([codeOf(c.animal), ...c.reasons].filter(Boolean).join(' · '))}</small></span><span class="sv-pct"><b>${c.pct} %</b><small>${esc(c.label)}</small></span></button>`).join('')}
                <p class="sv-cands-more"><button type="button" class="link-button" data-new-animal>＋ Créer la fiche d’un nouvel animal</button> · <button type="button" class="link-button" data-no-animal>✎ Garder sans fiche${reading ? ` (« ${esc(C().parseReading(reading).text)} »)` : ''}</button></p>`;
            if (cands[0]?.tie && prof === 'oiseau') box.insertAdjacentHTML('afterbegin', UI().notice ? UI().notice('warn', 'Deux animaux correspondent autant : la lecture sera marquée « Doute ».') : '');
            drawRel();
        }
        function drawFinder() {
            const box = form.querySelector('[data-finder]'), p = C().PROFILES[prof] || C().PROFILES.autre;
            form.querySelector('[name="count"]')?.setAttribute('data-unit', p.unit || 'animaux');
            if (p.find === 'rings') {
                box.innerHTML = `<div class="sv-finder"><div class="sv-finder-legs"><div data-legs>${legsSvg(seen, cur)}</div><p class="sv-small"><b data-curtxt></b> : choisis la couleur</p>
                    <div class="sv-palette" role="group" aria-label="Couleurs des bagues">${C().RING_COLORS.map(([k, n, hex]) => `<button type="button" class="sv-sw" data-col="${k}" style="background:${hex}" title="${esc(n)}" aria-label="${esc(n)}"></button>`).join('')}<button type="button" class="sv-sw is-txt" data-col="?" title="Bague vue mais couleur pas sûre">?</button><button type="button" class="sv-sw is-txt" data-col="none" title="Pas de bague à cet endroit">∅</button><button type="button" class="sv-sw is-txt" data-col-other title="Une autre couleur (pipette, code #…)">🎨</button><button type="button" class="sv-sw is-txt" data-col="" title="Pas regardé">⌫</button></div>
                    <label class="sv-code">Code lu<input data-reading value="${esc(reading)}" maxlength="40" placeholder="7K, 7?, 7[K|X]" autocomplete="off" spellcheck="false"></label><small class="muted">« ? » = pas lu · [K|X] = j’hésite entre K et X</small><div data-chars>${charsHtml(reading)}</div></div>
                    <div class="sv-cands" data-cands></div></div>`;
                const curTxt = () => { const t = form.querySelector('[data-curtxt]'); if (t) t.textContent = `${cur[0] === 'L' ? 'Gauche' : 'Droite'}, en ${cur[1] ? 'bas' : 'haut'}`; };
                curTxt();
                box.querySelector('[data-legs]').addEventListener('click', e => { const s = e.target.closest('[data-slot]'); if (!s) return; cur = [s.dataset.slot[0], Number(s.dataset.slot[1])]; box.querySelector('[data-legs]').innerHTML = legsSvg(seen, cur); curTxt(); });
                box.querySelector('.sv-palette').addEventListener('click', e => {
                    const o = e.target.closest('[data-col-other]');
                    if (o && UI().openColorBox) { UI().openColorBox(o, {get: () => (/^#/.test(seen[cur[0]][cur[1]] || '') ? seen[cur[0]][cur[1]] : '#888888'), set: (v, final) => { if (!final) return; seen[cur[0]][cur[1]] = v; UI().rememberColor?.(v); box.querySelector('[data-legs]').innerHTML = legsSvg(seen, cur); drawCands(); }}); return; }
                    const b = e.target.closest('[data-col]'); if (!b) return;
                    seen[cur[0]][cur[1]] = b.dataset.col || null;
                    const order = [['L', 0], ['L', 1], ['R', 0], ['R', 1]], i = order.findIndex(x => x[0] === cur[0] && x[1] === cur[1]); if (b.dataset.col && i < 3) cur = order[i + 1];
                    box.querySelector('[data-legs]').innerHTML = legsSvg(seen, cur); curTxt(); drawCands();
                });
                const rIn = box.querySelector('[data-reading]');
                rIn.addEventListener('input', () => { reading = rIn.value; box.querySelector('[data-chars]').innerHTML = charsHtml(reading); drawCands(); });
                box.querySelector('[data-chars]').addEventListener('click', async e => {
                    const b = e.target.closest('[data-char]'); if (!b) return;
                    const r = C().parseReading(reading), i = Number(b.dataset.char), c = r.chars[i];
                    if (c && c.length === 1) r.chars[i] = null;
                    else if (c === null) { const t = await A().askText({title: 'J’hésite entre…', message: `Le caractère n° ${i + 1} : écris les possibilités (ex. « K X » ou « 3 8 »).`, okLabel: 'Enregistrer'}); if (t == null) return; const opts = [...new Set(t.toUpperCase().replace(/[^0-9A-Z]/g, '').split(''))]; r.chars[i] = opts.length ? opts : null; }
                    else r.chars[i] = [c[0]];
                    reading = C().formatReading(r.chars) + (r.partial ? '…' : ''); rIn.value = reading; box.querySelector('[data-chars]').innerHTML = charsHtml(reading); drawCands();
                });
            } else {
                const hint = {compagnie: 'n° de puce ou de tatouage (même en partie)', cheval: 'n° de puce ou UELN (même en partie)', ferme: 'n° de boucle (même en partie)', marin: 'n° au catalogue de photo-identification, de balise ou de marque', sauvage: 'n° de collier, de boucle, de tatouage ou de puce', primate: 'n° au catalogue, de puce ou de tatouage'}[prof] || 'n° ou code (même en partie)';
                box.innerHTML = `<div class="sv-finder is-number"><label class="sv-code">N° lu<input data-number value="${esc(number)}" maxlength="40" placeholder="250 26 9…" autocomplete="off" spellcheck="false"></label><small class="muted">${esc(hint)} · « ? » = pas lu · [3|8] = j’hésite · « … » = la suite pas lue</small>${C().PROFILES[prof]?.marks?.includes('photo_id') ? '<p class="muted sv-small">📸 Photo-identification : compare avec les photos de référence de sa fiche (onglet Marques), puis choisis l’animal.</p>' : ''}<div class="sv-cands" data-cands></div></div>`;
                const nIn = box.querySelector('[data-number]'); nIn.addEventListener('input', () => { number = nIn.value; drawCands(); });
            }
            drawCands(); drawBeh(); drawSea();
        }
        form.querySelector('[data-prof]').addEventListener('change', e => { prof = e.target.value; drawFinder(); });
        form.addEventListener('click', async e => {
            const c = e.target.closest('[data-cand]');
            if (c) { chosen = Number(c.dataset.cand); P().pickerSet(form.querySelector('[data-pet-field] .pk'), chosen); form.querySelectorAll('[data-cand]').forEach(x => x.classList.toggle('is-on', x === c)); return; }
            if (e.target.closest('[data-no-animal]')) { chosen = 0; P().pickerSet(form.querySelector('[data-pet-field] .pk'), null); form.querySelectorAll('[data-cand]').forEach(x => x.classList.remove('is-on')); toast('L’observation sera gardée sans fiche, avec la lecture.'); return; }
            if (e.target.closest('[data-new-animal]')) {
                const name = await A().askText({title: 'Nouvel animal', message: 'Son nom (ou un code : « 7K », « Sans nom 2C9 »)', value: reading ? C().parseReading(reading).text : '', okLabel: 'Créer la fiche'}); if (name == null) return;
                const sp = {oiseau: 'oiseau', compagnie: 'chat', cheval: 'cheval', ferme: 'ferme', poisson: 'poisson', marin: 'marin', sauvage: 'sauvage', primate: 'sauvage'}[prof] || 'autre';
                const r = await write('create_animal', {name: name.trim() || 'Sans nom', species: sp, profile: prof});
                if (prof === 'oiseau' && ['L', 'R'].some(l => seen[l].some(v => v && v !== '?' && v !== 'none'))) {
                    const ring = v => !v || v === '?' || v === 'none' ? null : v === 'metal' ? {metal: true} : {color: C().colorInfo(v)?.[2] || v, name: C().colorInfo(C().colorKey(v))?.[1] || ''};
                    const colors = {L: seen.L.map(ring), R: seen.R.map(ring)}; const code = C().parseReading(reading); if (code.chars.length && !code.unknown && !code.doubtful) { const slot = ['R', 'L'].flatMap(l => [1, 0].map(i => [l, i])).find(([l, i]) => colors[l][i] && !colors[l][i].metal); if (slot) colors[slot[0]][slot[1]].code = code.text; }
                    await write('save_mark', {pet_id: r.id, kind: 'color_rings', colors, start_date: form.elements.date.value});
                } else if (prof !== 'oiseau' && number && !/[?\[…*]/.test(number)) await write('save_mark', {pet_id: r.id, kind: (C().PROFILES[prof]?.marks || ['other'])[0], code: number});
                D.animals = (await overview(true)).animals; chosen = r.id; P().pickerSet(form.querySelector('[data-pet-field] .pk'), r.id); toast(`Fiche de « ${r.title} » créée.`); drawCands(); return;
            }
            const b = e.target.closest('[data-b]'); if (b) { const k = b.dataset.b; beh.has(k) ? beh.delete(k) : beh.add(k); drawBeh(); return; }
            if (e.target.closest('[data-b-other]')) { const t = await A().askText({title: 'Ce qu’il faisait', message: 'En quelques mots (« se baigne », « chasse un goéland »…)', okLabel: 'Ajouter'}); if (t && t.trim()) { beh.add(t.trim().slice(0, 40)); drawBeh(); } return; }
            if (e.target.closest('[data-geo]')) {
                if (!navigator.geolocation) return toast('Cet appareil ne donne pas sa position.', 'error');
                navigator.geolocation.getCurrentPosition(p => { form.elements.lat.value = p.coords.latitude.toFixed(6); form.elements.lon.value = p.coords.longitude.toFixed(6); form.querySelector('[data-latlon]').textContent = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)} (± ${Math.round(p.coords.accuracy)} m)`; drawCands(); }, err => toast(`Position introuvable : ${err.message}`, 'error'), {enableHighAccuracy: true, timeout: 15000});
            }
        });
        form.addEventListener('picker-change', e => {
            if (e.detail.name === 'pet_id') { chosen = Number(e.detail.value) || 0; const a = animalById(D, chosen); if (a && profileOf(a) !== prof && !reading && !number) { prof = profileOf(a); form.querySelector('[data-prof]').value = prof; drawFinder(); } }
            if (e.detail.name === 'place_id' && e.detail.item && Number.isFinite(Number(e.detail.item.lat))) { form.elements.lat.value = e.detail.item.lat; form.elements.lon.value = e.detail.item.lon; form.querySelector('[data-latlon]').textContent = ''; drawCands(); }
        });
        drawFinder();
        return dlg;
    }

    /* ═════════ S9 : importer un trajet GPS (fenêtre K13 en 3 étapes) ═════════ */
    async function importGps({files = null, petId = 0} = {}) {
        if (RO()) return toast('Mode consultation : rien à importer.');
        if (!UI().openImportDialog) return toast('La fenêtre d’import n’est pas chargée.', 'error');
        const D = await overview(true).catch(() => ({animals: []}));
        let parsed = null;
        return UI().openImportDialog({title: 'Un trajet GPS', accept: '.gpx,.kml,.csv,.tsv,.txt,.json,.geojson', files: files || undefined, noun: 'point',
            text: '📁 Glisse ici le fichier, colle-le (⌘V) ou choisis-le',
            hint: 'GPX, KML, CSV, GeoJSON · faune sauvage : export Movebank, balises Ornitela, e-obs, Druid… · colliers d’animaux de compagnie : export des applis Tractive, Weenect, Invoxia, Kippy… Il faut date, heure, latitude, longitude.',
            analyze: async fs => {
                const f = fs[0]; if (f.size > C().MAX_TEXT) throw new Error('Fichier trop gros (40 Mo au plus).');
                let text; const buf = await f.arrayBuffer();
                text = window.LCNDA_SHEET?.decodeBytes ? window.LCNDA_SHEET.decodeBytes(new Uint8Array(buf)) : new TextDecoder('utf-8').decode(buf);
                if (typeof text !== 'string') text = text?.text ?? String(text);
                parsed = C().parseTrack(text, f.name);
                // l'animal : celui de la fiche, sinon celui dont la balise ou le collier porte le n° du fichier
                let pet = petId;
                if (!pet) { const ids = (parsed.ids || []).map(x => C().norm(x)); pet = (D.animals || []).find(a => (a.marks || []).some(m => m.code && ids.includes(C().norm(m.code))) || ids.includes(C().norm(a.title)))?.id || 0; }
                const pts = parsed.points, km = C().pathKm(pts), interval = Number((animalById(D, pet)?.marks || []).find(m => m.interval_min)?.interval_min) || 0;
                const hint = parsed.format.split(' ')[0];
                return {count: pts.length, noun: 'point', parsed, data: parsed,
                    summaryHtml: `<b>${esc(plural(pts.length, 'point'))}</b> du ${esc(dateFr(tIso(pts[0][0])))} au ${esc(dateFr(tIso(pts[pts.length - 1][0])))}, <b>${esc(kmText(km))}</b> · ${esc(parsed.format)}`,
                    notices: parsed.ignored ? [{kind: 'warn', text: `${plural(parsed.ignored, 'ligne')} sans date ou sans position ${parsed.ignored > 1 ? 'seront sautées' : 'sera sautée'}.`}] : [],
                    extra: `<div class="sv-imp"><fieldset><legend>Points à garder</legend><label class="checkbox-line"><input type="radio" name="svkeep" value="all" ${interval ? '' : 'checked'}> Tous les points (${fmtN(pts.length)})</label><label class="checkbox-line"><input type="radio" name="svkeep" value="thin" ${interval ? 'checked' : ''}> Un toutes les <input type="number" min="1" max="1440" value="${interval || 15}" data-unit="min" data-every aria-label="Minutes"> → <b data-thin-n></b></label></fieldset>
                        ${UI().checkHtml ? UI().checkHtml('Couper en nuits (une sortie = un trajet)', {attrs: 'data-nights', checked: /tractive|weenect|invoxia|kippy/i.test(hint)}) : '<label class="checkbox-line"><input type="checkbox" data-nights> Couper en nuits (une sortie = un trajet)</label>'}
                        <div><span class="pk-lab">Pour l’animal</span>${P().pickerField({name: '', hiddenName: false, kind: 'pet', value: pet || null})}</div><div data-skip></div></div>`,
                    onShow: body => {
                        const upd = () => { const n = keep(body).length; body.querySelector('[data-thin-n]').textContent = plural(n, 'point'); const go = body.closest('dialog')?.querySelector('[data-k-go]'); const pk = body.querySelector('.pk'); const pid = Number(P().pickerValue(pk)) || 0; if (go) { go.textContent = `⤒ Importer ${plural(n, 'point')}`; go.disabled = !pid || !n; } body.querySelector('[data-skip]').innerHTML = pid ? '' : (UI().notice ? UI().notice('warn', 'Choisis l’animal : à qui sont ces points ?') : ''); };
                        body.addEventListener('input', upd); body.addEventListener('change', upd); body.addEventListener('picker-change', upd); upd();
                    }};
            },
            run: async (an, fs, body) => {
                const pid = Number(P().pickerValue(body.querySelector('.pk'))) || 0; if (!pid) throw new Error('Choisis l’animal.');
                const pts = keep(body), nights = body.querySelector('[data-nights]')?.checked ? C().splitTrips(pts, 120).length : 0, km = C().pathKm(pts);
                let imp = 0, added = 0;
                for (let i = 0; i < pts.length; i += 5000) { const r = await write('gps_import', {pet_id: pid, import_id: imp, filename: fs[0].name, format: parsed.format, points: pts.slice(i, i + 5000), km, nights}); imp = r.import_id; added += r.added; }
                const a = animalById(D, pid); refreshView();
                return {message: `${plural(added, 'point importé', 'points importés')} pour ${a?.title || 'l’animal'}`, undo: async () => { await write('gps_undo', {import_id: imp}); refreshView(); }};
            }});
        function keep(body) { const all = parsed?.points || []; return body.querySelector('[name="svkeep"]:checked')?.value === 'thin' ? C().thin(all, Number(body.querySelector('[data-every]')?.value) || 15) : all; }
    }

    /* ═════════ S10 : 🐾 Recensement (Listes) : Observations · Animaux · Sites · Groupes ═════════ */
    const OBS_SORTS = [['recent', 'Plus récentes'], ['old', 'Plus anciennes'], ['az', 'A → Z'], ['za', 'Z → A']];
    /** S6 : le tableau des observations (aussi dans l'onglet 👁 Observations de la fiche) */
    function obsTableHtml(D, obs, {showAnimal = true} = {}) {
        return `<div class="data-table-wrap"><table class="data-table sv-obs-table"><thead><tr><th>Quand</th><th>Où</th>${showAnimal ? '<th>Animal</th>' : ''}<th>Ce qu’il faisait</th><th>Avec qui</th><th>Vu par</th><th>Photo, son</th><th>Bague</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${obs.map(o => { const a = animalById(D, o.pet_id), withA = (o.with || []).map(id => animalById(D, id)).filter(Boolean);
            return `<tr data-sv-obs="${o.id}" data-ctx-menu><td><b>${esc(o.iso ? dateFr(o.iso) : o.date)}</b>${o.time ? `<br><small class="muted">${esc(timeFr(o.time))}</small>` : ''}</td><td>📍 ${esc(placeOfObs(o, D))}${o.place_text && o.place ? `<br><small class="muted">${esc(o.place_text)}</small>` : ''}</td>${showAnimal ? `<td>${a ? `${esc(speciesIcon(a.species))} ${animalLink(a)}` : `<span class="muted">${o.count ? esc(`${o.count} sans bague`) : 'sans fiche'}</span>`}</td>` : ''}
                <td>${(o.behaviors || []).map(b => `<span class="sv-tag is-mini">${esc(C().BEHAVIORS[b] || b)}</span>`).join('')}${o.count ? ` <span class="sv-tag is-mini">👥 ${o.count}</span>` : ''}${o.sea?.depth_m != null ? ` <span class="sv-tag is-mini">⤵ ${o.sea.depth_m} m</span>` : ''}</td><td>${withA.map(x => animalLink(x)).join(', ') || '<span class="muted">seul</span>'}</td><td>${esc(o.observer || '—')}</td><td>${o.media_id ? `<button type="button" class="link-button" data-sv-media="${o.media_id}">📷 voir</button>` : '—'}</td><td>${relBadge(o)}${o.reading ? `<br><small class="muted">${esc(readingText(o))}</small>` : ''}</td>
                <td class="sv-row-act"><details class="ui-more"><summary class="icon-button small" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu"><button type="button" data-sv-obs-edit="${o.id}">✎ Modifier</button><button type="button" data-sv-obs-dup="${o.id}">⧉ Dupliquer</button><button type="button" class="danger" data-sv-obs-del="${o.id}">🗑 Supprimer</button></div></details></td></tr>`; }).join('')}</tbody></table></div>`;
    }
    ext.suivi.obsTableHtml = obsTableHtml;
    ext.lists.recensement = async token => {
        const st = A().state, ws = A().$('#workspace');
        if (st.svSite) return showSite(token, st.svSite);
        if (st.svGroup) return showGroup(token, st.svGroup);
        let D; try { D = await overview(true); } catch (e) { toast(e.message, 'error'); return; }
        if (token !== st.workspaceToken || st.module !== 'listes' || st.listType !== 'recensement') return;
        const tab = ['obs', 'animals', 'sites', 'groups'].includes(st.svTab) ? st.svTab : 'obs';
        const KEY = `listes:recensement:${tab}`;
        ws.innerHTML = `<section class="page sv-census">${UI().pageHeader({where: 'Listes · Animaux', icon: '🐾', title: 'Recensement', help: 'Les animaux suivis et tout ce qu’on a vu d’eux, sur tous les sites.',
            primary: RO() ? '' : tab === 'sites' ? '<button type="button" class="button" data-sv-site-new>＋ Nouveau site</button>' : tab === 'groups' ? '<button type="button" class="button" data-sv-group-new>＋ Nouveau groupe</button>' : '<button type="button" class="button" data-sv-new-obs>＋ Nouvelle observation</button>',
            actions: ['<button type="button" class="button secondary" data-sv-export>⤓ Exporter ▾</button>'], more: ['<button type="button" data-sv-goto-suivi>🐾 Suivi des animaux</button>', ...(RO() ? [] : ['<button type="button" data-sv-import>⤒ Importer un trajet…</button>', '<button type="button" data-sv-share>📤 Partager…</button>', '<button type="button" data-sv-receive>⤒ Recevoir un suivi partagé…</button>'])]})}
            <div class="segmented sv-census-tabs" role="tablist">${[['obs', '👁 Observations'], ['animals', '🔖 Animaux suivis'], ['sites', '🏞 Sites'], ['groups', '👥 Groupes']].map(([k, l]) => `<button type="button" role="tab" data-sv-ctab="${k}" class="${k === tab ? 'is-active' : ''}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
            <div data-sv-bar></div><div data-sv-list></div></section>`;
        const list = ws.querySelector('[data-sv-list]'), saved = UI().listBarState?.(KEY) || {};
        const spOpts = [...new Set((D.animals || []).filter(a => a.tracked).map(a => a.taxon || ext.speciesLabel?.(a.species) || a.species))].filter(Boolean).map(t => [t, t]);
        const years = [...new Set((D.observations || []).map(o => (o.iso || '').slice(0, 4)).filter(Boolean))].sort().reverse();
        const filters = tab === 'sites' || tab === 'groups' ? [] : [
            {id: 'sp', label: 'Espèce', type: 'radio', options: [['', 'Toutes'], ...spOpts], dflt: ''},
            {id: 'site', label: 'Site', kind: 'tsite', chipPrefix: '🏞'},
            ...(tab === 'obs' ? [{id: 'year', label: 'Année', type: 'radio', options: [['', 'Toutes'], ...years.map(y => [y, y])], dflt: ''}, {id: 'rel', label: 'Bague lue', type: 'check', options: [['full', 'En entier'], ['partial', 'Partielle'], ['colors', 'Couleurs seules'], ['doubt', 'Doute']]}] : []),
            ...(tab === 'animals' ? [{id: 'follow', label: 'Suivi', type: 'check', options: [['gps', 'Balise GPS'], ['gone', 'Pas revus depuis 6 mois'], ['ill', 'Ne va pas bien']]}] : [])];
        const draw = s => {
            const q = String(s.q || '').toLowerCase(), f = s.filters || {}, view = s.view || 'list', sort = s.sort || 'recent';
            const sp = f.sp || '', site = Number(typeof f.site === 'object' ? f.site?.id : f.site) || 0;
            const matchA = a => (!sp || (a.taxon || ext.speciesLabel?.(a.species) || a.species) === sp);
            if (tab === 'obs') {
                let rows = (D.observations || []).filter(o => { const a = animalById(D, o.pet_id); return (!sp || (a && matchA(a))) && (!site || o.site_id === site) && (!f.year || (o.iso || '').startsWith(f.year)) && (!(f.rel || []).length || f.rel.includes(o.reliability))
                    && (!q || [a?.title, placeOfObs(o, D), o.observer, o.note, o.reading, codeOf(a)].join(' ').toLowerCase().includes(q) || C().norm(codeOf(a)).includes(C().norm(q))); });
                rows = UI().sortItems ? UI().sortItems(rows, sort, {name: o => animalById(D, o.pet_id)?.title || '', date: o => `${o.iso} ${o.time}`}) : rows;
                bar.setCount?.(`${plural(rows.length, 'observation')} · vu sur ${plural(new Set(rows.map(o => o.site_id || o.place_id || placeOfObs(o, D))).size, 'site')}`);
                list.innerHTML = rows.length ? (view === 'cards' && UI().cardsHtml ? UI().cardsHtml(rows.slice(0, 300).map(o => { const a = animalById(D, o.pet_id); return {thumb: animalThumb(a, 60), name: a?.title || 'Animal sans fiche', open: `data-sv-obs="${o.id}"`, lines: [`${dateFr(o.iso || o.date)}${o.time ? ', ' + timeFr(o.time) : ''} · ${placeOfObs(o, D)}`, (o.behaviors || []).map(b => (C().BEHAVIORS[b] || b)).join(' ')], badges: [relBadge(o)].filter(Boolean), menu: RO() ? [] : [`<button type="button" data-sv-obs-edit="${o.id}">✎ Modifier</button>`, `<button type="button" data-sv-obs-dup="${o.id}">⧉ Dupliquer</button>`, `<button type="button" class="danger" data-sv-obs-del="${o.id}">🗑 Supprimer</button>`]}; })) : obsTableHtml(D, rows.slice(0, 500))) : A().emptyState({icon: '👁', text: q || sp || site ? 'Aucune observation ne correspond.' : 'Aucune observation pour l’instant', hint: 'Une observation : quand, où, quel animal, et si la bague a été bien lue.', action: RO() ? null : {label: '＋ Nouvelle observation', attrs: 'data-sv-new-obs'}});
            } else if (tab === 'animals') {
                let rows = (D.animals || []).filter(a => a.tracked && matchA(a) && (!site || (D.observations || []).some(o => o.pet_id === a.id && o.site_id === site)) && (!q || [a.title, a.taxon, codeOf(a), ...(a.marks || []).map(m => m.code)].join(' ').toLowerCase().includes(q) || (a.marks || []).some(m => C().norm(m.code).includes(C().norm(q)) && C().norm(q))));
                const fo = f.follow || [];
                if (fo.includes('gps')) rows = rows.filter(a => a.gps?.n || (a.marks || []).some(m => /gps|satellite|vhf/.test(m.kind)));
                if (fo.includes('gone')) rows = rows.filter(a => (daysSince(lastSeen(a)?.iso) ?? 9999) >= 182);
                if (fo.includes('ill')) rows = rows.filter(a => ['blesse', 'malade', 'soins'].includes(a.health?.state));
                rows = UI().sortItems ? UI().sortItems(rows, sort, {name: a => a.title, date: a => lastSeen(a)?.iso || ''}) : rows;
                bar.setCount?.(plural(rows.length, 'animal', 'animaux'));
                const item = a => { const l = lastSeen(a), gone = (daysSince(l?.iso) ?? 9999) >= 182; return {thumb: animalThumb(a, 60), name: `${a.gps?.n ? '📡 ' : ''}${a.title}${a.sex === 'M' ? ' ♂' : a.sex === 'F' ? ' ♀' : ''}`, open: `data-sv-pet="${a.id}"`,
                    lines: [codeOf(a) || a.taxon || ext.speciesLabel?.(a.species) || '', [a.obs_count ? plural(a.obs_count, 'observation') : '', a.sites ? plural(a.sites, 'site') : '', a.gps?.n ? `${fmtN(a.gps.n)} points GPS` : ''].filter(Boolean).join(' · ')],
                    badges: [a.deceased ? {text: '† Mort', kind: 'black'} : gone ? {text: l ? `Pas revu depuis ${ago(l.iso)}` : 'Jamais vu', kind: 'grey'} : {text: a.gps?.n ? 'Émet' : 'Suivi en cours', kind: 'blue'}, a.health && ['blesse', 'malade', 'soins'].includes(a.health.state) ? {text: HS()[a.health.state][0], kind: HS()[a.health.state][1]} : null, (a.last_obs?.reliability === 'partial' || a.last_obs?.reliability === 'doubt') ? {text: 'Lecture à vérifier', kind: 'yellow'} : null].filter(Boolean),
                    date: l ? `Vu ${whenShort(l.iso, l.time).replace(/^auj\./, 'aujourd’hui à').replace(/^hier /, 'hier à ')}` : ''}; };
                list.innerHTML = rows.length ? (view === 'cards' ? UI().cardsHtml(rows.map(item)) : UI().rowsHtml(rows.map(item))) : A().emptyState({icon: '🐾', text: 'Aucun animal suivi pour l’instant', hint: 'Ouvre la fiche d’un animal et ajoute-lui une marque, une observation ou un trajet GPS.'});
            } else if (tab === 'sites') {
                let rows = (D.sites || []).filter(x => !q || [x.name, x.kind, x.place?.name].join(' ').toLowerCase().includes(q));
                rows = UI().sortItems ? UI().sortItems(rows, sort, {name: x => x.name, date: x => x.updated_at}) : rows;
                bar.setCount?.(plural(rows.length, 'site'));
                const item = x => { const n = (D.observations || []).filter(o => o.site_id === x.id).length, c = (D.counts || []).filter(k => k.site_id === x.id).length; return {thumb: '<span class="ui-card-ico">🏞</span>', name: x.name, open: `data-sv-site="${x.id}"`, lines: [[x.kind, x.place?.name, x.area_ha ? `${x.area_ha.toLocaleString('fr-FR')} ha` : '', x.since ? `depuis ${x.since}` : ''].filter(Boolean).join(' · '), `${plural(n, 'observation')} · ${plural(c, 'comptage')}`], when: x.updated_at, whenLabel: 'Modifié'}; };
                list.innerHTML = rows.length ? (view === 'cards' ? UI().cardsHtml(rows.map(item)) : UI().rowsHtml(rows.map(item))) : A().emptyState({icon: '🏞', text: 'Aucun site de suivi pour l’instant', hint: 'Un parc, un dortoir, une colonie, une zone en mer : ses comptages datés et les animaux vus.', action: RO() ? null : {label: '＋ Nouveau site', attrs: 'data-sv-site-new'}});
            } else {
                let rows = (D.groups || []).filter(g => !q || [g.name, g.kind, g.species, g.territory].join(' ').toLowerCase().includes(q));
                rows = UI().sortItems ? UI().sortItems(rows, sort, {name: g => g.name, date: g => g.updated_at}) : rows;
                bar.setCount?.(plural(rows.length, 'groupe'));
                const item = g => { const cur = (D.members || []).filter(m => m.group_id === g.id && !m.end_date); return {thumb: '<span class="ui-card-ico">👥</span>', name: g.name, open: `data-sv-group="${g.id}"`, lines: [[g.kind, g.species, g.territory].filter(Boolean).join(' · '), plural(cur.length, 'membre actuel', 'membres actuels')], when: g.updated_at, whenLabel: 'Modifié'}; };
                list.innerHTML = rows.length ? (view === 'cards' ? UI().cardsHtml(rows.map(item)) : UI().rowsHtml(rows.map(item))) : A().emptyState({icon: '👥', text: 'Aucun groupe pour l’instant', hint: 'Une meute, une troupe, un clan, un pod : ses membres, leurs rôles et leur histoire.', action: RO() ? null : {label: '＋ Nouveau groupe', attrs: 'data-sv-group-new'}});
            }
        };
        const bar = UI().listBar({key: KEY, search: {placeholder: tab === 'obs' ? 'Chercher… (nom, code « 7K », bague EA…, lieu, observateur)' : tab === 'animals' ? 'Chercher… (nom, code « 7K », puce…)' : 'Chercher…'}, filters,
            view: {dflt: tab === 'obs' ? 'list' : 'cards', what: tab === 'obs' ? 'observations' : tab === 'animals' ? 'animaux' : tab === 'sites' ? 'sites' : 'groupes'},
            sort: {options: tab === 'animals' ? [['recent', 'Vus récemment'], ['old', 'Vus il y a longtemps'], ['az', 'A → Z'], ['za', 'Z → A']] : OBS_SORTS, value: saved.sort || 'recent'},
            onChange: s => draw(s)});
        ws.querySelector('[data-sv-bar]').replaceWith(bar);
        draw(bar.state);
        ws.querySelector('[data-sv-export]').addEventListener('click', e => exportMenu(e.currentTarget, () => { const s = bar.state, f = s.filters || {}, site = Number(typeof f.site === 'object' ? f.site?.id : f.site) || 0; return {animals: (D.animals || []).filter(a => a.tracked), obs: (D.observations || []).filter(o => (!site || o.site_id === site) && (!f.year || (o.iso || '').startsWith(f.year)))}; }, D));
        ws.querySelectorAll('[data-sv-ctab]').forEach(b => b.addEventListener('click', () => { st.svTab = b.dataset.svCtab; ext.lists.recensement(++st.workspaceToken); }));
        ws.querySelector('[data-sv-goto-suivi]')?.addEventListener('click', () => A().setModule('suivi'));
    };

    /* ═════════ S12 : la fiche « 🏞 Site de suivi » ═════════ */
    async function showSite(token, id) {
        const st = A().state, ws = A().$('#workspace');
        let r, D; try { [r, D] = await Promise.all([api('suivi', {op: 'site', id}), overview(true)]); } catch (e) { st.svSite = 0; toast(e.message, 'error'); return ext.lists.recensement(++st.workspaceToken); }
        if (token !== st.workspaceToken) return;
        const s = r.site, obs = (D.observations || []).filter(o => o.site_id === id), counts = r.counts;
        ws.innerHTML = `<section class="page sv-site">${UI().pageHeader({where: 'Listes · Recensement', detail: true, icon: '🏞', title: s.name, back: '<button type="button" class="link-button sv-back" data-sv-back>← Recensement</button>',
            help: esc([`🏞 Site de suivi${s.kind ? ' · ' + s.kind : ''}`, s.place?.name, s.area_ha ? `${s.area_ha.toLocaleString('fr-FR')} ha` : '', s.since ? `suivi depuis ${s.since}` : '', plural(obs.length, 'observation')].filter(Boolean).join(' · ')),
            primary: RO() ? '' : `<button type="button" class="button" data-sv-count-new="${id}">＋ Nouveau comptage</button>`, actions: RO() ? [] : [`<button type="button" class="button secondary" data-sv-site-edit="${id}">✎ Modifier</button>`],
            more: [`<button type="button" data-sv-site-obs="${id}">＋ Nouvelle observation ici</button>`, ...(RO() ? [] : [`<button type="button" class="danger" data-sv-site-del="${id}">🗑 Supprimer le site</button>`])]})}
            ${s.place_id ? `<div class="sv-place">${P().pickerView ? '' : ''}📍 <b>${esc(s.place?.name || '')}</b> ${s.place?.county ? `<small class="muted">${esc(s.place.county)}</small>` : ''}</div>` : ''}
            <div class="card-grid dashboard-grid"><section class="card span-6"><header class="card-head"><div class="card-title"><h3>🔢 Comptages <small>(${counts.length})</small></h3></div></header><div class="card-body">${countsCurve(counts)}${counts.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Quoi</th><th>Nombre</th><th>Par</th><th></th></tr></thead><tbody>${counts.map(c => `<tr data-ctx-menu><td><b>${esc(dateFr(c.iso || c.date))}</b>${c.time ? `<br><small class="muted">${esc(timeFr(c.time))}</small>` : ''}</td><td>${esc(COUNT_WHAT[c.what] || c.what_text || c.what)}${c.what_text && COUNT_WHAT[c.what] ? ` · ${esc(c.what_text)}` : ''}</td><td><b>${fmtN(c.number)}</b> ${esc(c.unit)}</td><td>${esc(c.observer || '—')}</td><td>${RO() ? '' : `<details class="ui-more"><summary class="icon-button small" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu"><button type="button" data-sv-count-edit="${c.id}">✎ Modifier</button><button type="button" class="danger" data-sv-count-del="${c.id}">🗑 Supprimer</button></div></details>`}</td></tr>`).join('')}</tbody></table></div>` : A().empty('Aucun comptage pour l’instant.', {icon: '🔢', action: RO() ? null : {label: '＋ Nouveau comptage', attrs: `data-sv-count-new="${id}"`}})}</div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>🐾 Animaux vus ici <small>(${r.seen.filter(x => x.pet_id).length})</small></h3></div></header><div class="card-body"><div class="sv-chips">${r.seen.map(x => { const a = animalById(D, x.pet_id); return a ? `<button type="button" class="sv-chip" data-sv-pet="${a.id}">${esc(speciesIcon(a.species))} ${esc(a.title)} <small>${x.n}×</small></button>` : `<span class="sv-chip is-free">? Non identifiés <small>${x.n}×</small></span>`; }).join('') || A().empty('Personne encore.', {icon: '🐾'})}</div>
                <div class="sv-map-host" data-site-map></div><div class="sv-legend"><span class="sv-leg"><i style="background:#1a8a3a"></i>contour du site</span><span class="sv-leg"><i style="background:#055dff"></i>observations</span></div></div></section></div></section>`;
        const pts = obs.filter(o => Number.isFinite(o.lat)).map(o => ({lat: o.lat, lon: o.lon, t: tOf(o), html: obsPopup(o, animalById(D, o.pet_id), D)}));
        mapView(ws.querySelector('[data-site-map]'), {series: [{name: 'observations', color: '#055dff', points: pts}], polygons: s.outline?.length > 2 ? [{coords: s.outline, color: '#1a8a3a', label: s.name}] : [], home: !pts.length && !s.outline?.length && Number.isFinite(s.lat) ? null : null, height: 260});
        ws.querySelector('[data-sv-back]')?.addEventListener('click', () => { st.svSite = 0; ext.lists.recensement(++st.workspaceToken); });
    }
    function siteDialog(site = null) {
        let outline = clone(site?.outline || []);
        const dlg = ext.openDialog({eyebrow: '🏞 SITE DE SUIVI', title: site ? `Modifier « ${site.name} »` : 'Nouveau site de suivi', wide: true,
            body: `<div class="sv-obs-2"><div class="form-grid"><label>Nom<input name="name" required maxlength="160" value="${esc(site?.name || '')}" placeholder="Parc des Buttes-Chaumont, dortoir de l’île…"></label>
                <label>Sorte<input name="kind" maxlength="60" value="${esc(site?.kind || '')}" placeholder="Parc, dortoir, colonie, quartier, zone en mer…"></label>
                <div><span class="pk-lab">Lieu</span>${P().pickerField({name: 'place_id', kind: 'place', value: site?.place_id || null})}</div>
                <label>Surface<input type="number" name="area_ha" min="0" step="0.1" data-unit="ha" value="${esc(site?.area_ha ?? '')}"></label>
                <label>Suivi depuis<input name="since" data-ui-date value="${esc(site?.since || '')}" placeholder="mars 2024"></label>
                <label>Note<textarea name="note" rows="2">${esc(site?.note || '')}</textarea></label></div>
                <div><span class="pk-lab">Contour sur la carte</span><small class="muted">Un clic sur la carte ajoute un coin du contour.</small><div class="sv-map-host" data-outline></div><button type="button" class="button small secondary" data-outline-clear>✕ Effacer le contour</button> <small data-outline-n></small></div></div>`,
            onSubmit: async form => {
                const v = new FormData(form); if (!String(v.get('name') || '').trim()) return UI().fail(form.elements.name, 'Donne un nom au site.');
                const r = await write('save_site', {id: site?.id || 0, name: v.get('name'), kind: v.get('kind'), place_id: Number(v.get('place_id')) || 0, area_ha: v.get('area_ha'), since: v.get('since'), note: v.get('note'), outline});
                toast(site ? 'Site enregistré.' : 'Site créé.', 'success');
                if (!site) { const st = A().state; st.svSite = r.id; st.listType = 'recensement'; st.svTab = 'sites'; if (st.module === 'listes') ext.lists.recensement(++st.workspaceToken); else A().setModule('listes'); } else refreshView();
            }});
        const host = dlg.querySelector('[data-outline]');
        const center = site && Number.isFinite(site.lat) ? [{lat: site.lat, lon: site.lon}] : [];
        let view;
        const redraw = () => { const n = dlg.querySelector('[data-outline-n]'); if (n) n.textContent = outline.length ? plural(outline.length, 'coin') : ''; view?.setSeries([{name: 'coins', color: '#1a8a3a', points: outline.map(c => ({lat: c[0], lon: c[1]}))}], outline.length > 2 ? [{coords: outline, color: '#1a8a3a', label: 'contour'}] : []); };
        view = mapView(host, {series: [{name: 'coins', color: '#1a8a3a', points: [...outline.map(c => ({lat: c[0], lon: c[1]})), ...center]}], polygons: outline.length > 2 ? [{coords: outline, color: '#1a8a3a'}] : [], height: 260, wheel: true, onClick: ({lat, lon}) => { outline.push([+lat.toFixed(6), +lon.toFixed(6)]); redraw(); }});
        dlg.querySelector('[data-outline-clear]').addEventListener('click', () => { outline = []; redraw(); });
        dlg.addEventListener('picker-change', e => { if (e.detail.name === 'place_id' && e.detail.item && Number.isFinite(Number(e.detail.item.lat)) && !outline.length) { view.setSeries([{name: 'lieu', color: '#1a8a3a', points: [{lat: Number(e.detail.item.lat), lon: Number(e.detail.item.lon)}]}]); view.fit(); } });
        redraw();
    }
    function countDialog(siteId, c = null) {
        ext.openDialog({eyebrow: '🔢 COMPTAGE', title: c ? 'Modifier le comptage' : 'Nouveau comptage',
            body: `<div class="form-grid"><label>Date<input name="date" data-ui-date required value="${esc(c?.date || '')}" placeholder="2 janvier 2026"></label><label>Heure<input name="time" data-ui-time value="${esc(c?.time || '')}"></label>
                <label>Quoi<select name="what">${Object.entries(COUNT_WHAT).map(([k, l]) => `<option value="${k}" ${c?.what === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Précision<input name="what_text" maxlength="200" value="${esc(c?.what_text || '')}" placeholder="île, colonie nord…"></label>
                <label>Nombre<input type="number" name="number" min="0" required value="${esc(c?.number ?? '')}" data-unit="${esc(c?.unit || 'animaux')}"></label><label>Ce qu’on compte<input name="unit" maxlength="40" value="${esc(c?.unit || '')}" placeholder="corneilles, nids, poussins…"></label>
                <div><span class="pk-lab">Par</span>${P().pickerField({name: 'observer', kind: 'person', allowFree: true, value: c?.observer_id || (c?.observer ? 'txt:' + c.observer : null)})}</div><label>Note<textarea name="note" rows="2">${esc(c?.note || '')}</textarea></label></div>`,
            onSubmit: async form => { const v = new FormData(form); if (!String(v.get('date') || '').trim()) return UI().fail(form.elements.date, 'Donne la date du comptage.'); await write('save_count', {id: c?.id || 0, site_id: siteId, date: v.get('date'), time: v.get('time'), what: v.get('what'), what_text: v.get('what_text'), number: v.get('number'), unit: v.get('unit'), observer: String(v.get('observer') || ''), note: v.get('note')}); toast(c ? 'Comptage enregistré.' : 'Comptage ajouté.', 'success'); refreshView(); }});
    }

    /* ═════════ La fiche « 👥 Groupe » : membres actuels et passés, rôles, frise ═════════ */
    async function showGroup(token, id) {
        const st = A().state, ws = A().$('#workspace');
        let r, D; try { [r, D] = await Promise.all([api('suivi', {op: 'group', id}), overview(true)]); } catch (e) { st.svGroup = 0; toast(e.message, 'error'); return ext.lists.recensement(++st.workspaceToken); }
        if (token !== st.workspaceToken) return;
        const g = r.group, mem = r.members, cur = mem.filter(m => !m.end_date), past = mem.filter(m => m.end_date && m.end_reason !== 'role');
        const END = Object.fromEntries(C().END_REASONS);
        ws.innerHTML = `<section class="page sv-group">${UI().pageHeader({where: 'Listes · Recensement', detail: true, icon: '👥', title: g.name, back: '<button type="button" class="link-button sv-back" data-sv-back>← Recensement</button>',
            help: esc([`${(g.kind || 'groupe').replace(/^./, c => c.toUpperCase())}`, g.species, g.territory ? `territoire : ${g.territory}` : '', plural(cur.length, 'membre actuel', 'membres actuels')].filter(Boolean).join(' · ')),
            primary: RO() ? '' : `<button type="button" class="button" data-sv-member-new="${id}">＋ Ajouter un membre</button>`, actions: RO() ? [] : [`<button type="button" class="button secondary" data-sv-group-edit="${id}">✎ Modifier</button>`],
            more: RO() ? [] : [`<button type="button" class="danger" data-sv-group-del="${id}">🗑 Supprimer le groupe</button>`]})}
            <div class="card-grid dashboard-grid"><section class="card span-6"><header class="card-head"><div class="card-title"><h3>Membres actuels <small>(${cur.length})</small></h3></div></header><div class="card-body"><div class="sv-chips">${cur.map(m => { const a = animalById(D, m.pet_id); return a ? `<span class="sv-chip is-member"><button type="button" class="link-button" data-sv-pet="${a.id}" data-sv-tab="group">${esc(speciesIcon(a.species))} ${esc(a.title)}</button>${m.role ? ` <b>${esc(m.role)}</b>` : ''} <small class="muted">depuis ${esc(m.start_date || '?')}</small>${RO() ? '' : `<button type="button" class="icon-button small" data-sv-member-edit="${m.id}" aria-label="Modifier">✎</button>`}</span>` : ''; }).join('') || A().empty('Aucun membre pour l’instant.', {icon: '👥'})}</div></div></section>
            <section class="card span-6"><header class="card-head"><div class="card-title"><h3>Membres passés <small>(${past.length})</small></h3></div></header><div class="card-body">${past.map(m => { const a = animalById(D, m.pet_id); return a ? `<div class="sv-row"><span class="sv-what"><button type="button" class="link-button" data-sv-pet="${a.id}" data-sv-tab="group">${esc(a.title)}</button>${m.role ? ` · ${esc(m.role)}` : ''}</span><small>${esc(m.start_date || '?')} → ${esc(m.end_date === '?' ? '?' : m.end_date)} · ${esc(END[m.end_reason] || 'parti')}</small>${m.end_reason === 'exclu' ? badge('Exclu', 'red') : m.end_reason === 'mort' ? badge('† Mort', 'black') : ''}</div>` : ''; }).join('') || A().empty('Personne n’est parti.', {icon: '👥'})}</div></section>
            <section class="card span-12"><header class="card-head"><div class="card-title"><h3>Frise du groupe</h3></div></header><div class="card-body">${ext.suivi.socialFrise ? ext.suivi.socialFrise(mem, D, {byAnimal: true}) : ''}</div></section></div></section>`;
        ws.querySelector('[data-sv-back]')?.addEventListener('click', () => { st.svGroup = 0; ext.lists.recensement(++st.workspaceToken); });
    }
    function groupDialog(g = null, {after = null} = {}) {
        ext.openDialog({eyebrow: '👥 GROUPE', title: g?.id ? `Modifier « ${g.name} »` : 'Nouveau groupe',
            body: `<div class="form-grid"><label>Nom<input name="name" required maxlength="160" value="${esc(g?.name || '')}" placeholder="Meute du Vercors, troupe de Kasekela, pod J…"></label>
                <label>Sorte<select name="kind">${C().GROUP_KINDS.map(k => `<option ${g?.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
                <label>Espèce<input name="species" maxlength="120" value="${esc(g?.species || '')}" placeholder="Loup gris, chimpanzé, orque…"></label><label>Territoire<input name="territory" maxlength="300" value="${esc(g?.territory || '')}"></label>
                <div><span class="pk-lab">Site</span>${P().pickerField({name: 'site_id', kind: 'tsite', value: g?.site_id || null})}</div><div><span class="pk-lab">Lieu</span>${P().pickerField({name: 'place_id', kind: 'place', value: g?.place_id || null})}</div>
                <label class="sv-span2">Note<textarea name="note" rows="2">${esc(g?.note || '')}</textarea></label></div>`,
            onSubmit: async form => { const v = new FormData(form); if (!String(v.get('name') || '').trim()) return UI().fail(form.elements.name, 'Donne un nom au groupe.'); const r = await write('save_group', {id: g?.id || 0, name: v.get('name'), kind: v.get('kind'), species: v.get('species'), territory: v.get('territory'), site_id: Number(v.get('site_id')) || 0, place_id: Number(v.get('place_id')) || 0, note: v.get('note')}); toast(g?.id ? 'Groupe enregistré.' : 'Groupe créé.', 'success'); if (after) after(r); else refreshView(); }});
    }

    /* ═════════ S1 : la phrase « l'onglet est caché » (liste 🐾 Animaux, fiche d'un animal), une seule fois ═════════ */
    const HINT_KEY = 'genealogie-suivi-hint-closed';
    const tabHidden = () => { try { return (A().menuHiddenKeys ? A().menuHiddenKeys() : []).includes('suivi'); } catch (_) { return false; } };
    function showTab() {
        A().undoLocalChange('✓ Onglet « 🐾 Suivi des animaux » affiché', ['genealogie-menu-hidden', 'genealogie-menu-suivi', 'genealogie-menu-animaux', 'genealogie-menu-fiches', 'genealogie-menu-adn'], () => {
            const hidden = A().menuHiddenKeys().filter(k => k !== 'suivi');
            localStorage.setItem('genealogie-menu-hidden', JSON.stringify(hidden)); ['suivi', 'animaux', 'fiches', 'adn'].forEach(k => localStorage.setItem(`genealogie-menu-${k}`, '1'));
        }, () => A().applyMenuOrder?.());
        A().applyMenuOrder?.();
    }
    ext.suivi.hintInto = host => {
        if (!host || !tabHidden() || host.querySelector('.sv-hint')) return;
        try { if (localStorage.getItem(HINT_KEY)) return; } catch (_) { return; }
        const box = document.createElement('div'); box.className = 'sv-hint ui-notice ui-notice-info'; box.setAttribute('role', 'status');
        box.innerHTML = `<span class="ui-notice-ico" aria-hidden="true">ℹ️</span><span><b>Tu suis des animaux sauvages ou un chat avec un collier GPS ?</b> L’onglet « 🐾 Suivi des animaux » est caché. Pour l’afficher : Réglages → Apparence → Onglets du haut. <button type="button" class="link-button" data-sv-show-tab>↗ Afficher l’onglet</button></span><button type="button" class="icon-button small" data-sv-hint-x aria-label="Fermer">×</button>`;
        const head = host.querySelector('.page-header'); head ? head.after(box) : host.prepend(box);
        box.querySelector('[data-sv-hint-x]').addEventListener('click', () => { try { localStorage.setItem(HINT_KEY, '1'); } catch (_) {} box.remove(); });
        box.querySelector('[data-sv-show-tab]').addEventListener('click', () => { showTab(); try { localStorage.setItem(HINT_KEY, '1'); } catch (_) {} box.remove(); });
    };

    /* ═════════ Ouvrir une fiche (animal, site, groupe) et les clics communs ═════════ */
    function openPet(id, tab = '') { const st = A().state; if (tab) st.svPetTab = tab; st.svSite = 0; st.svGroup = 0; if (ext.openPet) ext.openPet(Number(id)); }
    function openSite(id) { const st = A().state; st.svSite = Number(id); st.svGroup = 0; st.listType = 'recensement'; st.hPet = 0; if (st.module === 'listes') ext.lists.recensement(++st.workspaceToken); else A().setModule('listes'); }
    function openGroup(id) { const st = A().state; st.svGroup = Number(id); st.svSite = 0; st.listType = 'recensement'; st.hPet = 0; if (st.module === 'listes') ext.lists.recensement(++st.workspaceToken); else A().setModule('listes'); }
    function openCensus(tab = '') { const st = A().state; st.svSite = 0; st.svGroup = 0; if (tab) st.svTab = tab; st.listType = 'recensement'; st.hPet = 0; if (st.module === 'listes') ext.lists.recensement(++st.workspaceToken); else A().setModule('listes'); }
    ext.suivi.openItem = (kind, id) => (kind === 'pet' ? openPet(id, 'marks') : kind === 'tsite' ? openSite(id) : openGroup(id));
    async function obsById(id) { const D = await overview(); return (D.observations || []).find(o => o.id === Number(id)) || null; }
    document.addEventListener('click', async e => {
        const t = e.target.closest?.('[data-sv-pet], [data-sv-site], [data-sv-group], [data-sv-obs], [data-sv-obs-edit], [data-sv-obs-dup], [data-sv-obs-del], [data-sv-new-obs], [data-sv-import], [data-sv-census], [data-sv-stats-big], [data-sv-page-new], [data-sv-page-more], [data-sv-page-filter], [data-sv-reorder], [data-sv-site-new], [data-sv-site-edit], [data-sv-site-del], [data-sv-site-obs], [data-sv-count-new], [data-sv-count-edit], [data-sv-count-del], [data-sv-group-new], [data-sv-group-edit], [data-sv-group-del], [data-sv-big], [data-sv-more], [data-sv-health-new], [data-sv-media]');
        if (!t || t.closest('.pk')) return;
        const d = t.dataset;
        if (d.svObsEdit !== undefined) { e.preventDefault(); e.stopPropagation(); t.closest('details')?.removeAttribute('open'); const o = await obsById(d.svObsEdit); if (o) openObservation({obs: o}); return; }
        if (d.svObsDup !== undefined) { e.preventDefault(); e.stopPropagation(); t.closest('details')?.removeAttribute('open'); const o = await obsById(d.svObsDup); if (o) { const r = await write('save_obs', {...o, id: 0, place_id: o.place_id || 0, site_id: o.site_id || 0, observer: o.observer_id || (o.observer ? 'txt:' + o.observer : ''), reading_detail: o.reading_detail}); A().undoToast?.('Observation dupliquée.', {undo: async () => { await write('delete', {type: 'animal_obs', id: r.id}); refreshView(); }}); refreshView(); } return; }
        if (d.svObsDel !== undefined) { e.preventDefault(); e.stopPropagation(); t.closest('details')?.removeAttribute('open'); await A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'animal_obs', id: Number(d.svObsDel)}, type: 'animal_obs', id: Number(d.svObsDel), message: 'Observation supprimée.', after: () => refreshView()}); return; }
        if (d.svMedia !== undefined) { e.stopPropagation(); let it = null; try { const r = await api('picker_search', {kind: 'media', ids: d.svMedia}); it = r.groups?.[0]?.items?.[0] || null; } catch (_) {} if (it && A().openLightbox) A().openLightbox([{...it, filename: it.filename, media_type: it.media_type || 'image'}], 0, true); return; }
        if (d.svObs !== undefined) { if (e.target.closest('button:not([data-sv-obs]), a, details, .sv-pet-link')) return; const o = await obsById(d.svObs); if (o) RO() ? openPet(o.pet_id || 0, 'obs') : openObservation({obs: o}); return; }
        if (d.svPet !== undefined && !t.matches('[data-sv-new-obs]')) { if (t.tagName === 'TR' && e.target.closest('button:not([data-sv-pet]), a')) return; e.preventDefault(); document.querySelectorAll('dialog[open]').forEach(x => { if (x.contains(t)) x.close(); }); openPet(Number(d.svPet), d.svTab || ''); return; }
        if (d.svNewObs !== undefined) { e.preventDefault(); openObservation({petId: Number(d.svNewObs) || 0, siteId: Number(A().state.svSite) || 0}); return; }
        if (d.svImport !== undefined) { e.preventDefault(); importGps({petId: Number(d.svImport) || 0}); return; }
        if (d.svCensus !== undefined) return openCensus();
        if (d.svStatsBig !== undefined) return openStats();
        if (d.svPageNew !== undefined) return pageDialog();
        if (d.svPageMore !== undefined) return pageMenu(t, d.svPageMore);
        if (d.svPageFilter !== undefined) { const p = pagesWork().pages.find(x => x.id === d.svPageFilter); if (p) pageDialog(p); return; }
        if (d.svReorder !== undefined) return document.getElementById('dashboard-reorder')?.click();
        if (d.svSiteNew !== undefined) return siteDialog();
        if (d.svSiteEdit !== undefined) { const r = await api('suivi', {op: 'site', id: d.svSiteEdit}); return siteDialog(r.site); }
        if (d.svSiteDel !== undefined) { const id = Number(d.svSiteDel); await A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'track_site', id}, type: 'track_site', id, message: 'Site de suivi supprimé (ses comptages aussi).', after: what => { if (what === 'delete') { A().state.svSite = 0; } else A().state.svSite = id; refreshView(); }}); return; }
        if (d.svSiteObs !== undefined) return openObservation({siteId: Number(d.svSiteObs)});
        if (d.svCountNew !== undefined) return countDialog(Number(d.svCountNew));
        if (d.svCountEdit !== undefined) { t.closest('details')?.removeAttribute('open'); const D = await overview(true); const c = (D.counts || []).find(x => x.id === Number(d.svCountEdit)); if (c) countDialog(c.site_id, c); return; }
        if (d.svCountDel !== undefined) { t.closest('details')?.removeAttribute('open'); const id = Number(d.svCountDel); await A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'track_count', id}, type: 'track_count', id, message: 'Comptage supprimé.', after: () => refreshView()}); return; }
        if (d.svGroupNew !== undefined) return groupDialog(null, {after: r => openGroup(r.id)});
        if (d.svGroupEdit !== undefined) { const r = await api('suivi', {op: 'group', id: d.svGroupEdit}); return groupDialog(r.group); }
        if (d.svGroupDel !== undefined) { const id = Number(d.svGroupDel); await A().deleteWithUndo({action: 'suivi_write', body: {op: 'delete', type: 'animal_group', id}, type: 'animal_group', id, message: 'Groupe supprimé (son histoire aussi).', after: what => { A().state.svGroup = what === 'delete' ? 0 : id; refreshView(); }}); return; }
        if (d.svSite !== undefined) { if (t.closest('.pk')) return; e.preventDefault(); document.querySelectorAll('dialog[open]').forEach(x => { if (x.contains(t)) x.close(); }); return openSite(Number(d.svSite)); }
        if (d.svGroup !== undefined) { e.preventDefault(); return openGroup(Number(d.svGroup)); }
        if (d.svBig !== undefined) { const w = (A().dashboardBlockSettings?.().widgets || []).find(x => x.id === d.svBig); if (w) openBig(w); return; }
        if (d.svMore !== undefined) { const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === d.svMore); if (w) { w.limit = (Number(w.limit) || 6) + 20; A().saveDashboardBlockSettings(s); A().renderDashboard(undefined, {reuse: true}); } return; }
        if (d.svHealthNew !== undefined) return ext.suivi.openHealth?.({petId: Number(d.svPet) || 0});
    });
    document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const r = e.target.closest?.('.sv-row[role="button"], .sv-map-pt'); if (r && !e.target.closest('input, textarea, button')) { e.preventDefault(); r.dispatchEvent(new MouseEvent('click', {bubbles: true})); } });

    Object.assign(ext.suivi, {U: {esc, api, toast, plural, fmtN, badge, RO, pad, clone, dateFr, whenShort, timeFr, ago, daysSince, tIso, tTime, kmText, weightText, todayIso, MONTHS, MONTHS_L, DAYS, COLORS,
        overview, invalidate, write, refreshView, animalById, speciesIcon, profileOf, lastSeen, relBadge, readingText, healthBadge, HS, ringsMini, animalThumb, animalLink, codeOf, placeOfObs, REL,
        mapView, replayBar, mapSeries, tOf, obsPopup, causesBars, groupDialog, siteDialog}, openObservation, importGps, openStats, openBigMap, openSite, openGroup, openCensus, openPet, refreshView, overview, invalidate, scope, pinToDashboard, proposedWidgets, showTab});
})();
