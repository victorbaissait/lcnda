/* LCNDA — 📒 Albums photo, l'écran (onglet Documents → « 📚 Recueils | 📒 Albums photo »).
 * Serveur : lib/albums.php (api.php?action=albums | albums_write) ; calculs : app-albums-core.js ; style : assets/css/albums.css.
 * Essais : tests/test-albums.js.
 *  - un album = des photos dans l'ordre (glisser, ou ⋯ → ↑ ↓), un titre, une couverture, des dates (écrites ou calculées d'après les
 *    photos), une description, la mise en page d'un vrai album (1, 2, 3, 4 ou 6 photos par page, une légende sous chacune,
 *    « nouvelle page avant celle-ci », pages blanches, noires à l'encre blanche ou kraft) ; une photo peut être dans plusieurs albums ;
 *  - on y met des photos depuis Documents : « ☑ Choisir plusieurs » → « 📒 Mettre dans un album… », ☑ Cocher → la barre commune,
 *    clic droit sur une ligne, « ⋯ » d'un document, et 📍 « Mettre dans… » (le panier 🧺) → « Un album photo… » ;
 *  - 📖 Feuilleter : les pages l'une après l'autre (‹ ›, flèches, glisser du doigt sur un téléphone) ; 🖨 Imprimer (UI.openPrintDialog) ;
 *    ⤓ Exporter la liste (UI.exportRows) ; 🔎 Enquêter sur cet album (une enquête photo avec toutes ses photos, dans l'ordre de
 *    l'album, ouverte sur « 📒 Classement d'un album ») ;
 *  - ⚙️ Personnaliser : photos par page d'un nouvel album, tourner les pages (animation), légendes dans 📖 Feuilleter ;
 *  - mode consultation : on regarde et on feuillette ; les albums confidentiels et les photos de vivants n'y sont pas (serveur).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, K = () => window.LCNDA_ALBUMS_CORE;
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w, pl) => (A().plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const toast = (m, k) => A().toast?.(m, k);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const get = (op, q = {}) => A().api('albums', {op, ...q});
    const post = async (op, b = {}) => { const r = await A().api('albums_write', {}, {method: 'POST', body: {op, ...b}}); return r?.result ?? r ?? {}; };
    const src = m => (m?.filename ? `media/${encodeURIComponent(m.thumbnail || m.filename)}` : '');
    const full = m => (m?.filename ? `media/${encodeURIComponent(m.filename)}` : '');
    const isImg = m => String(m?.media_type || '').toLowerCase() === 'image' && !!m?.filename;
    const PREF = 'genealogie-albums';
    const prefs = () => { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); return {perPage: 4, turn: true, captions: true, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {})}; } catch (_) { return {perPage: 4, turn: true, captions: true}; } };
    const setPrefs = p => { try { localStorage.setItem(PREF, JSON.stringify({...prefs(), ...p})); } catch (_) {} };
    const changed = () => { idx = null; document.dispatchEvent(new CustomEvent('lcnda:albums-changed')); };

    /* ═════════ les albums de chaque média (la colonne de Documents) ═════════ */
    let idx = null, idxLoading = null;
    function index(force = false) {
        if (idx && !force) return Promise.resolve(idx);
        if (!idxLoading) idxLoading = get('index').then(r => { idx = {albums: r.albums || [], of: r.of || {}}; return idx; }).catch(() => { idx = {albums: [], of: {}}; return idx; }).finally(() => { idxLoading = null; });
        return idxLoading;
    }
    /** les lignes de la colonne : chaque album (▸ ▾), ses photos dans l'ordre (n° 1, 2…), puis « Dans aucun album » (les photos seulement) */
    function columnEntries(list, {folded = [], narrowed = false, isPhoto = () => true} = {}) {
        if (!idx) return null;
        const out = [], keep = new Map(list.map(d => [d.id, d]));
        idx.albums.forEach(a => {
            const ds = Object.entries(idx.of).flatMap(([mid, xs]) => xs.filter(x => x[0] === a.id && keep.has(Number(mid))).map(x => ({d: keep.get(Number(mid)), num: x[1]}))).sort((x, y) => x.num - y.num);
            if (!ds.length && narrowed) return;
            const shut = folded.includes(String(a.id));
            out.push({ah: a, n: ds.length, shut}); if (!shut) ds.forEach(x => out.push({d: x.d, letter: '#', num: x.num}));
        });
        const none = list.filter(d => !(idx.of[d.id] || []).length && isPhoto(d));
        if (none.length) { const shut = folded.includes('0'); out.push({ah: null, n: none.length, shut}); if (!shut) none.forEach(d => out.push({d, letter: '#'})); }
        return out;
    }

    /* ═════════ mettre des photos dans un album ═════════ */
    /** un menu : les albums existants, puis « ＋ Un nouvel album » ; ids dans l'ordre choisi */
    async function chooseAndAdd(mediaIds, {anchor = null, onDone = null, title = ''} = {}) {
        const ids = [].concat(mediaIds || []).map(Number).filter(Boolean);
        if (!ids.length) return toast(T('Choisis d’abord une photo.'), 'error');
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'), 'error');
        const L = (await index(true)).albums;
        const items = [{icon: '＋', label: T('Un nouvel album…'), run: () => create(ids, {onDone, title})}];
        if (L.length) items.push('-', ...L.slice(0, 60).map(a => ({icon: '📒', label: a.title, help: plural(a.n, 'photo'), run: () => addTo(a, ids, {onDone})})));
        if (UI().menuAt) UI().menuAt(anchor || document.activeElement || document.body, items, {title: T('📒 Mettre {n} dans…', {n: plural(ids.length, 'photo')})});
        else create(ids, {onDone, title});
    }
    async function addTo(a, ids, {onDone = null} = {}) {
        let r; try { r = await post('add', {id: a.id, media_ids: ids}); } catch (e) { return toast(e.message, 'error'); }
        changed(); await onDone?.();
        const n = (r.added || []).length;
        if (!n) return toast(T('Ces photos sont déjà dans « {a} ».', {a: a.title}));
        undoToast(T('{n} dans l’album « {a} »', {n: plural(n, 'photo'), a: a.title}), {
            undo: async () => { await post('remove', {id: a.id, item_ids: r.added}); changed(); await onDone?.(); },
            redo: async () => { await post('add', {id: a.id, media_ids: ids}); changed(); await onDone?.(); }});
        return r;
    }
    function create(ids = [], {onDone = null, title = ''} = {}) {
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'), 'error');
        return new Promise(res => {
            const dg = ext.openDialog?.({eyebrow: T('📒 NOUVEL ALBUM'), title: T('Nouvel album photo'), submitLabel: T('Créer l’album'), body: formHtml({title, per_page: prefs().perPage}, ids.length),
                onSubmit: async form => {
                    const f = readForm(form);
                    const r = await post('create', {...f, media_ids: ids});
                    changed(); await onDone?.(r);
                    undoToast(T('Album « {a} » créé', {a: r.album?.title || f.title}), {undo: async () => { await post('delete', {id: r.id}); changed(); await onDone?.(); }});
                    res(r);
                }});
            if (!dg) res(null); else dg.addEventListener('close', () => setTimeout(() => res(null), 0), {once: true});
        });
    }
    function formHtml(a = {}, n = 0) {
        const per = K().okPer(a.per_page || prefs().perPage);
        return `<div class="form-grid one-column alb-form">
            ${n ? `<p class="ui-hint">${esc(T('{n}, dans l’ordre où tu les as choisies. Tu pourras les ranger autrement en les faisant glisser.', {n: plural(n, 'photo')}))}</p>` : ''}
            <label>${esc(T('Titre'))}<input name="title" maxlength="160" required value="${esc(a.title || '')}" placeholder="${esc(T('ex. Album de la famille MAZAUD'))}"></label>
            <label>${esc(T('Description'))}<textarea name="description" rows="3" maxlength="4000" placeholder="${esc(T('D’où vient l’album, qui l’a fait, ce qu’il raconte…'))}">${esc(a.description || '')}</textarea></label>
            <div class="alb-row2"><label>${esc(T('De (année)'))}<input name="date_from" inputmode="numeric" maxlength="4" value="${esc(a.date_from || '')}" placeholder="${esc(T('ex. 1920'))}"></label>
                <label>${esc(T('À (année)'))}<input name="date_to" inputmode="numeric" maxlength="4" value="${esc(a.date_to || '')}" placeholder="${esc(T('ex. 1935'))}"></label></div>
            <label>${esc(T('Dates écrites (facultatif)'))}<input name="date_text" maxlength="80" value="${esc(a.date_text || '')}" placeholder="${esc(T('ex. vers 1925 ; vide : d’après les photos'))}"></label>
            <fieldset class="alb-fs"><legend>${esc(T('Photos par page'))}</legend><div class="alb-per">${K().PER_PAGE.map(k => `<label class="alb-perk"><input type="radio" name="per_page" value="${k}" ${k === per ? 'checked' : ''}><span>${k}</span></label>`).join('')}</div></fieldset>
            <label>${esc(T('Les pages'))}<select name="style">${K().STYLES.map(([k, l]) => `<option value="${k}" ${k === (a.style || 'classique') ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select></label>
            ${UI().toggleHtml ? UI().toggleHtml(T('🔒 Confidentiel (pas montré en mode consultation)'), {checked: !!Number(a.is_private), attrs: 'name="is_private" value="1"'}) : `<label class="checkbox-line"><input type="checkbox" name="is_private" value="1" ${Number(a.is_private) ? 'checked' : ''}> ${esc(T('🔒 Confidentiel (pas montré en mode consultation)'))}</label>`}</div>`;
    }
    function readForm(form) {
        const f = new FormData(form), y = v => { const n = Number(String(v || '').trim()); return n >= 1000 && n <= 2200 ? n : null; };
        return {title: String(f.get('title') || '').trim(), description: String(f.get('description') || ''), date_from: y(f.get('date_from')), date_to: y(f.get('date_to')), date_text: String(f.get('date_text') || '').trim(),
            per_page: Number(f.get('per_page')) || 4, style: String(f.get('style') || 'classique'), is_private: form.querySelector('[name="is_private"]')?.checked ? 1 : 0};
    }

    /* ═════════ à droite : les albums en vignettes, ou un album ═════════ */
    let cache = new Map(); // id → album (avec ses photos)
    async function load(id, force = false) { if (!force && cache.has(id)) return cache.get(id); const r = await get('get', {id}); cache.set(id, r.album); return r.album; }
    const cardOf = a => ({thumb: a.cover ? `<img src="${esc(src(a.cover))}" alt="" loading="lazy">` : '<span class="ui-card-ico">📒</span>', name: `📒 ${a.title}`, open: `data-alb-open="${a.id}"`, openLabel: T('Ouvrir l’album'), attrs: `data-alb-card="${a.id}"`,
        lines: [[a.range?.text, plural(a.n, 'photo')].filter(Boolean).join(' · '), a.description ? a.description.slice(0, 90) : ''],
        badges: [Number(a.is_private) ? {text: T('🔒 Confidentiel'), kind: 'grey'} : null, a.hidden ? {text: T('{n} cachées ici', {n: String(a.hidden)}), kind: 'grey'} : null].filter(Boolean),
        when: a.updated_at, whenLabel: 'Modifié', menu: [`<button type="button" role="menuitem" data-alb-flip="${a.id}">📖 ${esc(T('Feuilleter'))}</button>`, kiosk() ? '' : `<button type="button" role="menuitem" data-alb-del="${a.id}">🗑 ${esc(T('Supprimer l’album'))}</button>`]});
    /** host : la boîte des vignettes de Documents ; o : {docs (filtrés), album (id ou ''), setAlbum(v), openDoc(id), narrowed} */
    async function paintWorkspace(box, o = {}) {
        const id = Number(o.album) || 0;
        box.dataset.albHost = '1'; bindHost(box, o);
        if (id) return paintAlbum(box, id, o);
        let L = [];
        try { L = (await get('list')).albums || []; } catch (e) { box.innerHTML = A().emptyState({icon: '📒', text: e.message}); return; }
        if (!box.isConnected) return;
        const keep = new Set((o.docs || []).map(d => d.id)), I = await index();
        if (o.narrowed) L = L.filter(a => Object.entries(I.of).some(([mid, xs]) => keep.has(Number(mid)) && xs.some(x => x[0] === a.id)));
        const head = `<div class="alb-wshead">${kiosk() ? '' : `<button type="button" class="button small" data-alb-new>＋ ${esc(T('Nouvel album'))}</button>`}<button type="button" class="button small secondary" data-alb-prefs>⚙️ ${esc(T('Personnaliser'))}</button></div>`;
        if (!L.length) { box.innerHTML = head + A().emptyState({icon: '📒', text: T('Aucun album photo pour l’instant'), hint: T('« ☑ Choisir plusieurs », clique les photos dans l’ordre, puis « 📒 Mettre dans un album… ».')}); return; }
        box.innerHTML = head + UI().cardsHtml(L.map(cardOf));
    }
    function bindHost(box, o) {
        box._albO = o; if (box._albBound) return; box._albBound = true;
        box.addEventListener('click', async e => {
            const O = box._albO || {}; const b = e.target.closest('button, a, [data-alb-tile]'); if (!b || !box.dataset.albHost) return;
            const n = k => Number(b.dataset[k]);
            if (b.matches('[data-alb-open]')) { e.preventDefault(); O.setAlbum?.(n('albOpen')); return; }
            if (b.matches('[data-alb-back]')) { O.setAlbum?.(''); return; }
            if (b.matches('[data-alb-new]')) { create([], {onDone: () => paintWorkspace(box, O)}); return; }
            if (b.matches('[data-alb-prefs]')) { openPrefs(); return; }
            if (b.matches('[data-alb-flip]')) { b.closest('details')?.removeAttribute('open'); flip(n('albFlip')); return; }
            if (b.matches('[data-alb-del]')) { b.closest('details')?.removeAttribute('open'); remove(n('albDel'), () => { if (Number(O.album) === n('albDel')) O.setAlbum?.(''); else paintWorkspace(box, O); }); return; }
            const id = Number(box.querySelector('[data-alb-id]')?.dataset.albId) || 0; if (!id) return;
            if (b.matches('[data-alb-doc]')) { e.preventDefault(); O.openDoc?.(n('albDoc')); return; }
            if (b.matches('[data-alb-edit]')) { edit(id, () => paintAlbum(box, id, O, true)); return; }
            if (b.matches('[data-alb-addph]')) { addPhotos(id, () => paintAlbum(box, id, O, true)); return; }
            if (b.matches('[data-alb-more]')) { UI().menuAt?.(b, [{icon: '🖨', label: T('Imprimer l’album…'), run: () => print(id)}, {icon: '⤓', label: T('Exporter la liste…'), run: () => exportList(id)},
                ...(ext.enquetePhoto && !kiosk() ? [{icon: '🔎', label: T('Enquêter sur cet album'), run: () => inquire(id)}] : []), {icon: '⚙️', label: T('Personnaliser'), run: () => openPrefs()},
                ...(kiosk() ? [] : ['-', {icon: '🗑', label: T('Supprimer l’album'), danger: true, run: () => remove(id, () => O.setAlbum?.(''))}])], {title: cache.get(id)?.title || ''}); return; }
            if (b.matches('[data-alb-imenu]')) { itemMenu(id, n('albImenu'), b, () => paintAlbum(box, id, O, true)); return; }
        });
        box.addEventListener('change', async e => {
            const t = e.target.closest('[data-alb-cap]'); if (!t || kiosk()) return;
            const iid = Number(t.dataset.albCap), id = Number(box.querySelector('[data-alb-id]')?.dataset.albId) || 0, v = t.value;
            let r; try { r = await post('item_save', {item_id: iid, caption: v}); } catch (err) { return toast(err.message, 'error'); }
            const al = cache.get(id); const it = al?.items.find(x => x.id === iid); if (it) it.caption = v;
            undoToast(T('Légende enregistrée'), {undo: async () => { await post('item_save', {item_id: iid, caption: r.before?.caption || ''}); cache.delete(id); paintAlbum(box, id, box._albO, true); }});
        });
        // ↕ glisser une photo à sa place (souris) ; au clavier et au doigt : ⋯ → ↑ ↓
        let dragId = 0;
        box.addEventListener('dragstart', e => { const t = e.target.closest?.('[data-alb-tile]'); if (!t || kiosk()) return; dragId = Number(t.dataset.albTile); t.classList.add('is-dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId)); } catch (_) {} });
        box.addEventListener('dragend', e => { e.target.closest?.('[data-alb-tile]')?.classList.remove('is-dragging'); box.querySelectorAll('.is-dropbefore, .is-dropafter').forEach(x => x.classList.remove('is-dropbefore', 'is-dropafter')); });
        box.addEventListener('dragover', e => { const t = e.target.closest?.('[data-alb-tile]'); if (!t || !dragId) return; e.preventDefault(); const r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
            box.querySelectorAll('.is-dropbefore, .is-dropafter').forEach(x => x.classList.remove('is-dropbefore', 'is-dropafter')); t.classList.add(after ? 'is-dropafter' : 'is-dropbefore'); });
        box.addEventListener('drop', async e => { const t = e.target.closest?.('[data-alb-tile]'); if (!t || !dragId) return; e.preventDefault();
            const id = Number(box.querySelector('[data-alb-id]')?.dataset.albId) || 0, al = cache.get(id); if (!al) return;
            const ids = al.items.map(x => x.id), from = ids.indexOf(dragId); let to = ids.indexOf(Number(t.dataset.albTile)); const after = t.classList.contains('is-dropafter');
            dragId = 0; if (from < 0 || to < 0) return; if (after) to++; if (from < to) to--;
            if (from === to) return; await reorder(id, K().move(ids, from, to), () => paintAlbum(box, id, box._albO, true)); });
    }
    async function reorder(id, order, again) {
        let r; try { r = await post('reorder', {id, item_ids: order}); } catch (e) { return toast(e.message, 'error'); }
        cache.delete(id); changed(); await again?.();
        undoToast(T('Photos rangées dans le nouvel ordre'), {undo: async () => { await post('reorder', {id, item_ids: r.before}); cache.delete(id); changed(); await again?.(); }, redo: async () => { await post('reorder', {id, item_ids: order}); cache.delete(id); changed(); await again?.(); }});
    }
    async function paintAlbum(box, id, o = {}, force = false) {
        let al; try { al = await load(id, force); } catch (e) { box.innerHTML = `<div class="ong-recbar"><button type="button" class="button small secondary" data-alb-back>← ${esc(T('Tous les albums'))}</button></div>` + A().emptyState({icon: '📒', text: e.message}); return; }
        if (!box.isConnected) return;
        const ro = kiosk(), pg = K().pageOf(al.items, al.per_page);
        const meta = [al.range?.text, plural(al.n, 'photo'), T('{n} par page', {n: String(al.per_page)}), plural(K().pages(al.items, al.per_page).length, 'page')].filter(Boolean).join(' · ');
        box.innerHTML = `<div class="alb-view alb-st-${esc(al.style)}" data-alb-id="${id}">
            <div class="ong-recbar alb-bar"><button type="button" class="button small secondary" data-alb-back>← ${esc(T('Tous les albums'))}</button><strong>📒 ${esc(al.title)}</strong><small class="muted">${esc(meta)}</small><span class="spacer"></span>
                <button type="button" class="button small" data-alb-flip="${id}" ${al.n ? '' : 'disabled'}>📖 ${esc(T('Feuilleter'))}</button>
                ${ro ? '' : `<button type="button" class="button small secondary" data-alb-addph>＋ ${esc(T('Des photos'))}</button><button type="button" class="button small secondary" data-alb-edit>✎ ${esc(T('Modifier'))}</button>`}
                <button type="button" class="icon-button small alb-more" data-alb-more aria-label="${esc(T('Plus'))}" title="${esc(T('Plus'))}">⋯</button></div>
            ${al.description ? `<p class="alb-desc">${esc(al.description)}</p>` : ''}${al.hidden ? `<p class="muted alb-hid">🔒 ${esc(T('{n} photos de personnes vivantes ou confidentielles ne sont pas montrées ici.', {n: String(al.hidden)}))}</p>` : ''}
            ${al.items.length ? `<ol class="alb-grid" aria-label="${esc(T('Les photos de l’album, dans l’ordre'))}">${al.items.map((it, i) => {
                const p = pg[it.id], first = i === 0 || pg[al.items[i - 1].id] !== p;
                return `<li class="alb-tile${first ? ' is-pagefirst' : ''}${al.cover_media_id === it.media_id ? ' is-cover' : ''}" data-alb-tile="${it.id}" ${ro ? '' : 'draggable="true"'}>
                    ${first ? `<span class="alb-pg">${esc(T('page {n}', {n: String(p)}))}</span>` : ''}
                    <button type="button" class="alb-ph" data-alb-doc="${it.media_id}" title="${esc(T('Ouvrir le document'))}">${isImg(it.media) ? `<img src="${esc(src(it.media))}" alt="${esc(K().captionOf(it))}" loading="lazy" draggable="false">` : '<span class="ui-card-ico">📄</span>'}<span class="alb-n">${i + 1}</span>${al.cover_media_id === it.media_id ? `<span class="alb-cov" title="${esc(T('Couverture'))}">★</span>` : ''}</button>
                    ${ro ? `<p class="alb-cap">${esc(K().captionOf(it))}</p>` : `<textarea class="alb-capin" rows="2" maxlength="600" data-alb-cap="${it.id}" aria-label="${esc(T('Légende de la photo {n}', {n: String(i + 1)}))}" placeholder="${esc(it.media.title || T('Légende'))}">${esc(it.caption)}</textarea>
                    <button type="button" class="icon-button small alb-imenu" data-alb-imenu="${it.id}" aria-label="${esc(T('Plus'))}" title="${esc(T('Plus'))}">⋯</button>`}
                    <small class="muted alb-when">${esc([it.media.date_text, it.media.place].filter(Boolean).join(' · '))}</small></li>`; }).join('')}</ol>`
                : A().emptyState({icon: '📒', text: T('Cet album est vide'), hint: ro ? '' : T('« ＋ Des photos », ou « ☑ Choisir plusieurs » dans Documents puis « 📒 Mettre dans un album… ».')})}</div>`;
    }
    function itemMenu(id, iid, anchor, again) {
        const al = cache.get(id); if (!al) return; const ids = al.items.map(x => x.id), i = ids.indexOf(iid), it = al.items[i]; if (!it) return;
        const items = [
            i > 0 ? {icon: '↑', label: T('Avancer d’une place'), run: () => reorder(id, K().moveBy(ids, iid, -1), again)} : null,
            i < ids.length - 1 ? {icon: '↓', label: T('Reculer d’une place'), run: () => reorder(id, K().moveBy(ids, iid, 1), again)} : null,
            i > 0 ? {icon: '⇤', label: T('Mettre en premier'), run: () => reorder(id, K().move(ids, i, 0), again)} : null,
            '-', isImg(it.media) ? {icon: '★', label: al.cover_media_id === it.media_id ? T('C’est la couverture') : T('En faire la couverture'), run: async () => { const before = al.cover_media_id; await post('update', {id, cover_media_id: it.media_id}); cache.delete(id); changed(); await again();
                undoToast(T('Nouvelle couverture'), {undo: async () => { await post('update', {id, cover_media_id: before || 0}); cache.delete(id); changed(); await again(); }}); }} : null,
            {icon: Number(it.page_break) ? '✓' : '', label: T('Nouvelle page avant cette photo'), run: async () => { const v = Number(it.page_break) ? 0 : 1; await post('item_save', {item_id: iid, page_break: v}); cache.delete(id); await again();
                undoToast(v ? T('Nouvelle page avant la photo') : T('Plus de nouvelle page'), {undo: async () => { await post('item_save', {item_id: iid, page_break: v ? 0 : 1}); cache.delete(id); await again(); }}); }},
            '-', {icon: '↗', label: T('Ouvrir le document'), run: () => anchor.closest('[data-alb-tile]')?.querySelector('[data-alb-doc]')?.click()},
            {icon: '✕', label: T('Retirer de l’album'), danger: true, run: async () => { const r = await post('remove', {id, item_ids: [iid]}); cache.delete(id); changed(); await again();
                undoToast(T('Photo retirée de l’album (le document reste)'), {undo: async () => { await post('restore_items', {id, rows: r.rows}); cache.delete(id); changed(); await again(); }}); }},
        ].filter(Boolean);
        UI().menuAt?.(anchor, items, {title: K().captionOf(it).slice(0, 60)});
    }
    async function edit(id, again) {
        const al = await load(id, true);
        ext.openDialog?.({eyebrow: T('📒 ALBUM'), title: T('Modifier l’album'), submitLabel: T('Enregistrer'), body: formHtml(al),
            onSubmit: async form => {
                const f = readForm(form), r = await post('update', {id, ...f}); cache.delete(id); changed(); await again?.();
                undoToast(T('Album « {a} » modifié', {a: f.title}), {undo: async () => { await post('update', {id, ...r.before}); cache.delete(id); changed(); await again?.(); }});
            }});
    }
    async function addPhotos(id, again) {
        const P = window.LCNDA_MEDIA_PICKER || window.LCNDA_PICKER; if (!P?.openMediaPicker) return toast(T('La fenêtre des images n’est pas chargée.'), 'error');
        const it = await P.openMediaPicker({types: ['image'], multiple: true, title: T('📒 Les photos à mettre dans l’album')});
        if (!it || !it.length) return;
        const al = cache.get(id) || await load(id);
        await addTo(al, it.map(x => Number(x.id)), {onDone: async () => { cache.delete(id); await again?.(); }});
    }
    async function remove(id, again) {
        const a = cache.get(id) || (await get('list')).albums.find(x => x.id === id) || {title: ''};
        try { await post('delete', {id}); } catch (e) { return toast(e.message, 'error'); }
        cache.delete(id); changed(); await again?.();
        const msg = T('Album « {a} » supprimé (les photos restent dans Documents)', {a: a.title});
        if (A().undoDelete) A().undoDelete({type: 'photo_album', id, message: msg, redo: () => post('delete', {id}), after: async () => { cache.delete(id); changed(); await again?.(); }});
        else toast(msg);
    }
    async function exportList(id) {
        const al = await load(id, true);
        UI().exportRows?.({title: T('⤓ Exporter la liste des photos'), name: al.title, rows: () => [[T('N°'), T('Page'), T('Légende'), T('Titre du document'), T('Date'), T('Lieu'), T('Fichier')],
            ...al.items.map((it, i) => [i + 1, K().pageOf(al.items, al.per_page)[it.id], it.caption, it.media.title, it.media.date_text, it.media.place, it.media.filename])]});
    }
    /** 🔎 une enquête photo avec toutes les photos, dans l'ordre de l'album ; elle s'ouvre sur « 📒 Classement d'un album » */
    async function inquire(id) {
        const EP = ext.enquetePhoto; if (!EP?.create) return toast(T('L’enquête photo n’est pas chargée.'), 'error');
        const al = await load(id, true), ids = al.items.filter(it => isImg(it.media)).map(it => it.media_id);
        if (!ids.length) return toast(T('Cet album n’a pas encore de photo.'), 'error');
        const tool = await EP.create(ids, T('Album « {a} »', {a: al.title}));
        if (tool?.api && ext.enquetePhotoPlus?.has?.('classement')) setTimeout(() => ext.enquetePhotoPlus.open('classement', tool.api()), 300);
    }

    /* ═════════ 📖 feuilleter ═════════ */
    async function flip(id, start = 0) {
        let al; try { al = await load(id, true); } catch (e) { return toast(e.message, 'error'); }
        const P = K().pages(al.items, al.per_page), pr = prefs(), N = P.length + 1; let at = Math.max(0, Math.min(N - 1, start));
        const dlg = document.createElement('dialog'); dlg.className = `modal alb-flip alb-st-${al.style}`; dlg.setAttribute('aria-label', T('📖 Feuilleter l’album « {a} »', {a: al.title}));
        const cover = () => `<div class="alb-page alb-coverpage">${al.cover ? `<img src="${esc(full(al.cover))}" alt="">` : '<span class="alb-bigico" aria-hidden="true">📒</span>'}<h2>${esc(al.title)}</h2>${al.range?.text ? `<p class="alb-range">${esc(al.range.text)}</p>` : ''}${al.description ? `<p class="alb-fdesc">${esc(al.description)}</p>` : ''}</div>`;
        const page = k => `<div class="alb-page alb-per-${P[k].length}">${P[k].map(it => `<figure class="alb-fig">${isImg(it.media) ? `<img src="${esc(full(it.media))}" alt="${esc(K().captionOf(it))}">` : '<span class="alb-bigico">📄</span>'}${pr.captions ? `<figcaption>${esc(K().captionOf(it))}</figcaption>` : ''}</figure>`).join('')}</div>`;
        dlg.innerHTML = `<div class="alb-fhead"><b>📒 ${esc(al.title)}</b><span class="alb-fpos" data-alb-pos aria-live="polite"></span><button type="button" class="icon-button" data-alb-x aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">×</button></div>
            <div class="alb-fstage" data-alb-stage></div>
            <div class="alb-fnav"><button type="button" class="button secondary" data-alb-go="-1" aria-label="${esc(T('Page précédente'))}">‹ ${esc(T('Précédente'))}</button><button type="button" class="button secondary" data-alb-go="1" aria-label="${esc(T('Page suivante'))}">${esc(T('Suivante'))} ›</button></div>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        const stage = dlg.querySelector('[data-alb-stage]');
        const show = (d = 0) => {
            stage.innerHTML = at === 0 ? cover() : page(at - 1);
            const pg = stage.firstElementChild;
            if (d && pr.turn && !matchMedia('(prefers-reduced-motion: reduce)').matches) pg.classList.add(d > 0 ? 'is-turn-next' : 'is-turn-prev');
            dlg.querySelector('[data-alb-pos]').textContent = at === 0 ? T('Couverture') : T('Page {a} sur {b}', {a: String(at), b: String(N - 1)});
            dlg.querySelector('[data-alb-go="-1"]').disabled = at === 0; dlg.querySelector('[data-alb-go="1"]').disabled = at >= N - 1;
        };
        const go = d => { const n = Math.max(0, Math.min(N - 1, at + d)); if (n === at) return; at = n; show(d); };
        dlg.addEventListener('click', e => { if (e.target.closest('[data-alb-x]')) dlg.close(); const g = e.target.closest('[data-alb-go]'); if (g) go(Number(g.dataset.albGo)); });
        dlg.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); } if (e.key === 'Home') { at = 0; show(-1); } if (e.key === 'End') { at = N - 1; show(1); } });
        let x0 = null; // 👆 glisser du doigt
        stage.addEventListener('pointerdown', e => { x0 = e.clientX; });
        stage.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
        show();
        return dlg;
    }

    /* ═════════ 🖨 imprimer : la mise en page de l'album (photos par page, légendes) ═════════ */
    async function print(id) {
        const al = await load(id, true), U = UI();
        if (!U.openPrintDialog || !U.printSheets) return toast(T('L’impression n’est pas disponible.'), 'error');
        const css = `.alb-p{font-family:Georgia,serif;color:#111;display:grid;gap:5mm;height:100%;align-content:center}.alb-p.st-noir{background:#161616;color:#f3f0e8}.alb-p.st-kraft{background:#e9dcc2}
            .alb-p.per-1{grid-template-columns:1fr}.alb-p.per-2{grid-template-columns:1fr;grid-auto-rows:1fr}.alb-p.per-3{grid-template-columns:1fr;grid-auto-rows:1fr}.alb-p.per-4{grid-template-columns:1fr 1fr;grid-auto-rows:1fr}.alb-p.per-6{grid-template-columns:1fr 1fr;grid-auto-rows:1fr}
            .alb-p figure{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;overflow:hidden}.alb-p img{max-width:100%;max-height:100%;min-height:0;object-fit:contain;flex:1 1 auto;border:3mm solid #fff;box-shadow:0 0 0 .3mm #999}
            .alb-p figcaption{font-style:italic;font-size:10pt;text-align:center;margin-top:2mm}.alb-c{text-align:center;font-family:Georgia,serif;display:flex;flex-direction:column;justify-content:center;height:100%}.alb-c img{max-width:70%;max-height:60%;margin:0 auto 8mm;object-fit:contain}.alb-c h1{font-size:28pt;margin:0}`;
        const sheetHtml = (ch, list, per) => `<div class="alb-p per-${per} st-${esc(al.style)}">${list.map(it => `<figure>${isImg(it.media) && ch.photos !== false ? `<img src="${esc(full(it.media))}" alt="">` : ''}${ch.captions ? `<figcaption>${esc(K().captionOf(it))}</figcaption>` : ''}</figure>`).join('')}</div>`;
        U.openPrintDialog({title: T('Album « {a} »', {a: al.title}), icon: '📒', key: 'album-photo', zone: T('Album'), margin: 12,
            options: [{key: 'per', type: 'radio', label: T('Photos par page'), value: String(al.per_page), tiles: true, choices: K().PER_PAGE.map(k => ({value: String(k), label: String(k), cells: k}))},
                {key: 'captions', label: T('Les légendes sous les photos'), checked: true}, {key: 'cover', label: T('Une page de couverture'), checked: true}],
            html: ch => { const per = K().okPer(ch.per), pages = K().pages(al.items, per).map(list => ({html: sheetHtml(ch, list, Math.max(list.length === 1 ? 1 : 2, per))}));
                if (ch.cover) pages.unshift({html: `<div class="alb-c">${al.cover && ch.photos !== false ? `<img src="${esc(full(al.cover))}" alt="">` : ''}<h1>${esc(al.title)}</h1>${al.range?.text ? `<p>${esc(al.range.text)}</p>` : ''}${al.description ? `<p>${esc(al.description)}</p>` : ''}</div>`});
                return U.printSheets({title: al.title, css, pages, choix: ch, pad: 12}); },
            onPrint: () => post('log_export', {id, kind: 'print'}).catch(() => {})});
    }

    /* ═════════ ⚙️ Personnaliser ═════════ */
    function openPrefs() {
        const p = prefs();
        const dg = ext.openDialog?.({eyebrow: T('⚙️ PERSONNALISER'), title: T('Albums photo'), submitLabel: T('Fermer'),
            body: `<div class="form-grid one-column"><label>${esc(T('Photos par page d’un nouvel album'))}<select data-alp="perPage">${K().PER_PAGE.map(k => `<option value="${k}" ${k === K().okPer(p.perPage) ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
                ${UI().toggleHtml ? UI().toggleHtml(T('📖 Tourner les pages (petite animation)'), {checked: p.turn, attrs: 'data-alp="turn"'}) + UI().toggleHtml(T('📖 Les légendes sous les photos en feuilletant'), {checked: p.captions, attrs: 'data-alp="captions"'})
                    : `<label class="checkbox-line"><input type="checkbox" data-alp="turn" ${p.turn ? 'checked' : ''}> ${esc(T('📖 Tourner les pages (petite animation)'))}</label><label class="checkbox-line"><input type="checkbox" data-alp="captions" ${p.captions ? 'checked' : ''}> ${esc(T('📖 Les légendes sous les photos en feuilletant'))}</label>`}</div>`,
            onSubmit: () => true});
        dg?.addEventListener('change', e => { const k = e.target.dataset.alp; if (!k) return; const before = prefs(); setPrefs({[k]: k === 'perPage' ? Number(e.target.value) : e.target.checked});
            undoToast(T('✓ Enregistré'), {undo: () => setPrefs({[k]: before[k]})}); });
        return dg;
    }

    /* ═════════ 📍 « Mettre dans… » (le panier 🧺) → un album photo ═════════ */
    (ext.dropTargets = ext.dropTargets || []).push({id: 'album_photo', icon: '📒', label: 'Un album photo…', group: 'Ranger', kinds: ['media'], enabled: () => !kiosk(),
        choose: async () => { const L = (await index(true)).albums;
            return new Promise(res => UI().menuAt?.(document.activeElement || document.body, [{icon: '＋', label: T('Un nouvel album'), run: () => res({id: 0, title: T('Album photo')})}, ...(L.length ? ['-'] : []), ...L.slice(0, 60).map(a => ({icon: '📒', label: a.title, run: () => res({id: a.id, title: a.title})}))],
                {title: T('Dans quel album ?'), onClose: () => setTimeout(() => res(null), 50)})); },
        explain: (items, ctx) => T('{n} dans l’album, à la fin', {n: plural(items.length, 'photo')}) + (ctx?.title ? ` « ${ctx.title} »` : ''),
        receive: async (items, ctx) => {
            const ids = items.map(i => Number(i.ref_id)).filter(Boolean);
            if (!ctx.id) { const r = await post('create', {title: ctx.title || T('Album photo'), media_ids: ids, per_page: prefs().perPage}); changed();
                return {message: T('Album « {a} » créé', {a: r.album?.title || ''}), undo: async () => { await post('delete', {id: r.id}); changed(); }}; }
            const r = await post('add', {id: ctx.id, media_ids: ids}); changed();
            return {message: T('{n} dans l’album « {a} »', {n: plural((r.added || []).length, 'photo'), a: ctx.title}), undo: async () => { await post('remove', {id: ctx.id, item_ids: r.added || []}); changed(); }};
        }});

    ext.albums = {index, cached: () => idx, columnEntries, chooseAndAdd, create, addTo, paintWorkspace, flip, print, exportList, inquire, openPrefs, prefs, setPrefs, invalidate: () => { idx = null; cache.clear(); }, _get: get, _post: post};
})();
