/**
 * 🗺️ Plan des adresses d'une commune : ext.addrMap(boîte, {insee, digestId, year}).
 * Dans un dépouillement (onglet « Plan ») et sur la fiche du village (toutes les années, filtre par année).
 *  - carte qu'on déplace et qu'on zoome : la carte d'aujourd'hui, et par-dessus une carte ancienne (État-major, Cassini,
 *    photos 1950-1965, carte de 1950) avec un curseur de transparence ;
 *  - placement automatique, en local, avec la Base Adresse Nationale du département (téléchargée une fois) ;
 *  - placement à la main (clic sur la carte, ou glisser un point) pour les rues disparues ou renommées ;
 *  - anciens noms de rues (→ nom d'aujourd'hui, ou rue disparue dont on trace le parcours) ;
 *  - en secours, recherche en ligne (Géoplateforme de l'IGN) des adresses restantes.
 * Serveur : lib/addr_map.php.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = value => A().escapeHtml(value ?? '');
    const toast = (...a) => A().toast(...a);
    const get = (action, params = {}) => A().api(action, params);
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const plural = (n, one, many) => `${Number(n || 0).toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
    const pref = (k, d) => { try { const v = JSON.parse(localStorage.getItem('genealogie-addrmap') || '{}'); return v[k] ?? d; } catch (_) { return d; } };
    const setPref = (k, v) => { try { const o = JSON.parse(localStorage.getItem('genealogie-addrmap') || '{}'); o[k] = v; localStorage.setItem('genealogie-addrmap', JSON.stringify(o)); } catch (_) {} };
    // Fonds proposés en premier (réglables dans Apparence) ; tous les autres fonds de l'application suivent, par catégorie
    const OLD_DEFAULT = ['etatmajor', 'cassini', 'cassini_royal', 'ign_scan50_1950', 'ign_ortho_1950', 'ohm'];
    const NOW_DEFAULT = ['osmfr', 'ign_planv2', 'ign_hr_ortho', 'satellite', 'offline'];
    const SHORT = {etatmajor: 'État-major (1820-1866)', cassini: 'Cassini (XVIIIᵉ)', cassini_royal: 'Cassini, exemplaire du roi', ign_scan50_1950: 'Carte IGN de 1950', ign_ortho_1950: 'Photos aériennes 1950-1965', ohm: 'OpenHistoricalMap', osmfr: 'Plan d’aujourd’hui (OSM)', ign_planv2: 'Plan IGN', ign_hr_ortho: 'Photo aérienne actuelle (IGN)', satellite: 'Satellite (Esri)', offline: 'Hors ligne (sans Internet)'};
    const cats = () => A().tileLayerCategories || [];
    const label = k => SHORT[k] || cats().flatMap(c => c.items).find(i => i[0] === k)?.[1] || k;
    const favs = which => { try { const v = JSON.parse(localStorage.getItem(`genealogie-addrmap-${which}`) || 'null'); if (Array.isArray(v) && v.length) return v; } catch (_) {} return which === 'old' ? OLD_DEFAULT : NOW_DEFAULT; };
    const mapOptions = (which, cur) => { const f = favs(which); const opt = (k, l) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`;
        return (which === 'old' ? opt('', 'Aucune') : '') + f.map(k => opt(k, label(k))).join('') + (f.includes(cur) || !cur ? '' : opt(cur, label(cur)))
            + cats().map(c => { const items = c.items.filter(([k]) => !f.includes(k) && k !== cur); return items.length ? `<optgroup label="${esc(c.label)}">${items.map(([k, l]) => opt(k, l)).join('')}</optgroup>` : ''; }).join(''); };
    const PREC = {exact: ['✓', 'Adresse retrouvée telle quelle'], approx: ['≈', 'Numéro disparu : numéro voisin du même côté'], street: ['~', 'Sans numéro : milieu de la rue'], fuzzy: ['?', 'Nom de rue proche : à vérifier'], manual: ['📌', 'Placée à la main'], online: ['🌐', 'Trouvée en ligne']};
    const YEAR_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
    // Web Mercator, tuiles de 256 px (comme le reste de l'application)
    const X = (lon, z) => A().lngToX(lon, z), Y = (lat, z) => A().latToY(lat, z);
    const lonOf = (x, z) => x / (256 * 2 ** z) * 360 - 180;
    const latOf = (y, z) => { const n = Math.PI * (1 - 2 * y / (256 * 2 ** z)); return 180 / Math.PI * Math.atan(Math.sinh(n)); };

    // Fiche du village : le plan se charge quand on ouvre sa section
    document.addEventListener('toggle', e => {
        const d = e.target;
        if (!d.matches?.('details[data-addrmap-host]') || !d.open || d.dataset.loaded) return;
        d.dataset.loaded = '1'; ext.addrMap(d.querySelector('[data-addrmap-box]'), {insee: d.dataset.insee});
    }, true);

    ext.addrMap = async (box, {insee = '', digestId = 0, year = 0} = {}) => {
        box.innerHTML = '<p class="muted">Chargement du plan…</p>';
        let D;
        try { D = await get('addr_map', {insee, digest_id: digestId || ''}); } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
        if (!D.insee) { box.innerHTML = `<div class="maintenance-panel"><p>${esc(D.error || 'Commune inconnue.')}</p></div>`; return; }
        const st = {year: Number(year) || 0, old: pref('old', favs('old')[0]), now: pref('now', favs('now')[0]), opacity: pref('opacity', 70), auto: pref('auto', true), zoom: 16, lat: D.commune.lat ?? 46.6, lon: D.commune.lon ?? 2.4, mode: null, sel: null, draw: null};
        if (st.year && !D.years.includes(st.year)) st.year = 0;
        const yearColor = y => YEAR_COLORS[Math.max(0, D.years.indexOf(Number(y))) % YEAR_COLORS.length];
        const visible = () => D.addresses.filter(a => !st.year || a.years[st.year]);
        const placed = () => visible().filter(a => a.point);
        const W = () => box.querySelector('.h-am-map')?.clientWidth || 800, H = () => box.querySelector('.h-am-map')?.clientHeight || 560;

        // Centre la carte sur les points (sinon sur la commune)
        const fit = () => {
            const pts = placed().map(a => [a.point.lat, a.point.lon]).concat(D.streets.flatMap(s => s.path || []));
            if (!pts.length) { st.zoom = D.commune.lat ? 15 : 6; return; }
            const w = W() - 80, h = H() - 80;
            for (let z = 18; z >= 3; z--) { const xs = pts.map(p => X(p[1], z)), ys = pts.map(p => Y(p[0], z)); if (Math.max(...xs) - Math.min(...xs) <= w && Math.max(...ys) - Math.min(...ys) <= h) { st.zoom = z; break; } }
            const xs = pts.map(p => X(p[1], st.zoom)), ys = pts.map(p => Y(p[0], st.zoom));
            st.lon = lonOf((Math.min(...xs) + Math.max(...xs)) / 2, st.zoom); st.lat = latOf((Math.min(...ys) + Math.max(...ys)) / 2, st.zoom);
        };

        function shell() {
            const b = D.ban;
            const banLine = b.count ? `🏛️ BAN : ${plural(b.count, 'adresse', 'adresses')} d’aujourd’hui pour ${esc(D.commune.name || D.insee)}${b.import?.imported_at ? ` <small class="muted">(lues le ${esc(new Date(b.import.imported_at.replace(' ', 'T')).toLocaleDateString('fr-FR'))})</small>` : ''} <button type="button" class="link-button" data-am-ban="reload" title="Retélécharger le fichier du département (adresses récentes)">↻ mettre à jour</button>`
                : b.file ? `🏛️ Le fichier des adresses du département ${esc(b.dept)} est là : <button type="button" class="button small" data-am-ban="import">Lire les adresses de ${esc(D.commune.name || D.insee)}</button>`
                : `🏛️ Pour placer les adresses automatiquement, sans Internet ensuite : <button type="button" class="button small" data-am-ban="download">📥 Télécharger les adresses du département ${esc(b.dept)} (BAN, une fois)</button>`;
            box.innerHTML = `<div class="h-am">
                <div class="h-am-bar">
                    <label>Année <select data-am-year><option value="0">Toutes (${D.years.length})</option>${D.years.map(y => `<option value="${y}" ${st.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
                    <label>Carte ancienne <select data-am-old>${mapOptions('old', st.old)}</select></label>
                    <label class="h-am-op" title="0 : la carte d’aujourd’hui ; 100 : la carte ancienne">Ancienne <input type="range" min="0" max="100" value="${st.opacity}" data-am-op> Aujourd’hui</label>
                    <label>Aujourd’hui <select data-am-now>${mapOptions('now', st.now)}</select></label>
                </div>
                <div class="h-am-bar is-ban">${banLine}
                    <span class="h-am-actions"><label class="checkbox-line" title="Placer tout seul les nouvelles adresses à l’ouverture du plan"><input type="checkbox" data-am-auto ${st.auto ? 'checked' : ''}> placement automatique</label>
                    <button type="button" class="button small secondary" data-am-place ${b.count ? '' : 'disabled'} title="Placer les adresses pas encore placées (les points posés à la main ne bougent jamais)">📍 Placer</button>
                    <button type="button" class="button small secondary" data-am-online title="Chercher sur Internet (IGN) les adresses qui restent à placer">🌐 En ligne</button>
                    <button type="button" class="button small secondary" data-am-streets>🛣️ Anciens noms de rues${D.streets.length ? ` <small>${D.streets.length}</small>` : ''}</button></span></div>
                <div class="h-am-main"><div class="h-am-map" tabindex="0"><div class="h-am-tiles is-now"></div><div class="h-am-tiles is-old"></div><svg class="h-am-svg"></svg>
                        <div class="h-am-zoom"><button type="button" data-am-z="1" title="Zoomer">＋</button><button type="button" data-am-z="-1" title="Dézoomer">−</button><button type="button" data-am-fit title="Voir toutes les adresses">⤢</button></div>
                        <div class="h-am-banner" hidden></div><div class="h-am-pop" hidden></div>
                        <div class="h-am-legend"></div></div>
                    <aside class="h-am-side"></aside></div></div>`;
            bindShell();
        }

        /* ─── Carte : tuiles + points + rues anciennes ─── */
        function draw() {
            const map = box.querySelector('.h-am-map'); if (!map) return;
            const w = W(), h = H(), z = st.zoom, cx = X(st.lon, z), cy = Y(st.lat, z), left = cx - w / 2, top = cy - h / 2, world = 2 ** z;
            const tiles = bg => { if (!bg) return ''; let out = ''; for (let tx = Math.floor(left / 256); tx <= Math.floor((left + w) / 256); tx++) for (let ty = Math.floor(top / 256); ty <= Math.floor((top + h) / 256); ty++) { if (ty < 0 || ty >= world) continue; out += `<img draggable="false" referrerpolicy="no-referrer" alt="" src="${A().mapTileUrl(bg, z, ((tx % world) + world) % world, ty)}" style="left:${Math.round(tx * 256 - left)}px;top:${Math.round(ty * 256 - top)}px">`; } return out; };
            map.querySelector('.is-now').innerHTML = tiles(st.now);
            const old = map.querySelector('.is-old'); old.innerHTML = tiles(st.old); old.style.opacity = st.old ? (100 - st.opacity) / 100 : 0;
            const px = (lat, lon) => [X(lon, z) - left, Y(lat, z) - top];
            const svg = map.querySelector('svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            const paths = D.streets.filter(s => (s.path || []).length > 1).map(s => { const pts = s.path.map(p => px(p[0], p[1]).map(v => v.toFixed(1)).join(',')).join(' '); const [lx, ly] = px(...s.path[Math.floor(s.path.length / 2)]);
                return `<g class="h-am-street"><polyline points="${pts}" fill="none" stroke="#7b4a1e" stroke-width="6" stroke-opacity=".35" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="#7b4a1e" stroke-width="2.5" stroke-dasharray="7 5"/><text x="${lx.toFixed(1)}" y="${(ly - 9).toFixed(1)}" class="h-am-streetlabel">${esc(s.old_name)}${s.status === 'gone' ? ' (disparue)' : ''}</text></g>`; }).join('');
            const drawing = st.draw ? `<polyline points="${st.draw.path.map(p => px(p[0], p[1]).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#c0392b" stroke-width="3"/>${st.draw.path.map(p => { const [x, y] = px(p[0], p[1]); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#c0392b"/>`; }).join('')}` : '';
            // plusieurs adresses au même endroit : un léger décalage pour les voir toutes
            const seen = new Map();
            const marks = placed().map(a => {
                let [x, y] = px(a.point.lat, a.point.lon); const k = `${Math.round(x)}:${Math.round(y)}`, n = seen.get(k) || 0; seen.set(k, n + 1); if (n) { x += 9 * Math.cos(n * 2.4); y += 9 * Math.sin(n * 2.4); }
                const ys = Object.keys(a.years), col = st.year ? yearColor(st.year) : ys.length > 1 ? '#333' : yearColor(ys[0]), warn = ['fuzzy', 'street', 'approx'].includes(a.point.precision);
                return `<g class="h-am-pt ${st.sel === a.key ? 'is-sel' : ''}" data-am-key="${esc(a.key)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc([a.house, a.street].filter(Boolean).join(' '))} — ${esc(PREC[a.point.precision]?.[1] || '')}</title>
                    <circle r="${a.house ? 11 : 8}" fill="${col}" stroke="${warn ? '#f1c40f' : '#fff'}" stroke-width="${warn ? 3 : 2}" ${a.point.source === 'manual' ? 'stroke-dasharray="3 2"' : ''}/>${a.house ? `<text text-anchor="middle" dy="4">${esc(String(a.house).replace(/\s+/g, '').slice(0, 4))}</text>` : ''}</g>`;
            }).join('');
            svg.innerHTML = paths + marks + drawing;
            map.querySelector('.h-am-legend').innerHTML = st.year ? '' : D.years.map(y => `<span><i style="background:${yearColor(y)}"></i>${y}</span>`).join('') + (D.years.length > 1 ? '<span><i style="background:#333"></i>plusieurs années</span>' : '');
        }

        /* ─── Liste des adresses, rue par rue ─── */
        function side() {
            const list = visible(), byStreet = new Map();
            list.forEach(a => { const k = a.street_key || '—'; if (!byStreet.has(k)) byStreet.set(k, []); byStreet.get(k).push(a); });
            const todo = list.filter(a => !a.point).length;
            const al = new Map(D.streets.map(s => [s.old_name.toLowerCase(), s]));
            box.querySelector('.h-am-side').innerHTML = `<p class="h-am-count"><b>${plural(list.length, 'adresse', 'adresses')}</b>${st.year ? ` en ${st.year}` : ''} · ${plural(list.length - todo, 'placée', 'placées')}${todo ? ` · <b class="h-rc-warn">${todo} à placer</b>` : ''}</p>
                ${!list.length ? '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucune adresse relevée : dans les pages du dépouillement, remplis les colonnes « N° » et « Rue » des foyers.</span></p>' : ''}
                ${[...byStreet.entries()].sort((a, b) => (a[1][0].street || '').localeCompare(b[1][0].street || '', 'fr')).map(([k, as]) => { const s = as[0], alias = D.streets.find(x => x.old_name && x.old_name.toLowerCase() === (s.street || '').toLowerCase()) || al.get((s.street || '').toLowerCase());
                    return `<section class="h-am-st"><h4>${esc(s.street || 'Rue non précisée')}${s.street_status === 'renamed' && s.current_name ? ` <small class="h-rc-chip" title="Nom d’aujourd’hui">→ ${esc(s.current_name)}</small>` : ''}${s.street_status === 'gone' ? ' <small class="h-rc-chip is-gone">disparue</small>' : ''}
                        ${s.street ? `<button type="button" class="icon-button" data-am-alias="${esc(s.street)}" title="Ancien nom, nom d’aujourd’hui, rue disparue…">✎</button>` : ''}</h4>
                        <ul>${as.sort((a, b) => (parseInt(a.house, 10) || 0) - (parseInt(b.house, 10) || 0)).map(a => { const p = a.point, pr = p ? PREC[p.precision] || PREC.exact : null, ys = Object.keys(a.years);
                            return `<li class="${st.sel === a.key ? 'is-sel' : ''} ${p ? '' : 'is-todo'}" data-am-li="${esc(a.key)}"><button type="button" class="link-button" data-am-go="${esc(a.key)}">${a.house ? `n° ${esc(a.house)}` : 'sans n°'}</button>
                                <small class="muted">${ys.map(y => `<b style="color:${yearColor(y)}">${esc(y)}</b> ${a.years[y].length}🏠`).join(' · ')}</small>
                                <span class="h-am-prec" title="${esc(pr?.[1] || 'Pas encore placée')}">${pr ? pr[0] : '⚠'}</span>
                                <button type="button" class="icon-button" data-am-hand="${esc(a.key)}" title="Placer à la main : clique ensuite sur la carte">✋</button>${p ? `<button type="button" class="icon-button" data-am-unplace="${esc(a.key)}" title="Retirer le point">✕</button>` : ''}</li>`; }).join('')}</ul></section>`; }).join('')}`;
            box.querySelectorAll('[data-am-go]').forEach(b => b.addEventListener('click', () => { const a = byKey(b.dataset.amGo); st.sel = a.key; if (a.point) { st.lat = a.point.lat; st.lon = a.point.lon; st.zoom = Math.max(st.zoom, 17); draw(); popup(a); } else startHand(a); side(); }));
            box.querySelectorAll('[data-am-hand]').forEach(b => b.addEventListener('click', () => startHand(byKey(b.dataset.amHand))));
            box.querySelectorAll('[data-am-unplace]').forEach(b => b.addEventListener('click', async () => { const a = byKey(b.dataset.amUnplace); await post('save_addr_point', {insee: D.insee, street_key: a.street_key, house_key: a.house_key, lat: ''}); a.point = null; draw(); side(); }));
            box.querySelectorAll('[data-am-alias]').forEach(b => b.addEventListener('click', () => streetDialog(b.dataset.amAlias)));
        }
        const byKey = k => D.addresses.find(a => a.key === k);

        /* ─── Bulle d'une adresse : les foyers, année par année ─── */
        function popup(a) {
            const pop = box.querySelector('.h-am-pop'); if (!a?.point) { pop.hidden = true; return; }
            const w = W(), h = H(), z = st.zoom, x = X(a.point.lon, z) - X(st.lon, z) + w / 2, y = Y(a.point.lat, z) - Y(st.lat, z) + h / 2;
            const ys = Object.keys(a.years).filter(y => !st.year || Number(y) === st.year);
            pop.innerHTML = `<button type="button" class="icon-button h-am-popx" data-am-popx>✕</button><b>${esc([a.house, a.street].filter(Boolean).join(' '))}</b>${a.street_status === 'renamed' && a.current_name ? `<br><small class="muted">aujourd’hui : ${esc(a.current_name)}</small>` : ''}
                <br><small class="muted">${esc(PREC[a.point.precision]?.[1] || '')}</small>
                ${ys.map(y => `<div class="h-am-popy"><b style="color:${yearColor(y)}">${esc(y)}</b>${a.years[y].map(hh => `<div><button type="button" class="link-button" data-open-depouillement="${hh.digest_id}" data-depouillement-page="${esc(hh.page)}">Foyer ${esc(hh.household || '?')} · p. ${esc(hh.page || '?')}</button> : ${hh.people.map(p => p.person_id ? `<a href="#" data-am-person="${p.person_id}">${esc(p.name)}</a>` : esc(p.name)).join(', ')}</div>`).join('')}</div>`).join('')}
                <small class="muted">Glisse le point pour le déplacer.</small>`;
            pop.style.left = Math.min(w - 290, Math.max(6, x + 14)) + 'px'; pop.style.top = Math.min(h - 40, Math.max(6, y - 20)) + 'px'; pop.hidden = false;
            pop.querySelector('[data-am-popx]').addEventListener('click', () => { pop.hidden = true; st.sel = null; draw(); side(); });
            pop.querySelectorAll('[data-am-person]').forEach(l => l.addEventListener('click', e => { e.preventDefault(); A().state.currentPersonId = Number(l.dataset.amPerson); A().setModule('personnes'); }));
        }
        const banner = text => { const b = box.querySelector('.h-am-banner'); if (!b) return; b.hidden = !text; b.innerHTML = text || ''; b.querySelector('[data-am-cancel]')?.addEventListener('click', () => { st.mode = null; st.draw = null; banner(''); draw(); }); b.querySelector('[data-am-drawok]')?.addEventListener('click', finishDraw); b.querySelector('[data-am-drawundo]')?.addEventListener('click', () => { st.draw.path.pop(); draw(); }); };
        function startHand(a) { st.mode = {hand: a}; st.sel = a.key; banner(`✋ Clique sur la carte à l’endroit du <b>${esc([a.house, a.street].filter(Boolean).join(' '))}</b> (choisis une carte ancienne et règle la transparence pour retrouver la maison). <button type="button" class="link-button" data-am-cancel>Annuler</button>`); box.querySelector('.h-am-map').classList.add('is-placing'); side(); }
        async function placeAt(a, lat, lon, source = 'manual', precision = '') {
            await post('save_addr_point', {insee: D.insee, street_key: a.street_key, house_key: a.house_key, street: a.street, house: a.house, lat, lon, source, precision});
            a.point = {lat, lon, source, precision: source === 'manual' ? 'manual' : precision || 'exact'};
        }

        /* ─── Déplacer, zoomer, cliquer, glisser un point, tracer ─── */
        function bindMap() {
            const map = box.querySelector('.h-am-map');
            let drag = null;
            const at = e => { const r = map.getBoundingClientRect(), z = st.zoom; return {x: e.clientX - r.left, y: e.clientY - r.top, lat: latOf(Y(st.lat, z) + (e.clientY - r.top) - H() / 2, z), lon: lonOf(X(st.lon, z) + (e.clientX - r.left) - W() / 2, z)}; };
            map.addEventListener('pointerdown', e => {
                if (e.button !== 0 || e.target.closest('.h-am-zoom, .h-am-pop, .h-am-banner')) return;
                const g = e.target.closest('[data-am-key]');
                const pt = g && !st.mode && !st.draw ? byKey(g.dataset.amKey) : null; // en traçant ou en plaçant, glisser déplace la carte
                drag = {x0: e.clientX, y0: e.clientY, lat0: st.lat, lon0: st.lon, point: pt, orig: pt?.point ? {...pt.point} : null, moved: false};
                map.setPointerCapture(e.pointerId);
            });
            map.addEventListener('pointermove', e => {
                if (!drag) return;
                const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
                if (!drag.moved && Math.hypot(dx, dy) < 4) return;
                drag.moved = true;
                if (drag.point && !st.mode) { const p = at(e); drag.point.point = {...drag.point.point, lat: p.lat, lon: p.lon}; draw(); return; }
                const z = st.zoom; st.lon = lonOf(X(drag.lon0, z) - dx, z); st.lat = latOf(Y(drag.lat0, z) - dy, z); draw();
            });
            map.addEventListener('pointerup', async e => {
                const d = drag; drag = null; if (!d) return;
                if (d.moved && d.point && !st.mode) { const p = at(e); try { await placeAt(d.point, p.lat, p.lon); toast('Point déplacé (placé à la main).'); } catch (err) { d.point.point = d.orig; toast(err.message, 'error'); } draw(); side(); popup(d.point); return; }
                if (d.moved) return;
                const p = at(e);
                if (st.mode?.hand) { const a = st.mode.hand; st.mode = null; map.classList.remove('is-placing'); banner(''); try { await placeAt(a, p.lat, p.lon); toast('Adresse placée.'); } catch (err) { toast(err.message, 'error'); } draw(); side(); popup(a); return; }
                if (st.draw) { st.draw.path.push([+p.lat.toFixed(7), +p.lon.toFixed(7)]); draw(); return; }
                if (d.point) { st.sel = d.point.key; draw(); side(); popup(d.point); box.querySelector(`[data-am-li="${CSS.escape(d.point.key)}"]`)?.scrollIntoView({block: 'nearest'}); }
                else { box.querySelector('.h-am-pop').hidden = true; }
            });
            map.addEventListener('wheel', e => { e.preventDefault(); const p = at(e), dz = e.deltaY < 0 ? 1 : -1, z = Math.max(3, Math.min(19, st.zoom + dz)); if (z === st.zoom) return;
                // le point sous la souris reste sous la souris
                st.zoom = z; st.lon = lonOf(X(p.lon, z) - (p.x - W() / 2), z); st.lat = latOf(Y(p.lat, z) - (p.y - H() / 2), z); box.querySelector('.h-am-pop').hidden = true; draw(); }, {passive: false});
            map.querySelectorAll('[data-am-z]').forEach(b => b.addEventListener('click', () => { st.zoom = Math.max(3, Math.min(19, st.zoom + Number(b.dataset.amZ))); box.querySelector('.h-am-pop').hidden = true; draw(); }));
            map.querySelector('[data-am-fit]').addEventListener('click', () => { fit(); draw(); });
            map.addEventListener('keydown', e => { if (e.key === 'Escape' && (st.mode || st.draw)) { st.mode = null; st.draw = null; map.classList.remove('is-placing'); banner(''); draw(); } });
            new ResizeObserver(() => draw()).observe(map);
        }

        function bindShell() {
            const q = s => box.querySelector(s);
            q('[data-am-year]').addEventListener('change', e => { st.year = Number(e.target.value); q('.h-am-pop').hidden = true; draw(); side(); });
            q('[data-am-old]').addEventListener('change', e => { st.old = e.target.value; setPref('old', st.old); draw(); });
            q('[data-am-now]').addEventListener('change', e => { st.now = e.target.value; setPref('now', st.now); draw(); });
            q('[data-am-op]').addEventListener('input', e => { st.opacity = Number(e.target.value); setPref('opacity', st.opacity); q('.is-old').style.opacity = st.old ? (100 - st.opacity) / 100 : 0; });
            q('[data-am-auto]').addEventListener('change', e => { st.auto = e.target.checked; setPref('auto', st.auto); });
            q('[data-am-place]').addEventListener('click', e => autoPlace(e.shiftKey));
            q('[data-am-online]').addEventListener('click', online);
            q('[data-am-streets]').addEventListener('click', () => streetDialog(''));
            box.querySelectorAll('[data-am-ban]').forEach(b => b.addEventListener('click', () => ban(b.dataset.amBan)));
            bindMap();
        }

        async function reload(keepView = true) {
            const v = {lat: st.lat, lon: st.lon, zoom: st.zoom};
            D = await get('addr_map', {insee: D.insee});
            shell(); if (keepView) Object.assign(st, v); else fit(); draw(); side();
        }
        async function ban(kind) {
            const b = box.querySelector('.is-ban');
            try {
                if (kind === 'import') { b.innerHTML = '⏳ Lecture des adresses de la commune…'; const r = await post('addr_ban_import', {insee: D.insee}); const o = r.result || r; toast(o.warning || `${plural(o.imported, 'adresse', 'adresses')} lues · ${plural(o.placed || 0, 'adresse placée', 'adresses placées')}.`, o.warning ? 'error' : undefined); }
                else { b.innerHTML = `⏳ Téléchargement des adresses du département ${esc(D.ban.dept)} (adresse.data.gouv.fr)… cela peut prendre une minute.`; const r = await post('addr_ban_download', {dept: D.ban.dept, insee: D.insee}); const o = r.result || r; toast(`Adresses du département téléchargées (${Math.round(o.size / 1048576)} Mo) · ${plural(o.imported || 0, 'adresse', 'adresses')} pour la commune · ${plural(o.placed || 0, 'adresse placée', 'adresses placées')}.`); }
            } catch (e) { toast(e.message, 'error'); }
            reload(false);
        }
        async function autoPlace(force = false) {
            try { const r = await post('addr_auto_place', {insee: D.insee, force: force ? 1 : 0}); const o = r.result || r; toast(`${plural(o.placed, 'adresse placée', 'adresses placées')}${o.left ? ` · ${o.left} à placer à la main` : ''}.`); } catch (e) { toast(e.message, 'error'); }
            reload(!force);
        }
        /** Secours en ligne : Géoplateforme de l'IGN (même service que la BAN), pour les adresses qui restent. */
        async function online() {
            const todo = D.addresses.filter(a => !a.point && a.street_status !== 'gone');
            if (!todo.length) { toast('Toutes les adresses sont placées.'); return; }
            if (!await A().confirmBox(`Chercher en ligne ${plural(todo.length, 'adresse', 'adresses')} (service de l’IGN, Internet nécessaire) ?\n\nLes rues disparues ne seront pas trouvées : place-les à la main.`, {title: 'Chercher en ligne', okLabel: 'Chercher en ligne'})) return;
            let ok = 0;
            for (const a of todo) {
                const name = a.street_status === 'renamed' && a.current_name ? a.current_name : a.street;
                try {
                    const u = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent([a.house, name].filter(Boolean).join(' '))}&citycode=${encodeURIComponent(D.insee)}&limit=1${a.house ? '' : '&type=street'}`;
                    const res = await fetch(u); const j = await res.json(); const f = j.features?.[0];
                    if (f && f.properties?.score >= 0.5) { const [lon, lat] = f.geometry.coordinates; await placeAt(a, lat, lon, 'online', f.properties.type === 'housenumber' ? 'exact' : 'street'); ok++; }
                } catch (_) { toast('Pas de réponse du service en ligne : vérifie la connexion à Internet.', 'error'); break; }
            }
            toast(`${plural(ok, 'adresse trouvée', 'adresses trouvées')} en ligne${todo.length - ok ? ` · ${todo.length - ok} à placer à la main` : ''}.`);
            draw(); side();
        }

        /* ─── Anciens noms de rues ─── */
        function streetDialog(name) {
            const cur = D.streets.find(s => s.old_name.toLowerCase() === (name || '').toLowerCase());
            const oldNames = [...new Set(D.addresses.map(a => a.street).filter(Boolean))];
            ext.openDialog({eyebrow: 'ANCIENS NOMS DE RUES', title: name ? `« ${name} »` : `Rues de ${D.commune.name || D.insee}`, wide: true, submitLabel: 'Enregistrer',
                body: `${D.streets.length ? `<table class="data-table h-am-ststable"><thead><tr><th>Nom dans le document</th><th>Aujourd’hui</th><th></th></tr></thead><tbody>${D.streets.map(s => `<tr><td>${esc(s.old_name)}${s.year_from || s.year_to ? ` <small class="muted">${esc([s.year_from, s.year_to].filter(Boolean).join('–'))}</small>` : ''}</td><td>${s.status === 'gone' ? `<span class="h-rc-chip is-gone">disparue</span>${(s.path || []).length > 1 ? ' tracée' : ''}` : s.status === 'same' ? 'même nom' : esc(s.current_name || '—')}</td><td><button type="button" class="link-button" data-am-sedit="${esc(s.old_name)}">modifier</button></td></tr>`).join('')}</tbody></table><hr>` : ''}
                    <div class="form-grid"><label>Nom dans le document<input name="old_name" list="h-am-oldnames" value="${esc(cur?.old_name || name || '')}" required placeholder="rue Haute"></label>
                        <label>Ce qu’elle est devenue<select name="status"><option value="renamed" ${cur?.status !== 'gone' && cur?.status !== 'same' ? 'selected' : ''}>Renommée</option><option value="gone" ${cur?.status === 'gone' ? 'selected' : ''}>Disparue (détruite, devenue champ…)</option><option value="same" ${cur?.status === 'same' ? 'selected' : ''}>Même nom aujourd’hui</option></select></label>
                        <label data-am-cur>Nom d’aujourd’hui<input name="current_name" list="h-am-curnames" value="${esc(cur?.current_name || '')}" placeholder="rue Paul Doumer"></label>
                        <label>De (année)<input name="year_from" value="${esc(cur?.year_from || '')}" placeholder="1850"></label><label>À (année)<input name="year_to" value="${esc(cur?.year_to || '')}" placeholder="1950"></label>
                        <label class="span-2">Note<input name="note" value="${esc(cur?.note || '')}" placeholder="Détruite pour la voie ferrée ; renommée en 1919…"></label></div>
                    <datalist id="h-am-oldnames">${oldNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                    <datalist id="h-am-curnames">${D.current_streets.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
                    <p class="muted">${D.current_streets.length ? `${D.current_streets.length} rues d’aujourd’hui connues (BAN).` : 'Télécharge la BAN pour avoir la liste des rues d’aujourd’hui.'} Une rue disparue se trace sur la carte après l’enregistrement.</p>
                    ${cur?.status === 'gone' ? `<p><button type="button" class="button small secondary" data-am-trace>✏️ ${(cur.path || []).length > 1 ? 'Retracer' : 'Tracer'} la rue sur la carte</button></p>` : ''}`,
                onOpen: d => {
                    const sync = () => { d.querySelector('[data-am-cur]').hidden = d.querySelector('[name=status]').value !== 'renamed'; };
                    d.querySelector('[name=status]').addEventListener('change', sync); sync();
                    d.querySelectorAll('[data-am-sedit]').forEach(b => b.addEventListener('click', () => { d.close(); streetDialog(b.dataset.amSedit); }));
                    d.querySelector('[data-am-trace]')?.addEventListener('click', () => { d.close(); startDraw(cur); });
                },
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form));
                    const r = await post('save_addr_street', {insee: D.insee, ...f, path: cur?.path || []}); const o = r.result || r;
                    toast(`Rue enregistrée${o.placed ? ` · ${plural(o.placed, 'adresse replacée', 'adresses replacées')}` : ''}.`);
                    await reload();
                    if (f.status === 'gone' && !(cur?.path || []).length && await A().confirmBox('Tracer maintenant le parcours de cette rue disparue sur la carte ?', {title: 'Rue disparue', okLabel: 'Tracer le parcours', cancelLabel: 'Plus tard'})) startDraw(D.streets.find(s => s.old_name.toLowerCase() === f.old_name.toLowerCase()));
                },
                onDelete: cur ? async () => { if (!await A().confirmBox(`Oublier « ${cur.old_name} » ?`, {title: 'Oublier cette rue', okLabel: 'Oublier la rue'})) return false; await post('save_addr_street', {insee: D.insee, old_name: cur.old_name, delete: 1}); await reload(); } : null,
            });
        }
        function startDraw(s) {
            if (!s) return;
            st.draw = {street: s, path: []};
            banner(`✏️ Clique sur la carte, point après point, le long de <b>${esc(s.old_name)}</b> (une carte ancienne aide). <button type="button" class="button small" data-am-drawok>Terminer</button> <button type="button" class="link-button" data-am-drawundo>Retirer le dernier point</button> <button type="button" class="link-button" data-am-cancel>Annuler</button>`);
            draw();
        }
        async function finishDraw() {
            const d = st.draw; if (!d) return;
            if (d.path.length < 2) { toast('Mets au moins deux points.', 'error'); return; }
            try { await post('save_addr_street', {insee: D.insee, old_name: d.street.old_name, status: d.street.status, current_name: d.street.current_name, note: d.street.note, year_from: d.street.year_from, year_to: d.street.year_to, path: d.path}); }
            catch (e) { toast(e.message, 'error'); return; } // le tracé reste : on peut réessayer
            st.draw = null; banner(''); toast('Rue tracée.'); reload();
        }

        // Ouverture : placement automatique (en local) des nouvelles adresses, puis la carte
        if (st.auto && D.ban.count && D.addresses.some(a => !a.point && a.street_status !== 'gone')) {
            try { await post('addr_auto_place', {insee: D.insee}); D = await get('addr_map', {insee: D.insee}); } catch (_) {}
        }
        shell(); fit(); draw(); side();
    };

    /* ─── Apparence : fonds proposés en premier dans le plan du recensement ─── */
    ext.designPanels = ext.designPanels || [];
    ext.afterDesign = ext.afterDesign || [];
    ext.designPanels.push(() => {
        const part = (which, title, help) => { const on = favs(which);
            return `<h4>${title}</h4><p class="muted">${help}</p>${cats().map(c => `<details ${c.items.some(([k]) => on.includes(k)) ? 'open' : ''}><summary>${esc(c.label)}</summary><div class="h-village-maps-grid">${c.items.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-am-fav="${which}" value="${esc(k)}" ${on.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></details>`).join('')}`; };
        return `<section class="person-block-config" id="h-addrmap-config"><header><span class="eyebrow">PLAN DU RECENSEMENT</span><h3>Fonds de carte du plan des adresses</h3><p>Dépouillements (onglet « Plan ») et fiche d’un village : les fonds cochés viennent en premier dans les menus ; le premier coché est celui de départ. Tous les autres restent dans les menus, par catégorie.</p></header>
            ${part('old', '🕰️ Carte ancienne (par-dessus)', 'Cassini, État-major, cartes et photos de 1950…')}${part('now', '🗺️ Aujourd’hui (dessous)', 'Plan, photo aérienne, carte hors ligne…')}
            <p><button type="button" class="link-button" data-am-favreset>↺ Remettre comme au départ</button></p></section>`;
    });
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-addrmap-config');
        if (!box) return;
        const save = (which, list) => { try { localStorage.setItem(`genealogie-addrmap-${which}`, JSON.stringify(list)); } catch (_) {} };
        box.addEventListener('change', e => {
            const which = e.target.dataset.amFav; if (!which) return;
            const list = favs(which).filter(k => k !== e.target.value);
            if (e.target.checked) list.push(e.target.value);
            if (!list.length) { e.target.checked = true; toast('Garde au moins un fond.', 'error'); return; }
            save(which, list); toast('Fonds du plan des adresses enregistrés.');
        });
        box.querySelector('[data-am-favreset]').addEventListener('click', () => { save('old', OLD_DEFAULT); save('now', NOW_DEFAULT); box.querySelectorAll('[data-am-fav]').forEach(i => { i.checked = (i.dataset.amFav === 'old' ? OLD_DEFAULT : NOW_DEFAULT).includes(i.value); }); toast('Fonds de départ remis.'); });
    });
})();
