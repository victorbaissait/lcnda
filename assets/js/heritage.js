/**
 * Fiches « patrimoine » de LCNDA (serveur : lib/heritage.php, structure n°9) :
 *  🚢 départs (voyages, émigration) · 👶 enfants placés · 🛡️ armoiries · 🎖️ poilus et journaux de marche
 *  🚗 circuits « sur les traces de mes ancêtres » · 🗄️ papiers de famille · 🗺️ cartes anciennes posées sur la carte
 *  🔎 recherches enregistrées · 📊 prénoms comparés à la France, richesse d'après les inventaires après décès
 *  👨‍👩‍👧 export GEDCOM d'une seule branche · 🛟 copie hors de cet ordinateur
 *
 * Chargé juste après assets/js/app.js, qui lui prête ses outils (window.LCNDA_APP) et appelle ce qui est déclaré
 * dans window.LCNDA_EXT (blocs de fiche, widgets, listes, statistiques, carte, export).
 * Les blocs Départs, Enfant placé, Blason et Poilu ne s'affichent que si la case correspondante est cochée dans
 * IDENTITÉ → Modifier la personne (comme « Artiste »).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'dashboard', 'lists', 'graphStats']) ext[key] = ext[key] || {};
    for (const key of ['afterPerson', 'mapDraw', 'mapSetup', 'exportPanels', 'afterExport']) ext[key] = ext[key] || [];

    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const LP = (type, labels) => window.LCNDA_EXT?.labelsPicker?.(type, labels) || ''; // étiquettes (heritage-more.js)
    const LC = labels => window.LCNDA_EXT?.labelChips?.(labels) || '';
    const toast = (...args) => A().toast(...args);
    const empty = text => A().empty(text);
    const card = (...args) => A().card(...args);
    const S = () => A().state;
    const fmt = (n, d = 0) => Number(n || 0).toLocaleString('fr-FR', {maximumFractionDigits: d});
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const personLink = (id, name, extra = '') => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>${extra ? ` <small>${esc(extra)}</small>` : ''}` : esc(name || '');
    const chip = person => person ? A().personChip(person) : '';
    const designBg = () => { try { return A().mapBackgroundValue(JSON.parse(localStorage.getItem('genealogie-design') || '{}').mapBackground); } catch (_) { return 'bw'; } };
    const today = () => new Date().toISOString().slice(0, 10);
    const dateFr = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value || '');
        return new Date(value + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'});
    };
    const yearOf = text => Number(String(text || '').match(/(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/)?.[1] || 0) || null;

    /* ─── Petits outils partagés ─────────────────────────────────────── */

    // Liens vers une fiche personne (délégué : marche partout, même dans les widgets et les fenêtres)
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-person]');
        if (!b) return;
        event.preventDefault();
        document.querySelectorAll('dialog.h-modal[open]').forEach(d => d.close());
        S().currentPersonId = Number(b.dataset.hPerson);
        A().setModule('personnes');
    });
    // Ouvrir une liste (Listes → …)
    function openList(type) { S().listType = type; S().precisePlaceKey = ''; A().setModule('listes'); }
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-open-list]');
        if (!b) return;
        event.preventDefault();
        if (b.dataset.hEdit !== undefined) S().hEdit = {list: b.dataset.hOpenList, id: Number(b.dataset.hEdit) || 0, personId: Number(b.dataset.hPersonId) || 0};
        openList(b.dataset.hOpenList);
    });

    // Visionneuse : les médias affichés sont gardés ici, par groupe
    const mediaGroups = {};
    function thumbs(groupKey, items, options = {}) {
        if (!items?.length) return options.emptyText ? `<small class="muted">${esc(options.emptyText)}</small>` : '';
        mediaGroups[groupKey] = items;
        return `<div class="h-thumbs">${items.map((m, i) => `<button type="button" class="h-thumb" data-h-lightbox="${esc(groupKey)}" data-h-index="${i}" title="${esc(m.title || '')}">${A().mediaThumbHtml(m)}</button>`).join('')}</div>`;
    }
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-lightbox]');
        if (!b) return;
        const items = mediaGroups[b.dataset.hLightbox] || [];
        if (items.length) A().openLightbox(items, Number(b.dataset.hIndex) || 0, true);
    });

    /** Envoi de fichiers rattachés à une fiche (voyage, placement, blason…), avec leur rôle. */
    async function uploadFiles(type, id, files, role = '') {
        if (!files?.length || !id) return 0;
        const fd = new FormData();
        fd.append('collection_type', type); fd.append('collection_id', id); fd.append('collection_role', role); fd.append('csrf', S().csrf);
        [...files].forEach(file => fd.append('files[]', file));
        const response = await fetch('upload.php', {method: 'POST', body: fd});
        const result = await response.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!response.ok || result.error) throw new Error(result.error || 'Import impossible');
        return (result.media || []).length;
    }

    /**
     * Zone « fichiers » d'un formulaire : vignettes déjà rattachées (avec ✕ pour retirer), envoi de nouveaux fichiers
     * pour chaque rôle, et lien vers un média déjà dans l'application (ex. le scan d'un acte).
     */
    function mediaEditorHtml(type, id, media = [], roles = [['', 'Photos et documents']]) {
        return `<div class="h-media-editor" data-h-media-type="${type}" data-h-media-id="${id || 0}">
            ${roles.map(([role, label, accept]) => {
                const items = media.filter(m => (m.role || '') === role || (role === '' && !roles.some(r => r[0] === (m.role || ''))));
                return `<div class="h-media-role"><h5>${esc(label)}</h5><div class="collection-media-edit">${items.map(m => `<span class="collection-media-item">${A().mediaThumbHtml(m)}<button type="button" data-h-media-remove="${m.id}" aria-label="Retirer">✕</button></span>`).join('')}</div>
                <input type="file" multiple data-h-upload-role="${esc(role)}" accept="${esc(accept || 'image/*,application/pdf')}"></div>`;
            }).join('')}
            ${id ? `<div class="h-media-link"><input type="search" data-h-media-search placeholder="Ou lier un média déjà dans l’application (titre, cote)…" autocomplete="off"><select data-h-media-link-role>${roles.map(([role, label]) => `<option value="${esc(role)}">${esc(label)}</option>`).join('')}</select><div class="h-media-results" hidden></div></div>` : '<small class="muted">Les fichiers choisis sont envoyés à l’enregistrement.</small>'}
        </div>`;
    }
    function bindMediaEditor(root) {
        const box = root.querySelector('.h-media-editor');
        if (!box) return;
        const type = box.dataset.hMediaType, id = Number(box.dataset.hMediaId);
        box.addEventListener('click', async event => {
            const rm = event.target.closest('[data-h-media-remove]');
            if (rm && confirm('Retirer ce fichier de la fiche ? (il reste dans les médias de l’application)')) {
                try { await api('remove_collection_media', {}, {method: 'POST', body: {collection_type: type, collection_id: id, media_id: rm.dataset.hMediaRemove}}); rm.parentElement.remove(); }
                catch (error) { toast(error.message, 'error'); }
            }
            const pick = event.target.closest('[data-h-media-pick]');
            if (pick) {
                try {
                    await api('link_collection_media', {}, {method: 'POST', body: {collection_type: type, collection_id: id, media_id: pick.dataset.hMediaPick, role: box.querySelector('[data-h-media-link-role]').value}});
                    toast('Média lié. Il apparaîtra après l’enregistrement.');
                    pick.disabled = true; pick.textContent += ' ✓';
                } catch (error) { toast(error.message, 'error'); }
            }
        });
        const search = box.querySelector('[data-h-media-search]');
        if (search) {
            let timer = 0;
            search.addEventListener('input', () => {
                clearTimeout(timer);
                const q = search.value.trim(), results = box.querySelector('.h-media-results');
                if (q.length < 2) { results.hidden = true; return; }
                timer = setTimeout(async () => {
                    const data = await api('heritage_media_search', {q}).catch(() => ({media: []}));
                    results.innerHTML = (data.media || []).map(m => `<button type="button" class="h-media-pick" data-h-media-pick="${m.id}">${m.media_type === 'image' ? `<img src="media/${encodeURIComponent(m.thumbnail || m.filename)}" alt="">` : '📄'} ${esc(m.title || m.filename)}${m.document_reference ? ` <small>${esc(m.document_reference)}</small>` : ''}</button>`).join('') || '<small class="muted">Aucun média trouvé.</small>';
                    results.hidden = false;
                }, 250);
            });
        }
    }
    async function uploadMediaEditor(root, type, id) {
        let count = 0;
        for (const input of root.querySelectorAll('[data-h-upload-role]')) {
            if (input.files?.length) count += await uploadFiles(type, id, input.files, input.dataset.hUploadRole);
        }
        return count;
    }

    /** Champ « lieu » avec suggestions (base + villes du monde) ; les coordonnées choisies vont dans deux champs cachés. */
    function placeField(name, value, lat, lon, placeholder = '') {
        return `<span class="h-place"><input type="text" name="${name}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off" data-h-place="${name}"><input type="hidden" name="${name}_lat" value="${lat ?? ''}"><input type="hidden" name="${name}_lon" value="${lon ?? ''}"><span class="h-place-list" hidden></span>${lat != null && lat !== '' ? '<small class="h-place-ok" title="Placé sur la carte">📍</small>' : ''}</span>`;
    }
    document.addEventListener('input', event => {
        const input = event.target.closest?.('[data-h-place]');
        if (!input) return;
        const wrap = input.parentElement, list = wrap.querySelector('.h-place-list');
        wrap.querySelector(`[name="${input.name}_lat"]`).value = '';
        wrap.querySelector(`[name="${input.name}_lon"]`).value = '';
        wrap.querySelector('.h-place-ok')?.remove();
        clearTimeout(input._hTimer);
        const q = input.value.split(',')[0].trim();
        if (q.length < 2) { list.hidden = true; return; }
        input._hTimer = setTimeout(async () => {
            const seq = input._hSeq = (input._hSeq || 0) + 1;
            const data = await api('heritage_place_search', {q}).catch(() => ({places: []}));
            if (seq !== input._hSeq || input.value.split(',')[0].trim() !== q) return; // réponse d'une frappe plus ancienne
            list.innerHTML = (data.places || []).map(p => `<button type="button" data-h-place-pick data-label="${esc(p.label)}" data-lat="${p.lat}" data-lon="${p.lon}">${esc(p.label)}</button>`).join('') || '<small class="muted">Lieu inconnu : il sera cherché à l’enregistrement.</small>';
            list.hidden = false;
        }, 220);
    });
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-place-pick]');
        if (!b) return;
        const wrap = b.closest('.h-place'), input = wrap.querySelector('[data-h-place]');
        input.value = b.dataset.label;
        wrap.querySelector(`[name="${input.name}_lat"]`).value = b.dataset.lat;
        wrap.querySelector(`[name="${input.name}_lon"]`).value = b.dataset.lon;
        wrap.querySelector('.h-place-list').hidden = true;
        if (!wrap.querySelector('.h-place-ok')) wrap.insertAdjacentHTML('beforeend', '<small class="h-place-ok" title="Placé sur la carte">📍</small>');
    });
    document.addEventListener('focusout', event => {
        const input = event.target.closest?.('[data-h-place]');
        if (input) setTimeout(() => { const l = input.parentElement?.querySelector('.h-place-list'); if (l) l.hidden = true; }, 200);
    });

    /** Fenêtre de saisie (même allure que les autres fenêtres de l'application). */
    function openDialog({eyebrow = '', title = '', body = '', wide = false, submitLabel = 'Enregistrer', onSubmit, onDelete, onOpen, labels = null}) {
        const dialog = document.createElement('dialog');
        dialog.className = `modal h-modal${wide ? ' h-modal-wide' : ''}`;
        dialog.innerHTML = `<form method="dialog" class="h-dialog-form"><div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button class="icon-button" value="cancel" type="button" data-h-close aria-label="Fermer">×</button></div>
            <div class="h-dialog-body">${body}${labels ? LP(labels[0], labels[1]) : ''}</div>
            <div class="modal-actions">${onDelete ? '<button type="button" class="button secondary danger" data-h-delete>Supprimer</button>' : ''}<span class="spacer"></span><button type="button" class="button secondary" data-h-close>Annuler</button>${onSubmit ? `<button type="submit" class="button">${esc(submitLabel)}</button>` : ''}</div></form>`;
        document.body.appendChild(dialog);
        const form = dialog.querySelector('form');
        dialog.addEventListener('close', () => dialog.remove());
        dialog.querySelectorAll('[data-h-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('[type=submit]');
            if (button) button.disabled = true;
            try { if (await onSubmit(form) !== false) dialog.close(); }
            catch (error) { toast(error.message, 'error'); }
            finally { if (button) button.disabled = false; }
        });
        dialog.querySelector('[data-h-delete]')?.addEventListener('click', async () => {
            try { if (await onDelete() !== false) dialog.close(); } catch (error) { toast(error.message, 'error'); }
        });
        A().bindCollectionPersonFields(dialog);
        bindMediaEditor(dialog);
        onOpen?.(dialog);
        dialog.showModal();
        return dialog;
    }
    const values = form => A().formObject(form);
    const coord = (v, name) => v[`${name}_lat`] !== undefined && v[`${name}_lat`] !== '' ? Number(v[`${name}_lat`]) : null;

    /** Après une modification : la fiche ouverte, ou la liste ouverte, est redessinée. */
    async function refreshView() {
        const st = S();
        if (st.module === 'personnes' && st.currentPersonId) { await A().selectPerson(st.currentPersonId, false); return; }
        if (st.module === 'listes') { await A().renderList(); return; }
        if (st.module === 'dashboard') A().setModule('dashboard', false);
    }

    /* ─── Petite carte (fond de carte de l'application, points et trajets) ──── */

    const R = Math.PI / 180;
    /** Points d'un grand cercle (la route d'un navire « à travers l'océan ») entre deux positions. */
    function greatCircle([lat1, lon1], [lat2, lon2], steps = 48) {
        const p1 = lat1 * R, l1 = lon1 * R, p2 = lat2 * R, l2 = lon2 * R;
        const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
        if (!d) return [[lat1, lon1], [lat2, lon2]];
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const f = i / steps, a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
            const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
            const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
            const z = a * Math.sin(p1) + b * Math.sin(p2);
            out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / R, Math.atan2(y, x) / R]);
        }
        return out;
    }
    /**
     * Carte fixe : points {lat, lon, label, color, n} et trajets {coords:[[lat,lon]…], color, dashed, ocean}.
     * Les trajets « ocean » suivent le grand cercle.
     */
    function miniMap(points = [], paths = [], {height = 360, emptyText = 'Rien à placer sur la carte (lieux sans coordonnées).'} = {}) {
        const app = A();
        // En mer : le trajet qui ne passe que par la mer (sea-route.js) ; en attendant sa carte, le grand cercle
        const seaPath = p => window.LCNDA_SEA?.route(p.coords, p.year) || p.coords.slice(1).reduce((acc, c, i) => acc.concat(greatCircle(p.coords[i], c).slice(i ? 1 : 0)), []);
        // Carte terre / mer pas encore chargée : cette carte se redessine d'elle-même dès qu'elle l'est
        const mapId = paths.some(p => p.ocean) && window.LCNDA_SEA && !window.LCNDA_SEA.ready() ? 'h-map-' + Math.random().toString(36).slice(2, 9) : '';
        if (mapId) window.LCNDA_SEA.onReady(() => { const el = document.getElementById(mapId); if (el) el.outerHTML = miniMap(points, paths, {height, emptyText}); });
        const drawn = paths.map(p => ({...p, coords: p.ocean ? seaPath(p) : p.coords}))
            .filter(p => p.coords.length > 1);
        const all = [...points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => [p.lat, p.lon]), ...drawn.flatMap(p => p.coords)];
        if (!all.length) return `<div class="person-map-stage person-map-empty h-map-empty">${empty(emptyText)}</div>`;
        const width = 1000, pad = 90;
        let zoom = 2;
        for (let z = 13; z >= 1; z--) {
            const xs = all.map(c => app.lngToX(c[1], z)), ys = all.map(c => app.latToY(c[0], z));
            if (Math.max(...xs) - Math.min(...xs) <= width - pad * 2 && Math.max(...ys) - Math.min(...ys) <= height - pad * 2) { zoom = z; break; }
        }
        if (all.length === 1) zoom = Math.min(zoom, 10);
        const xs = all.map(c => app.lngToX(c[1], zoom)), ys = all.map(c => app.latToY(c[0], zoom));
        const left = (Math.min(...xs) + Math.max(...xs)) / 2 - width / 2, top = (Math.min(...ys) + Math.max(...ys)) / 2 - height / 2;
        const bg = designBg(), world = 2 ** zoom;
        let tiles = '';
        if (bg !== 'grid') {
            for (let tx = Math.floor(left / 256); tx <= Math.ceil((left + width) / 256); tx++) {
                for (let ty = Math.floor(top / 256); ty <= Math.ceil((top + height) / 256); ty++) {
                    if (ty < 0 || ty >= world) continue;
                    tiles += `<img class="person-map-tile" draggable="false" referrerpolicy="no-referrer" src="${app.mapTileUrl(bg, zoom, ((tx % world) + world) % world, ty)}" style="left:${(tx * 256 - left) / width * 100}%;top:${(ty * 256 - top) / height * 100}%;width:${256 / width * 100}%;height:${256 / height * 100}%" alt="">`;
                }
            }
        }
        const px = c => [app.lngToX(c[1], zoom) - left, app.latToY(c[0], zoom) - top];
        const lines = drawn.map(p => `<polyline points="${p.coords.map(c => px(c).map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${esc(p.color || '#0066cc')}" stroke-width="${p.width || 3}" ${p.dashed ? 'stroke-dasharray="8 6"' : ''} stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`).join('');
        const marks = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(p => {
            const [x, y] = px([p.lat, p.lon]);
            return `<g class="h-map-point" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc(p.label || '')}</title><circle r="${p.n ? 11 : 7}" fill="${esc(p.color || '#0066cc')}" stroke="#fff" stroke-width="2"/>${p.n ? `<text text-anchor="middle" dy="4" font-size="11" font-weight="700" fill="#fff">${esc(p.n)}</text>` : ''}${p.showLabel ? `<text x="12" y="-10" font-size="13" font-weight="700" class="h-map-label">${esc(p.label || '')}</text>` : ''}</g>`;
        }).join('');
        return `<div class="person-map-stage h-map map-bg-${esc(bg)}"${mapId ? ` id="${mapId}"` : ''} style="aspect-ratio:${width}/${height}" role="img" aria-label="Carte">${tiles}<svg viewBox="0 0 ${width} ${height}">${lines}${marks}</svg></div>`;
    }
    /* ─── Blocs spéciaux de la fiche : cochés fiche par fiche, ou sur toutes les fiches (Apparence) ─── */
    const FLAG_BLOCKS = [['show_voyage_block', '🚢 Départs / émigration'], ['show_placement_block', '👶 Enfant placé'], ['show_heraldry_block', '🛡️ Noblesse / blason'], ['show_poilu_block', '🎖️ Poilu 14-18'], ['show_resistance_block', '✊ Résistant'], ['show_voter_block', '🗳️ Cartes d’électeur'], ['show_language_block', '🗣️ Langues']];
    function flagSettings() {
        let v = {};
        try { v = JSON.parse(localStorage.getItem('genealogie-heritage-flags') || '{}') || {}; } catch (_) {}
        const keys = FLAG_BLOCKS.map(f => f[0]);
        const order = [...(Array.isArray(v.order) ? v.order.filter(k => keys.includes(k)) : []), ...keys.filter(k => !(v.order || []).includes(k))];
        return {always: Array.isArray(v.always) ? v.always : [], hidden: Array.isArray(v.hidden) ? v.hidden : [], order};
    }
    ext.flagSettings = flagSettings;
    /** Le bloc s'affiche-t-il sur cette fiche ? (masqué dans Apparence → jamais ; « toutes les fiches » → toujours) */
    function flagShown(person, key) {
        const s = flagSettings();
        if (s.hidden.includes(key)) return false;
        return s.always.includes(key) || Number(person?.[key]) === 1;
    }
    ext.flagShown = flagShown;
    /** Fenêtre IDENTITÉ : ordre des cases, cases masquées, et mention « sur toutes les fiches ». */
    function applyFlagSettings() {
        const box = document.querySelector('#person-form .person-heritage-flags');
        if (!box) return;
        const s = flagSettings();
        s.order.forEach(key => {
            const label = box.querySelector(`[name="${key}"]`)?.closest('label');
            if (!label) return;
            box.appendChild(label);
            label.hidden = s.hidden.includes(key);
            const input = label.querySelector('input');
            input.style.display = s.always.includes(key) ? 'none' : '';
            let note = label.querySelector('.h-flag-always');
            if (s.always.includes(key) && !note) { note = document.createElement('em'); note.className = 'h-flag-always'; note.textContent = ' — affiché sur toutes les fiches (Apparence)'; label.insertBefore(note, label.querySelector('small')); }
            if (!s.always.includes(key)) note?.remove();
        });
        box.hidden = false; // « Hors de ma généalogie » et le bloc militaire y sont toujours
    }
    ext.applyFlagSettings = applyFlagSettings;
    setTimeout(applyFlagSettings, 0);
    ext.designPanels = ext.designPanels || [];
    ext.afterDesign = ext.afterDesign || [];
    ext.designPanels.push(() => {
        const s = flagSettings();
        return `<section class="person-block-config" id="h-flag-config"><header><span class="eyebrow">FICHES PERSONNES</span><h3>Blocs à afficher sur demande</h3><p>Départs, Enfant placé, Blason, Poilu, Langues : d’habitude, on coche la case sur chaque fiche (IDENTITÉ → Modifier la personne). Coche « Sur toutes les fiches » pour qu’un bloc s’affiche partout sans rien cocher. Décoche « Proposé » pour le masquer complètement. Les flèches changent l’ordre des cases.</p></header>
            <table class="data-table h-flag-table"><thead><tr><th>Ordre</th><th>Bloc</th><th>Proposé</th><th>Sur toutes les fiches</th></tr></thead><tbody>${s.order.map((key, i) => { const label = FLAG_BLOCKS.find(f => f[0] === key)[1]; return `<tr><td><button type="button" class="icon-button" data-h-flag-move="${key}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Monter">↑</button><button type="button" class="icon-button" data-h-flag-move="${key}" data-dir="1" ${i < s.order.length - 1 ? '' : 'disabled'} aria-label="Descendre">↓</button></td><td>${esc(label)}</td><td><input type="checkbox" data-h-flag-offered="${key}" ${s.hidden.includes(key) ? '' : 'checked'}></td><td><input type="checkbox" data-h-flag-always="${key}" ${s.always.includes(key) ? 'checked' : ''} ${s.hidden.includes(key) ? 'disabled' : ''}></td></tr>`; }).join('')}</tbody></table></section>`;
    });
    ext.afterDesign.push(() => {
        const box = document.getElementById('h-flag-config');
        if (!box) return;
        const save = s => { localStorage.setItem('genealogie-heritage-flags', JSON.stringify(s)); applyFlagSettings(); const fresh = document.createElement('div'); fresh.innerHTML = ext.designPanels.find(fn => fn.toString().includes('h-flag-config'))(); box.replaceWith(fresh.firstElementChild); ext.afterDesign.forEach(fn => { if (fn.toString().includes('h-flag-config')) fn(); }); toast('Réglage enregistré.'); };
        box.addEventListener('click', event => {
            const b = event.target.closest('[data-h-flag-move]');
            if (!b) return;
            const s = flagSettings(), i = s.order.indexOf(b.dataset.hFlagMove), j = i + Number(b.dataset.dir);
            if (j < 0 || j >= s.order.length) return;
            [s.order[i], s.order[j]] = [s.order[j], s.order[i]];
            save(s);
        });
        box.addEventListener('change', event => {
            const s = flagSettings(), t = event.target;
            if (t.dataset.hFlagOffered) { const k = t.dataset.hFlagOffered; s.hidden = t.checked ? s.hidden.filter(x => x !== k) : [...new Set([...s.hidden, k])]; if (!t.checked) s.always = s.always.filter(x => x !== k); }
            if (t.dataset.hFlagAlways) { const k = t.dataset.hFlagAlways; s.always = t.checked ? [...new Set([...s.always, k])] : s.always.filter(x => x !== k); }
            save(s);
        });
    });

    /** Crayon + poubelle, comme dans le bloc Événements. */
    const tools = (editAttr, deleteAttr, what) => `<span class="inline-actions h-tools">${A().actionButton('edit', 'Modifier ' + what, editAttr)}${A().actionButton('delete', 'Supprimer ' + what, deleteAttr)}</span>`;
    /** 🖼️ Choisir une image de l'app (le même choix partout : retouche, transcription d'actes, signatures…) : les images tout de suite,
     *  en vignettes ; recherche par titre, cote, date, nom du fichier ou personne rattachée ; filtres ; ou une image de l'ordinateur.
     *  Renvoie {id, filename, title, transcription…} ou null. */
    function pickImage({eyebrow = 'MÉDIAS', title = 'Choisir une image', intro = '', filter = '', filters = true, allowImport = true, extra = ''} = {}) {
        return new Promise(resolve => {
            let done = false, items = [], timer = 0, seq = 0;
            const finish = v => { if (done) return; done = true; resolve(v); dlg.close(); };
            const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-rt-pick';
            dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
                <div class="h-rt-pick-bar"><input type="search" data-q placeholder="Chercher : titre, cote, date, nom d’une personne…" autocomplete="off">${filters ? `<select data-f aria-label="Filtre">${[['', 'Toutes les images'], ['notr', 'Pas encore transcrites'], ['tr', 'Déjà transcrites'], ['sig', 'Avec une signature repérée']].map(([k, l]) => `<option value="${k}" ${k === filter ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}${extra}${allowImport ? '<label class="button small"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-file hidden>📥 Image de l’ordinateur</label>' : ''}</div>
                ${intro ? `<p class="muted small">${intro}</p>` : ''}<div class="h-rt-pick-grid" data-grid><div class="loading-block">Chargement…</div></div>`;
            document.body.append(dlg);
            dlg.addEventListener('close', () => { dlg.remove(); if (!done) { done = true; resolve(null); } });
            dlg.querySelector('[data-x]').addEventListener('click', () => dlg.close());
            const grid = dlg.querySelector('[data-grid]'), q = dlg.querySelector('[data-q]'), f = dlg.querySelector('[data-f]');
            const load = async () => { const n = ++seq;
                try { items = (await A().api('image_pick', {q: q.value.trim(), filter: f?.value || ''})).media || []; } catch (e) { if (n === seq) grid.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
                if (n !== seq) return;
                grid.innerHTML = items.length ? items.map((m, i) => `<button type="button" class="h-rt-pick-item" data-i="${i}" title="${esc(m.title || m.filename)}"><img loading="lazy" alt="" src="media/${encodeURIComponent(m.thumbnail || m.filename)}">${Number(m.has_tr) ? '<b class="h-pick-badge" title="Déjà transcrite">📝</b>' : ''}<span>${esc(m.title || m.filename)}</span>${m.people || m.date_text ? `<small>${esc([m.people, m.date_text].filter(Boolean).join(' · '))}</small>` : ''}</button>`).join('')
                    : `<p class="muted">${q.value.trim() || f?.value ? 'Aucune image ne correspond.' : 'Aucune image dans l’app pour l’instant.'}${allowImport ? ' Prends-en une sur l’ordinateur (« 📥 Image de l’ordinateur »).' : ''}</p>`; };
            q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 220); });
            q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (items.length === 1) finish(items[0]); } });
            f?.addEventListener('change', load);
            grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) finish(items[+b.dataset.i]); });
            dlg.querySelector('[data-file]')?.addEventListener('change', async e => { const file = e.target.files?.[0]; if (!file) return;
                const fd = new FormData(); fd.append('file', file); fd.append('kind', 'image'); fd.append('title', file.name.replace(/\.[^.]+$/, '')); fd.append('csrf', A().state.csrf);
                grid.innerHTML = '<div class="loading-block">Envoi de l’image…</div>';
                try { const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': A().state.csrf}}), j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
                    finish({id: j.result.media_id, filename: j.result.filename, thumbnail: j.result.filename, title: file.name.replace(/\.[^.]+$/, ''), transcription: '', imported: true}); }
                catch (err) { toast(err.message, 'error'); load(); } });
            dlg.showModal(); q.focus(); load();
            dlg._pickFinish = finish; // pour les boutons ajoutés (« extra »)
        });
    }
    setTimeout(() => { ext.miniMap = miniMap; ext.uploadFiles = uploadFiles; ext.openDialog = openDialog; ext.tools = tools; ext.refreshView = refreshView; ext.mediaEditorHtml = mediaEditorHtml; ext.bindMediaEditor = bindMediaEditor; ext.uploadMediaEditor = uploadMediaEditor; ext.placeField = placeField; ext.thumbs = thumbs; ext.pickImage = pickImage; }, 0);
    const finite = v => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));

    /* ═══════════════════════ 🚢 DÉPARTS : VOYAGES ET ÉMIGRATION ═══════════════════════ */

    const voyageTitle = v => [v.departure_date || (v.departure_year ? String(v.departure_year) : ''), [v.departure_port, v.arrival_port || v.destination].filter(Boolean).map(t => String(t).split(',')[0].trim()).join(' → ')].filter(Boolean).join(' — ') || 'Voyage';
    function voyagePaths(rows) {
        const points = [], paths = [];
        rows.forEach((v, i) => {
            const color = ['#0066cc', '#cc4700', '#7a47db', '#00a37a', '#cc0014', '#a07a00'][i % 6];
            const route = (v.route || []).filter(r => finite(r.lat) && finite(r.lon));
            if (!route.length && finite(v.dep_lat) && finite(v.dest_lat)) route.push({lat: +v.dep_lat, lon: +v.dep_lon, label: v.departure_port, kind: 'depart'}, {lat: +v.dest_lat, lon: +v.dest_lon, label: v.arrival_port || v.destination, kind: 'arrivee'});
            const sea = route.filter(r => r.kind !== 'destination'), land = route.filter((r, k) => r.kind === 'destination' || route[k + 1]?.kind === 'destination');
            if (sea.length > 1) paths.push({coords: sea.map(r => [+r.lat, +r.lon]), color, ocean: true, year: Number(v.departure_year) || Number(String(v.departure_date || '').match(/\d{4}/)?.[0]) || 0});
            if (land.length > 1) paths.push({coords: land.map(r => [+r.lat, +r.lon]), color, dashed: true});
            route.forEach(r => points.push({lat: +r.lat, lon: +r.lon, label: `${r.label}${v.person_name ? ' — ' + v.person_name : ''}`, color, showLabel: rows.length < 4}));
        });
        return miniMap(points, paths, {emptyText: 'Choisis le port de départ et la destination dans les suggestions pour voir le trajet.'});
    }
    function voyageCardHtml(v, {withPerson = false, editable = true} = {}) {
        const media = v.media || [];
        const byRole = role => media.filter(m => (m.role || '') === role);
        const photos = media.filter(m => !['passagers', 'papiers', 'naturalisation'].includes(m.role || ''));
        const row = (label, value) => value ? `<div class="data-row"><dt>${esc(label)}</dt><dd>${nl(value)}</dd></div>` : '';
        return `<article class="h-record h-voyage"><header><div>${withPerson ? `<div>${personLink(v.person_id, v.person_name)}</div>` : ''}<strong>🚢 ${esc(voyageTitle(v))}</strong>${LC(v.labels)}${v.ship_name ? `<span class="h-ship">à bord du navire <em>${esc(v.ship_name)}</em></span>` : ''}</div>${editable ? tools(`data-h-voyage-edit="${v.id}" data-h-voyage-person="${v.person_id}"`, `data-h-voyage-delete="${v.id}"`, 'ce voyage') : ''}</header>
            <dl class="data-list">${row('Départ', [v.departure_date, v.departure_port].filter(Boolean).join(' · '))}${row('Escales', v.stopovers)}${row('Arrivée', [v.arrival_date, v.arrival_port].filter(Boolean).join(' · '))}${row('Destination', v.destination)}${row('Motif', v.reason)}
            ${v.companion_people?.length || v.companions ? `<div class="data-row"><dt>Partis ensemble</dt><dd>${[personLink(v.person_id, v.person_name), ...(v.companion_people || []).map(c => personLink(c.person.id, A().personName(c.person), c.relation))].join(', ')}${v.companions ? `<br><small>${nl(v.companions)}</small>` : ''}</dd></div>` : ''}</dl>
            ${v.passenger_list_ref || v.passenger_list_url || v.passenger_list_text || byRole('passagers').length ? `<details class="h-section" open><summary>Liste de passagers</summary>${v.passenger_list_ref ? `<p><strong>Référence :</strong> ${esc(v.passenger_list_ref)}</p>` : ''}${v.passenger_list_url ? `<p><a href="${esc(v.passenger_list_url)}" target="_blank" rel="noopener noreferrer">Voir la liste en ligne ↗</a></p>` : ''}${thumbs('voyage-pass-' + v.id, byRole('passagers'))}${v.passenger_list_text ? `<p class="h-transcription">${nl(v.passenger_list_text)}</p>` : ''}</details>` : ''}
            ${(() => { const naturalized = [{name: v.person_name, id: v.person_id, date: v.naturalization_date, place: v.naturalization_place, text: v.naturalization_text}, ...(v.companion_people || []).map(c => ({name: A().personName(c.person), id: c.person.id, date: c.naturalization_date, place: c.naturalization_place, text: c.naturalization_text}))].filter(n => n.date || n.place || n.text);
                return naturalized.length || byRole('naturalisation').length ? `<details class="h-section" open><summary>Naturalisation à l’arrivée</summary>${naturalized.map(n => `<p>${(v.companion_people || []).length ? `<strong>${personLink(n.id, n.name)}</strong> : ` : ''}${esc([n.date, n.place].filter(Boolean).join(' · '))}${n.text ? `<br><small>${nl(n.text)}</small>` : ''}</p>`).join('')}${thumbs('voyage-nat-' + v.id, byRole('naturalisation'))}</details>` : ''; })()}
            ${v.papers_text || byRole('papiers').length ? `<details class="h-section"><summary>Papiers d’émigration</summary>${thumbs('voyage-pap-' + v.id, byRole('papiers'))}${v.papers_text ? `<p class="h-transcription">${nl(v.papers_text)}</p>` : ''}</details>` : ''}
            ${photos.length ? `<div class="h-section"><h5>Photos</h5>${thumbs('voyage-photo-' + v.id, photos)}</div>` : ''}
            ${v.notes ? `<p class="muted">${nl(v.notes)}</p>` : ''}</article>`;
    }
    ext.personBlocks.voyages = (index, detail, {editOnly}) => {
        const p = detail.person;
        if (!flagShown(p, 'show_voyage_block')) return '';
        const rows = detail.heritage?.voyages || [];
        const body = rows.length ? `<div class="h-voyage-layout"><div class="h-records">${rows.map(v => voyageCardHtml(v, {editable: !Number(p.is_locked)})).join('')}</div><div class="h-voyage-map">${voyagePaths(rows)}<small class="muted">Trajet en mer tracé au plus court en ne passant que par la mer (détroits ; canaux de Suez, Kiel et Panama seulement après leur ouverture) ; en pointillés, le trajet à terre jusqu’à la destination.</small></div></div>`
            : empty('Aucun voyage pour l’instant. Ajoute le départ : date, port, navire, destination, liste de passagers, naturalisation…');
        return card(index, 'Départs / émigration', rows.length || '', body, 'span-12', editOnly(`<button type="button" class="button small secondary" data-h-voyage-edit="0" data-h-voyage-person="${p.id}">+ Voyage</button>`));
    };
    // Champs préfixés « c_ » : ne pas se mélanger avec la naturalisation de la personne principale
    function companionRow(c = {}) {
        return `<div class="transfer-row h-companion-row">${A().collectionPersonField('c_person_id', c.person || null, 'Fiche (époux, enfant, frère…)')}<input name="c_relation" value="${esc(c.relation || '')}" placeholder="Lien (épouse, fils…)">
            <input name="c_naturalization_date" value="${esc(c.naturalization_date || '')}" placeholder="Naturalisé·e le…"><input name="c_naturalization_place" value="${esc(c.naturalization_place || '')}" placeholder="Lieu / tribunal"><input name="c_naturalization_text" value="${esc(c.naturalization_text || '')}" placeholder="Détails"><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
    }
    async function openVoyageDialog(id, personId) {
        let v = {person_id: personId, media: []};
        if (id) { const data = await api('voyages', {person_id: personId}); v = (data.voyages || []).find(r => Number(r.id) === Number(id)) || v; }
        const f = k => esc(v[k] || '');
        openDialog({
            eyebrow: 'DÉPART', title: id ? 'Modifier le voyage' : 'Nouveau voyage', wide: true, labels: ['voyage', v.labels],
            body: `<div class="form-grid">
                <label>Date de départ<input name="departure_date" value="${f('departure_date')}" placeholder="12 mai 1885"></label>
                <label>Port de départ${placeField('departure_port', v.departure_port, v.dep_lat, v.dep_lon, 'Le Havre, Bordeaux, Marseille…')}</label>
                <label>Nom du navire<input name="ship_name" value="${f('ship_name')}" placeholder="La Bretagne"></label>
                <label>Motif<input name="reason" value="${f('reason')}" placeholder="Travail, famille, service militaire…"></label>
                <label>Escales <small>(une par ligne)</small><textarea name="stopovers" rows="2" placeholder="Liverpool">${f('stopovers')}</textarea></label>
                <label>Partis avec (texte libre, si pas de fiche)<textarea name="companions" rows="2" placeholder="Deux cousins du village">${f('companions')}</textarea></label>
                <label>Date d’arrivée<input name="arrival_date" value="${f('arrival_date')}" placeholder="24 mai 1885"></label>
                <label>Port d’arrivée${placeField('arrival_port', v.arrival_port, v.dest_lat, v.dest_lon, 'New York, Québec, Buenos Aires, Alger…')}</label>
                <label class="span-2">Destination finale <small>(si elle est ailleurs que le port)</small><input name="destination" value="${f('destination')}" placeholder="Montréal, Pampa, Oran…"></label>
            </div>
            <h4>Liste de passagers</h4><div class="form-grid">
                <label>Référence (archive, registre, page)<input name="passenger_list_ref" value="${f('passenger_list_ref')}" placeholder="Ellis Island, manifeste T715, rouleau 0427"></label>
                <label>Lien en ligne<input name="passenger_list_url" value="${f('passenger_list_url')}" placeholder="https://…"></label>
                <label class="span-2">Ce qui est écrit (transcription)<textarea name="passenger_list_text" rows="3">${f('passenger_list_text')}</textarea></label></div>
            <h4>Partis ensemble (fiches)</h4><p class="muted">Le voyage s’affichera aussi sur leur fiche. Chacun a sa propre naturalisation à l’arrivée.</p>
            <div class="h-rows" data-h-rows="companions">${(v.companion_people || []).map(companionRow).join('')}</div><button type="button" class="button small secondary" data-h-row-add="companions">+ Personne partie avec</button><template data-h-template="companions">${companionRow()}</template>
            <h4>Naturalisation à l’arrivée${(v.companion_people || []).length ? ' de ' + esc(v.person_name || 'la personne') : ''}</h4><div class="form-grid">
                <label>Date<input name="naturalization_date" value="${f('naturalization_date')}" placeholder="1892"></label>
                <label>Lieu / tribunal<input name="naturalization_place" value="${f('naturalization_place')}" placeholder="Cour de district de Chicago"></label>
                <label class="span-2">Détails<textarea name="naturalization_text" rows="2">${f('naturalization_text')}</textarea></label></div>
            <h4>Papiers d’émigration</h4>
            <label class="h-block-label">Texte des papiers (passeport, demande, contrat, lettres…)<textarea name="papers_text" rows="4">${f('papers_text')}</textarea></label>
            <label class="h-block-label">Notes<textarea name="notes" rows="2">${f('notes')}</textarea></label>
            <h4>Images</h4>${mediaEditorHtml('voyage', v.id, v.media, [['passagers', 'Liste de passagers (image)'], ['papiers', 'Papiers d’émigration'], ['naturalisation', 'Naturalisation'], ['', 'Photos (navire, départ, famille…)']])}`,
            onSubmit: async form => {
                const val = values(form);
                const companion_people = [...form.querySelectorAll('.h-companion-row')].map(r => Object.fromEntries(['person_id', 'relation', 'naturalization_date', 'naturalization_place', 'naturalization_text'].map(k => [k, r.querySelector(`[name=c_${k}]`).value]))).filter(c => Number(c.person_id));
                Object.keys(val).filter(k => k.startsWith('c_')).forEach(k => delete val[k]);
                const saved = await api('save_voyage', {}, {method: 'POST', body: {...val, companion_people, id: v.id || 0, person_id: v.person_id || personId, dep_lat: coord(val, 'departure_port'), dep_lon: val.departure_port_lon, dest_lat: coord(val, 'arrival_port'), dest_lon: val.arrival_port_lon}});
                await uploadMediaEditor(form, 'voyage', saved.result.id);
                const r = saved.result;
                toast(r.dep?.[0] == null || r.dest?.[0] == null ? 'Voyage enregistré (un lieu n’a pas été trouvé : choisis-le dans les suggestions pour tracer le trajet).' : 'Voyage enregistré.');
                await refreshView();
            },
            onDelete: v.id ? async () => { if (!confirm('Supprimer ce voyage ?')) return false; await api('delete_voyage', {}, {method: 'POST', body: {id: v.id}}); toast('Voyage supprimé.'); await refreshView(); } : null,
        });
    }
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-voyage-edit]');
        if (b) openVoyageDialog(Number(b.dataset.hVoyageEdit), Number(b.dataset.hVoyagePerson)).catch(error => toast(error.message, 'error'));
    });

    // Poubelles des blocs (voyage, placement, armoiries, parcours de poilu, inventaire, papier)
    document.addEventListener('click', async event => {
        const b = event.target.closest?.('[data-h-voyage-delete],[data-h-placement-delete],[data-h-coat-delete],[data-h-poilu-clear],[data-h-probate-delete],[data-h-paper-delete]');
        if (!b) return;
        event.preventDefault();
        try {
            const d = b.dataset;
            if (d.hVoyageDelete) { if (!confirm('Supprimer ce voyage ?')) return; await api('delete_voyage', {}, {method: 'POST', body: {id: d.hVoyageDelete}}); toast('Voyage supprimé.'); }
            else if (d.hPlacementDelete) { if (!confirm('Supprimer ce placement ?')) return; await api('delete_placement', {}, {method: 'POST', body: {id: d.hPlacementDelete}}); toast('Placement supprimé.'); }
            else if (d.hCoatDelete) {
                const coat = ((await api('coats_of_arms')).coats || []).find(c => Number(c.id) === Number(d.hCoatDelete));
                if (!coat) return;
                const personId = Number(d.hCoatPerson) || 0, others = (coat.people || []).filter(l => Number(l.person.id) !== personId);
                if (personId && others.length) {
                    if (!confirm(`Retirer « ${coat.title} » de cette fiche ? Les armoiries restent pour les ${others.length} autre(s) porteur(s).`)) return;
                    await api('save_coat_of_arms', {}, {method: 'POST', body: {...coat, people: others.map(l => ({person_id: l.person.id, note: l.note}))}});
                    toast('Armoiries retirées de cette fiche.');
                } else {
                    if (!confirm(`Supprimer les armoiries « ${coat.title} » ?`)) return;
                    await api('delete_coat_of_arms', {}, {method: 'POST', body: {id: coat.id}}); toast('Armoiries supprimées.');
                }
            }
            else if (d.hPoiluClear) { if (!confirm('Effacer tout le parcours de poilu (unités et événements) ?')) return; await api('save_poilu', {}, {method: 'POST', body: {person_id: d.hPoiluClear, units: [], events: []}}); toast('Parcours effacé.'); }
            else if (d.hProbateDelete) { if (!confirm('Supprimer cet inventaire après décès ?')) return; await api('delete_probate_inventory', {}, {method: 'POST', body: {id: d.hProbateDelete}}); toast('Inventaire supprimé.'); }
            else if (d.hPaperDelete) { if (!confirm('Retirer ce document de l’inventaire des papiers ?')) return; await api('delete_family_paper', {}, {method: 'POST', body: {id: d.hPaperDelete}}); toast('Document retiré.'); }
            await refreshView();
        } catch (error) { toast(error.message, 'error'); }
    });

    /* ═══════════════════════ 👶 ENFANTS PLACÉS ═══════════════════════ */

    const placementKinds = {nourrice: 'Mis en nourrice', abandon: 'Abandonné', hospice: 'Recueilli par l’hospice', assistance: 'Pupille de l’Assistance publique', orphelinat: 'Orphelinat', recueilli: 'Recueilli par une famille', autre: 'Autre placement'};
    function placementMap(rows) {
        const points = [], paths = [];
        rows.forEach(r => {
            if (finite(r.lat)) points.push({lat: +r.lat, lon: +r.lon, label: `${r.place_text}${r.person_name ? ' — ' + r.person_name : ''}`, color: '#cc4700', showLabel: rows.length < 4});
            if (finite(r.origin_lat)) points.push({lat: +r.origin_lat, lon: +r.origin_lon, label: `${r.origin_text} (départ)`, color: '#0066cc', showLabel: rows.length < 4});
            if (finite(r.lat) && finite(r.origin_lat)) paths.push({coords: [[+r.origin_lat, +r.origin_lon], [+r.lat, +r.lon]], color: '#cc4700', dashed: true});
        });
        return miniMap(points, paths, {emptyText: 'Choisis le lieu du placement dans les suggestions pour le voir sur la carte.'});
    }
    function placementCardHtml(r, {withPerson = false, editable = true} = {}) {
        const row = (label, value) => value ? `<div class="data-row"><dt>${esc(label)}</dt><dd>${nl(value)}</dd></div>` : '';
        const when = [r.start_date, r.end_date].filter(Boolean).join(' → ');
        return `<article class="h-record h-placement"><header><div>${withPerson ? `<div>${personLink(r.person_id, r.person_name)}</div>` : ''}<strong>👶 ${esc(r.kind_label || placementKinds[r.kind] || 'Placement')}${r.place_text ? ` à ${esc(r.place_text)}` : ''}</strong>${LC(r.labels)}${r.duration ? `<span class="h-duration">${esc(r.duration)}</span>` : ''}</div>${editable ? tools(`data-h-placement-edit="${r.id}" data-h-placement-person="${r.person_id}"`, `data-h-placement-delete="${r.id}"`, 'ce placement') : ''}</header>
            <dl class="data-list">${row('Période', when)}${row('Parti de', r.origin_text)}${row('Institution', r.institution)}${row('N° matricule', r.matricule)}${row('Nourrice / famille', [r.nurse_person_name, r.nurse_name].filter(Boolean).join(' · '))}${row('Mois de nourrice / pension', r.wage_text)}${row('Ce qu’il est devenu', r.outcome)}</dl>
            ${thumbs('placement-' + r.id, r.media)}${r.notes ? `<p class="h-transcription">${nl(r.notes)}</p>` : ''}</article>`;
    }
    ext.personBlocks.placements = (index, detail, {editOnly}) => {
        const p = detail.person;
        if (!flagShown(p, 'show_placement_block')) return '';
        const rows = detail.heritage?.placements || [];
        const body = rows.length ? `<div class="h-voyage-layout"><div class="h-records">${rows.map(r => placementCardHtml(r, {editable: !Number(p.is_locked)})).join('')}</div><div>${placementMap(rows)}</div></div>`
            : empty('Aucun placement enregistré : nourrice, abandon, hospice, Assistance publique… avec le lieu et la durée.');
        return card(index, 'Enfant placé', rows.length || '', body, 'span-12', editOnly(`<button type="button" class="button small secondary" data-h-placement-edit="0" data-h-placement-person="${p.id}">+ Placement</button>`));
    };
    async function openPlacementDialog(id, personId) {
        let r = {person_id: personId, kind: 'nourrice', media: []};
        if (id) { const data = await api('placements', {person_id: personId}); r = (data.placements || []).find(x => Number(x.id) === Number(id)) || r; }
        const f = k => esc(r[k] || '');
        openDialog({
            eyebrow: 'ENFANT PLACÉ', title: id ? 'Modifier le placement' : 'Nouveau placement', wide: true, labels: ['placement', r.labels],
            body: `<div class="form-grid">
                <label>Situation<select name="kind">${Object.entries(placementKinds).map(([k, l]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Institution<input name="institution" value="${f('institution')}" placeholder="Hospice des Enfants-Trouvés de Paris" list="h-institutions"><datalist id="h-institutions"><option>Hospice des Enfants-Trouvés de Paris</option><option>Assistance publique de Paris</option><option>Bureau des nourrices</option><option>Hospice civil</option><option>Hôtel-Dieu</option></datalist></label>
                <label>N° matricule / registre<input name="matricule" value="${f('matricule')}" placeholder="n° 12345"></label>
                <label>Parti de${placeField('origin_text', r.origin_text, r.origin_lat, r.origin_lon, 'Paris')}</label>
                <label>Placé à${placeField('place_text', r.place_text, r.lat, r.lon, 'Château-Chinon (Morvan)')}</label>
                <label>Du<input name="start_date" value="${f('start_date')}" placeholder="1878-03-12 ou mars 1878"></label>
                <label>Au<input name="end_date" value="${f('end_date')}" placeholder="1881-06-02"></label>
                <label>Durée <small>(sinon calculée)</small><input name="duration_text" value="${f('duration_text')}" placeholder="3 ans"></label>
                <label>Nourrice (fiche)${A().collectionPersonField('nurse_person_id', r.nurse_person_id ? {id: r.nurse_person_id, first_name: r.nurse_person_name || ''} : null, 'Personne de la base…')}</label>
                <label>ou nom de la nourrice / famille<input name="nurse_name" value="${f('nurse_name')}" placeholder="Femme Lazare, cultivateurs"></label>
                <label>Mois de nourrice / pension<input name="wage_text" value="${f('wage_text')}" placeholder="15 francs par mois"></label>
                <label>Ce qu’il est devenu<input name="outcome" value="${f('outcome')}" placeholder="Rendu à sa mère, décédé en nourrice, majorité…"></label>
                <label class="span-2">Notes, histoire<textarea name="notes" rows="4">${f('notes')}</textarea></label></div>
                <h4>Documents</h4>${mediaEditorHtml('placement', r.id, r.media, [['', 'Registre, collier, carnet, lettres, photos']])}`,
            onSubmit: async form => {
                const val = values(form);
                const saved = await api('save_placement', {}, {method: 'POST', body: {...val, id: r.id || 0, person_id: personId, lat: val.place_text_lat, lon: val.place_text_lon, origin_lat: val.origin_text_lat, origin_lon: val.origin_text_lon, nurse_person_id: form.querySelector('[name=nurse_person_id]').value}});
                await uploadMediaEditor(form, 'placement', saved.result.id);
                toast('Placement enregistré.'); await refreshView();
            },
            onDelete: r.id ? async () => { if (!confirm('Supprimer ce placement ?')) return false; await api('delete_placement', {}, {method: 'POST', body: {id: r.id}}); toast('Supprimé.'); await refreshView(); } : null,
        });
    }
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-placement-edit]');
        if (b) openPlacementDialog(Number(b.dataset.hPlacementEdit), Number(b.dataset.hPlacementPerson)).catch(error => toast(error.message, 'error'));
    });

    /* ═══════════════════════ 🛡️ ARMOIRIES ═══════════════════════ */

    const blazonWords = [['Émaux', ['d’or', 'd’argent', 'de gueules', 'd’azur', 'de sinople', 'de sable', 'de pourpre', 'd’hermine', 'de vair']], ['Pièces', ['à la fasce', 'au chef', 'à la bande', 'au pal', 'à la croix', 'au chevron', 'à la bordure', 'au sautoir']], ['Meubles', ['au lion', 'à l’aigle', 'à trois fleurs de lys', 'à l’étoile', 'à la tour', 'au croissant', 'à la coquille', 'à la merlette', 'au besant']], ['Mots', ['chargé de', 'accompagné de', 'posés deux et un', 'armé et lampassé', 'issant', 'en chef', 'en pointe', 'brochant sur le tout']]];
    function coatImage(c) { return (c.media || []).find(m => m.media_type === 'image'); }
    function coatCardHtml(c, {compact = false, currentPersonId = 0} = {}) {
        const img = coatImage(c);
        const others = (c.people || []).filter(l => Number(l.person.id) !== Number(currentPersonId));
        return `<article class="h-coat"><div class="h-coat-shield">${img ? `<button type="button" class="h-thumb" data-h-lightbox="coat-${c.id}" data-h-index="0">${A().mediaThumbHtml(img)}</button>` : '<span class="h-coat-placeholder" aria-hidden="true">🛡️</span>'}</div>
            <div class="h-coat-body"><strong>${esc(c.title)}</strong>${LC(c.labels)}${c.title_of_nobility ? ` <span class="collection-kind">${esc(c.title_of_nobility)}</span>` : ''}
            ${c.blazon ? `<p class="h-blazon">« ${esc(c.blazon)} »</p>` : '<p class="muted">Blasonnement à écrire.</p>'}
            ${c.motto ? `<p class="h-motto">Devise : <em>${esc(c.motto)}</em></p>` : ''}
            ${!compact && c.origin_text ? `<p class="muted">${nl(c.origin_text)}</p>` : ''}
            ${others.length ? `<div class="collection-holder">${currentPersonId ? 'Aussi porté par' : 'Porté par'} : ${others.map(l => chip(l.person) + (l.note ? ` <small>(${esc(l.note)})</small>` : '')).join(' · ')}</div>` : ''}
            <div class="page-actions compact">${tools(`data-h-coat-edit="${c.id}"`, `data-h-coat-delete="${c.id}" data-h-coat-person="${Number(currentPersonId) || 0}"`, 'ces armoiries')}</div></div></article>`;
    }
    function registerCoatMedia(rows) { rows.forEach(c => { const img = coatImage(c); if (img) mediaGroups['coat-' + c.id] = (c.media || []).filter(m => m.media_type === 'image'); }); }
    ext.personBlocks.heraldry = (index, detail, {editOnly}) => {
        const p = detail.person;
        if (!flagShown(p, 'show_heraldry_block')) return '';
        const rows = detail.heritage?.coats_of_arms || [];
        registerCoatMedia(rows);
        const body = rows.length ? `<div class="h-coats">${rows.map(c => coatCardHtml(c, {compact: true, currentPersonId: p.id})).join('')}</div>` : empty('Aucune armoirie liée à cette personne.');
        return card(index, 'Blason / noblesse', rows.length || '', body, 'span-6', editOnly(`<button type="button" class="button small secondary" data-h-coat-link="${p.id}">+ Armoiries</button>`));
    };
    async function openCoatDialog(id, presetPerson = null) {
        let c = {people: presetPerson ? [{person: presetPerson, note: ''}] : [], media: []};
        if (id) { const data = await api('coats_of_arms'); c = (data.coats || []).find(x => Number(x.id) === Number(id)) || c; }
        const f = k => esc(c[k] || '');
        const personRow = (l = {}) => `<div class="transfer-row">${A().collectionPersonField('person_id', l.person || null, 'Personne…')}<input type="text" name="note" value="${esc(l.note || '')}" placeholder="Rôle (chef de nom, branche cadette…)"><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
        openDialog({
            eyebrow: 'ARMOIRIES', title: id ? 'Modifier les armoiries' : 'Nouvelles armoiries', wide: true, labels: ['coat_of_arms', c.labels],
            body: `<div class="form-grid">
                <label>Nom<input name="title" required value="${f('title')}" placeholder="Armes de la famille de Montferrand"></label>
                <label>Titre de noblesse<input name="title_of_nobility" value="${f('title_of_nobility')}" placeholder="Écuyer, seigneur de…, comte…"></label>
                <label class="span-2">Blasonnement <small>(la description en langue héraldique)</small><textarea name="blazon" rows="3" placeholder="D’azur à trois fleurs de lys d’or, posées deux et un">${f('blazon')}</textarea></label>
                <div class="span-2 h-blazon-words">${blazonWords.map(([group, words]) => `<div><small>${esc(group)}</small>${words.map(w => `<button type="button" class="h-word" data-h-blazon-word="${esc(w)}">${esc(w)}</button>`).join('')}</div>`).join('')}</div>
                <label>Devise<input name="motto" value="${f('motto')}" placeholder="Fidèle à mon roi"></label>
                <label>Origine, sources<textarea name="origin_text" rows="2" placeholder="Armorial général de 1696, généralité de Limoges">${f('origin_text')}</textarea></label>
                <label class="span-2">Notes<textarea name="notes" rows="2">${f('notes')}</textarea></label></div>
                <h4>Personnes qui l’ont porté</h4><div class="h-rows" data-h-rows="people">${(c.people?.length ? c.people : [{}]).map(personRow).join('')}</div><button type="button" class="button small secondary" data-h-row-add="people">+ Personne</button><template data-h-template="people">${personRow()}</template>
                <h4>Image du blason</h4>${ext.openVectorEditor ? `<p class="h-coat-vec"><button type="button" class="button small" data-h-coat-vector>✒️ ${c.media?.length ? 'Refaire / retoucher le blason en vectoriel' : 'Dessiner le blason (écu, partitions, émaux, meubles)'}</button> <small class="muted">${c.id ? 'Le dessin vient s’ajouter ici en image, et le blasonnement se remplit s’il est vide.' : 'Enregistre d’abord les armoiries.'}</small></p>` : ''}${mediaEditorHtml('coat_of_arms', c.id, c.media, [['', 'Blason (image), sceau, ex-libris, armorial']])}`,
            onSubmit: async form => {
                const val = values(form);
                const people = [...form.querySelectorAll('[data-h-rows=people] .transfer-row')].map(r => ({person_id: r.querySelector('[name=person_id]').value, note: r.querySelector('[name=note]').value})).filter(p => Number(p.person_id));
                const saved = await api('save_coat_of_arms', {}, {method: 'POST', body: {id: c.id || 0, title: val.title, blazon: val.blazon, motto: val.motto, title_of_nobility: val.title_of_nobility, origin_text: val.origin_text, notes: val.notes, people}});
                await uploadMediaEditor(form, 'coat_of_arms', saved.result.id);
                toast('Armoiries enregistrées.'); await refreshView();
            },
            onDelete: c.id ? async () => { if (!confirm(`Supprimer « ${c.title} » ?`)) return false; await api('delete_coat_of_arms', {}, {method: 'POST', body: {id: c.id}}); toast('Supprimé.'); await refreshView(); } : null,
            onOpen: dialog => {
                dialog.addEventListener('click', event => {
                    if (event.target.closest('[data-h-coat-vector]')) {
                        if (!c.id) { toast('Enregistre d’abord les armoiries, puis rouvre-les pour dessiner le blason.', 'error'); return; }
                        const first = (c.media || []).find(m => /\.(png|jpe?g|webp|gif)$/i.test(m.filename || ''));
                        ext.openVectorEditor({coat: {id: c.id, title: dialog.querySelector('[name=title]')?.value || c.title}, imageSrc: first ? 'media/' + encodeURIComponent(first.filename) : '',
                            onBlazon: text => { const ta = dialog.querySelector('[name=blazon]'); if (ta && !ta.value.trim()) ta.value = text; },
                            onCoatSaved: () => toast('Image du blason ajoutée : elle apparaît à la réouverture des armoiries.')});
                        return;
                    }
                    const w = event.target.closest('[data-h-blazon-word]');
                    if (!w) return;
                    const ta = dialog.querySelector('[name=blazon]'), pos = ta.selectionStart ?? ta.value.length, before = ta.value.slice(0, pos), word = w.dataset.hBlazonWord;
                    const text = (before && !/\s$/.test(before) ? ' ' : '') + (before.trim() ? word : word.charAt(0).toUpperCase() + word.slice(1));
                    ta.value = before + text + ta.value.slice(pos); ta.focus(); ta.selectionStart = ta.selectionEnd = pos + text.length;
                });
            },
        });
    }
    async function openCoatLinkDialog(personId) {
        const [data, detail] = await Promise.all([api('coats_of_arms'), api('person', {id: personId})]);
        const person = detail.person, coats = (data.coats || []).filter(c => !(c.people || []).some(l => Number(l.person.id) === Number(personId)));
        openDialog({
            eyebrow: 'ARMOIRIES', title: 'Lier des armoiries à ' + A().personName(person), submitLabel: 'Lier',
            body: `${coats.length ? `<label class="h-block-label">Armoiries déjà enregistrées<select name="coat_id"><option value="">— Choisir —</option>${coats.map(c => `<option value="${c.id}">${esc(c.title)}${c.blazon ? ' — ' + esc(c.blazon.slice(0, 60)) : ''}</option>`).join('')}</select></label>` : '<p class="muted">Aucune autre armoirie enregistrée.</p>'}
                <label class="h-block-label">Rôle (facultatif)<input name="note" placeholder="Chef de nom, branche cadette…"></label>
                <p><button type="button" class="button secondary" data-h-coat-new>Créer de nouvelles armoiries…</button></p>`,
            onSubmit: async form => {
                const val = values(form);
                if (!val.coat_id) { toast('Choisis des armoiries, ou crée-en de nouvelles.', 'error'); return false; }
                const coat = coats.find(c => Number(c.id) === Number(val.coat_id));
                const people = [...(coat.people || []).map(l => ({person_id: l.person.id, note: l.note})), {person_id: personId, note: val.note}];
                await api('save_coat_of_arms', {}, {method: 'POST', body: {...coat, people}});
                toast('Armoiries liées.'); await refreshView();
            },
            onOpen: dialog => dialog.querySelector('[data-h-coat-new]').addEventListener('click', () => { dialog.close(); openCoatDialog(0, person); }),
        });
    }
    document.addEventListener('click', event => {
        const e = event.target.closest?.('[data-h-coat-edit]');
        if (e) openCoatDialog(Number(e.dataset.hCoatEdit)).catch(error => toast(error.message, 'error'));
        const l = event.target.closest?.('[data-h-coat-link]');
        if (l) openCoatLinkDialog(Number(l.dataset.hCoatLink)).catch(error => toast(error.message, 'error'));
        const add = event.target.closest?.('[data-h-row-add]');
        if (add) {
            const root = add.closest('form') || document, tpl = root.querySelector(`[data-h-template="${add.dataset.hRowAdd}"]`);
            root.querySelector(`[data-h-rows="${add.dataset.hRowAdd}"]`).insertAdjacentHTML('beforeend', tpl.innerHTML);
            A().bindCollectionPersonFields(root);
        }
        const rm = event.target.closest?.('[data-h-row-remove]');
        if (rm) rm.closest('.transfer-row, tr')?.remove();
    });

    /* ═══════════════════════ 🎖️ POILUS ET JOURNAUX DE MARCHE ═══════════════════════ */

    const poiluKinds = {incorpore: 'Incorporé', blesse: 'Blessé', malade: 'Malade / évacué', gaze: 'Gazé', prisonnier: 'Fait prisonnier', disparu: 'Disparu', tue: 'Tué', cite: 'Cité / décoré', permission: 'Permission', mutation: 'Changement d’unité', autre: 'Autre'};
    const MDH = 'https://www.memoiredeshommes.sga.defense.gouv.fr/';
    const jmoSearch = unit => `https://www.google.com/search?q=${encodeURIComponent(`"${unit}" journal des marches et opérations site:memoiredeshommes.sga.defense.gouv.fr`)}`;
    const gallicaHistory = unit => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`(gallica all "historique du ${unit}")`)}`;
    /** Unité où le soldat se trouvait à une date (d'après les périodes saisies). */
    function unitAt(units, date) {
        if (!date) return null;
        const d = String(date);
        return units.find(u => (!u.date_from || u.date_from <= d) && (!u.date_to || d <= u.date_to + '-99')) || (units.length === 1 ? units[0] : null);
    }
    function jmoLinks(u, date = '') {
        return `<span class="h-jmo-links">${u.jmo_url ? `<a href="${esc(u.jmo_url)}" target="_blank" rel="noopener noreferrer">📖 Journal de marche${u.jmo_cote ? ' (' + esc(u.jmo_cote) + ')' : ''} ↗</a>` : `<a href="${esc(jmoSearch(u.unit_name))}" target="_blank" rel="noopener noreferrer">📖 Trouver le journal de marche ↗</a>`}
            <a href="${MDH}" target="_blank" rel="noopener noreferrer">Mémoire des hommes ↗</a><a href="${esc(gallicaHistory(u.unit_name))}" target="_blank" rel="noopener noreferrer">Historique du régiment (Gallica) ↗</a>${date ? `<small class="muted">Dans le journal, va à la page du ${esc(dateFr(date))}.</small>` : ''}</span>`;
    }
    function poiluHtml(data, person) {
        const units = data.units || [], events = data.events || [];
        const unitRows = units.map(u => `<tr><td><strong>${esc(u.unit_name)}</strong>${u.note ? `<br><small>${esc(u.note)}</small>` : ''}</td><td>${esc([dateFr(u.date_from), dateFr(u.date_to)].filter(Boolean).join(' → ') || '—')}</td><td>${jmoLinks(u)}</td></tr>`).join('');
        const eventRows = events.map(e => {
            const u = unitAt(units, e.event_date);
            return `<li class="h-poilu-event is-${esc(e.kind)}"><strong>${esc(dateFr(e.event_date) || 'Date ?')}</strong> — ${esc(e.kind_label || poiluKinds[e.kind] || '')}${e.place_text ? ` à ${esc(e.place_text)}` : ''}${e.note ? ` <small>(${esc(e.note)})</small>` : ''}
                ${u ? `<div class="h-poilu-where">Ce jour-là, ${esc(person ? A().personName(person) : 'il')} était au <strong>${esc(u.unit_name)}</strong>. ${jmoLinks(u, e.event_date)}</div>` : (units.length ? '<div class="muted">Aucune unité saisie à cette date.</div>' : '')}</li>`;
        }).join('');
        return `${LC(data.labels)}${units.length ? `<table class="data-table h-poilu-units"><thead><tr><th>Unité</th><th>Période</th><th>Journaux de marche et opérations</th></tr></thead><tbody>${unitRows}</tbody></table>` : '<p class="muted">Ajoute son régiment (ex. « 152e régiment d’infanterie ») et ses dates : le lien vers les journaux de marche apparaîtra.</p>'}
            ${events.length ? `<ol class="h-poilu-events">${eventRows}</ol>` : ''}
            <p class="muted h-poilu-help">Les journaux des marches et opérations (JMO) sont les carnets où chaque unité notait jour après jour où elle était et ce qu’elle faisait. Ils sont numérisés sur Mémoire des hommes (rubrique « Journaux des unités, 1914-1918 »). Colle l’adresse exacte du journal dans la fiche pour l’ouvrir en un clic.</p>`;
    }
    ext.personBlocks.poilu = (index, detail, {editOnly}) => {
        const p = detail.person;
        if (!flagShown(p, 'show_poilu_block')) return '';
        const data = detail.heritage?.poilu || {units: [], events: []};
        return card(index, 'Poilu 14-18', (data.units || []).length || '', poiluHtml(data, p), 'span-12', editOnly(tools(`data-h-poilu-edit="${p.id}"`, `data-h-poilu-clear="${p.id}"`, 'le parcours de poilu')));
    };
    async function openPoiluDialog(personId) {
        const detail = await api('person', {id: personId});
        const data = detail.heritage?.poilu || {units: [], events: []};
        const unitRow = (u = {}) => `<div class="transfer-row h-unit-row"><input name="unit_name" value="${esc(u.unit_name || '')}" placeholder="152e régiment d’infanterie" list="h-units"><input type="date" name="date_from" value="${esc(u.date_from || '')}" title="Du"><input type="date" name="date_to" value="${esc(u.date_to || '')}" title="Au"><input name="jmo_cote" value="${esc(u.jmo_cote || '')}" placeholder="Cote JMO (26 N 698/1)"><input name="jmo_url" value="${esc(u.jmo_url || '')}" placeholder="Adresse du journal (https://…)"><input name="note" value="${esc(u.note || '')}" placeholder="Compagnie, bataillon…"><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
        const eventRow = (e = {}) => `<div class="transfer-row h-event-row"><input type="date" name="event_date" value="${esc(e.event_date || '')}"><select name="kind">${Object.entries(poiluKinds).map(([k, l]) => `<option value="${k}" ${e.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><input name="place_text" value="${esc(e.place_text || '')}" placeholder="Lieu (Verdun, bois des Caures…)"><input name="note" value="${esc(e.note || '')}" placeholder="Détail (éclat d’obus à la jambe…)"><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
        openDialog({
            eyebrow: 'POILU 14-18', title: 'Parcours de ' + A().personName(detail.person), wide: true, labels: ['poilu', data.labels],
            body: `<p class="muted">Le registre matricule (bloc Militaire) donne les unités successives et leurs dates, les blessures, les citations.</p>
                <h4>Unités (régiments, bataillons…)</h4><div class="h-rows" data-h-rows="units">${(data.units.length ? data.units : [{}]).map(unitRow).join('')}</div><button type="button" class="button small secondary" data-h-row-add="units">+ Unité</button><template data-h-template="units">${unitRow()}</template>
                <datalist id="h-units"><option>régiment d’infanterie</option><option>régiment d’infanterie territoriale</option><option>bataillon de chasseurs à pied</option><option>régiment d’artillerie de campagne</option><option>régiment de dragons</option><option>régiment du génie</option><option>régiment de tirailleurs</option><option>régiment d’infanterie coloniale</option></datalist>
                <h4>Événements datés</h4><div class="h-rows" data-h-rows="events">${(data.events.length ? data.events : [{}]).map(eventRow).join('')}</div><button type="button" class="button small secondary" data-h-row-add="events">+ Événement</button><template data-h-template="events">${eventRow()}</template>`,
            onSubmit: async form => {
                const units = [...form.querySelectorAll('.h-unit-row')].map(r => Object.fromEntries(['unit_name', 'date_from', 'date_to', 'jmo_cote', 'jmo_url', 'note'].map(k => [k, r.querySelector(`[name=${k}]`).value])));
                const events = [...form.querySelectorAll('.h-event-row')].map(r => Object.fromEntries(['event_date', 'kind', 'place_text', 'note'].map(k => [k, r.querySelector(`[name=${k}]`).value])));
                await api('save_poilu', {}, {method: 'POST', body: {person_id: personId, units, events}});
                toast('Parcours enregistré.'); await refreshView();
            },
        });
    }
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-poilu-edit]');
        if (b) openPoiluDialog(Number(b.dataset.hPoiluEdit)).catch(error => toast(error.message, 'error'));
    });

    /* ═══════════════════════ 📊 INVENTAIRES APRÈS DÉCÈS ═══════════════════════ */

    const probateCategories = {meubles: 'Meubles', betail: 'Bétail', outils: 'Outils', linge: 'Linge', vetements: 'Vêtements', vaisselle: 'Vaisselle, cuisine', grains: 'Grains, récoltes, provisions', argent: 'Argent, créances', immeubles: 'Maisons, terres', livres: 'Livres, papiers', bijoux: 'Bijoux', dettes: 'Dettes (à déduire)', autre: 'Autre'};
    const currencyLabel = c => ({livre: 'livres', franc: 'francs', nf: 'nouveaux francs'}[c] || 'livres');
    /** Même lecture que parse_old_amount (lib/heritage.php) : « 12 l 5 s 3 d », « 152,50 ». */
    function parseAmount(text) {
        const t = String(text || '').toLowerCase().replace(/ /g, ' ').trim();
        if (!t) return null;
        if (/^-?\d+(?:[.,]\d+)?$/.test(t.replace(/ /g, ''))) return Number(t.replace(/ /g, '').replace(',', '.'));
        const num = re => { const m = t.match(re); return m ? Number(String(m[1]).replace(',', '.')) : 0; };
        const l = num(/(\d+(?:[.,]\d+)?)\s*(?:l\b|lt\b|livres?|£|f\b|fr\b|francs?)/), s = num(/(\d+)\s*(?:s\b|sols?|sous)/), d = num(/(\d+)\s*(?:d\b|deniers?)/), c = num(/(\d+)\s*(?:c\b|cts?|centimes?)/);
        return l || s || d || c ? l + s / 20 + d / 240 + c / 100 : null;
    }
    const moneyText = (v, currency) => {
        if (currency === 'livre') { const total = Math.round((Number(v) || 0) * 240), lv = Math.floor(total / 240), sl = Math.floor((total % 240) / 12), dn = total % 12; return `${fmt(lv)} l${sl ? ` ${sl} s` : ''}${dn ? ` ${dn} d` : ''}`; }
        return `${fmt(v, 2)} ${currency === 'nf' ? 'NF' : 'F'}`;
    };
    /** Valeur en journées de travail d'un journalier (convertisseur de pouvoir d'achat de l'application). */
    function workDays(value, currency, year) {
        if (!year || !value) return null;
        let sols = Number(value) * 20;
        if (currency === 'nf' || (currency === 'franc' && year >= 1960)) sols *= 100;
        const wage = A().journalierWageSols(year);
        return wage ? sols / wage : null;
    }
    function probateSummaryHtml(inv) {
        const days = workDays(inv.net, inv.currency, inv.year);
        const cats = Object.entries(inv.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
        return `<article class="h-record"><header><div><strong>📜 Inventaire ${inv.date_text ? 'du ' + esc(inv.date_text) : ''}</strong>${LC(inv.labels)}${inv.notary ? ` <small>— ${esc(inv.notary)}</small>` : ''}${inv.person_name ? `<div>${personLink(inv.person_id, inv.person_name)}</div>` : ''}</div>${tools(`data-h-open-list="probate" data-h-edit="${inv.id}"`, `data-h-probate-delete="${inv.id}"`, 'cet inventaire')}</header>
            <p class="h-probate-total">Total : <strong>${esc(moneyText(inv.total, inv.currency))}</strong>${inv.debts ? ` · dettes ${esc(moneyText(inv.debts, inv.currency))} · net <strong>${esc(moneyText(inv.net, inv.currency))}</strong>` : ''}${days ? ` · ≈ <strong>${fmt(days)} journées de travail</strong> d’un journalier (${fmt(days / 250, 1)} années)` : ''}</p>
            ${cats.length ? `<p class="muted">${cats.map(([k, v]) => `${esc(probateCategories[k] || k)} : ${esc(moneyText(v, inv.currency))}`).join(' · ')}</p>` : ''}${thumbs('probate-' + inv.id, inv.media)}</article>`;
    }
    ext.personBlocks.probate = (index, detail) => {
        const rows = detail.heritage?.probate_inventories || [];
        if (!rows.length) return '';
        return card(index, 'Inventaire après décès', rows.length, rows.map(probateSummaryHtml).join(''), 'span-12', `<button type="button" class="button small secondary" data-h-open-list="probate" data-h-edit="0" data-h-person-id="${detail.person.id}">+ Inventaire</button>`);
    };

    /* ═══════════════════════ 🗄️ PAPIERS DE FAMILLE ═══════════════════════ */

    ext.personBlocks.family_papers_block = (index, detail) => {
        const rows = detail.heritage?.family_papers || [];
        if (!rows.length) return '';
        return card(index, 'Papiers de famille (originaux)', rows.length, `<ul class="h-paper-mini">${rows.map(r => `<li><span class="h-paper-number">${esc(r.class_number)}</span> <strong>${esc(r.title)}</strong>${LC(r.labels)}${r.date_text ? ` <small>${esc(r.date_text)}</small>` : ''}<br><small>📦 ${esc(r.storage_location || 'rangement à préciser')}${r.holder_text ? ' · chez ' + esc(r.holder_text) : ''}</small> ${tools(`data-h-open-list="family_papers" data-h-edit="${r.id}"`, `data-h-paper-delete="${r.id}"`, 'ce document')} ${thumbs('paper-' + r.id, r.media)}</li>`).join('')}</ul>`, 'span-6', '<button type="button" class="button small secondary" data-h-open-list="family_papers">Inventaire</button>');
    };

    /* ═══════════════════════ LISTES ═══════════════════════ */

    function pageHeader(eyebrow, title, intro, actions = '') {
        return `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</header>`;
    }
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes';
    function personPickerAdd(label, attr) {
        return `<span class="h-person-add">${A().collectionPersonField('h_add_person', null, 'Pour qui ? (nom)')}<button type="button" class="button" ${attr}>${esc(label)}</button></span>`;
    }
    function pickedPerson(button) { return Number(button.closest('.h-person-add')?.querySelector('[name=h_add_person]')?.value) || 0; }

    /* ── Départs et émigration ── */
    ext.lists.voyages_list = async token => {
        const data = await api('voyages');
        if (!isCurrent(token)) return;
        const rows = data.voyages || [];
        const destinations = {};
        rows.forEach(v => { const d = (v.destination || v.arrival_port || '?').split(',')[0].trim(); destinations[d] = (destinations[d] || 0) + 1; });
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Départs et émigration', 'Les branches parties au Québec, aux États-Unis, en Argentine, en Algérie… Chaque voyage se remplit depuis le bloc « Départs / émigration » de la fiche (case à cocher dans IDENTITÉ → Modifier la personne).')}
            <div class="collection-toolbar">${personPickerAdd('+ Voyage', 'data-h-voyage-add-list')}</div>
            ${rows.length ? `<p class="muted">${plural(rows.length, 'voyage', 'voyages')} · ${Object.entries(destinations).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${esc(d)} (${n})`).join(' · ')}</p>${voyagePaths(rows)}<div class="h-records h-records-grid">${rows.map(v => voyageCardHtml(v, {withPerson: true})).join('')}</div>` : empty('Aucun voyage enregistré.')}</section>`;
        A().bindCollectionPersonFields(A().$('#workspace'));
        A().$('[data-h-voyage-add-list]').addEventListener('click', event => { const pid = pickedPerson(event.currentTarget); if (!pid) return toast('Choisis d’abord la personne.', 'error'); openVoyageDialog(0, pid); });
    };

    /* ── Enfants placés ── */
    ext.lists.placements_list = async token => {
        const data = await api('placements');
        if (!isCurrent(token)) return;
        const rows = data.placements || [];
        const places = {};
        rows.forEach(r => { const d = (r.place_text || '?').split(',')[0].trim(); places[d] = (places[d] || 0) + 1; });
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Enfants placés', 'Enfants mis en nourrice, abandonnés ou recueillis par l’hospice : lieu et durée du placement. Beaucoup d’enfants de Paris partaient en nourrice dans le Morvan.')}
            <div class="collection-toolbar">${personPickerAdd('+ Placement', 'data-h-placement-add-list')}</div>
            ${rows.length ? `<p class="muted">${plural(rows.length, 'placement', 'placements')} · ${Object.entries(places).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${esc(d)} (${n})`).join(' · ')}</p>${placementMap(rows)}
            <table class="data-table"><thead><tr><th>Enfant</th><th>Situation</th><th>Lieu</th><th>Période</th><th>Durée</th><th>Nourrice / institution</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${personLink(r.person_id, r.person_name)}</td><td>${esc(r.kind_label)}</td><td>${esc(r.place_text)}${r.origin_text ? `<br><small>depuis ${esc(r.origin_text)}</small>` : ''}</td><td>${esc([r.start_date, r.end_date].filter(Boolean).join(' → '))}</td><td>${esc(r.duration)}</td><td>${esc([r.nurse_person_name, r.nurse_name, r.institution].filter(Boolean).join(' · '))}</td><td>${tools(`data-h-placement-edit="${r.id}" data-h-placement-person="${r.person_id}"`, `data-h-placement-delete="${r.id}"`, 'ce placement')}</td></tr>`).join('')}</tbody></table>` : empty('Aucun placement enregistré.')}</section>`;
        A().bindCollectionPersonFields(A().$('#workspace'));
        A().$('[data-h-placement-add-list]').addEventListener('click', event => { const pid = pickedPerson(event.currentTarget); if (!pid) return toast('Choisis d’abord la personne.', 'error'); openPlacementDialog(0, pid); });
    };

    /* ── Armoiries ── */
    ext.lists.coats_of_arms = async token => {
        const q = S().hCoatsQuery || '';
        const data = await api('coats_of_arms', {q});
        if (!isCurrent(token)) return;
        const rows = data.coats || [];
        registerCoatMedia(rows);
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Armoiries', 'Les blasons de ta famille : l’image, la description dans la langue des héraldistes (« d’azur à trois fleurs de lys d’or »), la devise et les personnes qui l’ont porté. Sur une fiche, coche « Noblesse / blason » pour l’afficher.')}
            <div class="collection-toolbar"><input type="search" id="h-coats-q" value="${esc(q)}" placeholder="Chercher (nom, blasonnement, famille)…"><button type="button" class="button" data-h-coat-edit="0">+ Armoiries</button></div>
            <div class="h-coats h-coats-grid">${rows.map(c => coatCardHtml(c)).join('') || empty('Aucune armoirie. Ajoute la première avec « + Armoiries » (image du blason, blasonnement, porteurs).')}</div></section>`;
        A().$('#h-coats-q').addEventListener('change', event => { S().hCoatsQuery = event.target.value.trim(); A().renderList(); });
    };

    /* ── Poilus ── */
    ext.lists.poilus_list = async token => {
        const data = await api('poilus');
        if (!isCurrent(token)) return;
        const rows = data.poilus || [];
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Poilus 14-18', 'Les soldats de la Grande Guerre : leurs unités et, pour chaque date importante (blessure, disparition…), le lien vers le journal de marche de leur régiment ce jour-là.')}
            ${rows.length ? rows.map(r => `<article class="h-record"><header><div>${chip(r.person)}${(r.person.mort_pour_la_france === 'yes') ? ' <span class="collection-kind">Mort pour la France</span>' : ''}</div>${tools(`data-h-poilu-edit="${r.person.id}"`, `data-h-poilu-clear="${r.person.id}"`, 'ce parcours')}</header>${poiluHtml(r, r.person)}</article>`).join('') : empty('Aucun poilu : coche « Poilu 14-18 » dans IDENTITÉ → Modifier la personne, puis saisis son parcours.')}</section>`;
        A().bindTableLinks();
    };

    /* ── Inventaires après décès ── */
    ext.lists.probate = async (token, editOverride = null) => {
        const data = await api('probate_inventories');
        if (!isCurrent(token)) return;
        const rows = data.inventories || [];
        const pending = S().hEdit?.list === 'probate' ? S().hEdit : null;
        S().hEdit = null;
        const edit = editOverride || pending;
        let editing = null;
        if (edit) editing = edit.id ? rows.find(r => Number(r.id) === Number(edit.id)) : {id: 0, person_id: edit.personId || 0, currency: 'livre', items: [], media: []};
        if (editing && !editing.person && editing.person_id) { try { editing.person = (await api('person', {id: editing.person_id})).person; } catch (_) {} }
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Inventaires après décès', 'Saisis un inventaire pièce par pièce (meubles, bétail, outils, linge…) avec la valeur de chaque objet. Le total est converti en journées de travail d’un journalier pour comparer la richesse d’une génération à l’autre (Graphiques → Statistiques → Richesse).')}
            <div class="collection-toolbar"><button type="button" class="button" data-h-probate-new>+ Inventaire</button><button type="button" class="button secondary" data-h-probate-compare>Comparer les générations</button></div>
            ${editing ? probateFormHtml(editing) : ''}
            ${rows.length ? `<table class="data-table"><thead><tr><th>Personne</th><th>Date</th><th>Notaire</th><th>Total</th><th>Net</th><th>Journées de travail</th><th></th></tr></thead><tbody>${rows.map(r => { const d = workDays(r.net, r.currency, r.year); return `<tr><td>${personLink(r.person_id, r.person_name)}${LC(r.labels)}</td><td>${esc(r.date_text)}</td><td>${esc(r.notary)}</td><td>${esc(moneyText(r.total, r.currency))}</td><td>${esc(moneyText(r.net, r.currency))}</td><td>${d ? fmt(d) : '—'}</td><td>${tools(`data-h-probate-edit="${r.id}"`, `data-h-probate-delete="${r.id}"`, 'cet inventaire')}</td></tr>`; }).join('')}</tbody></table>` : (editing ? '' : empty('Aucun inventaire après décès.'))}</section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-probate-new]').addEventListener('click', () => ext.lists.probate(++S().workspaceToken, {id: 0}));
        ws.querySelector('[data-h-probate-compare]').addEventListener('click', () => { S().graphTab = 'stats'; S().graphStatsType = 'probate_wealth'; A().setModule('graphiques'); });
        ws.querySelectorAll('[data-h-probate-edit]').forEach(b => b.addEventListener('click', () => ext.lists.probate(++S().workspaceToken, {id: Number(b.dataset.hProbateEdit)})));
        if (editing) bindProbateForm(editing);
    };
    function probateItemRow(it = {}) {
        return `<tr class="h-item-row"><td><input name="room" value="${esc(it.room || '')}" list="h-rooms" placeholder="Cuisine"></td><td><select name="category">${Object.entries(probateCategories).map(([k, l]) => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td><td><input name="description" value="${esc(it.description || '')}" placeholder="Une table de noyer avec ses deux bancs"></td><td><input name="quantity" value="${esc(it.quantity || '')}" placeholder="1" class="h-narrow"></td><td><input name="value_text" value="${esc(it.value_text || '')}" placeholder="3 l 10 s" class="h-narrow"></td><td><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></td></tr>`;
    }
    function probateFormHtml(inv) {
        const f = k => esc(inv[k] || '');
        return `<form class="maintenance-panel collection-form" id="h-probate-form"><h3>${inv.id ? 'Modifier l’inventaire' : 'Nouvel inventaire après décès'}</h3>
            <div class="form-grid"><label>Défunt(e)${A().collectionPersonField('person_id', inv.person || null, 'Personne de la base…')}</label><label>Date<input name="date_text" value="${f('date_text')}" placeholder="12 mars 1782"></label>
            <label>Notaire<input name="notary" value="${f('notary')}" placeholder="Me Dubois, notaire à Tulle"></label><label>Lieu<input name="place_text" value="${f('place_text')}"></label>
            <label>Monnaie<select name="currency"><option value="livre" ${inv.currency === 'livre' ? 'selected' : ''}>Livres tournois (l, s, d)</option><option value="franc" ${inv.currency === 'franc' ? 'selected' : ''}>Francs</option><option value="nf" ${inv.currency === 'nf' ? 'selected' : ''}>Nouveaux francs (1960-2001)</option></select></label><label>Cote<input name="reference" value="${f('reference')}" placeholder="AD19, 3 E 1234"></label></div>
            <h4>Objets, pièce par pièce</h4><p class="muted">Valeur : « 12 l 5 s 3 d » (livres, sols, deniers), « 12 livres 5 sols », ou un nombre (« 152,50 »). La catégorie « Dettes » est déduite du total.</p>
            <table class="data-table h-items"><thead><tr><th>Pièce</th><th>Catégorie</th><th>Objet</th><th>Qté</th><th>Valeur</th><th></th></tr></thead><tbody data-h-rows="items">${(inv.items?.length ? inv.items : [{}, {}, {}]).map(probateItemRow).join('')}</tbody></table>
            <datalist id="h-rooms"><option>Cuisine</option><option>Chambre</option><option>Grenier</option><option>Cave</option><option>Écurie</option><option>Étable</option><option>Grange</option><option>Boutique</option><option>Atelier</option><option>Cour</option></datalist>
            <p><button type="button" class="button small secondary" data-h-item-add>+ Ligne</button> <button type="button" class="button small secondary" data-h-item-add5>+ 5 lignes</button> <strong class="h-probate-live"></strong></p>
            <label class="h-block-label">Notes<textarea name="notes" rows="2">${f('notes')}</textarea></label>
            <h4>Scans de l’inventaire</h4>${mediaEditorHtml('probate_inventory', inv.id, inv.media, [['', 'Pages de l’inventaire']])}
            ${LP('probate_inventory', inv.labels)}<div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button><button class="button secondary" type="button" data-h-probate-cancel>Annuler</button>${inv.id ? '<button class="button secondary danger" type="button" data-h-probate-delete>Supprimer</button>' : ''}</div></form>`;
    }
    function bindProbateForm(inv) {
        const form = A().$('#h-probate-form');
        A().bindCollectionPersonFields(form); bindMediaEditor(form); form.scrollIntoView({block: 'start'});
        const live = () => {
            const cur = form.elements.currency.value; let total = 0, debts = 0;
            form.querySelectorAll('.h-item-row').forEach(r => { const v = parseAmount(r.querySelector('[name=value_text]').value) || 0; if (r.querySelector('[name=category]').value === 'dettes') debts += v; else total += v; });
            const year = yearOf(form.elements.date_text.value), days = workDays(total - debts, cur, year);
            form.querySelector('.h-probate-live').textContent = `Total ${moneyText(total, cur)}${debts ? ` − dettes ${moneyText(debts, cur)} = ${moneyText(total - debts, cur)}` : ''}${days ? ` ≈ ${fmt(days)} journées de travail` : ''}`;
        };
        form.addEventListener('input', live); live();
        form.querySelector('[data-h-item-add]').addEventListener('click', () => { form.querySelector('[data-h-rows=items]').insertAdjacentHTML('beforeend', probateItemRow()); });
        form.querySelector('[data-h-item-add5]').addEventListener('click', () => { form.querySelector('[data-h-rows=items]').insertAdjacentHTML('beforeend', [1, 2, 3, 4, 5].map(() => probateItemRow()).join('')); });
        form.addEventListener('click', () => setTimeout(live, 0));
        form.querySelector('[data-h-probate-cancel]').addEventListener('click', () => A().renderList());
        form.querySelector('[data-h-probate-delete]')?.addEventListener('click', async () => { if (!confirm('Supprimer cet inventaire ?')) return; await api('delete_probate_inventory', {}, {method: 'POST', body: {id: inv.id}}); toast('Supprimé.'); A().renderList(); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const v = values(form);
            const personId = Number(form.querySelector('[name=person_id]').value);
            if (!personId) return toast('Choisis la personne (dans les suggestions).', 'error');
            const items = [...form.querySelectorAll('.h-item-row')].map(r => Object.fromEntries(['room', 'category', 'description', 'quantity', 'value_text'].map(k => [k, r.querySelector(`[name=${k}]`).value])));
            try {
                const saved = await api('save_probate_inventory', {}, {method: 'POST', body: {id: inv.id, person_id: personId, date_text: v.date_text, notary: v.notary, place_text: v.place_text, currency: v.currency, reference: v.reference, notes: v.notes, items}});
                await uploadMediaEditor(form, 'probate_inventory', saved.result.id);
                toast('Inventaire enregistré.'); A().renderList();
            } catch (error) { toast(error.message, 'error'); }
        });
    }

    /* ── Papiers de famille ── */
    const paperKinds = ['Livret de famille', 'Acte ancien', 'Acte notarié', 'Lettre', 'Carte postale', 'Photo papier', 'Diplôme', 'Livret militaire', 'Carte d’identité', 'Passeport', 'Faire-part', 'Image pieuse', 'Livre de comptes', 'Journal intime', 'Autre'];
    ext.lists.family_papers = async (token, editOverride = null) => {
        const q = S().hPapersQuery || '';
        const data = await api('family_papers', {q});
        if (!isCurrent(token)) return;
        const rows = data.papers || [];
        const editing = editOverride ? (editOverride.id ? rows.find(r => Number(r.id) === Number(editOverride.id)) : {id: 0, class_number: data.next_number, people: [], media: []}) : null;
        const locations = [...new Set(rows.map(r => r.storage_location).filter(Boolean))];
        const groups = {};
        rows.forEach(r => { (groups[r.storage_location || 'Rangement à préciser'] ||= []).push(r); });
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Papiers de famille', 'L’inventaire de tes originaux papier (livrets de famille, actes anciens, lettres, photos papier) : où chacun est rangé, son numéro de classement, une étiquette à imprimer et à coller sur la chemise, et le lien vers son scan.')}
            <div class="collection-toolbar"><input type="search" id="h-papers-q" value="${esc(q)}" placeholder="Chercher (titre, n°, rangement, chez qui)…"><button type="button" class="button" data-h-paper-new>+ Document</button><button type="button" class="button secondary" data-h-paper-labels>Imprimer les étiquettes</button><button type="button" class="button secondary" data-h-paper-print>Imprimer l’inventaire</button></div>
            ${editing ? paperFormHtml(editing, locations) : ''}
            ${rows.length ? Object.entries(groups).map(([loc, list]) => `<h3>📦 ${esc(loc)} <small>(${list.length})</small></h3><table class="data-table h-papers"><thead><tr><th><input type="checkbox" data-h-paper-all title="Tout cocher"></th><th>N°</th><th>Document</th><th>Date</th><th>Chez</th><th>Personnes</th><th>Scan</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td><input type="checkbox" data-h-paper-check="${r.id}"></td><td><span class="h-paper-number">${esc(r.class_number)}</span></td><td><strong>${esc(r.title)}</strong>${LC(r.labels)}${r.kind ? `<br><small>${esc(r.kind)}</small>` : ''}${r.condition_text ? `<br><small class="muted">État : ${esc(r.condition_text)}</small>` : ''}</td><td>${esc(r.date_text)}</td><td>${esc(r.holder_text)}</td><td>${(r.people || []).map(chip).join('<br>')}</td><td>${thumbs('paper-' + r.id, r.media, {emptyText: 'pas de scan'})}</td><td>${tools(`data-h-paper-edit="${r.id}"`, `data-h-paper-delete="${r.id}"`, 'ce document')}</td></tr>`).join('')}</tbody></table>`).join('') : (editing ? '' : empty('Aucun document. Ajoute le premier avec « + Document ».'))}</section>`;
        const ws = A().$('#workspace');
        A().bindTableLinks();
        ws.querySelector('#h-papers-q').addEventListener('change', event => { S().hPapersQuery = event.target.value.trim(); A().renderList(); });
        ws.querySelector('[data-h-paper-new]').addEventListener('click', () => ext.lists.family_papers(++S().workspaceToken, {id: 0}));
        ws.querySelectorAll('[data-h-paper-edit]').forEach(b => b.addEventListener('click', () => ext.lists.family_papers(++S().workspaceToken, {id: Number(b.dataset.hPaperEdit)})));
        ws.querySelectorAll('[data-h-paper-all]').forEach(c => c.addEventListener('change', () => c.closest('table').querySelectorAll('[data-h-paper-check]').forEach(x => { x.checked = c.checked; })));
        const chosen = () => { const ids = [...ws.querySelectorAll('[data-h-paper-check]:checked')].map(c => Number(c.dataset.hPaperCheck)); return ids.length ? rows.filter(r => ids.includes(Number(r.id))) : rows; };
        ws.querySelector('[data-h-paper-labels]').addEventListener('click', () => printPaperLabels(chosen()));
        ws.querySelector('[data-h-paper-print]').addEventListener('click', () => printPaperInventory(chosen()));
        if (editing) bindPaperForm(editing);
    };
    function paperFormHtml(p, locations) {
        const f = k => esc(p[k] || '');
        const personRow = (person = null) => `<div class="transfer-row">${A().collectionPersonField('person_id', person, 'Personne concernée…')}<button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
        return `<form class="maintenance-panel collection-form" id="h-paper-form"><h3>${p.id ? 'Modifier le document' : 'Nouveau document'}</h3>
            <div class="form-grid"><label>N° de classement<input name="class_number" value="${f('class_number')}" placeholder="P-0001"></label><label>Titre<input name="title" required value="${f('title')}" placeholder="Livret de famille Dupont-Martin"></label>
            <label>Type<input name="kind" value="${f('kind')}" list="h-paper-kinds"><datalist id="h-paper-kinds">${paperKinds.map(k => `<option>${esc(k)}</option>`).join('')}</datalist></label><label>Date<input name="date_text" value="${f('date_text')}" placeholder="1923"></label>
            <label>Où il est rangé<input name="storage_location" value="${f('storage_location')}" list="h-paper-locations" placeholder="Boîte 3, classeur bleu"><datalist id="h-paper-locations">${locations.map(l => `<option>${esc(l)}</option>`).join('')}</datalist></label>
            <label>Chez qui<input name="holder_text" value="${f('holder_text')}" placeholder="Chez moi, chez tante Monique…"></label><label>État<input name="condition_text" value="${f('condition_text')}" placeholder="Bon, déchiré, taché…"></label>
            <label class="span-2">Description<textarea name="description" rows="2">${f('description')}</textarea></label></div>
            <h4>Personnes concernées</h4><div class="h-rows" data-h-rows="paper-people">${(p.people?.length ? p.people : [null]).map(personRow).join('')}</div><button type="button" class="button small secondary" data-h-row-add="paper-people">+ Personne</button><template data-h-template="paper-people">${personRow()}</template>
            <h4>Scan dans l’application</h4>${mediaEditorHtml('family_paper', p.id, p.media, [['', 'Scan (ou photo) du document']])}
            ${LP('family_paper', p.labels)}<div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button><button class="button secondary" type="button" data-h-paper-cancel>Annuler</button>${p.id ? '<button class="button secondary danger" type="button" data-h-paper-delete>Supprimer</button>' : ''}</div></form>`;
    }
    function bindPaperForm(p) {
        const form = A().$('#h-paper-form');
        A().bindCollectionPersonFields(form); bindMediaEditor(form); form.scrollIntoView({block: 'start'});
        form.querySelector('[data-h-paper-cancel]').addEventListener('click', () => A().renderList());
        form.querySelector('[data-h-paper-delete]')?.addEventListener('click', async () => { if (!confirm(`Supprimer « ${p.title} » de l’inventaire ?`)) return; await api('delete_family_paper', {}, {method: 'POST', body: {id: p.id}}); toast('Supprimé.'); A().renderList(); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const v = values(form);
            const people = [...form.querySelectorAll('[name=person_id]')].map(i => Number(i.value)).filter(Boolean);
            try {
                const saved = await api('save_family_paper', {}, {method: 'POST', body: {...v, id: p.id, people}});
                const n = await uploadMediaEditor(form, 'family_paper', saved.result.id);
                toast(`Document ${saved.result.class_number} enregistré${n ? ' avec son scan' : ''}.`); A().renderList();
            } catch (error) { toast(error.message, 'error'); }
        });
    }
    function printWindow(title, css, html) {
        const win = window.open('', '_blank', 'width=900,height=1000');
        if (!win) { toast('Fenêtre d’impression bloquée.', 'error'); return; }
        win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}${css}.noprint{margin:12px}@media print{.noprint{display:none}}</style></head><body><div class="noprint"><button onclick="window.print()">Imprimer</button></div>${html}</body></html>`);
        win.document.close();
    }
    function printPaperLabels(rows) {
        // Planche de 24 étiquettes (3 × 8, environ 70 × 37 mm)
        const labels = rows.map(r => `<div class="label"><div class="num">${esc(r.class_number)}</div><div class="title">${esc(r.title)}</div><div class="meta">${esc([r.kind, r.date_text].filter(Boolean).join(' · '))}</div><div class="meta">📦 ${esc(r.storage_location || '')}</div><div class="people">${esc((r.people || []).map(p => A().personName(p)).join(', '))}</div></div>`).join('');
        printWindow('Étiquettes — papiers de famille', '@page{size:A4;margin:8mm 0}.sheet{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37mm;justify-content:center}.label{box-sizing:border-box;padding:3mm 4mm;border:1px dashed #bbb;overflow:hidden}.num{font-size:20pt;font-weight:900;letter-spacing:.04em}.title{font-size:9.5pt;font-weight:700;margin:1mm 0;line-height:1.15;max-height:2.4em;overflow:hidden}.meta{font-size:8pt}.people{font-size:7.5pt;color:#444;margin-top:.5mm}', `<div class="sheet">${labels}</div>`);
    }
    function printPaperInventory(rows) {
        printWindow('Inventaire des papiers de famille', 'main{max-width:780px;margin:24px auto;padding:0 24px}h1{font-size:24px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #999;padding:6px;text-align:left;vertical-align:top}.n{font-weight:900;white-space:nowrap}',
            `<main><h1>Inventaire des papiers de famille</h1><p>${rows.length} document(s) — ${new Date().toLocaleDateString('fr-FR')}</p><table><thead><tr><th>N°</th><th>Document</th><th>Date</th><th>Rangement</th><th>Chez</th><th>Scan</th></tr></thead><tbody>${rows.map(r => `<tr><td class="n">${esc(r.class_number)}</td><td><b>${esc(r.title)}</b>${r.kind ? `<br>${esc(r.kind)}` : ''}${r.people?.length ? `<br><small>${esc(r.people.map(p => A().personName(p)).join(', '))}</small>` : ''}</td><td>${esc(r.date_text)}</td><td>${esc(r.storage_location)}</td><td>${esc(r.holder_text)}</td><td>${r.media?.length ? 'oui' : '—'}</td></tr>`).join('')}</tbody></table></main>`);
    }

    // Les listes ouvertes depuis une fiche (« + Inventaire », « Ouvrir ») passent par S().hEdit
    const originalPapers = ext.lists.family_papers;
    ext.lists.family_papers = (token, editOverride = null) => {
        const pending = S().hEdit?.list === 'family_papers' ? S().hEdit : null;
        if (pending) S().hEdit = null;
        return originalPapers(token, editOverride || pending);
    };

    /* ═══════════════════════ 🚗 CIRCUITS « SUR LES TRACES DE MES ANCÊTRES » ═══════════════════════ */

    const tripKinds = {eglise: 'Église', mairie: 'Mairie', tombe: 'Tombe / cimetière', maison: 'Maison', archives: 'Archives', monument: 'Monument aux morts', autre: 'Autre'};
    const tripIcons = {eglise: '⛪', mairie: '🏛️', tombe: '🪦', maison: '🏠', archives: '🗄️', monument: '🎖️', autre: '📍'};
    const dayColors = ['#0066cc', '#cc4700', '#00a37a', '#7a47db', '#cc0014', '#a07a00', '#008fb3', '#c2185b'];
    const stopTarget = s => finite(s.lat) ? `${Number(s.lat).toFixed(6)},${Number(s.lon).toFixed(6)}` : [s.address, s.place_text].filter(Boolean).join(', ');
    /** Liens « itinéraire » d'une journée : Google Maps (jusqu'à 10 étapes) et Plans d'Apple. */
    function dayRouteLinks(stops, startPlace) {
        const targets = stops.map(stopTarget).filter(Boolean);
        if (!targets.length) return '';
        const origin = startPlace || targets[0];
        const list = startPlace ? targets : targets.slice(1);
        const dest = list[list.length - 1] || targets[0];
        const way = list.slice(0, -1).slice(0, 8);
        const google = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}&travelmode=driving`;
        const apple = `https://maps.apple.com/?saddr=${encodeURIComponent(origin)}&daddr=${[...way, dest].map(encodeURIComponent).join('+to:')}&dirflg=d`;
        return `<span class="h-route-links"><a class="button small secondary" href="${esc(google)}" target="_blank" rel="noopener noreferrer">Ouvrir dans Google Maps ↗</a><a class="button small secondary" href="${esc(apple)}" target="_blank" rel="noopener noreferrer">Ouvrir dans Plans ↗</a>${list.length > 9 ? '<small class="muted">Google Maps ne prend que 10 étapes : les dernières sont à ajouter à la main.</small>' : ''}</span>`;
    }
    ext.lists.field_trips = async (token, view = null) => {
        const st = S();
        const pending = st.hEdit?.list === 'field_trips' ? st.hEdit : null;
        if (pending) { st.hEdit = null; view = {trip: pending.id}; }
        if (view?.trip) st.hTripId = view.trip;
        if (view?.back) st.hTripId = 0;
        if (st.hTripId && !view?.edit) return renderTrip(token, st.hTripId);
        const filter = ['todo', 'done', 'all'].includes(st.hTripFilter) ? st.hTripFilter : 'todo';
        const data = await api('field_trips', {status: filter});
        if (!isCurrent(token)) return;
        const editing = view?.edit !== undefined ? (view.edit ? (await api('field_trip', {id: view.edit})).trip : {id: 0, stops_per_day: 6, people: [], people_rows: []}) : null;
        if (!isCurrent(token)) return; // on a changé d'écran pendant le chargement
        const counts = data.counts || {todo: 0, done: 0};
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Circuits sur le terrain', 'Un circuit « sur les traces de mes ancêtres » : choisis une branche ou quelques ancêtres, et l’app prépare la liste des lieux à voir (églises, maisons, tombes, mairies, archives), le trajet jour par jour à ouvrir dans Plans ou Google Maps, et un carnet de route à imprimer.')}
            <div class="collection-toolbar"><button type="button" class="button" data-h-trip-new>+ Circuit</button><div class="segmented-filter" role="group">${[['todo', `À faire (${counts.todo})`], ['done', `Faits (${counts.done})`], ['all', `Tous (${counts.todo + counts.done})`]].map(([k, l]) => `<button type="button" class="button small ${filter === k ? '' : 'secondary'}" data-h-trip-filter="${k}" aria-pressed="${filter === k}">${esc(l)}</button>`).join('')}</div></div>
            ${editing ? tripFormHtml(editing) : ''}
            <div class="h-trip-list">${(data.trips || []).map(t => `<article class="h-record h-trip ${t.status === 'done' ? 'is-done' : ''}"><header><div><strong>${t.status === 'done' ? '✅' : '🚗'} ${esc(t.title)}</strong>${LC(t.labels)}<div class="muted">${esc([t.date_start ? dateFr(t.date_start) : 'dates à fixer', t.date_end && t.date_end !== t.date_start ? '→ ' + dateFr(t.date_end) : ''].join(' '))}${t.start_place ? ` · départ de ${esc(t.start_place)}` : ''}</div>
                <div>${plural(Number(t.stop_count), 'étape', 'étapes')}${Number(t.day_count) ? ` sur ${plural(Number(t.day_count), 'jour', 'jours')}` : ''}${Number(t.stop_count) ? ` · ${fmt(t.done_count)} faite${t.done_count > 1 ? 's' : ''}` : ''}${t.status === 'done' && t.done_at ? ` · fait le ${esc(dateFr(t.done_at))}` : ''}</div>
                ${Number(t.stop_count) ? `<div class="h-progress"><span style="width:${Math.round(100 * t.done_count / t.stop_count)}%"></span></div>` : ''}</div>
                <div class="page-actions compact"><button type="button" class="button small" data-h-trip-open="${t.id}">Ouvrir</button><button type="button" class="button small secondary" data-h-trip-status="${t.id}" data-status="${t.status === 'done' ? 'todo' : 'done'}">${t.status === 'done' ? 'Remettre à faire' : 'Marquer fait'}</button></div></header>${t.notes ? `<p class="muted">${nl(t.notes)}</p>` : ''}</article>`).join('') || empty(filter === 'done' ? 'Aucun circuit fait pour l’instant.' : 'Aucun circuit à faire. Crée le premier avec « + Circuit ».')}</div></section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-trip-new]').addEventListener('click', () => ext.lists.field_trips(++S().workspaceToken, {edit: 0}));
        ws.querySelectorAll('[data-h-trip-filter]').forEach(b => b.addEventListener('click', () => { S().hTripFilter = b.dataset.hTripFilter; A().renderList(); }));
        ws.querySelectorAll('[data-h-trip-open]').forEach(b => b.addEventListener('click', () => ext.lists.field_trips(++S().workspaceToken, {trip: Number(b.dataset.hTripOpen)})));
        ws.querySelectorAll('[data-h-trip-status]').forEach(b => b.addEventListener('click', async () => { await api('set_field_trip_status', {}, {method: 'POST', body: {id: b.dataset.hTripStatus, status: b.dataset.status}}); toast(b.dataset.status === 'done' ? 'Circuit marqué fait : il reste consultable dans « Faits ».' : 'Circuit remis à faire.'); A().renderList(); }));
        if (editing) bindTripForm(editing);
    };
    function tripFormHtml(t) {
        const people = t.people || [], rowsById = Object.fromEntries((t.people_rows || []).map(p => [p.id, p]));
        const row = (p = {}) => `<div class="transfer-row h-trip-person">${A().collectionPersonField('person_id', rowsById[p.id] || null, 'Ancêtre ou personne…')}<select name="mode"><option value="person" ${p.mode === 'person' ? 'selected' : ''}>cette personne seulement</option><option value="ascendants" ${p.mode === 'ascendants' || !p.mode ? 'selected' : ''}>et ses ascendants</option><option value="descendants" ${p.mode === 'descendants' ? 'selected' : ''}>et ses descendants</option></select><label class="h-inline">sur <input type="number" name="generations" min="1" max="12" value="${Number(p.generations) || 4}" class="h-narrow"> générations</label><button type="button" class="button small secondary" data-h-row-remove aria-label="Retirer">✕</button></div>`;
        return `<form class="maintenance-panel collection-form" id="h-trip-form"><h3>${t.id ? 'Modifier le circuit' : 'Nouveau circuit'}</h3>
            <div class="form-grid"><label>Nom<input name="title" required value="${esc(t.title || '')}" placeholder="Sur les traces des Dupont en Corrèze"></label><label>Point de départ<input name="start_place" value="${esc(t.start_place || '')}" placeholder="Brive-la-Gaillarde (hôtel, gîte…)"></label>
            <label>Du<input type="date" name="date_start" value="${esc(t.date_start || '')}"></label><label>Au<input type="date" name="date_end" value="${esc(t.date_end || '')}"></label>
            <label>Étapes par jour, au plus<input type="number" name="stops_per_day" min="1" max="20" value="${Number(t.stops_per_day) || 6}"></label></div>
            <h4>Pour qui ?</h4><div class="h-rows" data-h-rows="trip-people">${(people.length ? people : [{}]).map(row).join('')}</div><button type="button" class="button small secondary" data-h-row-add="trip-people">+ Personne ou branche</button><template data-h-template="trip-people">${row()}</template>
            ${t.id ? '' : `<h4>Étapes</h4><p class="muted">Ajoute dès maintenant autant d’étapes que tu veux, avec leur logistique, leur matériel, ce que tu vas chercher et une liste à cocher. « Préparer le circuit » ajoutera en plus les lieux de tes ancêtres.</p><div class="h-trip-drafts" data-h-trip-drafts></div><button type="button" class="button small secondary" data-h-draft-add>+ Étape</button>`}
            <label class="h-block-label">Notes (hébergement, rendez-vous, personnes à rencontrer…)<textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></label>
            ${LP('field_trip', t.labels)}<div class="page-actions action-zone"><button class="button" type="submit" name="generate" value="1">Enregistrer et préparer le circuit</button><button class="button secondary" type="submit" name="generate" value="0">Enregistrer seulement</button><button class="button secondary" type="button" data-h-trip-cancel>Annuler</button></div>
            <p class="muted">Préparer à nouveau remplace les étapes non faites ; les étapes cochées « faite » sont gardées.</p></form>`;
    }
    function bindTripForm(t) {
        const form = A().$('#h-trip-form');
        A().bindCollectionPersonFields(form); form.scrollIntoView({block: 'start'});
        form.querySelector('[data-h-trip-cancel]').addEventListener('click', () => { if (drafts.length && !confirm('Abandonner ce circuit et ses étapes ?')) return; ext.lists.field_trips(++S().workspaceToken, t.id ? {trip: t.id} : {back: true}); });
        // étapes ajoutées pendant la création : gardées ici, enregistrées avec le circuit
        const drafts = [], draftBox = form.querySelector('[data-h-trip-drafts]');
        const draftNames = x => Object.fromEntries(Object.entries(x.person_names || {}).map(([pid, n]) => [pid, {id: Number(pid), display_name: n, first_name: n, last_name: ''}]));
        const paintDrafts = () => { if (!draftBox) return;
            const sorted = drafts.map((d, i) => [d, i]).sort((a, b) => (Number(a[0].day) || 1) - (Number(b[0].day) || 1));
            draftBox.innerHTML = sorted.map(([d, i]) => { const x = d.extra || {}, n = (x.checklist || []).length;
                return `<div class="h-trip-draft"><span class="h-trip-draft-day">Jour ${Number(d.day) || 1}</span><div><strong>${esc(d.title || 'Étape sans titre')}</strong> <small class="muted">${esc(tripKinds[d.kind] || '')}</small><div class="muted">${esc([d.place_text, x.time_from && 'arrivée ' + x.time_from, x.transport, x.goals && 'je cherche : ' + x.goals, n && n + ' ligne' + (n > 1 ? 's' : '') + ' à cocher'].filter(Boolean).join(' · '))}</div></div>
                    <span class="h-trip-draft-tools"><button type="button" class="button small secondary" data-h-draft-edit="${i}">Modifier</button><button type="button" class="icon-button" data-h-draft-del="${i}" title="Retirer">✕</button></span></div>`; }).join('') || '<p class="muted">Aucune étape pour l’instant.</p>'; };
        const editDraft = i => { const d = i === null ? {kind: 'autre', day: drafts.length ? Math.max(...drafts.map(x => Number(x.day) || 1)) : 1, _draft: i !== null} : {...drafts[i], _draft: true};
            openStopDialog(d, draftNames(d.extra || {}), {onSave: async (v, extra) => { const row = {...v, lat: v.place_text_lat, lon: v.place_text_lon, extra}; if (i === null) drafts.push(row); else drafts[i] = row; paintDrafts(); }}); };
        paintDrafts();
        form.querySelector('[data-h-draft-add]')?.addEventListener('click', () => editDraft(null));
        draftBox?.addEventListener('click', e => { const ed = e.target.closest('[data-h-draft-edit]'), del = e.target.closest('[data-h-draft-del]');
            if (ed) editDraft(Number(ed.dataset.hDraftEdit));
            if (del && confirm('Retirer cette étape ?')) { drafts.splice(Number(del.dataset.hDraftDel), 1); paintDrafts(); } });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const v = values(form), generate = event.submitter?.value === '1';
            const people = [...form.querySelectorAll('.h-trip-person')].map(r => ({id: Number(r.querySelector('[name=person_id]').value), mode: r.querySelector('[name=mode]').value, generations: r.querySelector('[name=generations]').value})).filter(p => p.id);
            if (generate && !people.length) return toast('Choisis au moins une personne dans les suggestions.', 'error');
            try {
                const saved = await api('save_field_trip', {}, {method: 'POST', body: {id: t.id, title: v.title, start_place: v.start_place, date_start: v.date_start, date_end: v.date_end, stops_per_day: v.stops_per_day, notes: v.notes, status: t.status || 'todo', people, generate: generate ? 1 : 0}});
                let failed = 0;
                for (const d of drafts) { try { await api('save_field_trip_stop', {}, {method: 'POST', body: {...d, id: 0, trip_id: saved.result.id, done: 0}}); } catch (_) { failed++; } }
                if (failed) toast(`${failed} étape(s) non enregistrée(s) : ajoute-les depuis le circuit.`, 'error');
                else if (saved.result.warning) toast('Circuit enregistré. ' + saved.result.warning, 'error');
                else toast(generate ? 'Circuit préparé.' : 'Circuit enregistré.');
                ext.lists.field_trips(++S().workspaceToken, {trip: saved.result.id});
            } catch (error) { toast(error.message, 'error'); }
        });
    }
    /* Détails d'une étape : logistique, technique, recherche, liste à cocher (autant de lignes qu'on veut) */
    const PHOTO_RULES = ['', 'Photos autorisées', 'Photos sans flash', 'Photos payantes', 'Photos interdites', 'À demander sur place'];
    function stopExtraForm(x, peopleMap) {
        const v = k => esc(x[k] || '');
        const ck = (c = {text: '', done: 0}) => `<div class="h-ck-row"><input type="checkbox" data-ck-done ${c.done ? 'checked' : ''} title="Fait"><input data-ck-text value="${esc(c.text)}" placeholder="Ex. : prendre la carte de lecteur"><button type="button" class="icon-button" data-ck-del title="Retirer">×</button></div>`;
        const chip = pid => `<span class="label-chip" data-x-person="${Number(pid)}">${esc(peopleMap[pid] ? A().personName(peopleMap[pid]) : '#' + pid)} <button type="button" class="link-button" data-x-person-del aria-label="Retirer">×</button></span>`;
        return `<details class="h-stop-sec" open><summary>🚗 Logistique</summary><div class="form-grid">
                <label>Arrivée<input type="time" name="x_time_from" value="${v('time_from')}"></label><label>Départ<input type="time" name="x_time_to" value="${v('time_to')}"></label>
                <label>Durée prévue<input name="x_duration" value="${v('duration')}" placeholder="1 h 30"></label><label>Transport<select name="x_transport">${['', 'Voiture', 'À pied', 'Vélo', 'Train', 'Bus / car', 'Bateau', 'Avion'].map(o => `<option ${x.transport === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
                <label class="span-2">Accès, stationnement<input name="x_access" value="${v('access')}" placeholder="Parking derrière la mairie, entrée par la sacristie…"></label>
                <label>Contact<input name="x_contact_name" value="${v('contact_name')}" placeholder="Secrétaire de mairie, curé, archiviste…"></label><label>Téléphone<input name="x_contact_phone" value="${v('contact_phone')}"></label>
                <label>Courriel<input type="email" name="x_contact_email" value="${v('contact_email')}"></label><label>Site<input type="url" name="x_website" value="${v('website')}" placeholder="https://…"></label>
                <label class="span-2">Rendez-vous, réservation<input name="x_booking" value="${v('booking')}" placeholder="Salle de lecture sur rendez-vous, 3 jours avant"></label><label class="checkbox-line"><input type="checkbox" name="x_booking_done" ${x.booking_done ? 'checked' : ''}> Réservation faite</label>
                <label>Coût<input name="x_cost" value="${v('cost')}" placeholder="Entrée 5 €, parking 2 €"></label>
                <label class="span-2">Documents à emporter<input name="x_documents" value="${v('documents')}" placeholder="Pièce d’identité, carte de lecteur, liste des cotes…"></label></div></details>
            <details class="h-stop-sec" ${x.equipment || x.photo_rules || x.references ? 'open' : ''}><summary>🧰 Technique</summary><div class="form-grid">
                <label class="span-2">Matériel<textarea name="x_equipment" rows="2" placeholder="Appareil photo, trépied, lampe rasante, papier calque, gants, crayon à papier…">${v('equipment')}</textarea></label>
                <label>Photographie<select name="x_photo_rules">${PHOTO_RULES.map(o => `<option ${x.photo_rules === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
                <label class="span-2">Cotes, registres, tombes à voir<textarea name="x_references" rows="2" placeholder="3 E 45/12 (BMS 1702-1730), carré B rang 4…">${v('references')}</textarea></label></div></details>
            <details class="h-stop-sec" open><summary>🎯 Recherche</summary><div class="form-grid">
                <label class="span-2">Ce que je cherche<textarea name="x_goals" rows="2" placeholder="Acte de mariage de Jean et Marie (vers 1745), tombe des Dupont…">${v('goals')}</textarea></label>
                <div class="span-2"><span class="section-label">Personnes recherchées</span><div class="h-x-people" data-x-people>${(x.person_ids || []).map(chip).join('')}</div><span class="h-person-add">${A().collectionPersonField('x_person_pick', null, 'Ajouter une personne (nom)')}<button type="button" class="button small secondary" data-x-person-add>Ajouter</button></span></div>
                <label>Résultat<select name="x_result">${[['todo', 'À faire'], ['found', 'Trouvé'], ['partial', 'En partie'], ['none', 'Rien trouvé']].map(([k, l]) => `<option value="${k}" ${(x.result || 'todo') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="span-2">Ce que j’ai trouvé (compte rendu après la visite)<textarea name="x_findings" rows="3">${v('findings')}</textarea></label></div></details>
            <details class="h-stop-sec" open><summary>✅ Liste à cocher</summary><div data-ck-list>${(x.checklist || []).map(ck).join('')}</div><button type="button" class="button small secondary" data-ck-add>+ Ligne</button></details>`;
    }
    function bindStopExtraForm(dlg) {
        const list = dlg.querySelector('[data-ck-list]');
        dlg.querySelector('[data-ck-add]')?.addEventListener('click', () => { list.insertAdjacentHTML('beforeend', '<div class="h-ck-row"><input type="checkbox" data-ck-done title="Fait"><input data-ck-text placeholder="Ex. : prendre la carte de lecteur"><button type="button" class="icon-button" data-ck-del title="Retirer">×</button></div>'); list.lastElementChild.querySelector('[data-ck-text]').focus(); });
        list?.addEventListener('click', e => { if (e.target.closest('[data-ck-del]')) e.target.closest('.h-ck-row').remove(); });
        const people = dlg.querySelector('[data-x-people]');
        people?.addEventListener('click', e => { if (e.target.closest('[data-x-person-del]')) e.target.closest('[data-x-person]').remove(); });
        dlg.querySelector('[data-x-person-add]')?.addEventListener('click', e => {
            const box = e.currentTarget.closest('.h-person-add'), pid = Number(box.querySelector('[name=x_person_pick]')?.value) || 0;
            if (!pid) return toast('Choisis d’abord la personne dans la liste.', 'error');
            if (people.querySelector(`[data-x-person="${pid}"]`)) return;
            const name = box.querySelector('input[type=text], input:not([type=hidden])')?.value || '#' + pid;
            people.insertAdjacentHTML('beforeend', `<span class="label-chip" data-x-person="${pid}">${esc(name)} <button type="button" class="link-button" data-x-person-del aria-label="Retirer">×</button></span>`);
        });
    }
    function readStopExtra(form) {
        const x = {};
        form.querySelectorAll('[name^="x_"]').forEach(el => { if (el.name === 'x_person_pick') return; x[el.name.slice(2)] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; });
        x.checklist = [...form.querySelectorAll('.h-ck-row')].map(r => ({text: r.querySelector('[data-ck-text]').value.trim(), done: r.querySelector('[data-ck-done]').checked ? 1 : 0})).filter(c => c.text);
        x.person_ids = [...form.querySelectorAll('[data-x-person]')].map(c => Number(c.dataset.xPerson));
        return x;
    }
    async function renderTrip(token, id) {
        let t;
        try { t = (await api('field_trip', {id})).trip; } catch (error) { S().hTripId = 0; toast(error.message, 'error'); return ext.lists.field_trips(++S().workspaceToken); }
        if (!isCurrent(token)) return;
        const days = {};
        t.stops.forEach(s => { (days[s.day] ||= []).push(s); });
        const dayNums = Object.keys(days).map(Number).sort((a, b) => a - b);
        const points = [], paths = [];
        let n = 0;
        dayNums.forEach((d, i) => {
            const color = dayColors[i % dayColors.length], coords = [];
            days[d].forEach(s => { n++; if (finite(s.lat)) { points.push({lat: +s.lat, lon: +s.lon, label: `Jour ${d} · ${s.title}`, color, n}); coords.push([+s.lat, +s.lon]); } });
            if (coords.length > 1) paths.push({coords, color, width: 2});
        });
        const dayDate = d => { if (!t.date_start) return ''; const x = new Date(t.date_start + 'T12:00:00'); x.setDate(x.getDate() + d - 1); return x.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'}); };
        let k = 0;
        const maxDay = Math.max(0, ...dayNums);
        const stopExtraHtml = s => {
            const x = s.extra || {}, line = (icon, label, v) => v ? `<div class="h-stop-x"><span title="${esc(label)}">${icon}</span> ${nl(v)}</div>` : '';
            const when = [x.time_from, x.time_to].filter(Boolean).join(' → ') + (x.duration ? ` (${x.duration})` : '');
            const contact = [x.contact_name, x.contact_phone ? `<a href="tel:${esc(x.contact_phone.replace(/[^\d+]/g, ''))}">${esc(x.contact_phone)}</a>` : '', x.contact_email ? `<a href="mailto:${esc(x.contact_email)}">${esc(x.contact_email)}</a>` : ''].filter(Boolean);
            const who = (x.person_ids || []).map(pid => t.stop_people?.[pid]).filter(Boolean);
            const res = {found: '✅ Trouvé', partial: '🟡 En partie', none: '❌ Rien trouvé', todo: ''}[x.result] || '';
            return `${when ? line('🕘', 'Horaires de passage', when) : ''}${line('🚗', 'Transport et accès', [x.transport, x.access].filter(Boolean).join(' — '))}
                ${contact.length ? `<div class="h-stop-x"><span title="Contact">☎</span> ${x.contact_name ? esc(x.contact_name) : ''}${contact.slice(x.contact_name ? 1 : 0).length ? ' · ' + contact.slice(x.contact_name ? 1 : 0).join(' · ') : ''}</div>` : ''}
                ${x.booking ? `<div class="h-stop-x"><span title="Réservation">📅</span> ${nl(x.booking)} ${x.booking_done ? '<span class="collection-kind">réservé</span>' : '<span class="collection-kind is-warn">à réserver</span>'}</div>` : ''}
                ${line('💶', 'Coût', x.cost)}${line('🪪', 'Documents à emporter', x.documents)}${line('🧰', 'Matériel', x.equipment)}${line('📸', 'Photographie', x.photo_rules)}${line('🗂️', 'Cotes à consulter', x.references)}
                ${x.website ? `<div class="h-stop-x"><span>🔗</span> <a href="${esc(x.website)}" target="_blank" rel="noopener noreferrer">${esc(x.website.replace(/^https?:\/\//, '').slice(0, 60))}</a></div>` : ''}
                ${who.length ? `<div class="h-stop-x"><span title="Personnes recherchées">👤</span> ${who.map(p => personLink(p.id, A().personName(p))).join(', ')}</div>` : ''}
                ${line('🎯', 'Ce que je cherche', x.goals)}
                ${(x.checklist || []).length ? `<ul class="h-stop-checklist">${x.checklist.map((c, i) => `<li><label class="checkbox-line"><input type="checkbox" data-h-stop-ck="${s.id}" data-i="${i}" ${c.done ? 'checked' : ''}> ${esc(c.text)}</label></li>`).join('')}</ul>` : ''}
                ${res || x.findings ? `<div class="h-stop-x h-stop-result"><span title="Résultat">📝</span> ${res ? `<strong>${res}</strong> ` : ''}${nl(x.findings || '')}</div>` : ''}`;
        };
        const stopHtml = s => { k++; return `<li class="h-stop ${Number(s.done) ? 'is-done' : ''}"><label class="h-stop-check"><input type="checkbox" data-h-stop-done="${s.id}" ${Number(s.done) ? 'checked' : ''}><span class="h-stop-n">${k}</span></label>
            <div class="h-stop-body"><strong>${tripIcons[s.kind] || '📍'} ${esc(s.title || tripKinds[s.kind])}</strong> <small class="muted">${esc(s.place_text)}${s.address ? ' · ' + esc(s.address) : ''}${finite(s.lat) ? '' : ' · ⚠ pas de coordonnées'}</small>
            ${s.people_text ? `<div class="h-stop-people">${nl(s.people_text)}</div>` : ''}${s.to_photograph ? `<div class="h-stop-photo">📷 ${nl(s.to_photograph)}</div>` : ''}${s.opening_hours ? `<div class="h-stop-hours">🕘 ${nl(s.opening_hours)}</div>` : ''}${stopExtraHtml(s)}${s.notes ? `<div class="muted">${nl(s.notes)}</div>` : ''}</div>
            <div class="h-stop-tools"><button type="button" class="icon-button" data-h-stop-move="${s.id}" data-dir="-1" title="Monter">↑</button><button type="button" class="icon-button" data-h-stop-move="${s.id}" data-dir="1" title="Descendre">↓</button><select data-h-stop-day="${s.id}" title="Jour">${[...dayNums, maxDay + 1].map(d => `<option value="${d}" ${d === Number(s.day) ? 'selected' : ''}>Jour ${d}</option>`).join('')}</select>${tools(`data-h-stop-edit="${s.id}"`, `data-h-stop-delete="${s.id}"`, 'cette étape')}</div></li>`; };
        A().$('#workspace').innerHTML = `<section class="page collection-page h-trip-page">${pageHeader(t.status === 'done' ? 'CIRCUIT FAIT' : 'CIRCUIT', t.title, `${esc([t.date_start ? dateFr(t.date_start) : '', t.date_end && t.date_end !== t.date_start ? '→ ' + dateFr(t.date_end) : ''].join(' '))}${t.start_place ? ` · départ de ${esc(t.start_place)}` : ''} · ${plural(t.stops.length, 'étape', 'étapes')} sur ${plural(dayNums.length, 'jour', 'jours')} · pour ${(t.people_rows || []).map(p => esc(A().personName(p))).join(', ') || '—'}`,
            `<button type="button" class="button secondary" data-h-trip-back>← Tous les circuits</button><button type="button" class="button secondary" data-h-trip-edit>Modifier</button><button type="button" class="button secondary" data-h-trip-regen>Préparer à nouveau</button><button type="button" class="button" data-h-trip-print>Carnet de route à imprimer</button><button type="button" class="button secondary" data-h-trip-done>${t.status === 'done' ? 'Remettre à faire' : 'Marquer fait'}</button><button type="button" class="button secondary danger" data-h-trip-delete>Supprimer</button>`)}
            ${t.stops.length ? miniMap(points, paths) : ''}
            ${dayNums.map((d, i) => `<section class="h-day"><header class="h-day-head"><h3><span class="h-day-dot" style="background:${dayColors[i % dayColors.length]}"></span>Jour ${d}${dayDate(d) ? ` — ${esc(dayDate(d))}` : ''}</h3>${dayRouteLinks(days[d], i === 0 ? t.start_place : '')}</header><ol class="h-stops">${days[d].map(stopHtml).join('')}</ol></section>`).join('') || empty('Aucune étape : « Préparer à nouveau » (il faut des événements avec un lieu), ou ajoute une étape à la main.')}
            <p><button type="button" class="button small secondary" data-h-stop-edit="0">+ Étape</button></p>
            ${t.notes ? `<div class="maintenance-panel"><h4>Notes</h4><p>${nl(t.notes)}</p></div>` : ''}</section>`;
        const ws = A().$('#workspace');
        const reload = () => renderTrip(++S().workspaceToken, id);
        ws.querySelector('[data-h-trip-back]').addEventListener('click', () => ext.lists.field_trips(++S().workspaceToken, {back: true}));
        ws.querySelector('[data-h-trip-edit]').addEventListener('click', () => ext.lists.field_trips(++S().workspaceToken, {edit: id}));
        ws.querySelector('[data-h-trip-regen]').addEventListener('click', async () => { if (!confirm('Préparer à nouveau les étapes ? Les étapes non faites sont remplacées.')) return; try { const r = await api('generate_field_trip', {}, {method: 'POST', body: {id}}); toast(`${r.result.stops} étapes sur ${r.result.days} jour(s).`); reload(); } catch (error) { toast(error.message, 'error'); } });
        ws.querySelector('[data-h-trip-print]').addEventListener('click', () => printTrip(t, days, dayNums, dayDate));
        ws.querySelector('[data-h-trip-done]').addEventListener('click', async () => { const status = t.status === 'done' ? 'todo' : 'done'; await api('set_field_trip_status', {}, {method: 'POST', body: {id, status}}); toast(status === 'done' ? 'Circuit marqué fait.' : 'Circuit remis à faire.'); reload(); });
        ws.querySelector('[data-h-trip-delete]').addEventListener('click', async () => { if (!confirm(`Supprimer le circuit « ${t.title} » ?`)) return; await api('delete_field_trip', {}, {method: 'POST', body: {id}}); toast('Circuit supprimé.'); ext.lists.field_trips(++S().workspaceToken, {back: true}); });
        ws.querySelectorAll('[data-h-stop-done]').forEach(c => c.addEventListener('change', async () => { await api('set_field_trip_stop_done', {}, {method: 'POST', body: {id: c.dataset.hStopDone, done: c.checked ? 1 : 0}}); c.closest('.h-stop').classList.toggle('is-done', c.checked); }));
        ws.querySelectorAll('[data-h-stop-ck]').forEach(c => c.addEventListener('change', async () => { try { await api('set_field_trip_stop_check', {}, {method: 'POST', body: {id: c.dataset.hStopCk, index: Number(c.dataset.i), done: c.checked ? 1 : 0}}); const st = t.stops.find(x => Number(x.id) === Number(c.dataset.hStopCk)); if (st?.extra?.checklist?.[c.dataset.i]) st.extra.checklist[c.dataset.i].done = c.checked ? 1 : 0; } catch (error) { c.checked = !c.checked; toast(error.message, 'error'); } }));
        ws.querySelectorAll('[data-h-stop-move]').forEach(b => b.addEventListener('click', async () => { await api('move_field_trip_stop', {}, {method: 'POST', body: {id: b.dataset.hStopMove, direction: Number(b.dataset.dir)}}); reload(); }));
        ws.querySelectorAll('[data-h-stop-day]').forEach(sel => sel.addEventListener('change', async () => { await api('move_field_trip_stop', {}, {method: 'POST', body: {id: sel.dataset.hStopDay, day: Number(sel.value)}}); reload(); }));
        ws.querySelectorAll('[data-h-stop-delete]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette étape ?')) return; await api('delete_field_trip_stop', {}, {method: 'POST', body: {id: b.dataset.hStopDelete}}); reload(); }));
        ws.querySelectorAll('[data-h-stop-edit]').forEach(b => b.addEventListener('click', () => {
            const s = t.stops.find(x => Number(x.id) === Number(b.dataset.hStopEdit)) || {id: 0, kind: 'autre', day: dayNums[dayNums.length - 1] || 1};
            openStopDialog(s, t.stop_people || {}, {
                onSave: async (v, extra) => { await api('save_field_trip_stop', {}, {method: 'POST', body: {...v, id: s.id, trip_id: id, lat: v.place_text_lat, lon: v.place_text_lon, done: s.done, extra}}); toast('Étape enregistrée.'); reload(); },
                onDelete: s.id ? async () => { if (!confirm('Supprimer cette étape ?')) return false; await api('delete_field_trip_stop', {}, {method: 'POST', body: {id: s.id}}); reload(); } : null,
            });
        }));
    }
    /** Fenêtre d'une étape (dans un circuit, ou pendant la création du circuit). */
    function openStopDialog(s, peopleMap, {onSave, onDelete = null}) {
        openDialog({
            eyebrow: 'ÉTAPE', title: s.id || s._draft ? 'Modifier l’étape' : 'Nouvelle étape',
            body: `<div class="form-grid"><label>Sorte<select name="kind">${Object.entries(tripKinds).map(([kk, l]) => `<option value="${kk}" ${s.kind === kk ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label>Jour<input type="number" name="day" min="1" value="${Number(s.day) || 1}"></label>
                    <label class="span-2">Titre<input name="title" value="${esc(s.title || '')}" placeholder="Église Saint-Martin"></label><label>Commune${placeField('place_text', s.place_text, s.lat, s.lon, 'Commune')}</label><label>Adresse<input name="address" value="${esc(s.address || '')}"></label>
                    <label class="span-2">Pourquoi (personnes, actes)<textarea name="people_text" rows="2">${esc(s.people_text || '')}</textarea></label><label class="span-2">À photographier<textarea name="to_photograph" rows="2">${esc(s.to_photograph || '')}</textarea></label>
                    <label class="span-2">Horaires d’ouverture<input name="opening_hours" value="${esc(s.opening_hours || '')}" placeholder="Mardi-vendredi 9 h – 17 h, sur réservation"></label></div>
                    ${stopExtraForm(s.extra || {}, peopleMap)}
                    <label>Notes<textarea name="notes" rows="2">${esc(s.notes || '')}</textarea></label>`,
            wide: true,
            onOpen: dlg => bindStopExtraForm(dlg),
            onSubmit: async form => { const extra = readStopExtra(form); extra.person_names = Object.fromEntries([...form.querySelectorAll('[data-x-person]')].map(c => [c.dataset.xPerson, c.firstChild?.textContent.trim() || ''])); await onSave(values(form), extra); },
            onDelete,
        });
    }
    // détails d'une étape dans le carnet imprimé (cases à cocher à l'encre)
    function printStopExtra(x) {
        const p = (label, v) => v ? `<p><b>${label} :</b> ${nl(v)}</p>` : '';
        return p('Horaires', [x.time_from, x.time_to].filter(Boolean).join(' → ') + (x.duration ? ` (${x.duration})` : '')) + p('Transport, accès', [x.transport, x.access].filter(Boolean).join(' — '))
            + p('Contact', [x.contact_name, x.contact_phone, x.contact_email].filter(Boolean).join(' · ')) + p('Rendez-vous', x.booking ? x.booking + (x.booking_done ? ' (réservé)' : ' (à réserver)') : '')
            + p('Coût', x.cost) + p('Documents', x.documents) + p('Matériel', x.equipment) + p('Photographie', x.photo_rules) + p('Cotes', x.references) + p('Je cherche', x.goals)
            + ((x.checklist || []).length ? `<ul class="ck">${x.checklist.map(c => `<li>${c.done ? '☑' : '☐'} ${esc(c.text)}</li>`).join('')}</ul>` : '');
    }
    function printTrip(t, days, dayNums, dayDate) {
        let k = 0;
        const graves = t.stops.filter(s => s.kind === 'tombe');
        const archives = t.stops.filter(s => s.kind === 'archives');
        const html = `<main><header><h1>${esc(t.title)}</h1><p>${esc([t.date_start ? dateFr(t.date_start) : '', t.date_end && t.date_end !== t.date_start ? '→ ' + dateFr(t.date_end) : ''].join(' '))}${t.start_place ? ` · départ de ${esc(t.start_place)}` : ''}</p><p>Sur les traces de : ${(t.people_rows || []).map(p => esc(A().personName(p))).join(', ')}</p></header>
            ${graves.length ? `<h2>Tombes à chercher</h2><ul>${graves.map(s => `<li><b>${esc(s.title)}</b> — ${nl(s.people_text)}</li>`).join('')}</ul>` : ''}
            ${archives.length ? `<h2>Archives : horaires</h2><ul>${archives.map(s => `<li><b>${esc(s.title)}</b>${s.address ? ` — ${esc(s.address)}` : ''}<br>${nl(s.opening_hours || 'Horaires à vérifier')}</li>`).join('')}</ul>` : ''}
            ${dayNums.map(d => `<section class="day"><h2>Jour ${d}${dayDate(d) ? ` — ${esc(dayDate(d))}` : ''}</h2>${days[d].map(s => { k++; return `<div class="stop"><span class="box"></span><div><h3>${k}. ${esc(s.title)}</h3><p class="place">${esc(s.place_text)}${s.address ? ' · ' + esc(s.address) : ''}</p>${s.people_text ? `<p><b>Pourquoi :</b> ${nl(s.people_text)}</p>` : ''}${printStopExtra(s.extra || {})}${s.to_photograph ? `<p><b>À photographier :</b> ${nl(s.to_photograph)}</p>` : ''}${s.opening_hours ? `<p><b>Horaires :</b> ${nl(s.opening_hours)}</p>` : ''}${s.notes ? `<p>${nl(s.notes)}</p>` : ''}<div class="lines"><span></span><span></span></div></div></div>`; }).join('')}</section>`).join('')}
            ${t.notes ? `<h2>Notes</h2><p>${nl(t.notes)}</p>` : ''}<h2>Notes de route</h2><div class="lines big">${'<span></span>'.repeat(10)}</div></main>`;
        printWindow('Carnet de route — ' + t.title, 'main{max-width:760px;margin:24px auto;padding:0 24px;line-height:1.4}header{border-bottom:3px solid #111;padding-bottom:10px}h1{margin:0;font-size:28px}h2{font-size:18px;margin:22px 0 8px;border-bottom:1px solid #999}h3{font-size:15px;margin:0}.day{break-before:auto}.stop{display:flex;gap:10px;padding:8px 0;border-bottom:1px dotted #bbb;break-inside:avoid}.box{flex:0 0 16px;height:16px;border:2px solid #111;margin-top:2px}.place{color:#555;margin:2px 0}p{margin:3px 0;font-size:13px}.lines span{display:block;border-bottom:1px solid #ccc;height:22px}.lines.big span{height:28px}', html);
    }

    /* ═══════════════════════ 🗺️ CARTES ANCIENNES POSÉES SUR LA CARTE ═══════════════════════ */

    let oldMapsCache = null;
    async function loadOldMaps(force = false) { if (!oldMapsCache || force) oldMapsCache = (await api('old_maps')).maps || []; return oldMapsCache; }
    /** Image → monde (Web Mercator, zoom 0). t = [a,b,c,d,e,f]. */
    const applyT = (t, u, v) => [t[0] * u + t[2] * v + t[4], t[1] * u + t[3] * v + t[5]];
    const worldToLatLon = (x, y) => [A().yToLat(y, 0), A().xToLng(x, 0)];
    function computeTransform(points) {
        // Même calcul que old_map_transform (lib/heritage.php), pour l'aperçu immédiat
        const pts = points.filter(p => finite(p.u) && finite(p.lat)).map(p => [Number(p.u), Number(p.v), A().lngToX(Number(p.lon), 0), A().latToY(Number(p.lat), 0)]);
        if (pts.length < 3) return null;
        const s = {uu: 0, uv: 0, u: 0, vv: 0, v: 0, n: 0, ux: 0, vx: 0, x: 0, uy: 0, vy: 0, y: 0};
        pts.forEach(([u, v, x, y]) => { s.uu += u * u; s.uv += u * v; s.u += u; s.vv += v * v; s.v += v; s.n++; s.ux += u * x; s.vx += v * x; s.x += x; s.uy += u * y; s.vy += v * y; s.y += y; });
        const m = [[s.uu, s.uv, s.u], [s.uv, s.vv, s.v], [s.u, s.v, s.n]];
        const det = a => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
        const d = det(m);
        if (Math.abs(d) < 1e-12) return null;
        const solve = r => [0, 1, 2].map(c => det(m.map((row, i) => row.map((val, j) => j === c ? r[i] : val))) / d);
        const X = solve([s.ux, s.vx, s.x]), Y = solve([s.uy, s.vy, s.y]);
        return [X[0], Y[0], X[1], Y[1], X[2], Y[2]];
    }
    /** Écart moyen (en mètres) entre les points saisis et leur position calculée : contrôle de la précision. */
    function transformError(t, points) {
        const errs = points.filter(p => finite(p.u) && finite(p.lat)).map(p => { const [x, y] = applyT(t, +p.u, +p.v); const [lat, lon] = worldToLatLon(x, y); return haversine(lat, lon, +p.lat, +p.lon) * 1000; });
        return errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
    }
    function haversine(lat1, lon1, lat2, lon2) { const dLat = (lat2 - lat1) * R, dLon = (lon2 - lon1) * R; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(dLon / 2) ** 2; return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a))); }
    /** Carte que l'on peut déplacer (glisser) et zoomer (molette, boutons), avec une couche « carte ancienne » facultative. */
    function slippyMap(container, {lat = 46.6, lon = 2.4, zoom = 6, onClick = null, overlay = null} = {}) {
        const app = A(), st = {lat, lon, zoom, overlay, markers: []};
        container.classList.add('h-slippy');
        container.innerHTML = '<div class="h-slippy-tiles"></div><div class="h-slippy-overlay"></div><div class="h-slippy-marks"></div><div class="h-slippy-zoom"><button type="button" data-z="1">+</button><button type="button" data-z="-1">−</button></div>';
        const tilesEl = container.querySelector('.h-slippy-tiles'), ovEl = container.querySelector('.h-slippy-overlay'), marksEl = container.querySelector('.h-slippy-marks');
        const view = () => { const w = container.clientWidth, h = container.clientHeight; const cx = app.lngToX(st.lon, st.zoom), cy = app.latToY(st.lat, st.zoom); return {w, h, left: cx - w / 2, top: cy - h / 2}; };
        function draw() {
            const {w, h, left, top} = view();
            if (!w) { requestAnimationFrame(draw); return; }
            const bg = designBg() === 'grid' ? 'bw' : designBg(), z = st.zoom, world = 2 ** z;
            let tiles = '';
            for (let x = Math.floor(left / 256); x <= Math.ceil((left + w) / 256); x++) for (let y = Math.floor(top / 256); y <= Math.ceil((top + h) / 256); y++) {
                if (y < 0 || y >= world) continue;
                tiles += `<img draggable="false" referrerpolicy="no-referrer" src="${app.mapTileUrl(bg, z, ((x % world) + world) % world, y)}" style="left:${x * 256 - left}px;top:${y * 256 - top}px" alt="">`;
            }
            tilesEl.innerHTML = tiles;
            const o = st.overlay;
            if (o?.t && o.src) {
                const sc = 2 ** z, t = o.t;
                ovEl.innerHTML = `<img src="${esc(o.src)}" alt="" style="width:${o.w}px;height:${o.h}px;opacity:${o.opacity ?? .6};transform:matrix(${t[0] * sc},${t[1] * sc},${t[2] * sc},${t[3] * sc},${t[4] * sc - left},${t[5] * sc - top})">`;
            } else ovEl.innerHTML = '';
            marksEl.innerHTML = st.markers.map(mk => `<span class="h-slippy-mark" style="left:${app.lngToX(mk.lon, z) - left}px;top:${app.latToY(mk.lat, z) - top}px;--c:${mk.color || '#cc0014'}" title="${esc(mk.label || '')}">${esc(mk.text || '')}</span>`).join('');
        }
        let drag = null;
        container.addEventListener('pointerdown', e => { if (e.target.closest('.h-slippy-zoom')) return; drag = {x: e.clientX, y: e.clientY, moved: false, cx: app.lngToX(st.lon, st.zoom), cy: app.latToY(st.lat, st.zoom)}; container.setPointerCapture(e.pointerId); });
        container.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; st.lon = app.xToLng(drag.cx - dx, st.zoom); st.lat = app.yToLat(drag.cy - dy, st.zoom); draw(); });
        container.addEventListener('pointerup', e => {
            if (drag && !drag.moved && onClick) { const r = container.getBoundingClientRect(), {left, top} = view(); onClick(app.yToLat(top + e.clientY - r.top, st.zoom), app.xToLng(left + e.clientX - r.left, st.zoom)); }
            drag = null;
        });
        const zoomAt = (dz, px, py) => { const {w, h, left, top} = view(); const cx = px ?? w / 2, cy = py ?? h / 2; const la = app.yToLat(top + cy, st.zoom), lo = app.xToLng(left + cx, st.zoom); st.zoom = Math.max(2, Math.min(19, st.zoom + dz)); const nx = app.lngToX(lo, st.zoom) - cx + w / 2, ny = app.latToY(la, st.zoom) - cy + h / 2; st.lon = app.xToLng(nx, st.zoom); st.lat = app.yToLat(ny, st.zoom); draw(); };
        container.addEventListener('wheel', e => { e.preventDefault(); const r = container.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
        container.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => zoomAt(Number(b.dataset.z))));
        draw();
        return {draw, state: st, center(la, lo, z) { st.lat = la; st.lon = lo; if (z) st.zoom = z; draw(); }};
    }
    ext.lists.old_maps = async (token, editId = null) => {
        const maps = await loadOldMaps(true);
        if (!isCurrent(token)) return;
        if (editId !== null) return renderOldMapEditor(token, editId ? maps.find(m => Number(m.id) === Number(editId)) : null);
        A().$('#workspace').innerHTML = `<section class="page collection-page">${pageHeader('LISTES', 'Cartes anciennes', 'Pose ta propre carte ancienne sur la carte : un plan cadastral photographié aux archives, un vieux plan de village… Indique 3 points que tu reconnais (l’église, un carrefour, le moulin) et l’app la superpose exactement à la carte, avec un réglage de transparence. Places-y ensuite les maisons de tes ancêtres.')}
            <div class="collection-toolbar"><button type="button" class="button" data-h-oldmap-new>+ Carte ancienne</button></div>
            <div class="collection-grid">${maps.map(m => `<article class="collection-card">${m.filename ? `<div class="collection-photo"><img src="media/${encodeURIComponent(m.filename)}" alt="" loading="lazy"></div>` : ''}<div class="collection-body"><strong>${esc(m.title)}</strong>${LC(m.labels)}${m.year_text ? ` <span class="collection-kind">${esc(m.year_text)}</span>` : ''}<p class="muted">${m.transform ? `✅ Calée (${m.control_points.length} points)` : `⚠ À caler : ${m.control_points.length}/3 points`} · ${plural(m.markers.length, 'maison placée', 'maisons placées')}</p>
                <div class="page-actions"><button type="button" class="button small" data-h-oldmap-edit="${m.id}">Caler / placer</button>${m.transform ? `<button type="button" class="button small secondary" data-h-oldmap-show="${m.id}">Voir sur la carte</button>` : ''}</div></div></article>`).join('') || empty('Aucune carte ancienne. Ajoute une photo de plan avec « + Carte ancienne ».')}</div></section>`;
        const ws = A().$('#workspace');
        ws.querySelector('[data-h-oldmap-new]').addEventListener('click', () => ext.lists.old_maps(++S().workspaceToken, 0));
        ws.querySelectorAll('[data-h-oldmap-edit]').forEach(b => b.addEventListener('click', () => ext.lists.old_maps(++S().workspaceToken, Number(b.dataset.hOldmapEdit))));
        ws.querySelectorAll('[data-h-oldmap-show]').forEach(b => b.addEventListener('click', () => showOldMapOnMainMap(Number(b.dataset.hOldmapShow))));
    };
    function showOldMapOnMainMap(id) {
        const m = (oldMapsCache || []).find(x => Number(x.id) === Number(id));
        S().hOldMapId = id;
        if (m?.transform) {
            const [x, y] = applyT(m.transform, m.img_w / 2, m.img_h / 2), [lat, lon] = worldToLatLon(x, y);
            S().mapCenter = {lat, lon}; S().mapZoom = 15; S().mapKeepCenter = true;
        }
        A().setModule('carte');
    }
    function renderOldMapEditor(token, m) {
        const ed = m ? {...m, control_points: [...m.control_points], markers: [...m.markers]} : {id: 0, title: '', year_text: '', notes: '', control_points: [], markers: [], opacity: 70};
        A().$('#workspace').innerHTML = `<section class="page collection-page h-oldmap-page">${pageHeader('CARTE ANCIENNE', ed.id ? ed.title : 'Nouvelle carte ancienne', '', '<button type="button" class="button secondary" data-h-oldmap-back>← Toutes les cartes</button>')}
            <form class="maintenance-panel collection-form" id="h-oldmap-form"><div class="form-grid"><label>Nom<input name="title" required value="${esc(ed.title)}" placeholder="Cadastre napoléonien de Saint-Yrieix, section B"></label><label>Date<input name="year_text" value="${esc(ed.year_text)}" placeholder="1834"></label>
            <label>Image (photo ou scan du plan)<input type="file" name="image" accept="image/*"></label><label>Transparence sur la carte<input type="range" name="opacity" min="10" max="100" value="${Number(ed.opacity) || 70}"></label>
            <label class="span-2">Notes, cote<input name="notes" value="${esc(ed.notes)}" placeholder="AD87, 3 P 1234"></label></div>
            ${LP('old_map', ed.labels)}<div class="page-actions action-zone"><button class="button" type="submit">Enregistrer</button>${ed.id ? `<button class="button secondary" type="button" data-h-oldmap-show>Voir sur la carte</button><button class="button secondary danger" type="button" data-h-oldmap-delete>Supprimer</button>` : ''}</div></form>
            ${ed.filename ? `<div class="h-calib-help maintenance-panel"><p><b>Caler la carte :</b> 1. choisis un point ci-dessous ; 2. clique sur ce point dans <b>ton image</b> (à gauche) ; 3. clique au même endroit sur <b>la carte d’aujourd’hui</b> (à droite). Trois points bien écartés suffisent (plus, c’est encore mieux).<br><b>Placer une maison :</b> clique « Placer une maison », puis sur l’image.</p>
                <div class="h-calib-tools"><span data-h-calib-points></span><button type="button" class="button small secondary" data-h-calib-add>+ Point</button><button type="button" class="button small secondary" data-h-house-mode>🏠 Placer une maison</button><label class="h-inline"><input type="checkbox" data-h-calib-preview checked> Aperçu superposé</label><span data-h-calib-quality class="muted"></span></div></div>
                <div class="h-calib"><div class="h-calib-image"><div class="h-calib-imgwrap"><img src="media/${encodeURIComponent(ed.filename)}" alt="" draggable="false"><div class="h-calib-pins"></div></div></div><div class="h-calib-map"></div></div>
                <div class="maintenance-panel"><h4>Maisons placées</h4><ul class="h-houses"></ul></div>` : '<p class="muted">Enregistre d’abord la carte avec son image ; tu pourras ensuite la caler.</p>'}</section>`;
        const ws = A().$('#workspace'), form = ws.querySelector('#h-oldmap-form');
        ws.querySelector('[data-h-oldmap-back]').addEventListener('click', () => ext.lists.old_maps(++S().workspaceToken));
        ws.querySelector('[data-h-oldmap-delete]')?.addEventListener('click', async () => { if (!confirm(`Supprimer la carte « ${ed.title} » ?`)) return; await api('delete_old_map', {}, {method: 'POST', body: {id: ed.id}}); toast('Carte supprimée.'); ext.lists.old_maps(++S().workspaceToken); });
        ws.querySelector('[data-h-oldmap-show]')?.addEventListener('click', () => showOldMapOnMainMap(ed.id));
        let active = ed.control_points.findIndex(p => !finite(p.u) || !finite(p.lat));
        if (active < 0) active = ed.control_points.length < 3 ? ed.control_points.length : 0;
        while (ed.control_points.length < 3) ed.control_points.push({label: ''});
        let houseMode = false, map = null;
        const img = ws.querySelector('.h-calib-imgwrap img');
        const refresh = () => {
            if (!img || !img.isConnected) return;
            const pts = ed.control_points, t = computeTransform(pts);
            ws.querySelector('[data-h-calib-points]').innerHTML = pts.map((p, i) => `<button type="button" class="button small ${i === active && !houseMode ? '' : 'secondary'}" data-h-calib-pick="${i}">${i + 1}. ${esc(p.label || 'Point')} ${finite(p.u) ? '🖼' : '·'}${finite(p.lat) ? '🌍' : '·'}</button>`).join('');
            ws.querySelector('[data-h-calib-quality]').textContent = t ? `Calée : écart moyen ${fmt(transformError(t, pts))} m${pts.filter(p => finite(p.u) && finite(p.lat)).length === 3 ? ' (3 points : ajoute-en un 4e pour vérifier)' : ''}` : 'Pas encore calée (3 points complets nécessaires).';
            const k = img.clientWidth / (img.naturalWidth || 1);
            ws.querySelector('.h-calib-pins').innerHTML = pts.map((p, i) => finite(p.u) ? `<span class="h-pin ${i === active ? 'is-active' : ''}" style="left:${p.u * k}px;top:${p.v * k}px">${i + 1}</span>` : '').join('') + ed.markers.map(mk => `<span class="h-pin is-house" style="left:${mk.u * k}px;top:${mk.v * k}px" title="${esc(mk.label)}">🏠</span>`).join('');
            ws.querySelector('.h-houses').innerHTML = ed.markers.map((mk, i) => `<li>🏠 ${esc(mk.label || 'Maison')}${mk.person_id ? ` — ${personLink(mk.person_id, mk.person_name || 'fiche')}` : ''} <button type="button" class="link-button" data-h-house-remove="${i}">retirer</button></li>`).join('') || '<li class="muted">Aucune maison placée.</li>';
            if (map) {
                map.state.overlay = t && ws.querySelector('[data-h-calib-preview]').checked ? {t, src: img.src, w: img.naturalWidth, h: img.naturalHeight, opacity: Number(form.elements.opacity.value) / 100} : null;
                map.state.markers = [...pts.map((p, i) => finite(p.lat) ? {lat: +p.lat, lon: +p.lon, text: String(i + 1), label: p.label, color: i === active ? '#cc0014' : '#0066cc'} : null).filter(Boolean),
                    ...(t ? ed.markers.map(mk => { const [x, y] = applyT(t, mk.u, mk.v), [la, lo] = worldToLatLon(x, y); return {lat: la, lon: lo, text: '🏠', label: mk.label, color: '#7a47db'}; }) : [])];
                map.draw();
            }
        };
        if (img) {
            const firstLat = ed.control_points.find(p => finite(p.lat));
            map = slippyMap(ws.querySelector('.h-calib-map'), {lat: firstLat ? +firstLat.lat : 46.6, lon: firstLat ? +firstLat.lon : 2.4, zoom: firstLat ? 15 : 6, onClick: async (lat, lon) => {
                if (houseMode) return;
                const p = ed.control_points[active]; if (!p) return;
                p.lat = Number(lat.toFixed(7)); p.lon = Number(lon.toFixed(7));
                if (!p.label) p.label = (await A().askText({title: 'Point de repère', message: 'Nom de ce point (église, carrefour, moulin…) ?', okLabel: 'OK'})) || '';
                if (finite(p.u)) active = ed.control_points.findIndex(x => !finite(x.u) || !finite(x.lat));
                if (active < 0) active = ed.control_points.length - 1;
                refresh();
            }});
            if (!firstLat) { // centrée sur les lieux de la base si possible
                api('heritage_place_search', {q: (ed.title.match(/\b(?:de|d’|d')\s*([A-ZÉÈ][\wÀ-ÿ'’-]+(?:[- ][A-ZÉÈ][\wÀ-ÿ'’-]+)*)/u)?.[1]) || ''}).then(d => { const p = d.places?.[0]; if (p) map.center(p.lat, p.lon, 14); }).catch(() => {});
            }
            img.addEventListener('load', refresh);
            img.addEventListener('click', async event => {
                const r = img.getBoundingClientRect(), k = (img.naturalWidth || 1) / img.clientWidth, u = (event.clientX - r.left) * k, v = (event.clientY - r.top) * k;
                if (houseMode) {
                    const label = await A().askText({title: 'Maison', message: 'Quelle maison ? (ex. « Maison des Dupont, 1820-1880 »)', okLabel: 'Continuer'});
                    if (label === null) return;
                    const personName = (await A().askText({title: 'Maison', message: 'Nom de l’ancêtre (facultatif, pour garder une trace) :', okLabel: 'Placer'})) || '';
                    ed.markers.push({u: Math.round(u * 100) / 100, v: Math.round(v * 100) / 100, label: [label, personName].filter(Boolean).join(' — ')});
                    houseMode = false; refresh(); return;
                }
                const p = ed.control_points[active]; if (!p) return;
                p.u = Math.round(u * 100) / 100; p.v = Math.round(v * 100) / 100;
                refresh();
            });
            ws.querySelector('[data-h-calib-add]').addEventListener('click', () => { ed.control_points.push({label: ''}); active = ed.control_points.length - 1; refresh(); });
            ws.querySelector('[data-h-house-mode]').addEventListener('click', () => { if (!computeTransform(ed.control_points)) toast('Cale d’abord la carte (3 points), pour que les maisons apparaissent aussi sur la carte.'); houseMode = true; toast('Clique sur la maison dans l’image.'); });
            ws.querySelector('[data-h-calib-preview]').addEventListener('change', refresh);
            form.elements.opacity.addEventListener('input', refresh);
            ws.addEventListener('click', event => {
                const pick = event.target.closest('[data-h-calib-pick]');
                if (pick) { const i = Number(pick.dataset.hCalibPick); if (i === active && confirm('Effacer ce point pour le refaire ?')) { ed.control_points[i] = {label: ed.control_points[i].label}; } active = i; houseMode = false; refresh(); }
                const rm = event.target.closest('[data-h-house-remove]');
                if (rm) { ed.markers.splice(Number(rm.dataset.hHouseRemove), 1); refresh(); }
            });
            window.addEventListener('resize', refresh, {once: true});
            refresh();
        }
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const v = values(form);
            try {
                const body = {id: ed.id, title: v.title, year_text: v.year_text, notes: v.notes, opacity: v.opacity, control_points: ed.control_points.filter(p => finite(p.u) && finite(p.lat)), markers: ed.markers, img_w: img?.naturalWidth || 0, img_h: img?.naturalHeight || 0};
                let saved = await api('save_old_map', {}, {method: 'POST', body});
                const file = form.elements.image.files?.[0];
                if (file) {
                    await uploadFiles('old_map', saved.result.id, [file], 'carte');
                    const dims = await new Promise(resolve => { const im = new Image(); im.onload = () => resolve([im.naturalWidth, im.naturalHeight]); im.onerror = () => resolve([0, 0]); im.src = URL.createObjectURL(file); });
                    saved = await api('save_old_map', {}, {method: 'POST', body: {...body, id: saved.result.id, img_w: dims[0], img_h: dims[1], control_points: file && ed.id ? [] : body.control_points, markers: file && ed.id ? [] : body.markers}});
                }
                toast(saved.result.transform ? 'Carte enregistrée et calée.' : 'Carte enregistrée.');
                ext.lists.old_maps(++S().workspaceToken, saved.result.id);
            } catch (error) { toast(error.message, 'error'); }
        });
    }

    // Carte principale : choix de la carte ancienne et transparence (dans la barre d'outils), puis dessin à chaque déplacement
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage) return;
        const layer = document.createElement('div');
        layer.id = 'h-oldmap-layer'; layer.className = 'h-oldmap-layer';
        stage.insertBefore(layer, document.getElementById('map-tiles-overlay')?.nextSibling || stage.firstChild.nextSibling);
        const ctl = document.createElement('span');
        ctl.className = 'h-oldmap-ctl';
        strip.insertBefore(ctl, strip.querySelector('.spacer'));
        const fill = maps => {
            const ok = maps.filter(m => m.transform && m.filename);
            const sel = Number(S().hOldMapId) || 0;
            ctl.innerHTML = ok.length ? `<label>Ma carte ancienne <select id="h-oldmap-select"><option value="0">—</option>${ok.map(m => `<option value="${m.id}" ${sel === Number(m.id) ? 'selected' : ''}>${esc(m.title)}${m.year_text ? ' (' + esc(m.year_text) + ')' : ''}</option>`).join('')}</select></label>${sel ? `<label>Transparence <input type="range" id="h-oldmap-opacity" min="5" max="100" value="${Number(S().hOldMapOpacity ?? ok.find(m => Number(m.id) === sel)?.opacity ?? 70)}"></label>` : ''}` : '';
            ctl.querySelector('#h-oldmap-select')?.addEventListener('change', event => { S().hOldMapId = Number(event.target.value); S().hOldMapOpacity = null; fill(maps); A().drawMap(); });
            ctl.querySelector('#h-oldmap-opacity')?.addEventListener('input', event => { S().hOldMapOpacity = Number(event.target.value); const im = layer.querySelector('img'); if (im) im.style.opacity = String(event.target.value / 100); });
        };
        loadOldMaps().then(maps => { fill(maps); A().drawMap(); }).catch(() => {});
    });
    ext.mapDraw.push(({left, top, z}) => {
        const layer = document.getElementById('h-oldmap-layer');
        if (!layer) return;
        const m = (oldMapsCache || []).find(x => Number(x.id) === Number(S().hOldMapId));
        if (!m?.transform || !m.filename) { layer.innerHTML = ''; return; }
        const sc = 2 ** z, t = m.transform, opacity = (S().hOldMapOpacity ?? m.opacity ?? 70) / 100;
        const houses = m.markers.map(mk => { const [x, y] = applyT(t, mk.u, mk.v); return `<span class="h-house" style="left:${x * sc - left}px;top:${y * sc - top}px" title="${esc(mk.label)}">🏠<b>${esc(mk.label)}</b></span>`; }).join('');
        let img = layer.querySelector('img');
        if (!img || img.dataset.id !== String(m.id)) { layer.innerHTML = `<img data-id="${m.id}" src="media/${encodeURIComponent(m.filename)}" alt="" draggable="false"><div class="h-houses-layer"></div>`; img = layer.querySelector('img'); }
        img.style.cssText = `width:${m.img_w}px;height:${m.img_h}px;opacity:${opacity};transform:matrix(${t[0] * sc},${t[1] * sc},${t[2] * sc},${t[3] * sc},${t[4] * sc - left},${t[5] * sc - top})`;
        layer.querySelector('.h-houses-layer').innerHTML = houses;
    });

    /* ═══════════════════════ 🔎 RECHERCHES ENREGISTRÉES ═══════════════════════ */

    const searchEvents = {any: 'N’importe quel événement', birth: 'Naissance ou baptême', BIRT: 'Naissance', CHR: 'Baptême', MARR: 'Mariage', death: 'Décès ou inhumation', DEAT: 'Décès', BURI: 'Inhumation', RESI: 'Résidence', OCCU: 'Profession'};
    function criteriaForm(c = {}) {
        const v = k => esc(c[k] ?? '');
        return `<form id="h-search-form" class="maintenance-panel"><h3>Recherche multicritère</h3><div class="form-grid h-search-grid">
            <label>Nom<input name="last_name" value="${v('last_name')}" placeholder="Dupont"></label>
            <label>Le nom<select name="name_mode"><option value="exact" ${c.name_mode !== 'contains' && c.name_mode !== 'starts' ? 'selected' : ''}>est exactement</option><option value="starts" ${c.name_mode === 'starts' ? 'selected' : ''}>commence par</option><option value="contains" ${c.name_mode === 'contains' ? 'selected' : ''}>contient</option></select></label>
            <label>Prénom<input name="first_name" value="${v('first_name')}"></label>
            <label>Sexe<select name="gender"><option value="">Tous</option><option value="male" ${c.gender === 'male' ? 'selected' : ''}>Hommes</option><option value="female" ${c.gender === 'female' ? 'selected' : ''}>Femmes</option><option value="unknown" ${c.gender === 'unknown' ? 'selected' : ''}>Inconnu</option></select></label>
            <label>Événement<select name="event">${Object.entries(searchEvents).map(([k, l]) => `<option value="${k}" ${(c.event || 'any') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label>Lieu (commune, département, région, pays)<input name="place" value="${v('place')}" placeholder="Nord"></label>
            <label>Année de<input type="number" name="year_from" value="${v('year_from')}" placeholder="1700"></label>
            <label>à<input type="number" name="year_to" value="${v('year_to')}" placeholder="1800"></label>
            <label>Métier<input name="occupation" value="${v('occupation')}" placeholder="tisserand"></label>
            <label>Statut<select name="living"><option value="">Tous</option><option value="deceased" ${c.living === 'deceased' ? 'selected' : ''}>Décédés</option><option value="living" ${c.living === 'living' ? 'selected' : ''}>Vivants</option><option value="unknown" ${c.living === 'unknown' ? 'selected' : ''}>À vérifier</option></select></label></div>
            ${c.relation && c.relation_of ? `<input type="hidden" name="relation" value="${v('relation')}"><input type="hidden" name="relation_of" value="${v('relation_of')}">` : ''}${c.ancestors ? '<input type="hidden" name="ancestors" value="1">' : ''}
            ${c.relation && c.relation_of || c.ancestors ? `<p class="h-understood">Venue d’une question : seulement ${c.relation ? 'les proches de la fiche #' + v('relation_of') : 'les ancêtres de la personne de départ'}. <button type="button" class="link-button" data-h-search-unscope>retirer cette limite</button></p>` : ''}
            <p class="muted">Exemple : nom « Dupont », événement « Naissance ou baptême », lieu « Nord », année « à 1800 » = tous les Dupont nés dans le Nord avant 1800.</p>
            <div class="page-actions"><button class="button" type="submit">Chercher</button><button class="button secondary" type="button" data-h-search-save>Enregistrer cette recherche</button></div></form>`;
    }
    const criteriaOf = form => { const v = values(form); return {...v, year_from: v.year_from || null, year_to: v.year_to || null}; };
    ext.research = async token => {
        const st = S();
        st.hSearch = st.hSearch || {criteria: {}, id: 0, name: ''};
        const list = await api('saved_searches').catch(() => ({searches: []}));
        if (token !== st.workspaceToken || st.module !== 'recherche') return;
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page">${pageHeader('RECHERCHE', 'Recherches enregistrées', 'Sauvegarde une recherche (« tous les Dupont nés dans le Nord avant 1800 ») pour la relancer en un clic. L’app signale les nouvelles fiches qui y répondent, par exemple après un import ou une fusion.')}
            <div class="h-search-layout"><div>${criteriaForm(st.hSearch.criteria)}<div id="h-search-results"></div></div>
            <aside class="maintenance-panel h-saved-list"><h3>Mes recherches</h3>${(list.searches || []).map(s => `<article class="h-saved ${s.new_count ? 'has-new' : ''} ${Number(st.hSearch.id) === Number(s.id) ? 'is-active' : ''}"><button type="button" class="link-button" data-h-saved-run="${s.id}"><strong>${esc(s.name)}</strong></button>${s.new_count ? ` <span class="h-new-badge">${s.new_count} nouvelle${s.new_count > 1 ? 's' : ''}</span>` : ''}<small>${esc(s.description)}</small><small>${plural(s.count, 'fiche', 'fiches')}${s.error ? ' · ' + esc(s.error) : ''}</small>
                <span class="h-saved-tools">${s.new_count ? `<button type="button" class="link-button" data-h-saved-seen="${s.id}">marquer comme vues</button>` : ''}<button type="button" class="link-button" data-h-saved-delete="${s.id}">supprimer</button></span></article>`).join('') || '<p class="muted">Aucune recherche enregistrée.</p>'}</aside></div></section>`;
        const form = ws.querySelector('#h-search-form');
        const run = async (criteria, id = 0) => {
            const box = ws.querySelector('#h-search-results');
            box.innerHTML = '<p class="muted">Recherche…</p>';
            try {
                const r = await api('saved_search_results', {criteria: JSON.stringify(criteria), id});
                const newOnes = r.people.filter(p => p.is_new).length;
                box.innerHTML = `<h3>${plural(r.count, 'fiche trouvée', 'fiches trouvées')}${newOnes ? ` <span class="h-new-badge">${newOnes} nouvelle${newOnes > 1 ? 's' : ''}</span>` : ''}</h3><p class="muted">${esc(r.description)}</p>
                    ${r.people.length ? `<table class="data-table"><thead><tr><th>Personne</th><th>Naissance</th><th>Décès</th><th></th></tr></thead><tbody>${r.people.map(p => `<tr class="${p.is_new ? 'is-new' : ''}"><td>${personLink(p.id, A().personName(p))}</td><td>${esc(p.birth_date || p.birth_year || '')}</td><td>${esc(p.death_date || p.death_year || '')}</td><td>${p.is_new ? '<span class="h-new-badge">nouvelle</span>' : ''}</td></tr>`).join('')}</tbody></table>${r.count > r.people.length ? `<p class="muted">Seules les ${r.people.length} premières sont affichées.</p>` : ''}` : empty('Aucune fiche ne répond à ces critères.')}`;
            } catch (error) { box.innerHTML = empty(error.message); }
        };
        form.addEventListener('submit', event => { event.preventDefault(); st.hSearch = {criteria: criteriaOf(form), id: 0, name: ''}; run(st.hSearch.criteria); });
        ws.querySelector('[data-h-search-unscope]')?.addEventListener('click', event => { form.querySelectorAll('input[name="relation"],input[name="relation_of"],input[name="ancestors"]').forEach(i => i.remove()); event.target.closest('p').remove(); });
        ws.querySelector('[data-h-search-save]').addEventListener('click', async () => {
            const name = (await A().askText({title: 'Enregistrer la recherche', message: 'Nom de cette recherche :', value: st.hSearch.name || '', okLabel: 'Enregistrer'}))?.trim();
            if (!name) return;
            try { const r = await api('save_saved_search', {}, {method: 'POST', body: {id: st.hSearch.name === name ? st.hSearch.id : 0, name, criteria: criteriaOf(form)}}); st.hSearch = {criteria: criteriaOf(form), id: r.result.id, name}; toast(`Recherche enregistrée (${plural(r.result.count, 'fiche', 'fiches')}).`); ext.research(++S().workspaceToken); }
            catch (error) { toast(error.message, 'error'); }
        });
        ws.querySelectorAll('[data-h-saved-run]').forEach(b => b.addEventListener('click', async () => {
            const s = list.searches.find(x => Number(x.id) === Number(b.dataset.hSavedRun));
            st.hSearch = {criteria: s.criteria, id: s.id, name: s.name};
            await ext.research(++S().workspaceToken);
            run(s.criteria, s.id);
        }));
        ws.querySelectorAll('[data-h-saved-seen]').forEach(b => b.addEventListener('click', async () => { await api('mark_saved_search_seen', {}, {method: 'POST', body: {id: b.dataset.hSavedSeen}}); notified = {}; ext.research(++S().workspaceToken); }));
        ws.querySelectorAll('[data-h-saved-delete]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette recherche enregistrée ?')) return; await api('delete_saved_search', {}, {method: 'POST', body: {id: b.dataset.hSavedDelete}}); ext.research(++S().workspaceToken); }));
        if (st.hSearch.id || Object.values(st.hSearch.criteria || {}).some(Boolean)) run(st.hSearch.criteria, st.hSearch.id);
    };
    // Nouvelles fiches qui répondent à une recherche enregistrée : signalées après un import, une fusion, une nouvelle fiche…
    let notified = {};
    try { notified = JSON.parse(sessionStorage.getItem('lcnda-saved-search-notified') || '{}'); } catch (_) {}
    let checkTimer = 0;
    async function checkSavedSearches() {
        let data;
        try { data = await api('saved_searches'); } catch (_) { return; }
        const fresh = (data.searches || []).filter(s => s.new_count > (notified[s.id] || 0));
        fresh.forEach(s => { notified[s.id] = s.new_count; });
        try { sessionStorage.setItem('lcnda-saved-search-notified', JSON.stringify(notified)); } catch (_) {}
        if (fresh.length) toast(fresh.map(s => `🔎 « ${s.name} » : ${plural(s.new_count, 'nouvelle fiche', 'nouvelles fiches')}`).join(' · ') + ' (Recherche → Recherches enregistrées)');
    }
    const WATCHED = /^(import_package|import_local_path|merge_gedcom_apply|save_person|merge_persons|merge_duplicates|add_relation|save_event|add_event|bulk_)/;
    window.addEventListener('lcnda:data-changed', event => {
        if (!WATCHED.test(event.detail?.action || '')) return;
        clearTimeout(checkTimer);
        checkTimer = setTimeout(checkSavedSearches, 2500);
    });

    /* ═══════════════════════ 📊 COMPARER AVEC LA FRANCE ═══════════════════════ */

    function sparkline(series, familyYears, from, to, peakYear) {
        const w = 220, h = 40, years = [];
        for (let y = from; y <= to; y++) years.push(y);
        const max = Math.max(1, ...years.map(y => series[y] || 0));
        const pts = years.map((y, i) => `${(i / (years.length - 1 || 1) * w).toFixed(1)},${(h - (series[y] || 0) / max * (h - 4)).toFixed(1)}`).join(' ');
        const xOf = y => ((y - from) / (to - from || 1) * w).toFixed(1);
        return `<svg class="h-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/>${peakYear ? `<line x1="${xOf(peakYear)}" x2="${xOf(peakYear)}" y1="0" y2="${h}" stroke="#999" stroke-dasharray="2 2"/>` : ''}${familyYears.filter(y => y >= from && y <= to).map(y => `<circle cx="${xOf(y)}" cy="${(h - (series[y] || 0) / max * (h - 4)).toFixed(1)}" r="3.2" fill="#cc4700"/>`).join('')}</svg>`;
    }
    ext.graphStats.firstnames_france = async token => {
        const st = S(), minYear = Number(st.hNamesMinYear) || 1900;
        const data = await api('firstnames_france', {min_year: minYear});
        if (token !== st.workspaceToken || st.module !== 'graphiques') return;
        const meta = data.meta;
        const rows = data.names || [];
        const from = meta ? Math.max(meta.from, minYear) : minYear, to = meta ? meta.to : new Date().getFullYear();
        const phrase = r => {
            if (!meta) return '';
            if (!r.peak_year) return `<em>${esc(r.name)}</em> : prénom très rare en France (moins de 3 naissances par an), absent du fichier.`;
            const given = r.family_years.map(y => { const diff = y - r.peak_year; return `${y}${Math.abs(diff) <= 2 ? ' (en pleine mode)' : diff < 0 ? ` (${-diff} ans avant le pic : en avance)` : ` (${diff} ans après le pic)`}`; });
            return `<strong>${esc(r.name)}</strong> : au sommet en France vers <strong>${r.peak_year}</strong> (${fmt(r.peak_count)} bébés). Ta famille l’a donné en ${given.join(', ')}.`;
        };
        A().$('#workspace').innerHTML = `<section class="page">${pageHeader('STATISTIQUES', 'Prénoms : la famille et la France', 'La mode des prénoms de ta famille comparée à la France entière, d’après le fichier public des prénoms de l’INSEE (naissances depuis 1900 : il n’y a pas de données avant).')}
            <section class="maintenance-panel"><h3>Fichier des prénoms de l’INSEE</h3>${meta ? `<p>✅ ${fmt(meta.rows)} lignes importées, de ${meta.from} à ${meta.to}${meta.file ? ` (${esc(meta.file)})` : ''}.</p>` : '<p>Pas encore importé. Télécharge le « Fichier des prénoms — France » (CSV, quelques Mo) sur le site de l’INSEE, puis importe-le ici. Il reste sur ton ordinateur.</p>'}
                <p><a href="https://www.insee.fr/fr/statistiques/2540004" target="_blank" rel="noopener noreferrer">Fichier des prénoms sur insee.fr ↗</a> · <a href="https://www.data.gouv.fr/fr/datasets/fichier-des-prenoms-depuis-1900/" target="_blank" rel="noopener noreferrer">sur data.gouv.fr ↗</a></p>
                <form id="h-prenoms-import" class="page-actions"><input type="file" name="file" accept=".csv,.txt,.zip" required><button class="button small" type="submit">${meta ? 'Remplacer' : 'Importer'}</button><span class="muted" data-h-import-status></span></form>
                <label class="h-inline">Prénoms donnés à partir de <select id="h-names-min">${[1900, 1920, 1945, 1970].map(y => `<option value="${y}" ${minYear === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label></section>
            ${rows.length ? `<table class="data-table h-names-table"><thead><tr><th>Prénom</th><th>Dans la famille</th><th>En France (${from}–${to})</th><th>Comparaison</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.name)}</strong> <small>${r.sex === 2 ? '♀' : r.sex === 1 ? '♂' : ''}</small></td><td>${r.people.slice(0, 6).map(p => `${personLink(p.id, p.name)} <small>${p.year}</small>`).join('<br>')}${r.people.length > 6 ? `<span data-h-names-more hidden><br>${r.people.slice(6).map(p => `${personLink(p.id, p.name)} <small>${p.year}</small>`).join('<br>')}</span><br><button type="button" class="link-button" data-h-names-toggle data-more="${r.people.length - 6}" aria-expanded="false">+ ${r.people.length - 6} personne${r.people.length - 6 > 1 ? 's' : ''}</button>` : ''}</td><td>${meta && r.peak_year ? sparkline(r.series, r.family_years, from, to, r.peak_year) : '—'}</td><td>${phrase(r)}</td></tr>`).join('')}</tbody></table><p class="muted">Courbe : nombre de naissances en France chaque année ; trait pointillé : l’année du pic ; points orange : les années où ta famille l’a donné.</p>` : empty(`Aucune naissance datée depuis ${minYear} dans ta base.`)}</section>`;
        // « + 12 personnes » : déplie (ou replie) le reste de la liste
        A().$('#workspace > section').addEventListener('click', event => {
            const button = event.target.closest('[data-h-names-toggle]'); if (!button) return;
            const more = button.parentElement.querySelector('[data-h-names-more]'), open = more.hidden;
            more.hidden = !open; button.setAttribute('aria-expanded', String(open));
            const n = Number(button.dataset.more);
            button.textContent = open ? 'Replier' : `+ ${n} personne${n > 1 ? 's' : ''}`;
        });
        A().$('#h-names-min').addEventListener('change', event => { st.hNamesMinYear = Number(event.target.value); ext.graphStats.firstnames_france(++st.workspaceToken); });
        A().$('#h-prenoms-import').addEventListener('submit', async event => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget); fd.append('csrf', st.csrf);
            const status = event.currentTarget.querySelector('[data-h-import-status]');
            status.textContent = 'Import en cours (une minute environ)…';
            try {
                const response = await fetch('api.php?action=insee_prenoms_import', {method: 'POST', body: fd, headers: {'X-CSRF-Token': st.csrf}});
                const r = await response.json();
                if (!response.ok || r.error) throw new Error(r.error || 'Import impossible');
                toast(`Prénoms importés : ${fmt(r.rows)} lignes (${r.from}–${r.to}).`);
                ext.graphStats.firstnames_france(++st.workspaceToken);
            } catch (error) { status.textContent = ''; toast(error.message, 'error'); }
        });
    };
    ext.graphStats.probate_wealth = async token => {
        const st = S();
        const data = await api('probate_inventories');
        if (token !== st.workspaceToken || st.module !== 'graphiques') return;
        let sosa = {};
        try { sosa = JSON.parse(localStorage.getItem('genealogie-sosa-map') || '{}'); } catch (_) {}
        const rows = (data.inventories || []).map(r => ({...r, days: workDays(r.net, r.currency, r.year), gen: Number(sosa[r.person_id]) ? Math.floor(Math.log2(Number(sosa[r.person_id]))) + 1 : null})).sort((a, b) => (a.year || 9999) - (b.year || 9999));
        const max = Math.max(1, ...rows.map(r => r.days || 0));
        const gens = {};
        rows.filter(r => r.gen && r.days).forEach(r => { (gens[r.gen] ||= []).push(r); });
        const genRows = Object.entries(gens).sort((a, b) => b[0] - a[0]).map(([g, list]) => ({g: Number(g), avg: list.reduce((s, r) => s + r.days, 0) / list.length, list}));
        const maxG = Math.max(1, ...genRows.map(g => g.avg));
        A().$('#workspace').innerHTML = `<section class="page">${pageHeader('STATISTIQUES', 'Richesse d’après les inventaires après décès', 'Le total net de chaque inventaire, converti en journées de travail d’un journalier de province (même convertisseur que Maintenance → Calendrier / mesures). Ordre de grandeur pour comparer les générations entre elles, pas un montant exact.', '<button type="button" class="button secondary" data-h-open-list="probate">Saisir un inventaire</button>')}
            ${genRows.length ? `<section class="maintenance-panel"><h3>Par génération (numéros Sosa)</h3><table class="data-table"><thead><tr><th>Génération</th><th>Inventaires</th><th>Moyenne</th><th></th></tr></thead><tbody>${genRows.map(g => `<tr><td>${g.g}<sup>e</sup> génération</td><td>${g.list.map(r => personLink(r.person_id, r.person_name, r.year || '')).join('<br>')}</td><td>${fmt(g.avg)} journées<br><small>${fmt(g.avg / 250, 1)} années de travail</small></td><td class="h-bar-cell"><span class="h-bar" style="width:${Math.round(100 * g.avg / maxG)}%"></span></td></tr>`).join('')}</tbody></table></section>` : ''}
            ${rows.length ? `<section class="maintenance-panel"><h3>Chaque inventaire</h3><table class="data-table"><thead><tr><th>Année</th><th>Personne</th><th>Total net</th><th>Journées de travail</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.year || '?')}</td><td>${personLink(r.person_id, r.person_name)}${r.gen ? ` <small>(gén. ${r.gen})</small>` : ''}</td><td>${esc(moneyText(r.net, r.currency))}</td><td>${r.days ? `${fmt(r.days)}<br><small>${fmt(r.days / 250, 1)} années</small>` : '<small>année inconnue</small>'}</td><td class="h-bar-cell">${r.days ? `<span class="h-bar" style="width:${Math.round(100 * r.days / max)}%"></span>` : ''}</td></tr>`).join('')}</tbody></table></section>` : empty('Aucun inventaire après décès. Saisis-en un dans Listes → Inventaires après décès.')}</section>`;
    };

    /* ═══════════════════════ WIDGETS DU TABLEAU DE BORD ═══════════════════════ */

    let overviewPromise = null;
    const overview = () => { overviewPromise = overviewPromise || api('heritage_overview').finally(() => setTimeout(() => { overviewPromise = null; }, 3000)); return overviewPromise; };
    const more = (list, label) => `<div class="page-actions"><button type="button" class="button small secondary" data-h-open-list="${list}">${esc(label)}</button></div>`;
    ext.dashboard.voyages_widget = {load: overview, render: (index, widget, span, data) => {
        const rows = data?.voyages || [];
        return card(index, 'Départs et émigration', rows.length || '', rows.length ? `${voyagePaths(rows)}<ul class="h-widget-list">${rows.slice(0, 6).map(v => `<li>${personLink(v.person_id, v.person_name)} — ${esc(voyageTitle(v))}${v.ship_name ? ` <small>(${esc(v.ship_name)})</small>` : ''}</li>`).join('')}</ul>${more('voyages_list', 'Tous les départs')}` : empty('Aucun départ enregistré : coche « Départs / émigration » sur une fiche.'), span);
    }};
    ext.dashboard.placements_widget = {load: overview, render: (index, widget, span, data) => {
        const rows = data?.placements || [];
        return card(index, 'Enfants placés', rows.length || '', rows.length ? `${placementMap(rows)}<ul class="h-widget-list">${rows.slice(0, 6).map(r => `<li>${personLink(r.person_id, r.person_name)} — ${esc(r.kind_label)}${r.place_text ? ' à ' + esc(r.place_text) : ''}${r.duration ? ` <small>(${esc(r.duration)})</small>` : ''}</li>`).join('')}</ul>${more('placements_list', 'Tous les placements')}` : empty('Aucun enfant placé enregistré.'), span);
    }};
    ext.dashboard.heraldry_widget = {load: overview, render: (index, widget, span, data) => {
        const rows = data?.coats_of_arms || [];
        registerCoatMedia(rows);
        return card(index, 'Armoiries', rows.length || '', rows.length ? `<div class="h-coats">${rows.slice(0, 4).map(c => coatCardHtml(c, {compact: true})).join('')}</div>${more('coats_of_arms', 'Toutes les armoiries')}` : empty('Aucune armoirie.') + more('coats_of_arms', 'Ajouter des armoiries'), span);
    }};
    ext.dashboard.poilus_widget = {load: overview, render: (index, widget, span, data) => {
        const rows = data?.poilus || [];
        return card(index, 'Poilus 14-18', rows.length || '', rows.length ? `<ul class="h-widget-list">${rows.slice(0, 8).map(r => { const hurt = (r.events || []).find(e => ['blesse', 'tue', 'disparu', 'gaze', 'prisonnier'].includes(e.kind)); const u = hurt ? unitAt(r.units || [], hurt.event_date) : (r.units || [])[0]; return `<li>${chip(r.person)}${u ? ` — ${esc(u.unit_name)}` : ''}${hurt ? `<br><small>${esc(hurt.kind_label)} le ${esc(dateFr(hurt.event_date))}${hurt.place_text ? ' à ' + esc(hurt.place_text) : ''}</small>` : ''}${u ? `<br>${jmoLinks(u, hurt?.event_date || '')}` : ''}</li>`; }).join('')}</ul>${more('poilus_list', 'Tous les poilus')}` : empty('Aucun poilu : coche « Poilu 14-18 » sur une fiche.'), span);
    }};
    ext.dashboard.saved_searches_widget = {load: () => api('saved_searches'), render: (index, widget, span, data) => {
        const rows = data?.searches || [];
        return card(index, 'Recherches enregistrées', rows.length || '', rows.length ? `<ul class="h-widget-list">${rows.map(s => `<li><button type="button" class="link-button" data-h-run-saved="${s.id}">${esc(s.name)}</button> <small>${plural(s.count, 'fiche', 'fiches')}</small>${s.new_count ? ` <span class="h-new-badge">${s.new_count} nouvelle${s.new_count > 1 ? 's' : ''}</span>` : ''}</li>`).join('')}</ul>` : empty('Aucune recherche enregistrée (Recherche → Recherche multicritère).'), span);
    }};
    document.addEventListener('click', event => {
        const b = event.target.closest?.('[data-h-run-saved]');
        if (!b) return;
        S().researchKind = 'saved'; S().hSearch = {criteria: {}, id: 0, name: ''};
        A().api('saved_searches').then(d => { const s = (d.searches || []).find(x => Number(x.id) === Number(b.dataset.hRunSaved)); if (s) S().hSearch = {criteria: s.criteria, id: s.id, name: s.name}; A().setModule('recherche'); });
    });
    ext.dashboard.field_trips_widget = {load: () => api('field_trips', {status: 'todo'}), render: (index, widget, span, data) => {
        const rows = data?.trips || [];
        return card(index, 'Circuits sur le terrain', rows.length || '', rows.length ? `<ul class="h-widget-list">${rows.slice(0, 6).map(t => `<li><button type="button" class="link-button" data-h-open-list="field_trips" data-h-edit="${t.id}">🚗 ${esc(t.title)}</button><br><small>${esc(t.date_start ? dateFr(t.date_start) : 'dates à fixer')} · ${plural(Number(t.stop_count), 'étape', 'étapes')}${Number(t.stop_count) ? ` · ${t.done_count} faite(s)` : ''}</small></li>`).join('')}</ul>${more('field_trips', 'Tous les circuits')}` : empty('Aucun circuit à faire.') + more('field_trips', 'Préparer un circuit'), span);
    }};
    ext.dashboard.offsite_backup_widget = {load: () => api('offsite_status'), render: (index, widget, span, data) => card(index, 'Copie hors de l’ordinateur', '', offsiteSummaryHtml(data, true), span)};

    /* ═══════════════════════ 🛟 COPIE HORS DE CET ORDINATEUR ═══════════════════════ */

    function offsiteSummaryHtml(s, compact = false) {
        if (!s) return empty('État indisponible.');
        const sentence = !s.dirs.length ? '⚠ Aucun dossier hors de cet ordinateur n’est réglé : si le Mac est volé ou tombe en panne, tout part avec lui.'
            : s.days === null ? '⚠ Aucune copie hors de cet ordinateur pour l’instant.'
            : s.days === 0 ? '✅ Ta dernière copie hors de cet ordinateur date d’aujourd’hui.'
            : `${s.days >= s.warn_days ? '⚠' : '✅'} Ta dernière copie hors de cet ordinateur date de ${plural(s.days, 'jour', 'jours')}.`;
        return `<p class="h-offsite-sentence ${s.warn ? 'is-warn' : 'is-ok'}">${esc(sentence)}</p>${s.last ? `<small class="muted">${esc(s.last.file || '')} — ${esc(s.last.dir || '')}</small>` : ''}
            ${compact ? `<div class="page-actions">${s.dirs.length ? '<button type="button" class="button small" data-h-offsite-copy>Copier maintenant</button>' : ''}<button type="button" class="button small secondary" data-h-offsite-settings>Régler</button></div>` : ''}`;
    }
    async function offsiteCopy(withMedia = false, button = null) {
        if (button) button.disabled = true;
        try {
            const r = await api('offsite_copy_now', {}, {method: 'POST', body: {with_media: withMedia ? 1 : 0}});
            (r.done || []).forEach(d => toast(`Copie faite : ${d.dir}${d.media_copied ? ` (+ ${d.media_copied} médias)` : ''}`));
            (r.errors || []).forEach(e => toast(`${e.dir} : ${e.error}`, 'error'));
            return r;
        } catch (error) { toast(error.message, 'error'); } finally { if (button) button.disabled = false; }
    }
    document.addEventListener('click', async event => {
        const c = event.target.closest?.('[data-h-offsite-copy]');
        if (c) { await offsiteCopy(false, c); if (S().module === 'dashboard') A().setModule('dashboard', false); }
        if (event.target.closest?.('[data-h-offsite-settings]')) { S().maintenanceTab = 'export'; A().setModule('maintenance'); setTimeout(() => document.getElementById('h-offsite-panel')?.scrollIntoView({block: 'start'}), 400); }
    });
    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-offsite-panel"><h3>🛟 Copie hors de cet ordinateur</h3>
        <p>La sauvegarde automatique reste sur le même disque : si l’ordinateur est volé ou tombe en panne, tout part avec lui. Choisis un ou plusieurs dossiers <b>ailleurs</b> : disque externe, clé USB, dossier iCloud Drive, Dropbox, OneDrive… L’app y copie la base et te prévient quand la dernière copie devient trop ancienne.</p>
        <div data-h-offsite-body><p class="muted">Chargement…</p></div></section>`);
    ext.afterExport.push(async () => {
        const box = document.querySelector('[data-h-offsite-body]');
        if (!box) return;
        const render = s => {
            box.innerHTML = `${offsiteSummaryHtml(s)}
                <ul class="h-offsite-dirs">${s.dirs.map((d, i) => `<li><code>${esc(d.path)}</code> ${d.reachable ? (d.cloud ? '<span class="collection-kind">synchronisé en ligne</span>' : d.same_disk ? '<span class="collection-kind is-warn">⚠ même disque que la base : ne protège pas d’un vol ou d’une panne</span>' : '<span class="collection-kind">branché</span>') : '<span class="collection-kind is-warn">débranché ou introuvable</span>'}${d.last_file ? ` <small>dernière copie : ${new Date(d.last_file.mtime * 1000).toLocaleDateString('fr-FR')}</small>` : ''} <button type="button" class="link-button" data-h-offsite-remove="${i}">retirer</button></li>`).join('') || '<li class="muted">Aucun dossier.</li>'}</ul>
                <div class="form-grid"><label class="span-2">Ajouter un dossier<input type="text" data-h-offsite-new placeholder="/Volumes/MaCle/LCNDA  ou  ~/Library/Mobile Documents/com~apple~CloudDocs/LCNDA" list="h-offsite-suggest"><datalist id="h-offsite-suggest">${(s.suggestions || []).map(x => `<option value="${esc(x.path)}">${esc(x.label)}</option>`).join('')}</datalist></label>
                ${(s.suggestions || []).length ? `<div class="span-2 h-offsite-suggestions">${s.suggestions.map(x => `<button type="button" class="button small secondary" data-h-offsite-suggest="${esc(x.path)}">${esc(x.label)}</button>`).join('')}</div>` : ''}
                <label>Prévenir quand la dernière copie a plus de<span class="h-inline"><input type="number" data-h-offsite-days min="1" max="365" value="${s.warn_days}" class="h-narrow"> jours</span></label></div>
                <div class="page-actions"><button type="button" class="button secondary" data-h-offsite-save>Enregistrer les réglages</button>${s.dirs.length ? '<button type="button" class="button" data-h-offsite-now>Copier maintenant</button><button type="button" class="button secondary" data-h-offsite-now-media>Copier avec les médias</button>' : ''}</div>`;
            const dirs = s.dirs.map(d => ({path: d.path, label: d.label}));
            const save = async extra => { try { const r = await api('save_offsite_settings', {}, {method: 'POST', body: {dirs: extra, warn_days: box.querySelector('[data-h-offsite-days]').value}}); render(r.result); toast('Réglages enregistrés.'); } catch (error) { toast(error.message, 'error'); } };
            box.querySelector('[data-h-offsite-save]').addEventListener('click', () => { const v = box.querySelector('[data-h-offsite-new]').value.trim(); save(v ? [...dirs, {path: v}] : dirs); });
            box.querySelectorAll('[data-h-offsite-suggest]').forEach(b => b.addEventListener('click', () => { box.querySelector('[data-h-offsite-new]').value = b.dataset.hOffsiteSuggest; }));
            box.querySelectorAll('[data-h-offsite-remove]').forEach(b => b.addEventListener('click', () => save(dirs.filter((_, i) => i !== Number(b.dataset.hOffsiteRemove)))));
            box.querySelector('[data-h-offsite-now]')?.addEventListener('click', async e => { const r = await offsiteCopy(false, e.currentTarget); if (r?.status) render(r.status); });
            box.querySelector('[data-h-offsite-now-media]')?.addEventListener('click', async e => { const r = await offsiteCopy(true, e.currentTarget); if (r?.status) render(r.status); });
        };
        try { render(await api('offsite_status')); } catch (error) { box.innerHTML = empty(error.message); }
    });
    // Au démarrage : prévenir si la dernière copie hors de l'ordinateur est trop ancienne (une fois par jour)
    setTimeout(async () => {
        if (!S()?.csrf) return;
        let s;
        try { s = await api('offsite_status'); } catch (_) { return; }
        const key = 'lcnda-offsite-warned', day = today();
        let last = '';
        try { last = localStorage.getItem(key) || ''; } catch (_) {}
        if (last === day) return;
        if (s.warn === 'old') toast(s.days === null ? '🛟 Aucune copie hors de cet ordinateur pour l’instant (Maintenance → Export propre).' : `🛟 Ta dernière copie hors de cet ordinateur date de ${plural(s.days, 'jour', 'jours')}.`);
        else if (s.warn === 'none' && (!last || Date.now() - new Date(last).getTime() > 7 * 86400000)) toast('🛟 Pense à une copie hors de cet ordinateur (disque externe, clé, iCloud, Dropbox) : Maintenance → Export propre.');
        else return;
        try { localStorage.setItem(key, day); } catch (_) {}
        checkSavedSearches();
    }, 6000);
    setTimeout(() => { if (S()?.csrf) checkSavedSearches(); }, 8000);

    /* ═══════════════════════ 👨‍👩‍👧 EXPORT D'UNE SEULE BRANCHE ═══════════════════════ */

    ext.exportPanels.push(() => `<section class="maintenance-panel" id="h-branch-export"><h3>👨‍👩‍👧 GEDCOM d’une seule branche</h3>
        <p>Pour un cousin qui ne s’intéresse qu’à sa branche : un GEDCOM limité aux <b>ascendants d’une personne</b>, ou aux <b>descendants d’un couple</b>, au lieu de toute ta base. Combine-le avec « Pour partager » pour masquer les vivants.</p>
        <form id="h-branch-form" class="form-grid"><label>Branche<select name="branch_mode"><option value="ascendants">Ascendants d’une personne</option><option value="descendants">Descendants d’un couple (ou d’une personne)</option></select></label>
            <label>Personne${A().collectionPersonField('branch_person', null, 'Personne…')}</label>
            <label data-h-partner>Conjoint (pour un couple)${A().collectionPersonField('branch_partner', null, 'Conjoint…')}</label>
            <label>Générations, au plus<input type="number" name="branch_generations" min="1" max="60" value="60"></label>
            <label class="checkbox-line" data-h-spouses><input type="checkbox" name="branch_spouses" checked> Avec les conjoints des descendants</label>
            <label>Version<select name="gedcom_version"><option value="7">GEDCOM 7.0</option><option value="5.5.1">GEDCOM 5.5.1</option></select></label>
            <label class="checkbox-line"><input type="checkbox" name="share" checked> Pour partager : masquer les vivants et les fiches confidentielles</label>
            <label class="checkbox-line"><input type="checkbox" name="include_media" checked> Médias</label><label class="checkbox-line"><input type="checkbox" name="include_notes" checked> Notes</label><label class="checkbox-line"><input type="checkbox" name="include_sources" checked> Sources</label>
            <div class="page-actions" style="grid-column:1/-1"><button class="button" type="submit">Télécharger le GEDCOM de la branche</button></div></form></section>`);
    ext.afterExport.push(() => {
        const form = document.getElementById('h-branch-form');
        if (!form) return;
        A().bindCollectionPersonFields(form);
        const sync = () => { const desc = form.elements.branch_mode.value === 'descendants'; form.querySelector('[data-h-partner]').hidden = !desc; form.querySelector('[data-h-spouses]').hidden = !desc; };
        form.elements.branch_mode.addEventListener('change', sync); sync();
        form.addEventListener('submit', event => {
            event.preventDefault();
            const person = form.querySelector('[name=branch_person]').value;
            if (!person) return toast('Choisis la personne (dans les suggestions).', 'error');
            const url = new URL('api.php', location.href);
            const p = {action: 'export_gedcom', branch_mode: form.elements.branch_mode.value, branch_person: person, branch_partner: form.elements.branch_mode.value === 'descendants' ? form.querySelector('[name=branch_partner]').value : '', branch_generations: form.elements.branch_generations.value,
                branch_spouses: form.elements.branch_spouses.checked ? '1' : '0', gedcom_version: form.elements.gedcom_version.value, share: form.elements.share.checked ? '1' : '0',
                include_media: form.elements.include_media.checked ? '1' : '0', include_notes: form.elements.include_notes.checked ? '1' : '0', include_sources: form.elements.include_sources.checked ? '1' : '0', include_living: '1'};
            Object.entries(p).forEach(([k, v]) => v !== '' && url.searchParams.set(k, v));
            location.assign(url.toString());
        });
    });
})();
