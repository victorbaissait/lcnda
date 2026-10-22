/**
 * 🗺 Cadastre — Listes → Lieux et maisons → « 🗺 Cadastre » (serveur : lib/cadastre.php, styles : assets/css/cadastre.css).
 * Construit sur ce qui existait : la Carte (crochets ext.mapSetup / ext.mapDraw, fonds de carte de l'app), les Cartes
 * anciennes (calage d'un plan napoléonien, heritage.js), l'outil Maison, les fiches de village, le plan des adresses, le menu
 * de choix unique (personnes avec rôles, lieux, maisons, événements, sources, cartes anciennes) et la fenêtre des images.
 *  - la liste « Parcelles » (H10, K5, K9) et la fiche d'une parcelle (page, ou fenêtre par-dessus un autre outil) ;
 *  - « ＋ Ajouter une parcelle » : commune + section + numéro, ou un clic sur la carte → contour, surface, section et numéro
 *    lus en ligne par le serveur (API Carto IGN, WFS de la Géoplateforme en secours) ;
 *  - le calque « ▦ Parcelles du cadastre » sur la Carte (tuiles IGN Parcellaire Express + mes parcelles dessinées, 📍 Parcelle ici),
 *    dans le plan des adresses (ext.cadastre.tilesHtml) et dans la liste des fonds (« ign_parcels », app.js) ;
 *  - les blocs « 🗺 Parcelles » d'une maison (ext.housePaneExtras), d'un village ([data-cad-host]) et « 🗺 Propriétaire de… »
 *    sur la fiche d'une personne (ext.personBlocks.parcels).
 * API : ext.cadastre = {open(id, {dialog}), edit(row, prefill), showOnMap(parcel), tilesHtml(left, top, w, h, z), miniMap(el, o), reload()}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    ext.personBlocks = ext.personBlocks || {};
    for (const key of ['mapSetup', 'mapDraw', 'housePaneExtras']) ext[key] = ext[key] || [];
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const toast = (m, k, o) => A().toast(m, k, o);
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${w}`);
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const KEY = 'listes:cadastre';
    const ROLES = ['propriétaire', 'copropriétaire', 'usufruitier', 'nu-propriétaire', 'héritier', 'acheteur', 'vendeur', 'fermier', 'métayer', 'locataire', 'occupant', 'exploitant', 'voisin', 'notaire', 'géomètre'];
    const ZONES = {primary: ['Propriétaires', 'à qui la parcelle appartenait', '＋ Ajouter un propriétaire…'], secondary: ['Autres personnes', 'occupants, fermiers, voisins, notaire…', '＋ Ajouter une autre personne…']};
    const ATTR = 'Parcelles © IGN / DGFiP (Parcellaire Express, Licence Ouverte 2.0)';
    const CAD_MAXZ = 19, CAD_MINZ = 13;
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes' && S().listType === 'cadastre';
    const fmtN = n => Number(n || 0).toLocaleString('fr-FR');
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

    /** 1234 → « 1 234 m² (12 a 34 ca) » — les ares et centiares du cadastre */
    function surfaceText(m2) {
        if (m2 === null || m2 === undefined || m2 === '') return '';
        const n = Math.round(Number(m2)); if (!Number.isFinite(n)) return '';
        const ha = Math.floor(n / 10000), a = Math.floor((n % 10000) / 100), ca = n % 100;
        const parts = [ha ? `${ha} ha` : '', a ? `${a} a` : '', ca || (!ha && !a) ? `${ca} ca` : ''].filter(Boolean).join(' ');
        return `${fmtN(n)} m²${n >= 100 ? ` (${parts})` : ''}`;
    }
    const secText = s => String(s || '').replace(/^0+(?=.)/, '');
    const numText = n => String(n || '').replace(/^0+/, '');
    const titleOf = p => [p.section ? `Section ${secText(p.section)}` : '', p.numero ? `n° ${numText(p.numero)}` : ''].filter(Boolean).join(' ') || p.lieu_dit || 'Parcelle sans numéro';

    /* ═════════ Géométrie : Web Mercator (mêmes formules que la Carte), contours en SVG ═════════ */
    const X = (lon, z) => A().lngToX(lon, z), Y = (lat, z) => A().latToY(lat, z);
    const rings = g => (g?.coordinates || []).flatMap(poly => poly || []);
    function pathOf(g, z, left, top) {
        return (g?.coordinates || []).map(poly => (poly || []).map(ring => ring.map(([lo, la], i) => `${i ? 'L' : 'M'}${(X(lo, z) - left).toFixed(1)} ${(Y(la, z) - top).toFixed(1)}`).join('') + 'Z').join('')).join('');
    }
    function bboxOf(g) {
        let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
        rings(g).forEach(r => r.forEach(([lo, la]) => { a = Math.min(a, lo); b = Math.min(b, la); c = Math.max(c, lo); d = Math.max(d, la); }));
        return Number.isFinite(a) ? [a, b, c, d] : null;
    }
    /** une petite image de la forme de la parcelle (vignette de la liste) */
    function shapeSvg(g, size = 48) {
        const bb = bboxOf(g); if (!bb) return '<span class="ui-card-ico" aria-hidden="true">▦</span>';
        const z = 22, x0 = X(bb[0], z), y0 = Y(bb[3], z), w = Math.max(1, X(bb[2], z) - x0), h = Math.max(1, Y(bb[1], z) - y0), k = (size - 8) / Math.max(w, h);
        const d = (g.coordinates || []).map(poly => poly.map(ring => ring.map(([lo, la], i) => `${i ? 'L' : 'M'}${((X(lo, z) - x0) * k + (size - w * k) / 2).toFixed(1)} ${((Y(la, z) - y0) * k + (size - h * k) / 2).toFixed(1)}`).join('') + 'Z').join('')).join('');
        return `<svg class="cad-shape" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><path d="${d}"/></svg>`;
    }
    /** les tuiles transparentes des parcelles (IGN, Géoplateforme, sans clé) au-dessus d'un fond ; au-delà du zoom 19, les tuiles du 19 agrandies */
    function cadTileUrl(z, x, y) {
        return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${x}&TILEROW=${y}&FORMAT=image/png`;
    }
    function tilesHtml(left, top, w, h, z) {
        if (z < CAD_MINZ || (typeof navigator !== 'undefined' && navigator.onLine === false)) return '';
        const zt = Math.min(z, CAD_MAXZ), size = 256 * 2 ** (z - zt), world = 2 ** zt;
        let out = '';
        for (let tx = Math.floor(left / size); tx <= Math.floor((left + w) / size); tx++) for (let ty = Math.floor(top / size); ty <= Math.floor((top + h) / size); ty++) {
            if (ty < 0 || ty >= world) continue;
            out += `<img class="cad-tile" draggable="false" referrerpolicy="no-referrer" alt="" src="${cadTileUrl(zt, ((tx % world) + world) % world, ty)}" style="left:${Math.round(tx * size - left)}px;top:${Math.round(ty * size - top)}px;width:${size}px;height:${size}px">`;
        }
        return out;
    }
    const baseBg = () => { const v = A().mapBackgroundValue?.(A().readDesignSettings?.().mapBackground) || 'bw'; return v === 'grid' ? 'bw' : v; };

    /**
     * Une petite carte (fiche, fenêtre « Ajouter ») : le fond de l'app, les parcelles du cadastre par-dessus (interrupteur),
     * les contours donnés (parcels : [{geometry, sel, label}]) ; glisser, molette, ＋ −, clic → onClick(lat, lon).
     */
    function miniMap(el, {lat = 46.6, lon = 2.4, zoom = 6, parcels = [], onClick = null, cad = true} = {}) {
        const st = {lat, lon, zoom, parcels, cad};
        el.classList.add('cad-map');
        el.innerHTML = `<div class="cad-map-base"></div><div class="cad-map-cad"></div><svg class="cad-map-svg" aria-hidden="true"></svg>
            <div class="cad-map-zoom"><button type="button" data-cz="1" aria-label="Zoomer">＋</button><button type="button" data-cz="-1" aria-label="Dézoomer">−</button></div>
            <label class="ui-toggle cad-map-tog" title="Les parcelles d’aujourd’hui (IGN), par-dessus le fond"><input type="checkbox" data-cad-tog ${cad ? 'checked' : ''}><i></i>Parcelles</label>
            <small class="cad-map-attr">${esc(ATTR)}</small><div class="cad-map-hint" hidden></div>`;
        const base = el.querySelector('.cad-map-base'), lay = el.querySelector('.cad-map-cad'), svg = el.querySelector('svg'), hint = el.querySelector('.cad-map-hint');
        const view = () => { const w = el.clientWidth, h = el.clientHeight; return {w, h, left: X(st.lon, st.zoom) - w / 2, top: Y(st.lat, st.zoom) - h / 2}; };
        function draw() {
            if (!el.isConnected) return;
            const {w, h, left, top} = view(); if (!w || !h) { requestAnimationFrame(draw); return; }
            const z = st.zoom, world = 2 ** z, bg = baseBg();
            let t = '';
            for (let x = Math.floor(left / 256); x <= Math.floor((left + w) / 256); x++) for (let y = Math.floor(top / 256); y <= Math.floor((top + h) / 256); y++) {
                if (y < 0 || y >= world) continue;
                t += `<img draggable="false" referrerpolicy="no-referrer" alt="" src="${A().mapTileUrl(bg, z, ((x % world) + world) % world, y)}" style="left:${Math.round(x * 256 - left)}px;top:${Math.round(y * 256 - top)}px">`;
            }
            base.innerHTML = t;
            lay.innerHTML = st.cad ? tilesHtml(left, top, w, h, z) : '';
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svg.innerHTML = st.parcels.filter(p => p.geometry).map(p => `<path class="cad-poly${p.sel ? ' is-sel' : ''}" d="${pathOf(p.geometry, z, left, top)}"><title>${esc(p.label || '')}</title></path>`).join('')
                + (st.mark ? `<circle class="cad-mark" cx="${(X(st.mark[1], z) - left).toFixed(1)}" cy="${(Y(st.mark[0], z) - top).toFixed(1)}" r="6"/>` : '');
            hint.hidden = !(st.cad && z < CAD_MINZ); hint.textContent = 'Zoome pour voir les parcelles';
        }
        let drag = null;
        el.addEventListener('pointerdown', e => { if (e.target.closest('button,label,input')) return; drag = {x: e.clientX, y: e.clientY, moved: false, cx: X(st.lon, st.zoom), cy: Y(st.lat, st.zoom)}; el.setPointerCapture?.(e.pointerId); });
        el.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (!drag.moved) return; st.lon = A().xToLng(drag.cx - dx, st.zoom); st.lat = A().yToLat(drag.cy - dy, st.zoom); draw(); });
        el.addEventListener('pointerup', e => {
            if (drag && !drag.moved && onClick) { const r = el.getBoundingClientRect(), {left, top} = view(); const la = A().yToLat(top + e.clientY - r.top, st.zoom), lo = A().xToLng(left + e.clientX - r.left, st.zoom); st.mark = [la, lo]; draw(); onClick(la, lo); }
            drag = null;
        });
        const zoomAt = (dz, px, py) => { const {w, h, left, top} = view(); const cx = px ?? w / 2, cy = py ?? h / 2; const la = A().yToLat(top + cy, st.zoom), lo = A().xToLng(left + cx, st.zoom); st.zoom = Math.max(3, Math.min(21, st.zoom + dz)); st.lon = A().xToLng(X(lo, st.zoom) - cx + w / 2, st.zoom); st.lat = A().yToLat(Y(la, st.zoom) - cy + h / 2, st.zoom); draw(); };
        el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
        el.querySelectorAll('[data-cz]').forEach(b => b.addEventListener('click', () => zoomAt(Number(b.dataset.cz))));
        el.querySelector('[data-cad-tog]').addEventListener('change', e => { st.cad = e.target.checked; draw(); });
        const api = {state: st, draw,
            set(parcels) { st.parcels = parcels || []; draw(); },
            center(la, lo, z) { st.lat = la; st.lon = lo; if (z) st.zoom = z; draw(); },
            fit(g) { const bb = bboxOf(g); if (!bb) return; const w = el.clientWidth || 400, h = el.clientHeight || 280; let z = 19; for (; z > 5; z--) { if (X(bb[2], z) - X(bb[0], z) <= w * .6 && Y(bb[1], z) - Y(bb[3], z) <= h * .6) break; } st.zoom = z; st.lat = (bb[1] + bb[3]) / 2; st.lon = (bb[0] + bb[2]) / 2; draw(); }};
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(el);
        draw();
        return api;
    }

    /* ═════════ Les données ═════════ */
    let cache = null;
    async function loadAll(force = false) { if (!cache || force) cache = (await get('cadastre_parcels', {with_geom: 1})).items || []; return cache; }
    const changed = () => { cache = null; document.dispatchEvent(new CustomEvent('lcnda:cadastre-changed')); };

    /* ═════════ ＋ Ajouter une parcelle / ✎ Modifier ═════════ */
    /** La fenêtre de la parcelle. row = la fiche (cadastre_parcel) ou null ; prefill = {place: {id, title}, insee, section, numero, lat, lon, house, person, parcel (trouvée en ligne)} */
    async function edit(row = null, prefill = {}) {
        const d = row || null, p = d?.parcel || {};
        const L = d?.links || [];
        const of = k => L.filter(l => l.kind === k);
        const people = {main: null, people: of('person').map(l => (l.id ? {id: l.id, title: l.title, role: l.role, primary: !!l.primary} : {txt: l.txt || l.title, role: l.role, primary: !!l.primary}))};
        if (prefill.person && !people.people.some(x => Number(x.id) === Number(prefill.person.id))) people.people.push({id: Number(prefill.person.id), title: prefill.person.title || '', role: 'propriétaire', primary: true});
        const dates = new Map(of('person').map(l => [l.id ? String(l.id) : 'txt:' + (l.txt || l.title), {from: l.from || '', to: l.to || ''}]));
        const names = new Map(people.people.filter(x => x.id).map(x => [String(x.id), x.title || '']));
        const multi = (k, extra = []) => [...of(k).filter(l => !l.gone).map(l => ({id: l.id, title: l.title})), ...extra];
        const place = p.commune_place_id ? {id: p.commune_place_id, title: p.commune || `#${p.commune_place_id}`, name: p.commune || ''} : prefill.place || null;
        const houses = multi('house', prefill.house ? [{id: Number(prefill.house.id), title: prefill.house.title || ''}] : []);
        const placesV = multi('place', prefill.linkPlace ? [{id: Number(prefill.linkPlace.id), title: prefill.linkPlace.title || ''}] : []);
        const media = of('media').filter(l => !l.gone).map(l => l.id);
        let found = prefill.parcel || null; // la parcelle lue en ligne (contour, surface…)
        const geomStart = p.geometry || found?.geometry || null;
        const isNew = !d;
        return new Promise(resolve => {
            let saved = null, mm = null, insee = p.insee || prefill.insee || '';
            const dlg = ext.openDialog({eyebrow: 'CADASTRE', title: isNew ? 'Nouvelle parcelle' : `Modifier « ${p.title || titleOf(p)} »`, wide: true,
                body: `<div class="cad-edit">
                    <section class="cad-find" aria-label="Retrouver la parcelle">
                        <h4>🔍 Retrouver la parcelle ${UI()?.helpTip ? '' : ''}<small class="muted">— le contour, la surface, la section et le numéro viennent du cadastre d’aujourd’hui (IGN)</small></h4>
                        <div class="form-grid cad-find-row">
                            <div class="cad-find-commune"><span class="pk-lab">Commune</span><div data-cad-f="commune_place_id">${P().pickerField({name: 'commune_place_id', kind: 'place', value: place})}</div></div>
                            <label>Section<input name="section" maxlength="3" autocomplete="off" value="${esc(secText(p.section || prefill.section || found?.section || ''))}" placeholder="AB" data-cad-sec></label>
                            <label>Numéro<input name="numero" maxlength="5" inputmode="numeric" autocomplete="off" value="${esc(numText(p.numero || prefill.numero || found?.numero || ''))}" placeholder="100"></label>
                            <div class="cad-find-btns"><button type="button" class="button" data-cad-find>🔍 Chercher</button><button type="button" class="button secondary" data-cad-mapclick aria-pressed="false">🗺 Cliquer sur la carte</button></div>
                        </div>
                        <div class="cad-secs" data-cad-secs></div>
                        <div class="cad-found" data-cad-found aria-live="polite"></div>
                        <div class="cad-edit-map" data-cad-editmap></div>
                    </section>
                    <input type="hidden" name="insee" value="${esc(insee)}"><input type="hidden" name="prefixe" value="${esc(p.prefixe || found?.prefixe || '000')}">
                    <div class="form-grid">
                        <label>Lieu-dit<input name="lieu_dit" maxlength="200" value="${esc(p.lieu_dit || '')}" placeholder="Les Combes, Le Pré du Moulin…"></label>
                        <label>Surface<input name="surface_m2" type="number" min="0" step="1" data-unit="m²" value="${esc(p.surface_m2 ?? found?.surface_m2 ?? '')}"></label>
                        <label>Nature<input name="nature" maxlength="120" value="${esc(p.nature || '')}" placeholder="pré, terre, vigne, bois, maison et cour…"></label>
                        <label>Ancien numéro <small>(plan napoléonien)</small><input name="old_ref" maxlength="120" value="${esc(p.old_ref || '')}" placeholder="B 245 (1834)"></label>
                        <label class="span-2">Adresse<span class="cad-addr"><input name="address" maxlength="300" value="${esc(p.address || '')}" placeholder="12 rue du Moulin"><button type="button" class="button small secondary" data-cad-addr title="L’adresse d’aujourd’hui la plus proche du centre de la parcelle (Base Adresse Nationale)">📍 Adresse d’aujourd’hui</button></span></label>
                    </div>
                    <h4 class="cad-h">👥 Propriétaires et occupants</h4>
                    <div data-cad-f="people_json">${P().pickerField({name: 'people_json', hiddenName: false, kind: 'person', allowFree: true, roles: {main: false, roleList: ROLES, zones: ZONES}, value: people})}</div>
                    <div class="cad-dates" data-cad-dates></div>
                    <div class="form-grid cad-links">
                        <div><span class="pk-lab">🏠 Maisons (outil Maison)</span><div data-cad-f="cad_houses">${P().pickerField({name: 'cad_houses', hiddenName: false, kind: 'house', multiple: true, value: houses})}</div></div>
                        <div><span class="pk-lab">📍 Autres lieux</span><div data-cad-f="cad_places">${P().pickerField({name: 'cad_places', hiddenName: false, kind: 'place', multiple: true, value: placesV})}</div></div>
                        <div><span class="pk-lab">📅 Événements (vente, partage, succession…)</span><div data-cad-f="cad_events">${P().pickerField({name: 'cad_events', hiddenName: false, kind: 'event', multiple: true, value: multi('event')})}</div></div>
                        <div><span class="pk-lab">📚 Sources</span><div data-cad-f="cad_sources">${P().pickerField({name: 'cad_sources', hiddenName: false, kind: 'source', multiple: true, value: multi('source')})}</div></div>
                        <div><span class="pk-lab">🗺️ Plans anciens calés (Cartes anciennes)</span><div data-cad-f="cad_oldmaps">${P().pickerField({name: 'cad_oldmaps', hiddenName: false, kind: 'oldmap', multiple: true, value: multi('oldmap')})}</div></div>
                        <div><span class="pk-lab">🖼 Médias (extrait de matrice, plan scanné, photos)</span><div data-cad-f="media">${P().mediaField ? P().mediaField({name: '', multiple: true, types: ['image', 'document'], value: media, title: 'Médias de la parcelle', okLabel: 'Relier ces images'}) : ''}</div></div>
                    </div>
                    <div class="form-grid cad-notes"><label class="span-2">Notes<textarea name="notes" rows="3" maxlength="20000" placeholder="Matrice cadastrale (case n°…), mutations, partages, ce que tu sais de cette parcelle…">${esc(p.notes || '')}</textarea></label></div>
                </div>`,
                onOpen: dg => {
                    const f = dg.querySelector('form');
                    const box = dg.querySelector('[data-cad-found]'), secsBox = dg.querySelector('[data-cad-secs]'), mapHost = dg.querySelector('[data-cad-editmap]');
                    const fieldOf = name => dg.querySelector(`[data-cad-f="${name}"] .pk`);
                    const peopleField = fieldOf('people_json');
                    let clickMode = false, placeLL = null;
                    const showMap = () => {
                        mapHost.hidden = false;
                        if (!mm) {
                            const c = found || p;
                            const ll = c.lat ? [c.lat, c.lon] : prefill.lat ? [prefill.lat, prefill.lon] : placeLL;
                            mm = miniMap(mapHost, {lat: ll?.[0] || 46.6, lon: ll?.[1] || 2.4, zoom: c.lat || prefill.lat ? 17 : ll ? 15 : 6,
                                parcels: geomStart ? [{geometry: geomStart, sel: true}] : [], onClick: (la, lo) => { if (clickMode) lookPoint(la, lo); }});
                            if (geomStart) setTimeout(() => mm.fit(geomStart), 30);
                        }
                    };
                    mapHost.hidden = !geomStart && !prefill.lat;
                    if (!mapHost.hidden) showMap();
                    const setFound = it => {
                        found = it;
                        if (!it) return;
                        if (it.insee) { insee = it.insee; f.elements.insee.value = it.insee; }
                        f.elements.prefixe.value = it.prefixe || '000';
                        f.elements.section.value = secText(it.section); f.elements.numero.value = numText(it.numero);
                        if (it.surface_m2 != null) f.elements.surface_m2.value = it.surface_m2;
                        showMap(); mm.set([{geometry: it.geometry, sel: true, label: it.title}]); if (it.geometry) mm.fit(it.geometry);
                    };
                    const rowHtml = (it, i) => `<div class="cad-hit${found && found.idu === it.idu ? ' is-on' : ''}">${shapeSvg(it.geometry, 34)}<div><b>${esc(it.title)}</b><small class="muted">${esc([it.commune, surfaceText(it.surface_m2), it.idu].filter(Boolean).join(' · '))}</small></div>
                        ${it.existing_id ? `<button type="button" class="button small secondary" data-cad-hitopen="${it.existing_id}">↗ Déjà dans ta liste</button>` : `<button type="button" class="button small" data-cad-hit="${i}">✓ Prendre celle-ci</button>`}</div>`;
                    let hits = [];
                    const showHits = (list, src) => {
                        hits = list;
                        box.innerHTML = list.length ? `<p class="muted small">${plural(list.length, 'parcelle trouvée', 'parcelles trouvées')}${src === 'wfs' ? ' (Géoplateforme IGN)' : ' (API Carto IGN)'}</p>${list.slice(0, 200).map(rowHtml).join('')}${list.length > 200 ? `<p class="muted small">… et ${list.length - 200} autres : écris le numéro.</p>` : ''}`
                            : UI().notice('warn', 'Aucune parcelle à cet endroit dans le cadastre d’aujourd’hui. Vérifie la section et le numéro (une parcelle a pu être divisée ou renumérotée), ou remplis la fiche à la main.');
                        if (list.length === 1 && !list[0].existing_id) { setFound(list[0]); box.querySelector('.cad-hit')?.classList.add('is-on'); }
                    };
                    const busy = txt => { box.innerHTML = UI().spinner(txt); };
                    const fail = e => { box.innerHTML = UI().notice('error', e.message || 'Le cadastre en ligne ne répond pas.'); };
                    async function lookRef() {
                        if (!insee) { const v = P().pickerValue(fieldOf('commune_place_id')); if (Number(v)) { try { const pi = await get('cadastre_place', {id: Number(v)}); insee = pi.insee; f.elements.insee.value = insee; } catch (_) {} } }
                        if (!insee) return UI().fail(fieldOf('commune_place_id')?.querySelector('input[type=hidden]') || f.elements.section, 'Choisis une commune de France (elle a un code INSEE).');
                        if (!f.elements.section.value.trim()) return UI().fail(f.elements.section, 'Écris la section (1 ou 2 lettres, ex. « AB » ou « B »).');
                        busy('Je cherche dans le cadastre…');
                        try { const r = await get('cadastre_lookup', {mode: 'ref', insee, section: f.elements.section.value, numero: f.elements.numero.value, prefixe: f.elements.prefixe.value}); showHits(r.parcels || [], r.source); } catch (e) { fail(e); }
                    }
                    async function lookPoint(la, lo) {
                        busy('Je cherche la parcelle à cet endroit…');
                        try { const r = await get('cadastre_lookup', {mode: 'point', lat: la.toFixed(6), lon: lo.toFixed(6), address: f.elements.address.value.trim() ? '' : 1}); showHits(r.parcels || [], r.source); if (r.address && !f.elements.address.value.trim() && (r.parcels || []).length) f.elements.address.value = r.address; } catch (e) { fail(e); }
                    }
                    async function loadSections() {
                        secsBox.innerHTML = '';
                        if (!insee) return;
                        try { const r = await get('cadastre_lookup', {mode: 'sections', insee}); const s = r.sections || [];
                            secsBox.innerHTML = s.length ? `<span class="muted small">Sections de la commune :</span> ${s.map(x => `<button type="button" class="cad-secbtn" data-cad-secpick="${esc(x)}">${esc(secText(x))}</button>`).join('')}` : '';
                        } catch (_) { /* pas de réseau : on écrit la section à la main */ }
                    }
                    dg.addEventListener('picker-change', async e => {
                        if (e.detail.name === 'commune_place_id') {
                            const it = e.detail.item; insee = it?.insee || ''; f.elements.insee.value = insee;
                            let ll = it?.lat ? [Number(it.lat), Number(it.lon)] : null;
                            if (it && !insee && Number(it.id)) { try { const pi = await get('cadastre_place', {id: Number(it.id)}); insee = pi.insee; f.elements.insee.value = insee; if (!ll && pi.lat) ll = [pi.lat, pi.lon]; } catch (_) {} }
                            if (ll) { prefill.lat = prefill.lat || null; if (mm) mm.center(ll[0], ll[1], 15); else placeLL = ll; }
                            if (insee) box.innerHTML = '';
                            if (it && !insee) box.innerHTML = UI().notice('info', 'Ce lieu n’a pas de code de commune française (INSEE) : la recherche en ligne ne marche que pour les communes de France. Tu peux remplir la parcelle à la main.');
                            loadSections();
                        }
                        if (e.detail.name === 'people_json') { (e.detail.items?.people || []).forEach(x => { if (x.id && x.title) names.set(String(x.id), x.title); }); paintDates(); }
                    });
                    function paintDates() {
                        const v = P().pickerValue(peopleField) || {people: []};
                        const list = (v.people || []);
                        dg.querySelector('[data-cad-dates]').innerHTML = list.length ? `<p class="muted small">Depuis quand, jusqu’à quand ? (écris comme dans un acte : « 1834 », « vers 1850 », « 12 mars 1872 »)</p>${list.map(x => { const k = x.id ? String(x.id) : 'txt:' + (x.txt || x.title || ''), dd = dates.get(k) || {};
                            return `<div class="cad-daterow" data-cad-dk="${esc(k)}"><b>${esc(x.title || (x.id ? names.get(String(x.id)) : '') || x.txt || 'Personne')}</b>${x.role ? ` <small class="muted">${esc(x.role)}</small>` : ''}<label>de<input data-ui-date="nocal" data-cad-from value="${esc(dd.from || '')}" placeholder="1834"></label><label>à<input data-ui-date="nocal" data-cad-to value="${esc(dd.to || '')}" placeholder="1872"></label></div>`; }).join('')}` : '';
                    }
                    dg.querySelector('[data-cad-dates]').addEventListener('input', e => { const r = e.target.closest('[data-cad-dk]'); if (!r) return; dates.set(r.dataset.cadDk, {from: r.querySelector('[data-cad-from]').value, to: r.querySelector('[data-cad-to]').value}); });
                    paintDates();
                    dg.addEventListener('click', async e => {
                        const b = e.target.closest('button'); if (!b) return;
                        if (b.matches('[data-cad-find]')) { e.preventDefault(); return lookRef(); }
                        if (b.matches('[data-cad-mapclick]')) { e.preventDefault(); clickMode = !clickMode; b.setAttribute('aria-pressed', clickMode ? 'true' : 'false'); b.classList.toggle('is-active', clickMode); showMap(); mm.draw(); if (clickMode) box.innerHTML = UI().notice('info', 'Clique sur la parcelle, sur la carte ci-dessous (zoome d’abord : glisse, molette, ＋).'); return; }
                        if (b.dataset.cadHit !== undefined) { e.preventDefault(); setFound(hits[Number(b.dataset.cadHit)]); box.querySelectorAll('.cad-hit').forEach((h, i) => h.classList.toggle('is-on', i === Number(b.dataset.cadHit))); return; }
                        if (b.dataset.cadHitopen) { e.preventDefault(); dg.close(); open(Number(b.dataset.cadHitopen)); return; }
                        if (b.dataset.cadSecpick) { e.preventDefault(); f.elements.section.value = secText(b.dataset.cadSecpick); f.elements.numero.focus(); return; }
                        if (b.matches('[data-cad-addr]')) {
                            e.preventDefault();
                            const c = found || p; if (!c?.lat) return UI().fail(f.elements.address, 'Retrouve d’abord la parcelle (le centre de la parcelle sert à trouver l’adresse).');
                            b.disabled = true;
                            try { const r = await get('cadastre_lookup', {mode: 'point', lat: Number(c.lat).toFixed(6), lon: Number(c.lon).toFixed(6), address: 1}); if (r.address) f.elements.address.value = r.address; else toast('Pas d’adresse trouvée près de cette parcelle.'); }
                            catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
                        }
                    });
                    [f.elements.section, f.elements.numero].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lookRef(); } }));
                    if (insee) loadSections();
                    if (isNew && prefill.lat && !found) { clickMode = false; lookPoint(prefill.lat, prefill.lon); }
                    else if (found) setTimeout(() => setFound(found), 40);
                    dg.addEventListener('close', () => resolve(saved), {once: true});
                    setTimeout(() => (isNew ? f.elements.section : f.elements.lieu_dit).focus(), 40);
                },
                onDelete: d ? async () => { await remove(d.parcel); return true; } : null,
                onSubmit: async f => {
                    const dg = f.closest('dialog');
                    const val = name => P().pickerValue(dg.querySelector(`[data-cad-f="${name}"] .pk`));
                    const ids = name => [].concat(val(name) || []).map(Number).filter(Boolean);
                    const pv = val('people_json') || {people: []};
                    const links = [
                        ...(pv.people || []).map(x => { const k = x.id ? String(x.id) : 'txt:' + (x.txt || x.title || ''), dd = dates.get(k) || {}; return {kind: 'person', id: Number(x.id) || 0, txt: x.id ? '' : (x.txt || x.title || ''), role: x.role || (x.primary ? 'propriétaire' : ''), primary: !!x.primary, from: dd.from || '', to: dd.to || ''}; }),
                        ...ids('cad_houses').map(id => ({kind: 'house', id})), ...ids('cad_places').map(id => ({kind: 'place', id})), ...ids('cad_events').map(id => ({kind: 'event', id})),
                        ...ids('cad_sources').map(id => ({kind: 'source', id})), ...ids('cad_oldmaps').map(id => ({kind: 'oldmap', id})),
                        ...[].concat(P().mediaValue?.(dg.querySelector('[data-cad-f="media"] [data-media-field]')) || []).map(Number).filter(Boolean).map(id => ({kind: 'media', id, role: of('media').find(l => l.id === id)?.role || ''}))];
                    const v = A().formObject(f);
                    const placeV = Number(val('commune_place_id')) || 0;
                    if (!String(v.section || '').trim() && !String(v.numero || '').trim() && !String(v.lieu_dit || '').trim() && !String(v.old_ref || '').trim()) return UI().fail(f.elements.section, 'Donne au moins la section et le numéro de la parcelle (ou un lieu-dit).');
                    const g = found?.geometry || (!found ? p.geometry : null) || null;
                    const body = {id: p.id || 0, insee: v.insee, commune_place_id: placeV, commune_name: found?.commune || '', prefixe: v.prefixe, section: v.section, numero: v.numero,
                        lieu_dit: v.lieu_dit, surface_m2: v.surface_m2, nature: v.nature, address: v.address, old_ref: v.old_ref, notes: v.notes,
                        geometry: g, lat: g ? null : (found?.lat ?? p.lat ?? null), lon: g ? null : (found?.lon ?? p.lon ?? null), source: found ? 'api' : (p.source || 'manual'), links};
                    if (!body.commune_name) body.commune_name = (placeV && placeV === Number(p.commune_place_id)) ? (p.commune || '') : '';
                    const res = await post('save_cadastre_parcel', body);
                    saved = res.result || res;
                    changed();
                    toast(isNew ? `Parcelle « ${saved.title} » créée.` : 'Enregistré', isNew ? '' : 'success');
                }});
            if (!dlg) resolve(null);
        });
    }

    async function remove(parcel, after = null) {
        const r = await post('delete_cadastre_parcel', {id: parcel.id});
        const snap = r.result || r; let id = parcel.id;
        changed();
        const again = after || refresh;
        A().undoToast(`Parcelle « ${parcel.title || titleOf(parcel)} » supprimée`, {
            undo: async () => { const x = await post('restore_cadastre_parcel', snap); id = (x.result || x).id; changed(); await again(); },
            redo: async () => { await post('delete_cadastre_parcel', {id}); changed(); await again(); }});
        if (Number(S().cadastreId) === Number(parcel.id)) S().cadastreId = 0;
        await again();
    }
    const refresh = async () => { if (S().module === 'listes' && S().listType === 'cadastre') await A().renderList?.(); };

    /* ═════════ La liste ═════════ */
    function ownersOf(it) { return (it.people || []).filter(x => /propri|usufr|héritier|acheteur/i.test(x.role || '') || !x.role); }
    function itemOf(it, view) {
        const owners = ownersOf(it);
        return {thumb: shapeSvg(it.geometry, view === 'cards' ? 120 : 34), name: `${it.title}${it.commune ? ' · ' + it.commune : ''}`, open: `data-cad-open="${it.id}"`,
            lines: [[it.lieu_dit, surfaceText(it.surface_m2), it.nature].filter(Boolean).join(' · ') || it.address || (it.old_ref ? `ancien n° ${it.old_ref}` : ''),
                owners.length ? `${owners.length > 1 ? 'Propriétaires' : 'Propriétaire'} : ${owners.slice(0, 3).map(x => x.name + (x.from || x.to ? ` (${[x.from, x.to].filter(Boolean).join('–')})` : '')).join(', ')}${owners.length > 3 ? '…' : ''}` : (it.people.length ? plural(it.people.length, 'personne reliée', 'personnes reliées') : '')],
            badges: [it.houses.length ? {text: plural(it.houses.length, 'maison'), kind: 'blue'} : null, it.counts.oldmap ? {text: 'plan ancien', kind: 'green'} : null, !it.geometry ? {text: 'sans contour', kind: 'yellow'} : null].filter(Boolean),
            when: it.updated_at, whenLabel: 'Modifié',
            menu: [`<button type="button" data-cad-edit="${it.id}">✎ Modifier</button>`, it.lat ? `<button type="button" data-cad-onmap="${it.id}">🗺 Voir sur la carte</button>` : '', `<button type="button" class="danger" data-cad-del="${it.id}">🗑 Supprimer</button>`].filter(Boolean),
            actions: view === 'list' ? `${it.houses.length ? UI().badge(plural(it.houses.length, 'maison'), 'blue') : ''}<button type="button" class="button small secondary" data-cad-open="${it.id}">↗ Ouvrir</button>` : '', attrs: `data-cad-row="${it.id}"`};
    }

    async function renderList(token) {
        if (Number(S().cadastreId)) return renderSheet(token, Number(S().cadastreId));
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page cad-page">${UI().pageHeader({title: 'Cadastre', icon: '🗺',
            help: 'Les parcelles de ta famille : terres, prés, maisons. Retrouve une parcelle par sa commune, sa section et son numéro (ou d’un clic sur la carte), relie-la aux propriétaires, aux maisons, aux actes et au plan napoléonien.',
            primary: '<button type="button" class="button" data-cad-new>＋ Ajouter une parcelle</button>',
            actions: ['<button type="button" class="button secondary" data-cad-bigmap>🗺 Voir sur la carte</button>', '<button type="button" class="button secondary" data-cad-oldmaps>🗺️ Cartes anciennes</button>'],
            more: ['<button type="button" data-cad-faq>❓ Ce qu’on peut récupérer (licences)</button>']})}
            <div data-cad-bar></div><div data-cad-list>${UI().spinner('Chargement des parcelles…')}</div><p class="muted small cad-attr">${esc(ATTR)} · plans, numéros et surfaces d’aujourd’hui (le plan napoléonien se cale à part).</p></section>`;
        let all;
        try { all = await loadAll(true); } catch (e) { if (isCurrent(token)) ws.querySelector('[data-cad-list]').innerHTML = UI().notice('error', e.message || 'Chargement impossible.'); return; }
        if (!isCurrent(token)) return;
        const communes = [...new Map(all.filter(x => x.commune).map(x => [x.commune, 0])).keys()].sort((a, b) => a.localeCompare(b, 'fr'));
        const count = fn => all.filter(fn).length;
        let shown = 60, bar = null;
        bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher… (commune, section, numéro, lieu-dit, propriétaire)'},
            filters: [{id: 'commune', label: 'Commune', type: 'check', options: communes.map(c => [c, `${c} (${count(x => x.commune === c)})`, c])},
                {id: 'owner', label: 'Propriétaire', type: 'radio', dflt: '', options: [['', 'Toutes'], ['yes', `Avec un propriétaire (${count(x => ownersOf(x).length)})`, 'Avec propriétaire'], ['no', `Sans propriétaire (${count(x => !ownersOf(x).length)})`, 'Sans propriétaire']]},
                {id: 'house', label: 'Maison', type: 'check', options: [['yes', `Reliées à une maison (${count(x => x.houses.length)})`, 'Avec maison']]},
                {id: 'shape', label: 'Contour', type: 'check', options: [['no', `Sans contour (${count(x => !x.geometry)})`, 'Sans contour']]}],
            view: {dflt: 'list', what: 'parcelles'}, sort: {options: [['az', 'Commune, section, numéro'], ['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['big', 'Les plus grandes']], value: 'az'},
            onChange: () => { shown = 60; if (bar) paint(); }});
        ws.querySelector('[data-cad-bar]').replaceWith(bar);
        const box = ws.querySelector('[data-cad-list]');
        function paint() {
            const st = bar.state, q = fold(st.q).trim(), f = st.filters;
            let rows = all.filter(x => (!q || q.split(/\s+/).every(w => fold([x.commune, `section ${secText(x.section)}`, secText(x.section), numText(x.numero), `${secText(x.section)} ${numText(x.numero)}`, x.lieu_dit, x.address, x.nature, x.old_ref, x.idu, ...x.people.map(p => p.name), ...x.houses.map(h => h.name)].join(' ')).includes(w)))
                && (!(f.commune || []).length || f.commune.includes(x.commune))
                && (!f.owner || (f.owner === 'yes' ? ownersOf(x).length > 0 : !ownersOf(x).length))
                && (!(f.house || []).length || x.houses.length > 0)
                && (!(f.shape || []).length || !x.geometry));
            const key = x => `${fold(x.commune)}|${x.section}|${x.numero}`;
            rows = st.sort === 'big' ? [...rows].sort((a, b) => (b.surface_m2 || 0) - (a.surface_m2 || 0))
                : st.sort === 'recent' || st.sort === 'old' ? UI().sortItems(rows, st.sort, {name: key, date: x => x.updated_at})
                : [...rows].sort((a, b) => key(a).localeCompare(key(b), 'fr', {numeric: true}));
            bar.setCount(rows.length === all.length ? plural(all.length, 'parcelle') : `${plural(rows.length, 'parcelle')} sur ${all.length}`);
            if (!all.length) { box.innerHTML = A().emptyState({icon: '🗺', text: 'Aucune parcelle pour l’instant', hint: 'Une terre, un pré, la maison des ancêtres : choisis la commune, écris la section et le numéro (sur un acte, une matrice, un plan), ou clique sur la carte. Le contour et la surface viennent tout seuls.', action: {label: '＋ Ajouter une parcelle', attrs: 'data-empty-click="[data-cad-new]"'}}); return; }
            if (!rows.length) { box.innerHTML = A().emptyState({icon: '🔍', text: 'Rien ne correspond', hint: 'Enlève un filtre, ou cherche autrement (une commune, un nom).'}); return; }
            const view = st.view === 'cards' ? 'cards' : 'list';
            box.innerHTML = UI().itemsHtml(view, rows.slice(0, shown).map(x => itemOf(x, view)));
            if (rows.length > shown) box.appendChild(UI().moreButton({remaining: rows.length - shown, step: 60, feminine: true, onClick: () => { shown += 60; paint(); }}));
        }
        paint();
        ws.addEventListener('click', async e => {
            const t = e.target.closest?.('[data-cad-open],[data-cad-new],[data-cad-edit],[data-cad-del],[data-cad-onmap],[data-cad-bigmap],[data-cad-oldmaps],[data-cad-faq]'); if (!t) return;
            const row = id => all.find(x => Number(x.id) === Number(id));
            try {
                if (t.matches('[data-cad-open]')) { e.preventDefault(); S().cadastreId = Number(t.dataset.cadOpen); return refresh(); }
                if (t.matches('[data-cad-new]')) { const r = await edit(null); if (r) { S().cadastreId = r.id; await refresh(); } return; }
                if (t.matches('[data-cad-edit]')) { const d = await get('cadastre_parcel', {id: Number(t.dataset.cadEdit)}); if (await edit(d)) await refresh(); return; }
                if (t.matches('[data-cad-del]')) { const r = row(t.dataset.cadDel); if (r) await remove(r); return; }
                if (t.matches('[data-cad-onmap]')) { const r = row(t.dataset.cadOnmap); if (r) showOnMap(r); return; }
                if (t.matches('[data-cad-bigmap]')) { const pts = all.filter(x => x.lat); S().cadLayer = true; lsSet('lcnda-cadastre-layer', true); if (pts.length) { const la = pts.reduce((a, x) => a + x.lat, 0) / pts.length, lo = pts.reduce((a, x) => a + x.lon, 0) / pts.length; S().mapCenter = {lat: la, lon: lo}; S().mapZoom = pts.length > 1 ? 14 : 17; S().mapKeepCenter = true; } A().setModule('carte'); return; }
                if (t.matches('[data-cad-oldmaps]')) { S().listType = 'old_maps'; A().setModule('listes'); return; }
                if (t.matches('[data-cad-faq]')) { UI().openFaq?.('Que peut-on récupérer du cadastre, et avec quelle licence ?'); }
            } catch (err) { toast(err.message, 'error'); }
        }, {signal: A().listControllerSignal?.()});
    }

    /* ═════════ La fiche d'une parcelle ═════════ */
    const linkRows = (list, fn) => (list.length ? UI().rowsHtml(list.map(fn)) : '');
    function personThumb(l) {
        if (!l.id) return '<span class="cad-free" aria-hidden="true">?</span>';
        const pp = {id: l.id, name: l.title, first_name: (l.title || '').split(' ')[0], last_name: (l.title || '').split(' ').slice(1).join(' ')};
        return UI().avatarOr ? UI().avatarOr(pp, 34, `<span class="cad-ini" aria-hidden="true">${esc((l.title || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>`) : '👤';
    }
    const datesText = l => (l.from || l.to ? (l.from && l.to ? `de ${l.from} à ${l.to}` : l.from ? `depuis ${l.from}` : `jusqu’à ${l.to}`) : '');
    function cardSec(title, body, actions = '', cls = '') { return `<section class="card cad-card ${cls}"><header class="card-head"><div class="card-title"><h3>${title}</h3></div>${actions ? `<div class="card-head-actions">${actions}</div>` : ''}</header><div class="card-body">${body}</div></section>`; }

    function sheetHtml(d, {dialog = false} = {}) {
        const p = d.parcel, L = d.links, of = k => L.filter(l => l.kind === k);
        const row = (lab, val) => (val ? `<div class="cad-dl-row"><dt>${esc(lab)}</dt><dd>${val}</dd></div>` : '');
        const ar = d.archives;
        const fa = `https://francearchives.gouv.fr/fr/search?q=${encodeURIComponent(['cadastre', p.commune].filter(Boolean).join(' '))}`;
        const people = of('person'), owners = people.filter(l => l.primary), others = people.filter(l => !l.primary);
        const pRow = l => ({thumb: personThumb(l), name: l.title || 'Sans nom', open: l.id && !l.gone ? `data-cad-person="${l.id}"` : '', lines: [l.role, datesText(l), l.id ? '' : 'sans fiche'].filter(Boolean)});
        const media = of('media');
        return `<div class="cad-sheet${dialog ? ' is-dialog' : ''}">
            <div class="cad-grid">
                ${cardSec('🗺 Sur la carte', `<div class="cad-sheet-map" data-cad-sheetmap></div>`, `${p.lat ? '<button type="button" class="button small secondary" data-cad-bigmapone>🗺 Grande carte</button>' : ''}${p.insee && p.section && p.numero ? '<button type="button" class="button small secondary" data-cad-refetch title="Relire le contour et la surface dans le cadastre d’aujourd’hui">↻ Relire en ligne</button>' : ''}`)}
                ${cardSec('▦ La parcelle', `<dl class="cad-dl">${row('Commune', esc(p.commune || '') + (p.insee ? ` <small class="muted">(INSEE ${esc(p.insee)})</small>` : ''))}${row('Section', esc(secText(p.section)))}${row('Numéro', esc(numText(p.numero)))}${p.prefixe && p.prefixe !== '000' ? row('Préfixe (ancienne commune)', esc(p.prefixe)) : ''}
                    ${row('Lieu-dit', esc(p.lieu_dit))}${row('Surface', esc(surfaceText(p.surface_m2)))}${row('Nature', esc(p.nature))}${row('Adresse', esc(p.address))}${row('Ancien numéro', esc(p.old_ref))}${row('Identifiant', p.idu ? `<code>${esc(p.idu)}</code>` : '')}</dl>
                    ${p.source === 'api' ? `<p class="muted small">${esc(d.attribution || ATTR)}</p>` : ''}
                    ${!p.geometry ? UI().notice('info', 'Pas encore de contour : « ✎ Modifier » → « 🔍 Chercher » (ou un clic sur la carte) pour le récupérer.') : ''}`)}
            </div>
            ${cardSec(`👥 Propriétaires et occupants <small>(${people.length})</small>`, people.length ? `${owners.length ? `<h4 class="cad-sub">★ Propriétaires</h4>${linkRows(owners, pRow)}` : ''}${others.length ? `<h4 class="cad-sub">☆ Autres personnes</h4>${linkRows(others, pRow)}` : ''}`
                : A().empty('Aucune personne reliée', {icon: '👥', action: {label: '＋ Ajouter un propriétaire', attrs: 'data-empty-click="[data-cad-editme]"'}}))}
            <div class="cad-grid">
                ${cardSec(`🏠 Maisons <small>(${of('house').length})</small>`, linkRows(of('house'), l => ({thumb: '<span class="ui-card-ico" aria-hidden="true">🏠</span>', name: l.title, open: l.gone ? '' : `data-cad-house="${l.id}"`, lines: [l.role]})) || A().empty('Aucune maison reliée', {icon: '🏠'}))}
                ${cardSec(`📅 Événements <small>(${of('event').length})</small>`, linkRows(of('event'), l => ({thumb: '<span class="ui-card-ico" aria-hidden="true">📅</span>', name: l.title, open: l.person_id ? `data-cad-person="${l.person_id}"` : '', lines: [l.role]})) || A().empty('Aucun acte relié (vente, partage, succession…)', {icon: '📅'}))}
            </div>
            ${cardSec(`🖼 Médias <small>(${media.length})</small>`, media.length ? `<div class="cad-media">${media.map((m, i) => `<button type="button" class="cad-mthumb" data-cad-media="${i}" title="${esc(m.title)}">${m.filename && /image/.test(m.media_type || 'image') ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="" loading="lazy">` : '<span>📄</span>'}<small>${esc(m.title)}</small></button>`).join('')}</div>`
                : A().empty('Aucune image : un extrait de matrice, le plan scanné, une photo…', {icon: '🖼', action: {label: '＋ Ajouter des images', attrs: 'data-empty-click="[data-cad-addmedia]"'}}), '<button type="button" class="button small secondary" data-cad-addmedia>＋ Ajouter des images</button>')}
            ${cardSec('🏛 Plan napoléonien et archives', `<p>Le plan cadastral « napoléonien » (vers 1810-1850) et ses matrices sont aux <b>archives départementales</b>. Beaucoup les montrent en ligne (conditions de réutilisation propres à chaque département) : télécharge l’image de la section, ajoute-la à tes médias, puis cale-la sur la carte d’aujourd’hui (2 points suffisent, 3 ou plus c’est mieux).</p>
                <ul class="cad-ar">${ar?.url ? `<li><a href="${esc(ar.url)}" target="_blank" rel="noopener noreferrer">${esc(ar.service)} ↗</a>${ar.digitized ? ` <small class="muted">${esc(ar.digitized)}</small>` : ''}</li>` : ar ? `<li>${esc(ar.service)} <small class="muted">(adresse du site à chercher)</small></li>` : ''}<li><a href="${esc(fa)}" target="_blank" rel="noopener noreferrer">Chercher « cadastre ${esc(p.commune || '')} » sur FranceArchives ↗</a></li></ul>
                <p class="muted small">Liens donnés sans garantie : les sites des archives changent souvent.</p>
                ${of('oldmap').length ? `<h4 class="cad-sub">🗺️ Plans anciens calés</h4>${linkRows(of('oldmap'), l => ({thumb: '<span class="ui-card-ico" aria-hidden="true">🗺️</span>', name: l.title, open: l.gone ? '' : `data-cad-oldmap="${l.id}"`, actions: l.gone ? '' : `<button type="button" class="button small secondary" data-cad-oldmapshow="${l.id}">🗺 Sur la carte</button>`}))}` : ''}`,
                '<button type="button" class="button small" data-cad-calage>＋ Caler un plan ancien</button>')}
            <div class="cad-grid">
                ${cardSec(`📍 Lieux et 📚 sources <small>(${of('place').length + of('source').length})</small>`, (linkRows([...of('place'), ...of('source')], l => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${l.kind === 'place' ? '📍' : '📚'}</span>`, name: l.title, lines: [l.kind === 'place' ? 'lieu' : 'source', l.role]})) || A().empty('Aucun lieu ni source', {icon: '📚'})))}
                ${cardSec('💶 Ventes depuis 2020 (DVF)', `<div data-cad-dvf><p class="muted">Les ventes enregistrées par les impôts (prix, date, nature du terrain), sans nom de personne. Seulement pour les parcelles d’aujourd’hui.</p>${p.idu ? '<button type="button" class="button small secondary" data-cad-dvfgo>🔎 Voir les ventes</button>' : ''}</div>`)}
            </div>
            ${p.notes ? cardSec('📝 Notes', `<p class="cad-notes-view">${esc(p.notes).replace(/\n/g, '<br>')}</p>`) : ''}
        </div>`;
    }

    function bindSheet(root, d, {reload, dialogEl = null} = {}) {
        const p = d.parcel, L = d.links;
        const mapEl = root.querySelector('[data-cad-sheetmap]');
        if (mapEl) {
            const mm = miniMap(mapEl, {lat: p.lat || 46.6, lon: p.lon || 2.4, zoom: p.lat ? 17 : 6, parcels: p.geometry ? [{geometry: p.geometry, sel: true, label: p.title}] : []});
            if (p.geometry) setTimeout(() => mm.fit(p.geometry), 30);
        }
        const leave = () => { dialogEl?.close(); document.querySelectorAll('dialog[open].h-hs-dlg, dialog[open].is-full').forEach(x => { void x; }); };
        root.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
            try {
                if (b.dataset.cadPerson) { leave(); A().openPersonById(Number(b.dataset.cadPerson)); return; }
                if (b.dataset.cadHouse) { ext.openHouse?.({id: Number(b.dataset.cadHouse), onClose: () => reload?.()}); return; }
                if (b.dataset.cadMedia !== undefined) { const m = L.filter(l => l.kind === 'media' && !l.gone).map(l => ({id: l.id, filename: l.filename, title: l.title, media_type: l.media_type || 'image', thumbnail: l.thumbnail})); A().openLightbox?.(m, Number(b.dataset.cadMedia)); return; }
                if (b.dataset.cadOldmap) { leave(); S().listType = 'old_maps'; await A().setModule('listes'); ext.lists.old_maps?.(++S().workspaceToken, Number(b.dataset.cadOldmap)); return; }
                if (b.dataset.cadOldmapshow) { leave(); showOnMap(p, {oldmap: Number(b.dataset.cadOldmapshow)}); return; }
                if (b.matches('[data-cad-bigmapone]')) { leave(); showOnMap(p); return; }
                if (b.matches('[data-cad-editme]')) { if (await edit(await get('cadastre_parcel', {id: p.id}))) reload?.(); return; }
                if (b.matches('[data-cad-calage]')) {
                    leave();
                    S().hOldMapPrefill = {title: `Plan napoléonien de ${p.commune || 'la commune'}${p.section ? `, section ${secText(p.section)}` : ''}`, lat: p.lat, lon: p.lon, parcelId: p.id, mapId: null};
                    S().listType = 'old_maps'; await A().setModule('listes'); ext.lists.old_maps?.(++S().workspaceToken, 0);
                    toast('Donne une image du plan (photo ou scan), enregistre, puis clique 2 points (ou plus) sur l’image et au même endroit sur la carte.');
                    return;
                }
                if (b.matches('[data-cad-addmedia]')) {
                    const list = await P().openMediaPicker?.({multiple: true, types: ['image', 'document'], eyebrow: 'CADASTRE', title: 'Images de la parcelle', intro: 'Un extrait de matrice cadastrale, le plan napoléonien scanné, une photo de la parcelle… « 📁 Importer » ajoute une image de l’ordinateur à tes médias.', okLabel: 'Relier ces images'});
                    if (!list?.length) return;
                    for (const m of list) await post('cadastre_link', {parcel_id: p.id, kind: 'media', id: Number(m.id), on: true});
                    toast(`${plural(list.length, 'image reliée', 'images reliées')} à la parcelle.`); changed(); reload?.(); return;
                }
                if (b.matches('[data-cad-refetch]')) {
                    b.disabled = true;
                    const r = await get('cadastre_lookup', {mode: 'ref', insee: p.insee, section: p.section, numero: p.numero, prefixe: p.prefixe});
                    const it = (r.parcels || [])[0];
                    if (!it) { toast('Cette parcelle n’est plus dans le cadastre d’aujourd’hui (divisée ou renumérotée ?).', 'error'); b.disabled = false; return; }
                    const full = await get('cadastre_parcel', {id: p.id});
                    const links = full.links.map(l => ({kind: l.kind, id: l.id, txt: l.txt || '', role: l.role, primary: l.primary, from: l.from, to: l.to, note: l.note}));
                    await post('save_cadastre_parcel', {...full.parcel, geometry: it.geometry, surface_m2: it.surface_m2 ?? full.parcel.surface_m2, commune_name: full.parcel.commune || it.commune, source: 'api', links});
                    toast('Contour et surface relus dans le cadastre d’aujourd’hui.', 'success'); changed(); reload?.(); return;
                }
                if (b.matches('[data-cad-dvfgo]')) {
                    const box = root.querySelector('[data-cad-dvf]'); box.innerHTML = UI().spinner('Je lis les ventes de la commune (DVF)…');
                    try {
                        const r = await get('cadastre_dvf', {idu: p.idu});
                        box.innerHTML = r.sales.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Vente</th><th>Prix</th><th>Terrain</th><th>Bâti</th><th>Adresse</th></tr></thead><tbody>${r.sales.map(s => `<tr><td>${esc(s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR') : '')}</td><td>${esc(s.nature_mutation)}</td><td>${s.valeur != null ? esc(Math.round(s.valeur).toLocaleString('fr-FR')) + ' €' : ''}</td><td>${esc([s.nature_culture, s.surface_terrain != null ? fmtN(s.surface_terrain) + ' m²' : ''].filter(Boolean).join(' · '))}</td><td>${esc([s.type_local, s.surface_bati ? fmtN(s.surface_bati) + ' m²' : ''].filter(Boolean).join(' · '))}</td><td>${esc(s.adresse)}</td></tr>`).join('')}</tbody></table></div>
                            <p class="muted small">${esc(r.attribution)} · années lues : ${esc((r.years || []).join(', '))}${!p.nature && r.sales.find(s => s.nature_culture) ? ` · <button type="button" class="link-button" data-cad-dvfnature="${esc(r.sales.find(s => s.nature_culture).nature_culture)}">reprendre la nature « ${esc(r.sales.find(s => s.nature_culture).nature_culture)} »</button>` : ''}</p>`
                            : A().empty(`Aucune vente de cette parcelle depuis ${r.years?.length ? Math.min(...r.years) : 2020}.`, {icon: '💶'});
                    } catch (err) { box.innerHTML = UI().notice('error', err.message); }
                    return;
                }
                if (b.dataset.cadDvfnature) {
                    const full = await get('cadastre_parcel', {id: p.id});
                    await post('save_cadastre_parcel', {...full.parcel, nature: b.dataset.cadDvfnature, links: full.links.map(l => ({kind: l.kind, id: l.id, txt: l.txt || '', role: l.role, primary: l.primary, from: l.from, to: l.to, note: l.note}))});
                    toast('Nature reprise des ventes.', 'success'); changed(); reload?.();
                }
            } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        });
    }

    async function renderSheet(token, id) {
        const ws = A().$('#workspace'); if (!ws || !isCurrent(token)) return;
        ws.innerHTML = `<section class="page cad-page">${UI().spinner('Chargement de la parcelle…')}</section>`;
        let d;
        try { d = await get('cadastre_parcel', {id}); }
        catch (e) { if (!isCurrent(token)) return; S().cadastreId = 0; ws.innerHTML = `<section class="page cad-page">${UI().notice('error', e.message || 'Parcelle introuvable.')}<p><button type="button" class="button secondary" data-cad-back>← Toutes les parcelles</button></p></section>`; ws.querySelector('[data-cad-back]').addEventListener('click', refresh); return; }
        if (!isCurrent(token)) return;
        const p = d.parcel;
        ws.innerHTML = `<section class="page cad-page">${UI().pageHeader({title: `${p.title}${p.commune ? ' · ' + p.commune : ''}`, detail: true, icon: '▦',
            help: esc([p.lieu_dit, surfaceText(p.surface_m2), p.nature, p.address].filter(Boolean).join(' · ') || 'Une parcelle du cadastre.'),
            primary: '<button type="button" class="button" data-cad-editme>✎ Modifier</button>',
            actions: ['<button type="button" class="button secondary" data-cad-back>← Toutes les parcelles</button>'],
            more: ['<button type="button" class="danger" data-cad-delme>🗑 Supprimer</button>']})}${sheetHtml(d)}</section>`;
        const page = ws.querySelector('.cad-page');
        const again = () => renderSheet(++S().workspaceToken, id);
        bindSheet(page, d, {reload: again});
        page.querySelector('[data-cad-back]').addEventListener('click', () => { S().cadastreId = 0; refresh(); });
        page.querySelector('[data-cad-editme]').addEventListener('click', async () => { if (await edit(await get('cadastre_parcel', {id}))) again(); });
        page.querySelector('[data-cad-delme]')?.addEventListener('click', () => remove(p).catch(err => toast(err.message, 'error')));
    }

    /** ↗ Ouvrir : la page dans Listes, ou une fenêtre par-dessus l'outil en cours (maison, menu de choix) */
    async function open(id, {dialog = false} = {}) {
        if (!dialog) { S().cadastreId = Number(id); S().listType = 'cadastre'; return A().setModule('listes'); }
        let d; try { d = await get('cadastre_parcel', {id}); } catch (e) { toast(e.message, 'error'); return; }
        const p = d.parcel;
        let dlgRef = null;
        const reload = async () => { if (!dlgRef?.open) return; try { const nd = await get('cadastre_parcel', {id}); dlgRef.querySelector('.h-dialog-body').innerHTML = sheetHtml(nd, {dialog: true}); d = nd; } catch (_) {} };
        dlgRef = ext.openDialog({eyebrow: 'PARCELLE', title: `${p.title}${p.commune ? ' · ' + p.commune : ''}`, wide: true, body: sheetHtml(d, {dialog: true}),
            onOpen: dg => { dlgRef = dg; bindSheet(dg.querySelector('.h-dialog-body'), d, {reload, dialogEl: dg});
                dg.querySelector('.modal-actions .spacer')?.insertAdjacentHTML('beforebegin', '<button type="button" class="button secondary" data-cad-full>↗ Ouvrir la fiche</button><button type="button" class="button secondary" data-cad-editd>✎ Modifier</button>');
                dg.querySelector('[data-cad-full]').addEventListener('click', () => { dg.close(); document.querySelectorAll('dialog[open]').forEach(x => x.close()); open(id); });
                dg.querySelector('[data-cad-editd]').addEventListener('click', async () => { if (await edit(await get('cadastre_parcel', {id}))) reload(); }); }});
    }

    function showOnMap(p, {oldmap = 0} = {}) {
        if (p.lat) { S().mapCenter = {lat: Number(p.lat), lon: Number(p.lon)}; S().mapZoom = 18; S().mapKeepCenter = true; }
        S().cadLayer = true; lsSet('lcnda-cadastre-layer', true); S().cadFocus = Number(p.id) || 0;
        if (oldmap) S().hOldMapId = oldmap;
        A().setModule('carte');
    }

    ext.lists.cadastre = renderList;

    /* ═════════ 🗺️ Une carte ancienne enregistrée depuis « ＋ Caler un plan ancien » : reliée à la parcelle ═════════ */
    document.addEventListener('lcnda:oldmap-saved', async e => {
        const pre = S()?.hOldMapPrefill, id = Number(e.detail?.id) || 0;
        if (!pre?.parcelId || !id || (pre.mapId && pre.mapId !== id)) return;
        pre.mapId = id;
        try { const r = await post('cadastre_link', {parcel_id: pre.parcelId, kind: 'oldmap', id, on: true}); if (!(r.result || r).already) { toast('Plan relié à la parcelle.'); changed(); } } catch (_) {}
    });

    /* ═════════ La Carte : « ▦ Parcelles du cadastre » et « 📍 Parcelle ici » ═════════ */
    let last = null, pickOn = false, pop = null;
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage) return;
        if (S().cadLayer === undefined) S().cadLayer = !!lsGet('lcnda-cadastre-layer', false);
        const layer = document.createElement('div');
        layer.id = 'cad-layer'; layer.className = 'cad-layer';
        layer.innerHTML = '<div class="cad-layer-tiles"></div><svg class="cad-layer-svg"></svg>';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const ctl = document.createElement('span');
        ctl.className = 'cad-ctl';
        ctl.innerHTML = `<label class="ui-toggle" title="Les parcelles du cadastre d’aujourd’hui (IGN), et les tiennes"><input type="checkbox" data-cad-layer ${S().cadLayer ? 'checked' : ''}><i></i>▦ Parcelles</label><button type="button" class="button small secondary" data-cad-pick aria-pressed="false" title="Clique ensuite sur la carte : la parcelle de cet endroit, à ajouter à ta liste">📍 Parcelle ici</button><small class="muted" data-cad-zhint hidden>zoome pour voir les parcelles</small>`;
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        pickOn = false;
        ctl.querySelector('[data-cad-layer]').addEventListener('change', e => { S().cadLayer = e.target.checked; lsSet('lcnda-cadastre-layer', e.target.checked); A().drawMap?.(); });
        ctl.querySelector('[data-cad-pick]').addEventListener('click', e => { pickOn = !pickOn; e.currentTarget.setAttribute('aria-pressed', String(pickOn)); e.currentTarget.classList.toggle('is-active', pickOn); stage.classList.toggle('is-cad-pick', pickOn); if (pickOn) { if (!S().cadLayer) { S().cadLayer = true; ctl.querySelector('[data-cad-layer]').checked = true; } if (S().mapZoom < 16) toast('Zoome sur l’endroit, puis clique sur la parcelle.'); A().drawMap?.(); } });
        let down = null;
        stage.addEventListener('pointerdown', e => { down = pickOn && !e.target.closest('button,a,input,.cad-pop,.map-tooltip') ? {x: e.clientX, y: e.clientY} : null; });
        stage.addEventListener('pointerup', e => {
            if (!down || !last) return;
            const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4; down = null;
            if (moved) return;
            const r = stage.getBoundingClientRect(), la = A().yToLat(last.top + e.clientY - r.top, last.z), lo = A().xToLng(last.left + e.clientX - r.left, last.z);
            pointPop(stage, la, lo, e.clientX - r.left, e.clientY - r.top);
        });
        stage.addEventListener('click', e => { const g = e.target.closest?.('[data-cad-poly]'); if (g && !pickOn) { const r = stage.getBoundingClientRect(); savedPop(stage, Number(g.dataset.cadPoly), e.clientX - r.left, e.clientY - r.top); } });
        loadAll().then(() => A().drawMap?.()).catch(() => {});
    });
    function closePop() { pop?.remove(); pop = null; }
    function popAt(stage, x, y, html) {
        closePop();
        pop = document.createElement('div'); pop.className = 'cad-pop';
        pop.innerHTML = `<button type="button" class="cad-pop-x icon-button small" aria-label="Fermer">×</button>${html}`;
        pop.style.left = `${Math.max(8, Math.min(stage.clientWidth - 290, x + 12))}px`; pop.style.top = `${Math.max(8, Math.min(stage.clientHeight - 160, y - 20))}px`;
        stage.appendChild(pop);
        pop.addEventListener('pointerdown', e => e.stopPropagation());
        pop.querySelector('.cad-pop-x').addEventListener('click', closePop);
        return pop;
    }
    let found = null;
    async function pointPop(stage, la, lo, x, y) {
        const el = popAt(stage, x, y, UI().spinner('Je cherche la parcelle…'));
        try {
            const r = await get('cadastre_lookup', {mode: 'point', lat: la.toFixed(6), lon: lo.toFixed(6)});
            if (pop !== el) return;
            const it = (r.parcels || [])[0]; found = it ? {...it} : null; A().drawMap?.();
            el.innerHTML = `<button type="button" class="cad-pop-x icon-button small" aria-label="Fermer">×</button>${it ? `<b>▦ ${esc(it.title)}</b><small class="muted">${esc([it.commune, surfaceText(it.surface_m2)].filter(Boolean).join(' · '))}</small>
                <div class="cad-pop-act">${it.existing_id ? `<button type="button" class="button small" data-cad-popopen="${it.existing_id}">↗ Ouvrir ma fiche</button>` : '<button type="button" class="button small" data-cad-popadd>＋ Ajouter cette parcelle</button>'}</div><small class="muted">${esc(ATTR)}</small>` : '<p>Aucune parcelle ici (le cadastre en ligne n’a rien à cet endroit).</p>'}`;
            el.querySelector('.cad-pop-x').addEventListener('click', closePop);
            el.querySelector('[data-cad-popopen]')?.addEventListener('click', () => { closePop(); open(Number(it.existing_id), {dialog: true}); });
            el.querySelector('[data-cad-popadd]')?.addEventListener('click', async () => { closePop(); const res = await edit(null, {parcel: it, insee: it.insee}); found = null; if (res) { await loadAll(true); A().drawMap?.(); open(res.id, {dialog: true}); } });
        } catch (e) { if (pop === el) el.innerHTML = `<button type="button" class="cad-pop-x icon-button small" aria-label="Fermer">×</button>${UI().notice('error', e.message)}`; el.querySelector('.cad-pop-x')?.addEventListener('click', closePop); }
    }
    function savedPop(stage, id, x, y) {
        const it = (cache || []).find(c => Number(c.id) === id); if (!it) return;
        const el = popAt(stage, x, y, `<b>▦ ${esc(it.title)}${it.commune ? ' · ' + esc(it.commune) : ''}</b><small class="muted">${esc([it.lieu_dit, surfaceText(it.surface_m2)].filter(Boolean).join(' · '))}</small>${ownersOf(it).length ? `<small>${esc(ownersOf(it).map(o => o.name).join(', '))}</small>` : ''}<div class="cad-pop-act"><button type="button" class="button small" data-cad-popopen>↗ Ouvrir</button></div>`);
        el.querySelector('[data-cad-popopen]').addEventListener('click', () => { closePop(); open(id, {dialog: true}); });
    }
    ext.mapDraw.push(({left, top, z, width, height}) => {
        last = {left, top, z};
        const layer = document.getElementById('cad-layer'); if (!layer) return;
        const on = !!S().cadLayer;
        layer.querySelector('.cad-layer-tiles').innerHTML = on ? tilesHtml(left, top, width, height, z) : '';
        const svg = layer.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const mine = z >= 12 ? (cache || []).filter(p => p.geometry) : [];
        svg.innerHTML = mine.map(p => `<path class="cad-poly is-mine${Number(S().cadFocus) === Number(p.id) ? ' is-sel' : ''}" data-cad-poly="${p.id}" d="${pathOf(p.geometry, z, left, top)}"><title>${esc(p.title + (p.commune ? ' · ' + p.commune : ''))}</title></path>`).join('')
            + (found?.geometry ? `<path class="cad-poly is-found" d="${pathOf(found.geometry, z, left, top)}"/>` : '');
        const hint = document.querySelector('[data-cad-zhint]'); if (hint) hint.hidden = !(on && z < CAD_MINZ);
    });

    /* ═════════ Les blocs : maison, village (lieu), personne ═════════ */
    function blockRows(items, {mine = true} = {}) {
        return UI().rowsHtml(items.map(it => ({thumb: '<span class="ui-card-ico" aria-hidden="true">▦</span>', name: `${it.title}${it.commune ? ' · ' + it.commune : ''}`, open: `data-cad-bopen="${it.id}"`,
            lines: [mine && it.mine ? [it.mine.role, datesText(it.mine)].filter(Boolean).join(', ') : '', [it.lieu_dit, surfaceText(it.surface_m2), it.nature].filter(Boolean).join(' · '),
                !mine && it.people.length ? it.people.slice(0, 3).map(x => x.name).join(', ') : ''].filter(Boolean)})));
    }
    async function fillHost(host) {
        if (host.dataset.cadDone === '1') return; host.dataset.cadDone = '1';
        const kind = host.dataset.cadHost, id = Number(host.dataset.cadId) || 0, insee = host.dataset.cadInsee || '', name = host.dataset.cadName || '';
        const inHouse = kind === 'house';
        host.innerHTML = inHouse ? UI().spinner('…') : `<section class="maintenance-panel cad-host"><h3>🗺 Parcelles du cadastre</h3>${UI().spinner('Chargement…')}</section>`;
        let items = [];
        try { items = (await get('cadastre_for', {kind, id, insee})).items || []; } catch (e) { host.innerHTML = UI().notice('error', e.message); return; }
        const ro = document.body.classList.contains('is-kiosk');
        const btns = ro ? '' : `<div class="cad-host-btns"><button type="button" class="button small secondary" data-cad-hadd>＋ Ajouter une parcelle</button><span class="cad-host-pk" data-cad-hpk>${P().pickerField({name: 'cad_link', hiddenName: false, kind: 'parcel', placeholder: '🔗 Relier une parcelle de ta liste…'})}</span></div>`;
        const body = (items.length ? blockRows(items, {mine: kind !== 'place'}) : A().empty(kind === 'house' ? 'Aucune parcelle reliée à cette maison' : `Aucune parcelle à ${name || 'cet endroit'}`, {icon: '🗺'})) + btns;
        host.innerHTML = inHouse ? body : `<section class="maintenance-panel cad-host"><h3>🗺 Parcelles du cadastre${items.length ? ` <small>(${items.length})</small>` : ''}</h3>${body}</section>`;
        host.querySelector('[data-cad-hadd]')?.addEventListener('click', async () => {
            const pre = kind === 'house' ? {house: {id, title: name}} : {place: id ? {id, title: name, name} : null, insee, linkPlace: null};
            if (kind === 'house') { const pk = host.closest('dialog, .h-hs-form')?.querySelector('[data-hs-placepk] .pk'), v = pk ? P().pickerValue(pk) : null; if (Number(v)) pre.place = Number(v); } // le lieu de la maison
            const r = await edit(null, pre); if (r) { host.dataset.cadDone = ''; fillHost(host); }
        });
        host.addEventListener('picker-change', async e => {
            const it = e.detail.item; if (!it || e.detail.name !== 'cad_link') return;
            try { await post('cadastre_link', {parcel_id: Number(it.id), kind, id, role: kind === 'house' ? 'la maison' : '', on: true}); toast('Parcelle reliée.'); changed(); host.dataset.cadDone = ''; fillHost(host); } catch (err) { toast(err.message, 'error'); }
        });
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-cad-bopen]'); if (!b || b.closest('.cad-sheet')) return; e.preventDefault(); open(Number(b.dataset.cadBopen), {dialog: true}); });
    const scan = root => root.querySelectorAll?.('[data-cad-host]:not([data-cad-done="1"])').forEach(fillHost);
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-cad-host]')) fillHost(n); else scan(n); } }).observe(document.documentElement, {childList: true, subtree: true});
    document.addEventListener('lcnda:cadastre-changed', () => document.querySelectorAll('[data-cad-host][data-cad-done="1"]').forEach(h => { h.dataset.cadDone = ''; fillHost(h); }));

    // 🏠 Maison → onglet Maison : « 🗺 Parcelles du cadastre »
    ext.housePaneExtras.push(ctx => {
        if (!ctx?.houseId) return '';
        const sec = ctx.sec || ((t, k, b) => `<details class="ui-section" open><summary>${esc(t)}</summary><div class="ui-section-body">${b}</div></details>`);
        return sec('🗺 Parcelles du cadastre', 'h-cad', `<div data-cad-host="house" data-cad-id="${Number(ctx.houseId)}" data-cad-name="${esc(ctx.name || '')}"></div>`, false);
    });

    // 👤 la fiche d'une personne : « 🗺 Propriétaire de… »
    ext.personBlocks.parcels = (index, detail) => {
        const list = detail.heritage?.parcels || [], pid = Number(detail.person?.id) || 0; if (!list.length || !pid) return '';
        const allOwner = list.every(it => it.mine?.primary || /propri|usufr|héritier/i.test(it.mine?.role || ''));
        return A().card(index, allOwner ? '🗺 Propriétaire de…' : '🗺 Parcelles du cadastre', list.length, `<div class="cad-pblock">${blockRows(list)}</div>`, 'span-6');
    };
    const addBlock = () => { const Lb = A()?.defaultPersonBlocks; if (!Array.isArray(Lb) || Lb.some(b => b[0] === 'parcels')) return; const i = Lb.findIndex(b => b[0] === 'houses'); Lb.splice(i < 0 ? Lb.length : i + 1, 0, ['parcels', '🗺 Propriétaire de… (cadastre)']); };
    const addList = () => { const app = A(); if (app?.defaultListTypes && !app.defaultListTypes.some(x => x[0] === 'cadastre')) app.defaultListTypes.push(['cadastre', '25a', '🗺 Cadastre']); };
    addBlock(); addList(); document.addEventListener('DOMContentLoaded', () => { addBlock(); addList(); }, {once: true});

    ext.cadastre = {open, edit, showOnMap, tilesHtml, miniMap, reload: () => loadAll(true), surfaceText, shapeSvg};
})();
