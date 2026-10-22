/* LCNDA — 🏞 Cartes postales anciennes (F8 ; serveur : lib/postcards.php).
 * Ce qui existait : le média « carte postale » (envoi recto/verso, correspondance « Carte postale »), la visionneuse qui passe
 * du recto au verso, l'atelier de transcription. Ici, en plus :
 *  - la fiche de la carte : recto et verso (fenêtre des images), éditeur, numéro, date d'envoi, cachet, écrite par / à (menu de
 *    choix des personnes, nom libre possible), adresse, texte du dos (= transcription du média du verso, « 📜 Transcrire » ouvre
 *    l'atelier), lieu montré (menu de choix des lieux), point de vue et direction (angle de vue sur la Carte), notes ;
 *  - Listes → « 🏞 Cartes postales » (barre H10, Liste | Fiches), avec les cartes de tes médias qui n'ont pas encore leur fiche ;
 *  - le calque « 🏞 Cartes postales » de la Carte (vignettes et cône de la vue) ;
 *  - le bloc « 🏞 Cartes postales » de la fiche d'un lieu (Monographie de commune) et de la fiche d'un village.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    for (const key of ['mapSetup', 'mapDraw']) ext[key] = ext[key] || [];
    const esc = v => A().escapeHtml(String(v ?? ''));
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || A();
    const S = () => A().state;
    const api = (...a) => A().api(...a);
    const write = body => api('postcard_write', {}, {method: 'POST', body});
    const KEY = 'listes:postcards';
    const DIRS = [['', '—'], [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SO'], [270, 'O'], [315, 'NO']];
    let D = null; // {postcards, candidates}
    const load = async () => (D = await api('postcards'));
    const dirName = b => { if (b === null || b === undefined || b === '') return ''; const n = ((Number(b) % 360) + 360) % 360; return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(n / 45) % 8]; };
    const placeText = pl => pl ? [pl.name, pl.county && pl.county !== pl.name ? pl.county : ''].filter(Boolean).join(', ') : '';
    const personText = (p, txt) => p ? p.title : txt || '';
    const img = (src, alt = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">` : '<span class="ui-card-ico">🏞</span>';

    /* ═════════ La fiche d'une carte ═════════ */
    async function openCard(pc, {place = null, recto = null, verso = null, after = null} = {}) {
        const isNew = !pc?.id;
        const v = pc || {};
        const r = recto || v.recto, vs = verso === undefined ? v.verso : (verso || v.verso);
        const pv = x => x ? (x.id ? {id: x.id, title: x.title} : null) : null;
        const writer = v.writer ? pv(v.writer) : v.writer_text ? 'txt:' + v.writer_text : null;
        const recip = v.recipient ? pv(v.recipient) : v.recipient_text ? 'txt:' + v.recipient_text : null;
        const pl = v.place || place;
        const dlg = ext.openDialog({eyebrow: 'CARTE POSTALE', title: isNew ? 'Nouvelle carte postale' : (v.title || 'Carte postale'), wide: true,
            body: `<div class="h-cpo-form">
                <div class="h-cpo-sides"><div><span class="pk-lab">Recto (la vue)</span>${P().mediaField({name: 'media_id', types: ['image'], value: r ? {id: r.id, title: r.title, filename: r.filename, thumb: r.thumb} : null, title: 'Le recto de la carte postale', okLabel: 'Prendre cette image'})}</div>
                    <div><span class="pk-lab">Verso (le dos écrit)</span>${P().mediaField({name: 'verso_media_id', types: ['image'], value: vs ? {id: vs.id, title: vs.title, filename: vs.filename, thumb: vs.thumb} : null, title: 'Le verso de la carte postale', okLabel: 'Prendre cette image'})}</div></div>
                <div class="form-grid">
                    <label class="span-2">Titre <small class="muted">(sinon celui de l’image)</small><input name="title" maxlength="300" value="${esc(v.own_title || '')}" placeholder="Brive — La place de la Guierle"></label>
                    <label>Éditeur<input name="publisher" maxlength="300" value="${esc(v.publisher || '')}" placeholder="Éd. Lévy et fils, ND Phot…"></label>
                    <label>Numéro<input name="card_number" maxlength="80" value="${esc(v.card_number || '')}" placeholder="n° 12"></label>
                    <label>Date d’envoi<input name="sent_date" data-ui-date="nocal" maxlength="120" value="${esc(v.sent_date || '')}" placeholder="12 août 1912, vers 1905…"></label>
                    <label>Cachet de la poste<input name="postmark" maxlength="300" value="${esc(v.postmark || '')}" placeholder="Brive (Corrèze) 12-8-12"></label>
                    <div><span class="pk-lab">Écrite par</span>${P().pickerField({name: 'writer', kind: 'person', allowFree: true, animals: false, value: writer})}</div>
                    <div><span class="pk-lab">À (destinataire)</span>${P().pickerField({name: 'recipient', kind: 'person', allowFree: true, animals: false, value: recip})}</div>
                    <label class="span-2">Adresse du destinataire<textarea name="recipient_address" rows="2" maxlength="600" placeholder="Madame Borie, rue du Lycée, Tulle">${esc(v.recipient_address || '')}</textarea></label>
                    <div class="span-2 h-cpo-back"><div class="h-cpo-backhead"><span class="pk-lab">Texte écrit au dos</span><button type="button" class="button small secondary" data-cpo-transcribe title="L’atelier de transcription : l’image du dos à gauche, le texte à droite, lecture automatique, repérage des noms">📜 Transcrire dans l’atelier</button></div>
                        <textarea name="back_text" rows="5" maxlength="50000" placeholder="« Ma chère cousine, nous voici bien arrivés… »">${esc(v.back_text || '')}</textarea>
                        <small class="muted">C’est la transcription de l’image du ${vs ? 'verso' : 'dos'} : la même que dans la visionneuse et la recherche.</small></div>
                    <div class="span-2"><span class="pk-lab">Lieu montré sur la carte</span>${P().pickerField({name: 'place_id', kind: 'place', value: pl ? {id: pl.id, title: pl.name, name: pl.name, kind: 'place', short: pl.county || ''} : null})}</div>
                    <fieldset class="span-2 h-cpo-view"><legend>Angle de vue <small class="muted">(facultatif : d’où la photo a été prise et dans quelle direction)</small></legend>
                        <div class="h-cpo-dirs" role="group" aria-label="Direction">${DIRS.map(([b, l]) => `<button type="button" class="button small ${String(v.view_bearing ?? '') !== '' && b !== '' && Math.round(Number(v.view_bearing) / 45) * 45 % 360 === b ? '' : 'secondary'}" data-cpo-dir="${b}">${l}</button>`).join('')}</div>
                        <label>Direction<input type="range" name="view_bearing_r" min="0" max="359" step="1" value="${Number(v.view_bearing ?? 0)}" data-unit="°" data-default="0"></label>
                        <input type="hidden" name="view_bearing" value="${v.view_bearing ?? ''}">
                        <details ${v.view_lat !== null && v.view_lat !== undefined ? 'open' : ''}><summary>Préciser le point d’où la vue a été prise</summary><div class="form-grid">
                            <label>Latitude<input name="view_lat" inputmode="decimal" value="${v.view_lat ?? ''}" placeholder="45.1588"></label><label>Longitude<input name="view_lon" inputmode="decimal" value="${v.view_lon ?? ''}" placeholder="1.5321"></label></div>
                            <small class="muted">Vide = le lieu montré. Tu peux copier les coordonnées depuis la Carte (clic droit) ou un site de cartes.</small></details></fieldset>
                    <label class="span-2">Notes<textarea name="notes" rows="2" maxlength="8000">${esc(v.notes || '')}</textarea></label>
                </div></div>`,
            onDelete: isNew ? null : async () => { await removeCard(v); after?.(); return true; },
            onOpen: d => {
                const f = d.querySelector('form');
                const bear = f.elements.view_bearing, range = f.elements.view_bearing_r;
                const paintDirs = () => d.querySelectorAll('[data-cpo-dir]').forEach(b => b.classList.toggle('secondary', !(bear.value !== '' && b.dataset.cpoDir !== '' && Math.round(Number(bear.value) / 45) * 45 % 360 === Number(b.dataset.cpoDir))));
                d.querySelector('.h-cpo-dirs').addEventListener('click', e => { const b = e.target.closest('[data-cpo-dir]'); if (!b) return; bear.value = b.dataset.cpoDir; if (b.dataset.cpoDir !== '') { range.value = b.dataset.cpoDir; range.dispatchEvent(new Event('input')); } paintDirs(); });
                range.addEventListener('input', () => { bear.value = range.value; paintDirs(); });
                d.querySelector('[data-cpo-transcribe]').addEventListener('click', async () => {
                    const vid = Number(f.elements.verso_media_id?.value) || Number(f.elements.media_id?.value) || 0;
                    if (!vid) return UI().fail?.(f.elements.verso_media_id || f.elements.media_id, 'Choisis d’abord l’image du verso (ou du recto).');
                    if (!ext.openActTranscriber) return A().toast('L’atelier de transcription n’est pas encore chargé.', 'error');
                    const [m] = await (P().loadMedia?.([vid], true) || Promise.resolve([]));
                    await ext.openActTranscriber({mediaId: vid, filename: m?.filename || '', title: `Carte postale — ${f.elements.title.value.trim() || m?.title || 'texte du dos'}`, text: f.elements.back_text.value, kind: 'lettre'});
                    // à la fermeture de l'atelier : son texte, s'il a été « mis dans le média », revient ici
                    const wait = setInterval(async () => {
                        if (document.querySelector('dialog.h-tx-dlg[open]')) return; clearInterval(wait);
                        try { const [x] = await P().loadMedia([vid], true); if (x?.transcription && x.transcription !== f.elements.back_text.value) { f.elements.back_text.value = x.transcription; A().toast('Le texte de l’atelier est repris dans « Texte écrit au dos ».'); } } catch (_) {}
                    }, 600);
                });
            },
            onSubmit: async form => {
                const fv = A().formObject(form);
                if (!Number(fv.media_id)) return UI().fail(form.elements.media_id, 'Choisis l’image du recto (la vue).');
                if (Number(fv.verso_media_id) && Number(fv.verso_media_id) === Number(fv.media_id)) return UI().fail(form.elements.verso_media_id, 'Le verso doit être une autre image que le recto.');
                const lat = String(fv.view_lat || '').trim(), lon = String(fv.view_lon || '').trim();
                if ((lat === '') !== (lon === '')) return UI().fail(form.elements[lat === '' ? 'view_lat' : 'view_lon'], 'Donne la latitude et la longitude, ou aucune des deux.');
                if (lat !== '' && (!(Math.abs(Number(lat.replace(',', '.'))) <= 90) || !(Math.abs(Number(lon.replace(',', '.'))) <= 180))) return UI().fail(form.elements.view_lat, 'Latitude entre -90 et 90, longitude entre -180 et 180.');
                const body = {op: 'save', id: v.id || 0, media_id: Number(fv.media_id), verso_media_id: Number(fv.verso_media_id) || 0, title: fv.title, publisher: fv.publisher, card_number: fv.card_number,
                    sent_date: fv.sent_date, postmark: fv.postmark, writer: fv.writer || '', recipient: fv.recipient || '', recipient_address: fv.recipient_address, back_text: fv.back_text,
                    place_id: Number(fv.place_id) || 0, view_bearing: fv.view_bearing, view_lat: lat, view_lon: lon, notes: fv.notes};
                const res = await write(body);
                A().toast(isNew ? 'Carte postale ajoutée.' : 'Enregistré', 'success');
                await load().catch(() => {}); after?.(res.postcard); refreshAll();
                return true;
            }});
        return dlg;
    }
    async function removeCard(pc) {
        const res = await write({op: 'delete', id: pc.id});
        await load().catch(() => {}); refreshAll();
        A().undoToast(`Fiche de la carte « ${pc.title} » supprimée (les images restent dans les Médias)`, {undo: async () => { await write({op: 'restore', snapshot: res.snapshot}); await load().catch(() => {}); refreshAll(); }});
    }
    function refreshAll() {
        if (S().module === 'listes' && S().listType === 'postcards') draw();
        document.querySelectorAll('[data-cpo-host]').forEach(h => { h.dataset.cpoDone = ''; fillHost(h); });
        if (S().module === 'carte' && layerOn()) A().drawMap?.();
    }
    const showImages = pc => { const list = [pc.recto, pc.verso].filter(Boolean).map((m, i) => ({id: m.id, filename: m.filename, title: m.title || pc.title, media_type: 'image', postcard_group: 'pc' + pc.media_id, postcard_side: i ? 'verso' : 'recto'})); if (list.length && A().openLightbox) A().openLightbox(list, 0, true); };

    /* ═════════ Listes → Cartes postales ═════════ */
    ext.lists.postcards = async token => {
        try { await load(); } catch (e) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(e.message, {icon: '⛔'})}</section>`; return; }
        if (token !== S().workspaceToken) return;
        draw();
    };
    function rowsOf() {
        const done = (D?.postcards || []).map(pc => ({...pc, todo: false}));
        const todo = (D?.candidates || []).map(c => ({id: 0, media_id: c.media_id, title: c.title, recto: c.recto, verso: c.verso, sent_date: c.date_text || '', todo: true, place: null, back_filled: false, updated_at: ''}));
        return [...todo, ...done];
    }
    function draw() {
        const ws = A().$('#workspace'), U = UI();
        const lb = U.listBarState?.(KEY) || {}, fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const sort = lb.sort || (U.sortOf ? U.sortOf(KEY) : 'recent'), view = U.viewOf ? U.viewOf(KEY, 'cards') : 'cards';
        const words = fold(lb.q).split(/\s+/).filter(Boolean), fState = lb.f?.state || [], fPlace = lb.f?.place, fBack = lb.f?.back || '';
        const all = rowsOf();
        const shown = all.filter(pc => words.every(w => fold([pc.title, pc.publisher, pc.card_number, pc.sent_date, pc.postmark, placeText(pc.place), personText(pc.writer, pc.writer_text), personText(pc.recipient, pc.recipient_text), pc.back_text, pc.notes].join(' ')).includes(w))
            && (!fState.length || fState.includes(pc.todo ? 'todo' : 'done')) && (!fPlace?.id || Number(pc.place?.id) === Number(fPlace.id))
            && (!fBack || (fBack === 'yes' ? pc.back_filled : !pc.back_filled)));
        const yearOf = pc => (String(pc.sent_date || '').match(/(1[5-9]\d\d|20\d\d)/) || [])[1] || '9999';
        const rows = sort === 'sent' ? [...shown].sort((a, b) => yearOf(a).localeCompare(yearOf(b))) : U.sortItems ? U.sortItems(shown, sort, {name: pc => pc.title, date: pc => pc.updated_at || ''}) : shown;
        const item = pc => ({thumb: img(pc.recto?.thumb, pc.title), name: pc.title, open: pc.todo ? `data-cpo-todo="${pc.media_id}"` : `data-cpo-open="${pc.id}"`,
            lines: [[placeText(pc.place) && '📍 ' + placeText(pc.place), pc.publisher, pc.card_number].filter(Boolean).join(' · ') || (pc.todo ? 'Pas encore de fiche' : ''),
                [pc.sent_date && 'Envoyée ' + pc.sent_date, (pc.writer || pc.writer_text) && 'par ' + personText(pc.writer, pc.writer_text), (pc.recipient || pc.recipient_text) && 'à ' + personText(pc.recipient, pc.recipient_text)].filter(Boolean).join(' ')],
            badges: [pc.todo ? {text: 'À compléter', kind: 'yellow'} : null, pc.verso ? {text: 'Recto · verso', kind: 'grey'} : null, pc.back_filled ? {text: 'Texte transcrit', kind: 'green'} : null].filter(Boolean),
            when: pc.updated_at || '', whenLabel: 'Modifié', date: pc.todo ? 'À compléter' : '',
            quick: `<button type="button" class="button small secondary" data-cpo-view="${pc.todo ? 'm' + pc.media_id : pc.id}" title="Voir le recto et le verso en grand">🖼</button>`,
            menu: pc.todo ? [] : [`<button type="button" data-cpo-open="${pc.id}">✎ Modifier</button>`, pc.place?.lat != null || pc.view_lat != null ? `<button type="button" data-cpo-onmap="${pc.id}">🗺 Voir sur la carte</button>` : '', `<button type="button" class="danger" data-cpo-del="${pc.id}">🗑 Supprimer la fiche</button>`].filter(Boolean),
            actions: view === 'cards' ? '' : `<button type="button" class="icon-button small" data-cpo-view="${pc.todo ? 'm' + pc.media_id : pc.id}" title="Voir en grand" aria-label="Voir en grand">🖼</button>`});
        const header = U.pageHeader ? U.pageHeader({title: 'Cartes postales', icon: '🏞',
            help: 'Les cartes postales anciennes : la vue et le dos écrit, l’éditeur, la date d’envoi, qui l’a écrite et à qui, le lieu montré — retrouvées sur la Carte et dans la fiche du lieu.',
            primary: '<button type="button" class="button" data-cpo-new>＋ Nouvelle carte postale</button>', actions: ['<button type="button" class="button secondary" data-cpo-map>🗺 Voir sur la carte</button>']})
            : '<header class="page-header"><h2>🏞 Cartes postales</h2></header>';
        const todoN = (D?.candidates || []).length;
        ws.innerHTML = `<section class="page h-cpo-page">${header}
            ${todoN ? (U.notice?.('info', `${A().plural(todoN, 'carte postale', 'cartes postales')} de tes médias ${todoN > 1 ? 'n’ont' : 'n’a'} pas encore de fiche : elles sont marquées « À compléter ».`) || '') : ''}
            ${all.length ? '<div data-cpo-bar></div>' : ''}
            ${!all.length ? A().emptyState({icon: '🏞', text: 'Aucune carte postale pour l’instant', hint: 'Ajoute une carte : l’image de la vue, celle du dos, puis le lieu montré pour la retrouver sur la Carte.', action: {label: '＋ Nouvelle carte postale', attrs: 'data-cpo-new'}})
                : !rows.length ? A().emptyState({icon: '🔍', text: 'Aucune carte ne correspond', hint: 'Change les mots cherchés ou retire un filtre.'})
                    : U.itemsHtml ? U.itemsHtml(view, rows.map(item)) : ''}</section>`;
        const page = ws.querySelector('.h-cpo-page');
        const slot = page.querySelector('[data-cpo-bar]');
        if (slot && U.listBar) {
            const bar = U.listBar({key: KEY, search: {placeholder: 'Chercher une carte… (titre, lieu, éditeur, texte du dos, Borie)'},
                filters: [{id: 'state', label: 'Où j’en suis', type: 'check', options: [['todo', 'À compléter'], ['done', 'Avec sa fiche']]},
                    {id: 'place', label: 'Lieu montré', type: 'place', chipPrefix: 'À'},
                    {id: 'back', label: 'Texte du dos', type: 'radio', options: [['', 'Tout'], ['yes', 'Transcrit'], ['no', 'Pas encore transcrit']], dflt: ''}],
                view: {dflt: 'cards', what: 'cartes', onChange: () => draw()},
                sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['sent', 'Par date d’envoi'], ['az', 'A → Z'], ['za', 'Z → A']], value: sort},
                onChange: (b, {what}) => { U.setSort?.(KEY, b.sort); if (what !== 'view') draw(); }});
            bar.setCount(`${A().plural(rows.length, 'carte postale', 'cartes postales')}${rows.length !== all.length ? ` sur ${all.length}` : ''}`);
            slot.replaceWith(bar);
        }
    }
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-cpo-new], [data-cpo-open], [data-cpo-todo], [data-cpo-view], [data-cpo-del], [data-cpo-onmap], [data-cpo-map]');
        if (!t || !t.closest('.h-cpo-page, [data-cpo-host], .h-cpo-pop, .ui-actmenu, .ui-ph-menu')) return;
        const find = id => (D?.postcards || []).find(x => x.id === Number(id));
        if (t.dataset.cpoNew !== undefined) { const host = t.closest('[data-cpo-host]'); return openCard(null, {place: host ? {id: Number(host.dataset.cpoPlace), name: host.dataset.cpoName || ''} : null}); }
        if (t.dataset.cpoOpen) { const pc = find(t.dataset.cpoOpen); if (pc) openCard(pc); return; }
        if (t.dataset.cpoTodo) { const c = (D?.candidates || []).find(x => x.media_id === Number(t.dataset.cpoTodo)); if (c) openCard(null, {recto: c.recto, verso: c.verso}); return; }
        if (t.dataset.cpoView) { const v = t.dataset.cpoView; const pc = v.startsWith('m') ? (D?.candidates || []).find(x => 'm' + x.media_id === v) : find(v); if (pc) showImages({...pc, media_id: pc.media_id}); return; }
        if (t.dataset.cpoDel) { const pc = find(t.dataset.cpoDel); if (pc) removeCard(pc).catch(err => A().toast(err.message, 'error')); return; }
        if (t.dataset.cpoOnmap) { const pc = find(t.dataset.cpoOnmap); if (pc) showOnMap(pc); return; }
        if (t.dataset.cpoMap !== undefined) showOnMap(null);
    });
    function showOnMap(pc) {
        setLayer(true);
        const st = S();
        if (pc && pc.lat != null) { st.mapCenter = {lat: Number(pc.lat), lon: Number(pc.lon)}; st.mapZoom = Math.max(Number(st.mapZoom) || 6, 13); st.mapKeepCenter = true; }
        if (st.mapMode === 'photos' || st.mapMode === 'cemetery') st.mapMode = 'standard';
        A().setModule('carte');
    }

    /* ═════════ Le calque de la Carte ═════════ */
    const LAYER_KEY = 'lcnda-map-postcards';
    const layerOn = () => { try { return localStorage.getItem(LAYER_KEY) === '1'; } catch (_) { return false; } };
    const setLayer = on => { try { localStorage.setItem(LAYER_KEY, on ? '1' : '0'); } catch (_) {} };
    ext.mapSetup.push(() => {
        const strip = document.querySelector('.map-layout .tool-strip'), stage = document.getElementById('map-stage');
        if (!strip || !stage || strip.querySelector('[data-cpo-layer]')) return;
        const layer = document.createElement('div'); layer.id = 'h-cpo-layer'; layer.className = 'h-cpo-layer';
        stage.insertBefore(layer, document.getElementById('map-overlay') || null);
        const b = document.createElement('button'); b.type = 'button'; b.dataset.cpoLayer = '1'; b.className = `button small ${layerOn() ? '' : 'secondary'}`; b.textContent = '🏞 Cartes postales';
        b.title = 'Montrer les cartes postales anciennes à l’endroit qu’elles montrent (avec la direction de la vue)'; b.setAttribute('aria-pressed', String(layerOn()));
        strip.insertBefore(b, strip.querySelector('.spacer') || strip.querySelector('#map-reset'));
        b.addEventListener('click', async () => { setLayer(!layerOn()); b.classList.toggle('secondary', !layerOn()); b.setAttribute('aria-pressed', String(layerOn())); if (layerOn() && !D) await load().catch(() => {}); A().drawMap?.(); });
        if (layerOn() && !D) load().then(() => A().drawMap?.()).catch(() => {});
        layer.addEventListener('click', e => { const m = e.target.closest('[data-cpo-pin]'); if (!m) return; e.stopPropagation(); popup(m, (D?.postcards || []).find(x => x.id === Number(m.dataset.cpoPin))); });
        layer.addEventListener('pointerdown', e => { if (e.target.closest('[data-cpo-pin], .h-cpo-pop')) e.stopPropagation(); });
    });
    ext.mapDraw.push(({left, top, z, width, height}) => {
        const layer = document.getElementById('h-cpo-layer'); if (!layer) return;
        if (!layerOn() || !D) { layer.innerHTML = ''; return; }
        const app = A(), cards = (D.postcards || []).filter(pc => pc.lat != null && pc.lon != null);
        // plusieurs cartes au même endroit : posées en éventail pour qu'on les voie toutes
        const spot = {};
        const pins = cards.map(pc => {
            const x = app.lngToX(Number(pc.lon), z) - left, y = app.latToY(Number(pc.lat), z) - top;
            if (x < -80 || y < -80 || x > width + 80 || y > height + 80) return '';
            const k = `${Math.round(x / 8)}:${Math.round(y / 8)}`, n = spot[k] = (spot[k] || 0) + 1, dx = (n - 1) * 14;
            const cone = pc.view_bearing != null ? `<svg class="h-cpo-cone" viewBox="-60 -60 120 120" aria-hidden="true" style="transform:rotate(${Number(pc.view_bearing)}deg)"><path d="M0 0 L-22 -54 A58 58 0 0 1 22 -54 Z"/></svg>` : '';
            return `<button type="button" class="h-cpo-pin" data-cpo-pin="${pc.id}" style="left:${(x + dx).toFixed(1)}px;top:${y.toFixed(1)}px" title="${esc(pc.title)}${pc.view_bearing != null ? ' — vue vers le ' + dirName(pc.view_bearing) : ''}">${cone}<span class="h-cpo-pin-img">${img(pc.recto?.thumb, pc.title)}</span></button>`;
        }).join('');
        const pop = layer.querySelector('.h-cpo-pop');
        layer.innerHTML = pins;
        if (pop) layer.appendChild(pop);
    });
    function popup(pin, pc) {
        if (!pc) return;
        const layer = document.getElementById('h-cpo-layer');
        layer.querySelector('.h-cpo-pop')?.remove();
        const box = document.createElement('div'); box.className = 'h-cpo-pop map-tooltip is-pinned';
        box.style.left = pin.style.left; box.style.top = pin.style.top;
        box.innerHTML = `<div class="map-tooltip-header"><strong>🏞 ${esc(pc.title)}</strong><button type="button" class="map-tooltip-close" aria-label="Fermer">×</button></div>
            <button type="button" class="h-cpo-pop-img" data-cpo-view="${pc.id}" title="Voir le recto et le verso en grand">${img(pc.recto?.thumb, pc.title)}${pc.verso ? img(pc.verso.thumb, 'verso') : ''}</button>
            <small>${esc([placeText(pc.place), pc.sent_date && 'envoyée ' + pc.sent_date, pc.view_bearing != null && 'vue vers le ' + dirName(pc.view_bearing)].filter(Boolean).join(' · '))}</small>
            ${pc.back_filled ? `<p class="h-cpo-pop-back">« ${esc(pc.back_text.slice(0, 160))}${pc.back_text.length > 160 ? '…' : ''} »</p>` : ''}
            <div class="h-cpo-pop-act"><button type="button" class="button small" data-cpo-open="${pc.id}">↗ Ouvrir la fiche</button></div>`;
        box.querySelector('.map-tooltip-close').addEventListener('click', () => box.remove());
        layer.appendChild(box);
    }

    /* ═════════ Le bloc de la fiche d'un lieu et d'un village ═════════ */
    async function fillHost(h) {
        if (h.dataset.cpoDone === '1') return; h.dataset.cpoDone = '1';
        const id = Number(h.dataset.cpoPlace) || 0;
        let list = [];
        if (id) { try { list = (await api('postcards', {place_id: id})).postcards || []; } catch (_) { list = []; } }
        if (!h.isConnected) return;
        (D = D || {postcards: [], candidates: []});
        list.forEach(pc => { if (!D.postcards.some(x => x.id === pc.id)) D.postcards.push(pc); else D.postcards = D.postcards.map(x => x.id === pc.id ? pc : x); });
        const add = id ? `<button type="button" class="button small secondary" data-cpo-new>＋ Ajouter une carte postale</button>` : '';
        h.innerHTML = `<section class="maintenance-panel h-cpo-block"><div class="h-panel-head"><h3>🏞 Cartes postales${list.length ? ` <small class="muted">(${list.length})</small>` : ''}</h3>${list.length ? add : ''}</div>
            ${list.length ? `<div class="h-cpo-thumbs">${list.map(pc => `<button type="button" class="h-cpo-thumb" data-cpo-open="${pc.id}" title="Ouvrir la fiche de la carte">${img(pc.recto?.thumb, pc.title)}<span><b>${esc(pc.title)}</b><small class="muted">${esc([pc.sent_date, pc.publisher, pc.view_bearing != null ? 'vue vers le ' + dirName(pc.view_bearing) : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`
                : A().empty(id ? 'Aucune carte postale de ce lieu.' : 'Ce lieu n’est pas encore dans ta base.', {icon: '🏞', action: id ? {label: '＋ Ajouter une carte postale', attrs: 'data-cpo-new'} : null})}</section>`;
    }
    const scan = root => root.querySelectorAll?.('[data-cpo-host]:not([data-cpo-done="1"])').forEach(fillHost);
    new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-cpo-host]')) fillHost(n); scan(n); } }).observe(document.documentElement, {childList: true, subtree: true});

    // au catalogue des listes (même point d'enregistrement que les autres modules)
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === 'postcards')) app.defaultListTypes.push(['postcards', '04e', 'Cartes postales']);
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);
    window.LCNDA_POSTCARDS = {openCard, load, showOnMap};
})();
