/* LCNDA — 🔎 Enquête photo (maquette validée docs/design/enquete-photo.html) : l'écran d'enquête et ses portes d'entrée.
 * Serveur : lib/enquete_photo.php (GET ep, POST ep_write). Calculs : app-enquete-photo-core.js. Aides, guides, IA, comparer en ligne,
 * raconter et partager : heritage-enquete-photo-aides.js. Essai : tests/test-enquete-photo.js.
 *
 *  § 1  le bouton partout : « 🔎 Enquêter » sur la page d'un document (à côté de « 📜 Atelier de transcription » et « 📁 Ranger » ; devient
 *       « 🔎 Enquête · 5 indices · lieu probable »), dans la visionneuse, dans le clic droit de toute image de l'app (UI.ctxExtras), dans
 *       « 📤 Envoyer vers… / 📍 Mettre dans… » (ext.sendTargets, ext.dropTargets), cochés dans Documents → « 🔎 Enquêter sur ces images » ;
 *       pastille « 🔎 N » sur les images qui ont une enquête ; Listes → Outils de modification → 🔎 Enquête photo (ext.editToolsExtra).
 *  § 2  l'écran : l'image et ses CALQUES (◯ ▭ ➚ T ✎ ▦ flouter, 📏 objet droit, 🌑 ombre, ✂ morceau), recto / verso, zoom et
 *       déplacement, calques 👁 🔒, ⤓ l'image avec ou sans calques (l'image d'origine n'est jamais touchée) ; questions guidées
 *       (passer, revenir, dans le désordre) ; § 2 bis plusieurs images : une à la fois / côte à côte (loupe liée) / mosaïque, tableau
 *       « quel indice pour quelle image », ✂ Séparer (↶ Annuler).
 *  § 3  indices et certitude (Prouvé · Probable · Supposé · Réfuté, barré) ; conclusion ; « 📍 Mettre ce lieu sur la photo » (↶ Annuler).
 *  § 7  relier à une personne, un lieu, un événement, une enquête 🕵️, une source, un tableau ; 🧺 panier ; « Ce qui le concerne ».
 * Réglage : genealogie-enquete-photo (⚙️ Personnaliser : l'IA éteinte au départ, tolérance de l'ombre, vue, questions guidées ;
 * grille de lecture et double loupe : heritage-enquete-photo-suite.js, qui se pose aussi sur la scène, la conclusion et les questions).
 * Mode consultation et appareils invités : lecture seule, rien ne part sur Internet.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {}, UI = () => window.LCNDA_UI || {}, C = () => window.LCNDA_EP_CORE;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const get = (op, q = {}) => A().api('ep', {op, ...q});
    const post = (op, body = {}) => A().api('ep_write', {}, {method: 'POST', body: {op, ...body}}).then(r => r?.result ?? r);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const mediaSrc = m => (m && m.filename ? `media/${encodeURIComponent(m.filename)}` : '');
    const uid = () => Math.random().toString(36).slice(2, 10);
    const KEY = 'genealogie-enquete-photo';
    const DEF = {ai: false, tol: 6, view: 'one', guided: true, numbers: true, tenMinutes: false};
    const prefs = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return {...DEF, ...(v && typeof v === 'object' ? v : {})}; } catch (_) { return {...DEF}; } };
    const setPrefs = patch => { try { localStorage.setItem(KEY, JSON.stringify({...prefs(), ...patch})); } catch (_) {} };

    /* ═════════ les mots communs ═════════ */
    const CERT = {proven: ['Prouvé', 'green'], probable: ['Probable', 'blue'], supposed: ['Supposé', 'yellow'], refuted: ['Réfuté', 'red']};
    const certBadge = c => (UI().badge ? UI().badge(T(CERT[c]?.[0] || 'Supposé'), CERT[c]?.[1] || 'yellow') : `<b>${esc(T(CERT[c]?.[0] || 'Supposé'))}</b>`);
    const KINDS = [['lieu', '🗺', 'Lieu'], ['date', '📅', 'Date'], ['gens', '👔', 'Gens'], ['objet', '🚲', 'Objet'], ['texte', '🔤', 'Texte'], ['support', '🖼', 'Support'], ['dos', '✉️', 'Dos'], ['ciel', '🌦', 'Ciel'], ['autre', '•', 'Autre']];
    const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[KINDS.length - 1];
    const SOURCES = {moi: 'Moi', ia: '🤖 IA (à vérifier)', ombre: '☀️ Calcul d’ombre', exif: '🏷 Métadonnées', en_ligne: '🌐 Trouvé en ligne', donnees: '🧰 Données de l’app', repere: '📒 Repère', famille: '👪 La famille', compare: '🔍 Comparaison', visage: '👤 Visages (sur l’ordinateur)', atelier: '📜 Atelier de transcription', police: '🔤 Essai de police'};
    const LETTER = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');
    const certSeg = (name, value, list = ['proven', 'probable', 'supposed']) => UI().segmented ? UI().segmented({label: T('Certitude'), cls: 'ep-cert', items: list.map(c => ({on: value === c, attrs: `data-ep-cert="${c}" data-name="${name}"`, html: esc(T(CERT[c][0]))}))})
        : `<select name="${name}">${list.map(c => `<option value="${c}"${value === c ? ' selected' : ''}>${esc(T(CERT[c][0]))}</option>`).join('')}</select>`;
    /** le choix de certitude d'une fenêtre : boutons segmentés + case cachée */
    function bindCert(root) {
        root.querySelectorAll('.ep-cert').forEach(g => {
            const name = g.querySelector('[data-name]')?.dataset.name; if (!name) return;
            let hid = root.querySelector(`input[type=hidden][name="${name}"]`);
            if (!hid) { hid = document.createElement('input'); hid.type = 'hidden'; hid.name = name; g.after(hid); hid.value = g.querySelector('.is-active')?.dataset.epCert || 'supposed'; }
            g.addEventListener('click', e => { const b = e.target.closest('[data-ep-cert]'); if (!b) return; UI().segPick?.(b); hid.value = b.dataset.epCert; });
        });
    }

    /* ═════════ les enquêtes des images (pastilles, bouton) ═════════ */
    let counts = null, countsAt = 0;
    async function loadCounts(force = false) {
        if (!force && counts && Date.now() - countsAt < 30000) return counts;
        try { const r = await get('counts'); counts = {by: r.counts || {}, files: r.files || {}}; countsAt = Date.now(); } catch (_) { counts = counts || {by: {}, files: {}}; }
        return counts;
    }
    const countFor = id => Number(counts?.by?.[String(id)] || 0);

    /** ouvrir : l'enquête de cette image (s'il y en a une, ou laquelle) ou en commencer une */
    async function forMedia(mediaIds, {anchor = null, title = ''} = {}) {
        const ids = [].concat(mediaIds).map(Number).filter(Boolean);
        if (!ids.length) return toast(T('Choisis d’abord une image.'), 'error');
        if (ids.length === 1) {
            let list = []; try { list = (await get('media', {media_id: ids[0]})).inquiries || []; } catch (_) {}
            if (list.length === 1 && !anchor) return open(list[0].id);
            if (list.length) {
                const items = list.map(q => ({icon: '🔎', label: q.title || T('Enquête photo'), help: plural(q.n_clues, 'indice'), run: () => open(q.id)}));
                if (!kiosk()) items.push('-', {icon: '＋', label: T('Une nouvelle enquête sur cette photo'), run: () => create(ids, title)});
                return UI().menuAt ? UI().menuAt(anchor || document.activeElement || document.body, items, {title: T('🔎 Enquête photo')}) : open(list[0].id);
            }
        }
        if (kiosk()) return toast(T('Mode consultation : pas de nouvelle enquête.'), 'error');
        return create(ids, title);
    }
    async function create(mediaIds, title = '') {
        if (kiosk()) return toast(T('Mode consultation : pas de nouvelle enquête.'), 'error');
        try { const r = await post('create', {media_ids: [].concat(mediaIds || []).map(Number).filter(Boolean), title}); await loadCounts(true); decorateAll(); return open(r.id); }
        catch (e) { toast(e.message, 'error'); return null; }
    }

    /* ═════════════════════════ L'ÉCRAN D'ENQUÊTE ═════════════════════════ */
    let tool = null; // l'enquête ouverte
    async function open(id, opts = {}) {
        let data; try { data = await get('get', {id}); } catch (e) { toast(e.message, 'error'); return null; }
        document.querySelector('dialog.ep-dlg')?.close();
        const dlg = document.createElement('dialog'); dlg.className = 'modal ep-dlg'; dlg.dataset.noFoot = '1'; dlg.dataset.ownClose = '1';
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'enquete-photo', true); dlg.showModal();
        tool = new Tool(dlg, data, opts);
        dlg.addEventListener('cancel', e => { e.preventDefault(); if (tool?.drawing) { tool.cancelDraw(); return; } dlg.close(); });
        dlg.addEventListener('close', () => { if (tool) { try { ext.enquetePhotoPlus?.onClose?.(tool.api()); } catch (_) {} try { tool.enh?.stop(); } catch (_) {} } tool?.flush(); tool = null; dlg.remove(); loadCounts(true).then(decorateAll); opts.onClose?.(); });
        return tool;
    }

    class Tool {
        constructor(dlg, data, opts) {
            this.dlg = dlg; this.opts = opts; this.inq = data.inquiry; this.privacy = data.privacy || {}; this.ro = kiosk() || !!data.kiosk;
            const p = prefs();
            this.st = {cur: 0, view: this.inq.images.length > 1 ? p.view : 'one', tool: 'hand', zoom: {k: 1, x: 0, y: 0}, panel: opts.panel || 'questions', sel: null, filter: '', openQ: opts.question || ''};
            this.hist = []; this.fut = []; this.dirty = new Set(); this.saveT = 0; this.t0 = Date.now();
            this.render();
            if (this.ro) this.status('ro');
        }
        get images() { return this.inq.images || []; }
        get img() { return this.images[this.st.cur] || null; }
        get clues() { return this.inq.clues || []; }
        imgById(id) { return this.images.find(i => i.id === Number(id)); }
        letterOf(im) { return LETTER(this.images.indexOf(im)); }
        async reload(panelKeep = true) {
            try { const d = await get('get', {id: this.inq.id}); const cur = this.img?.id; this.inq = d.inquiry; this.privacy = d.privacy || {}; const i = this.images.findIndex(x => x.id === cur); this.st.cur = i >= 0 ? i : 0; }
            catch (e) { toast(e.message, 'error'); }
            this.render(panelKeep);
        }
        status(s) { const el = this.dlg.querySelector('[data-ui-status]'); if (!el) return; if (s === 'ro') { el.innerHTML = `<span class="ui-status-txt">🔒 ${esc(T('Consultation : lecture seule'))}</span>`; return; } UI().savedStatus?.(el, s); }

        /* ─── la charpente ─── */
        render() {
            const U = UI(), n = this.images.length;
            const extra = `<span class="ep-count">${esc(plural(n, 'image'))} · ${esc(plural(this.clues.length, 'indice'))}</span>${ext.enquetePhotoPlus?.badge ? ext.enquetePhotoPlus.badge(this.inq) : ''}`;
            const top = U.editorTopbar ? U.editorTopbar({icon: '🔎', name: this.inq.title, nameAttrs: `data-ep-name ${this.ro ? 'readonly' : ''} placeholder="${esc(T('Nom de l’enquête'))}"`, menus: [{html: '<nav data-ep-menus></nav>'}], undo: !this.ro, status: this.ro ? '' : 'saved', extra,
                buttons: {customize: {attrs: 'data-ep-cmd="prefs"', html: `⚙️ ${esc(T('Personnaliser'))}`}, export: {attrs: 'data-ep-cmd="export"', label: `⤓ ${T('Exporter')} ▾`}, full: {attrs: 'data-full-toggle="enquete-photo"'}, close: {attrs: 'data-ep-cmd="close"'}}})
                : `<header class="ui-topbar"><span>🔎</span><input class="ui-topbar-name" data-ep-name value="${esc(this.inq.title)}"><span class="ui-topbar-spacer"></span><span data-ui-status></span><button type="button" class="icon-button" data-ep-cmd="close" aria-label="${esc(T('Fermer'))}">×</button></header>`;
            const toasts = this.dlg.querySelector(':scope > #toast-region'); // les messages (↶ Annuler) sont posés dans la fenêtre ouverte : ils restent
            this.dlg.innerHTML = `${top}<div class="ep-main">
                <section class="ep-left">
                    <div class="ep-strip" data-ep-strip></div>
                    <div class="ep-tools" data-ep-tools></div>
                    <div class="ep-stage" data-ep-stage tabindex="0" aria-label="${esc(T('La photo : molette pour zoomer, glisser pour déplacer'))}"></div>
                    <div class="ep-layers" data-ep-layers></div>
                </section>
                <aside class="ep-side" data-ep-side></aside></div>`;
            if (toasts) this.dlg.appendChild(toasts);
            if (U.editorMenus) U.editorMenus(this.dlg.querySelector('[data-ep-menus]'), {[T('Fichier')]: () => this.fileMenu(), [T('Affichage')]: () => this.viewMenu()});
            U.harmonizeTopbar?.(this.dlg.querySelector('.ui-topbar'));
            this.bindTop();
            this.renderStrip(); this.renderTools(); this.renderStage(); this.renderLayers(); this.renderSide();
        }
        bindTop() {
            const d = this.dlg;
            const name = d.querySelector('[data-ep-name]');
            name?.addEventListener('change', async () => { if (this.ro) return; const v = name.value.trim(); if (!v) { name.value = this.inq.title; return; } const before = this.inq.title; this.inq.title = v;
                try { await post('update', {id: this.inq.id, title: v}); this.status('saved'); undoToast(T('Renommée « {name} »', {name: v}), {undo: async () => { await post('update', {id: this.inq.id, title: before}); this.inq.title = before; name.value = before; }}); } catch (e) { toast(e.message, 'error'); } });
            d.querySelector('.ui-topbar')?.addEventListener('click', e => {
                const c = e.target.closest('[data-ep-cmd], [data-ui-cmd]'); if (!c) return;
                const k = c.dataset.epCmd || c.dataset.uiCmd;
                if (k === 'close') d.close();
                else if (k === 'undo') this.undo(); else if (k === 'redo') this.redo();
                else if (k === 'prefs') this.openPrefs();
                else if (k === 'export') this.exportMenu(c);
                else if (k === 'level') ext.enquetePhotoPlus?.open('niveau', this.api());
            });
            d.addEventListener('keydown', e => {
                if (e.target.closest('input, textarea, select, [contenteditable]')) return;
                const mod = e.metaKey || e.ctrlKey;
                if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
                if ((e.key === 'Delete' || e.key === 'Backspace') && this.st.sel) { e.preventDefault(); this.deleteShape(this.st.sel); return; }
                const keys = {v: 'hand', h: 'hand', o: 'circle', r: 'rect', a: 'arrow', t: 'text', f: 'free', b: 'blur'};
                if (!mod && keys[e.key.toLowerCase()] && !this.ro) this.setTool(keys[e.key.toLowerCase()]);
                if (!mod && (e.key === '+' || e.key === '=')) this.zoomBy(1.25); if (!mod && e.key === '-') this.zoomBy(0.8); if (!mod && e.key === '0') this.fit();
            });
        }
        fileMenu() {
            const it = [];
            if (!this.ro) it.push({icon: '＋', label: T('Ajouter une photo ou un document…'), run: () => this.addImages()});
            it.push({icon: '⤓', label: T('Exporter…'), run: () => this.exportMenu(this.dlg.querySelector('[data-ep-cmd="export"]'))});
            if (!this.ro) it.push({icon: this.inq.is_private ? '🔓' : '🔒', label: this.inq.is_private ? T('Ne plus garder confidentielle') : T('Garder cette enquête confidentielle'), run: () => this.togglePrivate()});
            if (!this.ro) it.push({icon: this.inq.status === 'done' ? '↺' : '✓', label: this.inq.status === 'done' ? T('Reprendre l’enquête') : T('Terminer pour l’instant'), run: () => this.setStatus(this.inq.status === 'done' ? 'open' : 'done')});
            if (!this.ro) it.push('-', {icon: '🗑', label: T('Supprimer l’enquête'), danger: true, run: () => this.remove()});
            return it;
        }
        viewMenu() {
            const v = this.st.view, it = [['one', T('Une image à la fois')], ['side', T('Côte à côte (loupe liée)')], ['mosaic', T('Toutes en mosaïque')]].map(([k, l]) => ({icon: v === k ? '●' : '○', label: l, run: () => this.setView(k)}));
            it.push('-', {icon: '⤢', label: T('Voir toute l’image'), shortcut: '0', run: () => this.fit()}, {icon: '🎚️', label: T('Mieux voir (contraste, lumière)'), run: () => this.betterSee()});
            return it;
        }
        setView(k) { this.st.view = k; setPrefs({view: k}); this.st.zoom = {k: 1, x: 0, y: 0}; this.renderStrip(); this.renderStage(); }
        async togglePrivate() { const v = this.inq.is_private ? 0 : 1; try { await post('update', {id: this.inq.id, is_private: v}); this.inq.is_private = v; await this.reload(); toast(v ? T('Enquête confidentielle : rien ne part sur Internet.') : T('L’enquête n’est plus confidentielle.')); } catch (e) { toast(e.message, 'error'); } }
        async setStatus(s) { const before = this.inq.status; try { await post('update', {id: this.inq.id, status: s}); this.inq.status = s; undoToast(s === 'done' ? T('Enquête terminée pour l’instant') : T('Enquête reprise'), {undo: async () => { await post('update', {id: this.inq.id, status: before}); this.inq.status = before; }}); if (s === 'done') this.dlg.close(); } catch (e) { toast(e.message, 'error'); } }
        async remove() {
            const id = this.inq.id, title = this.inq.title;
            try { await post('delete', {id}); } catch (e) { return toast(e.message, 'error'); }
            this.dlg.close(); await loadCounts(true); decorateAll(); refreshLists();
            A().undoDelete ? A().undoDelete({type: 'photo_inquiry', id, message: T('Enquête photo « {name} » supprimée', {name: title}), redo: () => post('delete', {id}), after: async w => { await loadCounts(true); decorateAll(); refreshLists(); if (w === 'undo') open(id); }})
                : toast(T('Enquête supprimée.'));
        }

        /* ─── la bande des images (A, B, C…) ─── */
        renderStrip() {
            const box = this.dlg.querySelector('[data-ep-strip]'); if (!box) return;
            const many = this.images.length > 1, pair = this.pairOf(this.img);
            const chips = this.images.map((im, i) => `<button type="button" class="ep-chip${i === this.st.cur ? ' is-active' : ''}" data-ep-img="${i}" title="${esc(im.media?.title || '')}"><b>${LETTER(i)}</b>${im.media?.media_type === 'image' && im.media.filename ? `<img src="${esc(mediaSrc({filename: im.media.thumbnail || im.media.filename}))}" alt="" loading="lazy">` : '<span aria-hidden="true">📄</span>'}<span class="ep-chip-t">${esc(im.label || im.media?.title || '')}${im.side ? ` · ${esc(T(im.side === 'recto' ? 'recto' : 'verso'))}` : ''}</span></button>${this.ro ? '' : `<button type="button" class="ep-chip-x" data-ep-imgx="${im.id}" title="${esc(T('Retirer cette image de l’enquête'))}" aria-label="${esc(T('Retirer cette image de l’enquête'))}">×</button>`}`).map(h => `<span class="ep-chipw" role="listitem">${h}</span>`).join('');
            const views = many && UI().segmented ? UI().segmented({label: T('Façon de voir les images'), cls: 'ep-views', items: [['one', T('Une image à la fois')], ['side', T('Côte à côte (loupe liée)')], ['mosaic', T('Toutes en mosaïque')]].map(([k, l]) => ({on: this.st.view === k, attrs: `data-ep-view="${k}"`, html: esc(l)}))}) : '';
            const rv = pair && UI().segmented ? UI().segmented({label: T('Recto ou verso'), cls: 'ep-rv', items: [['recto', T('Recto')], ['verso', T('Verso')]].map(([k, l]) => ({on: (this.img?.side || 'recto') === k, attrs: `data-ep-side="${k}"`, html: esc(l)}))}) : '';
            box.innerHTML = `<div class="ep-chips" role="list">${chips}${this.ro ? '' : `<button type="button" class="ep-chip ep-add" data-ep-add title="${esc(T('Une série d’un même album, la carte et la lettre qui en parle, le recto et le verso, deux vues du même lieu'))}">＋ ${esc(T('Ajouter une photo ou un document…'))}</button>`}</div>${rv}${views}`;
            box.onclick = e => {
                const x = e.target.closest('[data-ep-imgx]'); if (x) { const im = this.imgById(x.dataset.epImgx); if (im && !this.ro) this.separate(im); return; } // × : sortie de l'enquête (↶ Annuler), le média reste
                const c = e.target.closest('[data-ep-img]'); if (c) { this.st.cur = Number(c.dataset.epImg); this.st.sel = null; this.renderStrip(); this.renderStage(); this.renderLayers(); this.renderSide(); this.syncBetter(); return; }
                if (e.target.closest('[data-ep-add]')) return this.addImages();
                const v = e.target.closest('[data-ep-view]'); if (v) return this.setView(v.dataset.epView);
                const s = e.target.closest('[data-ep-side]'); if (s) { const other = this.pairOf(this.img); if (other && (this.img.side || 'recto') !== s.dataset.epSide) { this.st.cur = this.images.indexOf(other); this.renderStrip(); this.renderStage(); this.renderLayers(); } }
            };
            box.oncontextmenu = e => { const c = e.target.closest('[data-ep-img]'); if (!c) return; e.preventDefault(); e.stopPropagation(); this.imageMenu(this.images[Number(c.dataset.epImg)], {x: e.clientX, y: e.clientY}); };
            UI().bindFileDrop?.(box, files => this.dropFiles(files), {accept: 'image/*'});
        }
        pairOf(im) { if (!im || !im.side) return null; return this.images.find(x => x !== im && x.side && x.side !== im.side && (x.media?.postcard_group && x.media.postcard_group === im.media?.postcard_group || this.images.filter(y => y.side).length === 2)) || null; }
        imageMenu(im, at) {
            const items = [{icon: '↗', label: T('Ouvrir le média'), run: () => { this.dlg.close(); A().openLightbox?.([{...im.media, id: im.media_id}], 0, kiosk()); }}];
            if (!this.ro) items.push({icon: '✎', label: T('Renommer…'), run: async () => { const v = await A().askText?.({title: T('Nom de l’image dans l’enquête'), value: im.label || im.media?.title || ''}); if (v == null) return; await post('image_save', {image_id: im.id, label: v}); im.label = v; this.renderStrip(); }},
                {icon: im.side === 'recto' ? '●' : '○', label: T('C’est le recto'), run: () => this.setSide(im, 'recto')}, {icon: im.side === 'verso' ? '●' : '○', label: T('C’est le verso'), run: () => this.setSide(im, 'verso')},
                {icon: '📜', label: T('Lire avec l’atelier'), run: () => ext.openActTranscriber?.({mediaId: im.media_id, filename: im.media?.filename, title: im.media?.title || ''})},
                '-', {icon: '✂', label: T('Séparer (sortir de l’enquête avec ses indices)'), danger: true, run: () => this.separate(im)});
            UI().menuAt?.(at, items, {title: `${this.letterOf(im)} · ${im.label || im.media?.title || ''}`});
        }
        async setSide(im, side) { const v = im.side === side ? '' : side; await post('image_save', {image_id: im.id, side: v}).catch(e => toast(e.message, 'error')); im.side = v; this.renderStrip(); }
        async separate(im) {
            try { const r = await post('remove_image', {image_id: im.id});
                const after = async () => { await this.reload(); await loadCounts(true); decorateAll(); };
                await after();
                A().undoDelete ? A().undoDelete({type: 'photo_inquiry_image', id: im.id, message: r.clues_removed ? T('Image sortie de l’enquête, avec {n}', {n: plural(r.clues_removed, 'indice')}) : T('Image sortie de l’enquête'), after}) : toast(T('Image sortie de l’enquête.'));
            } catch (e) { toast(e.message, 'error'); }
        }
        async addImages(ids = null) {
            if (this.ro) return;
            if (!ids) { const P = window.LCNDA_PICKER; const it = await P?.openMediaPicker?.({multiple: true, eyebrow: T('🔎 ENQUÊTE PHOTO'), title: T('Ajouter une photo ou un document…'), intro: T('Les images restent à leur place dans Documents : l’enquête les relie, elle ne les déplace pas.')}); if (!it || !it.length) return; ids = it.map(x => Number(x.id)); }
            try { const r = await post('add_images', {id: this.inq.id, media_ids: ids}); await this.reload(); await loadCounts(true); decorateAll(); toast(r.added ? T('{n} ajoutée(s) à l’enquête', {n: plural(r.added, 'image')}) : T('Ces images sont déjà dans l’enquête.')); }
            catch (e) { toast(e.message, 'error'); }
        }
        async dropFiles(files) {
            if (this.ro || !ext.rtImportImage) return; const ids = [];
            for (const f of files) { try { const r = await ext.rtImportImage(f); if (r?.media_id) ids.push(Number(r.media_id)); } catch (e) { toast(e.message, 'error'); } }
            if (ids.length) this.addImages(ids);
        }

        /* ─── la barre d'outils de dessin ─── */
        renderTools() {
            const box = this.dlg.querySelector('[data-ep-tools]'); if (!box) return;
            const TOOLS = [['hand', '✋', 'Déplacer, choisir (V)'], ['circle', '◯', 'Entourer (O)'], ['rect', '▭', 'Encadrer (R)'], ['arrow', '➚', 'Flèche (A)'], ['text', 'T', 'Texte (T)'], ['free', '✎', 'Main levée (F)'], ['blur', '▦', 'Flouter un visage (B)'], '|',
                ['vline', '📏', 'Tracer un objet droit (poteau, mur, personne debout)'], ['shadow', '🌑', 'Tracer son ombre'], ['line', '📐', 'Une ligne de perspective'], ['crop', '✂', 'Découper un morceau (comparer, reflets)']];
            box.innerHTML = `<div class="ep-toolset" role="toolbar" aria-label="${esc(T('Outils de dessin'))}">${TOOLS.map(t => (t === '|' ? '<span class="ep-sep" aria-hidden="true"></span>' : `<button type="button" class="ep-tool${this.st.tool === t[0] ? ' is-active' : ''}" data-ep-tool="${t[0]}" title="${esc(T(t[2]))}" aria-label="${esc(T(t[2]))}" aria-pressed="${this.st.tool === t[0]}" ${this.ro && t[0] !== 'hand' ? 'disabled' : ''}>${esc(t[1])}</button>`)).join('')}</div>
                <span class="ep-sp"></span><button type="button" class="icon-button small" data-ep-z="out" aria-label="${esc(T('Dézoomer'))}" title="${esc(T('Dézoomer'))}">−</button><button type="button" class="icon-button small" data-ep-z="in" aria-label="${esc(T('Zoomer'))}" title="${esc(T('Zoomer'))}">＋</button><button type="button" class="button small secondary" data-ep-z="fit" title="${esc(T('Voir toute l’image'))}">⤢</button><span class="ep-better" data-ep-better>${this.betterHtml()}</span>`;
            box.onclick = e => {
                if (this.betterClick(e)) return;
                const t = e.target.closest('[data-ep-tool]'); if (t && !t.disabled) return this.setTool(t.dataset.epTool);
                const z = e.target.closest('[data-ep-z]'); if (!z) return;
                if (z.dataset.epZ === 'in') this.zoomBy(1.25); else if (z.dataset.epZ === 'out') this.zoomBy(0.8); else if (z.dataset.epZ === 'fit') this.fit();
            };
            box.oninput = e => this.betterInput(e, true); box.onchange = e => this.betterInput(e, false);
        }
        setTool(t) { this.st.tool = t; this.dlg.querySelectorAll('[data-ep-tool]').forEach(b => { const on = b.dataset.epTool === t; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); }); this.dlg.querySelector('[data-ep-stage]')?.setAttribute('data-tool', t); }
        /* ─── 🎚️ Mieux voir : le même panneau que l'atelier de transcription (ext.txView, heritage-transcribe-view.js), sur l'image
         *     AFFICHÉE seulement (l'image d'origine n'est jamais modifiée) ; « 💾 Retenir pour cette photo » le garde avec l'enquête
         *     (settings.views) ; en plus : 🔦 lumière rasante (relief, calculé sur l'ordinateur) et « ＋ Garder ce que je lis ». ─── */
        viewFor(im) { const TV = ext.txView; if (!im || !TV) return null; this.views = this.views || {...(this.inq.settings?.views || {})}; return TV.viewOf({rake: 0, rakeAz: 315, ...(this.views[im.id] || {})}); }
        setViewOf(im, v) { this.views = this.views || {}; this.views[im.id] = {...v}; }
        betterHtml() {
            const TV = ext.txView; if (!TV) return '';
            const v = this.viewFor(this.img) || TV.viewOf();
            const cfg = {v: 2, layout: 'B', order: TV.ITEMS.map(i => i[0]), hidden: ['image', 'rot'], panel: TV.ITEMS.map(i => i[0])};
            let h = TV.toolbarHtml(v, cfg).replace(/<span class="h-tx-ctl h-tx-cfg">[\s\S]*?<\/button><\/span>/, '');
            const keepA = T('Retenir pour cet acte'), keepB = T('Retenir pour cette photo');
            h = h.split(keepA).join(keepB).replace(/data-tx-cmd="keepview" title="[^"]*"/, `data-tx-cmd="keepview" title="${esc(T('Ces réglages de l’image sont gardés avec l’enquête et reviennent à la prochaine ouverture (l’image d’origine ne change pas)'))}"`);
            const rake = `<section class="h-tx-rub ep-rake"><h4>${esc(T('Lumière rasante'))}</h4><span class="h-tx-ctl"><label class="ui-toggle h-tx-ck" title="${esc(T('Comme une lampe posée à plat : un texte gaufré, un timbre sec, un crayon effacé ressortent en relief'))}"><input type="checkbox" data-ep-view="rake" ${v.rake ? 'checked' : ''}><i></i>🔦 ${esc(T('Lumière rasante (relief)'))}</label></span>
                <span class="h-tx-ctl"><label class="h-tx-rg"><span class="h-tx-rgl">${esc(T('D’où vient la lumière'))}</span><input type="range" data-ep-view="rakeAz" min="0" max="359" step="5" value="${v.rakeAz}" aria-label="${esc(T('D’où vient la lumière'))}"></label></span>
                ${this.ro ? '' : `<span class="h-tx-ctl"><button type="button" class="button small secondary" data-ep-readkeep>＋ ${esc(T('Garder ce que je lis'))}</button></span>`}</section>`;
            h = h.replace('<section class="h-tx-rub h-tx-rub-act">', `${rake}<section class="h-tx-rub h-tx-rub-act">`);
            return `<span class="ep-hint-see" hidden>${esc(T('Zoom et « Mieux voir » seulement : aucune IA qui recrée des détails'))}</span>${h}`;
        }
        /** ouvrir le panneau (par une aide : 🎨 canaux de couleur, 🔦 lumière rasante, 🔎 agrandir sans inventer) */
        betterSee({rake = false} = {}) {
            const p = this.dlg.querySelector('[data-ep-better] [data-tx-panel]'); if (!p) return;
            if (rake && !this.ro) { const v = this.viewFor(this.img); if (v && !v.rake) { v.rake = 1; this.setViewOf(this.img, v); this.syncBetter(); this.applyView(); } }
            this.togglePanel(true);
        }
        togglePanel(force) {
            const p = this.dlg.querySelector('[data-ep-better] [data-tx-panel]'), b = this.dlg.querySelector('[data-ep-better] [data-tx-cmd="better"]'); if (!p) return;
            const open = force ?? p.hidden; p.hidden = !open; b?.setAttribute('aria-expanded', String(open));
            if (open && !this.outside) { this.outside = e => { if (!e.target.closest?.('[data-ep-better]') && !e.target.closest?.('.toast, [class*="toast"], dialog.h-modal')) this.togglePanel(false); }; this.dlg.addEventListener('pointerdown', this.outside); }
            if (!open && this.outside) { this.dlg.removeEventListener('pointerdown', this.outside); this.outside = null; }
        }
        syncBetter() {
            const TV = ext.txView, v = this.viewFor(this.img), box = this.dlg.querySelector('[data-ep-better]'); if (!TV || !v || !box) return;
            box.querySelectorAll('[data-tx-view]').forEach(i => { if (i.type === 'checkbox') i.checked = !!v[i.dataset.txView]; else i.value = String(v[i.dataset.txView]); });
            box.querySelectorAll('[data-ep-view]').forEach(i => { if (i.type === 'checkbox') i.checked = !!v[i.dataset.epView]; else i.value = String(v[i.dataset.epView]); });
            box.querySelectorAll('[data-tx-chan]').forEach(b => { const on = b.dataset.txChan === v.channel; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            box.querySelectorAll('[data-tx-recipe]').forEach(b => { const on = TV.recipeOn(v, b.dataset.txRecipe); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            const badge = box.querySelector('[data-tx-badge]'); if (badge) { const n = TV.changedCount(v, Object.keys(TV.CHANGED)) + (v.rake ? 1 : 0); badge.hidden = !n; badge.textContent = String(n); }
        }
        betterInput(e, preview) {
            const k = e.target.dataset?.txView || e.target.dataset?.epView; if (!k || !e.target.closest('[data-ep-better]')) return;
            const v = this.viewFor(this.img); if (!v) return;
            v[k] = e.target.type === 'checkbox' ? (k === 'rake' ? (e.target.checked ? 1 : 0) : e.target.checked) : Number(e.target.value);
            this.setViewOf(this.img, v); this.syncBetter(); this.applyView(this.img, {preview});
        }
        betterClick(e) {
            const box = e.target.closest('[data-ep-better]'); if (!box) return false;
            const TV = ext.txView, im = this.img, c = e.target.closest('[data-tx-cmd]');
            if (c?.dataset.txCmd === 'better') { this.togglePanel(); return true; }
            if (!im || !TV) return true;
            const chan = e.target.closest('[data-tx-chan]'); if (chan) { const v = this.viewFor(im); v.channel = chan.dataset.txChan; this.setViewOf(im, v); this.syncBetter(); this.applyView(); return true; }
            const rcp = e.target.closest('[data-tx-recipe]'); if (rcp) { const before = this.viewFor(im), id = rcp.dataset.txRecipe, r = TV.RECIPES.find(x => x[0] === id); if (!r) return true;
                const put = v => { this.setViewOf(im, v); this.syncBetter(); this.applyView(im); }; put({...TV.recipeView(before, id), rake: 0, rakeAz: before.rakeAz});
                undoToast(T('Recette « {name} » posée sur l’image', {name: r[2]}), {undo: () => put(before)}); return true; }
            if (e.target.closest('[data-ep-readkeep]')) { const v = this.viewFor(im), how = [v.rake ? T('lumière rasante') : '', v.channel ? T({r: 'Rouge seul', g: 'Vert seul', b: 'Bleu seul'}[v.channel]) : '', v.invert ? T('Négatif') : '', TV.RECIPES.find(x => TV.recipeOn(v, x[0]))?.[2] || ''].filter(Boolean).join(', ') || T('Mieux voir');
                ext.enquetePhotoPlus?.keepRead?.(this.api(), im, how, v); return true; }
            if (!c) return true;
            if (c.dataset.txCmd === 'keepview') { if (this.ro) return true; const s = {...(this.inq.settings || {}), views: {...(this.inq.settings?.views || {}), [im.id]: this.viewFor(im)}}; this.inq.settings = s;
                post('update', {id: this.inq.id, settings: s}).then(() => toast(T('Réglages de l’image retenus pour cette photo : ils reviennent à la prochaine ouverture.'))).catch(err => toast(err.message, 'error')); return true; }
            if (c.dataset.txCmd === 'resetview') { const before = this.viewFor(im), origin = () => { this.setViewOf(im, TV.viewOf({rake: 0, rakeAz: 315})); this.syncBetter(); this.applyView(im); };
                if (!Object.entries(TV.DEFAULT_VIEW).some(([kk, d]) => String(before[kk]) !== String(d)) && !before.rake) { toast(T('L’image est déjà comme au départ')); return true; }
                origin(); undoToast(T('Image remise comme au départ'), {undo: () => { this.setViewOf(im, before); this.syncBetter(); this.applyView(im); }, redo: origin}); return true; }
            return true;
        }
        /** le réglage posé sur l'image affichée : filtre CSS, ou image calculée sur l'ordinateur (worker de l'atelier) ; l'image d'origine ne change pas */
        async applyView(im = this.img, {preview = false} = {}) {
            const TV = ext.txView, view = this.viewOf(im), img = view?.querySelector('img.ep-photo'), svg = view?.querySelector('svg.ep-svg'); if (!TV || !img) return;
            const v = this.viewFor(im), orig = mediaSrc(im.media); img.dataset.epOrig = orig;
            const geo = `${v.mirror ? 'scaleX(-1) ' : ''}${(v.rot || 0) + (v.tilt || 0) ? `rotate(${(v.rot || 0) + (v.tilt || 0)}deg)` : ''}`.trim();
            img.style.transform = geo; if (svg) svg.style.transform = geo;
            const seq = (this.viewSeq = (this.viewSeq || 0) + 1);
            if (v.rake) { // 🔦 lumière rasante : le relief calculé ici (app-enquete-photo-core.js), sur l'image d'origine réduite
                try { const el = new Image(); el.src = orig; await el.decode(); const k = Math.min(1, 1600 / Math.max(el.naturalWidth, el.naturalHeight)), cv = document.createElement('canvas'); cv.width = Math.round(el.naturalWidth * k); cv.height = Math.round(el.naturalHeight * k);
                    const g = cv.getContext('2d'); g.drawImage(el, 0, 0, cv.width, cv.height); const d = g.getImageData(0, 0, cv.width, cv.height); g.putImageData(new ImageData(C().emboss(d.data, cv.width, cv.height, v.rakeAz, 3), cv.width, cv.height), 0, 0);
                    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); if (seq !== this.viewSeq) return; const old = img.src; img.src = URL.createObjectURL(blob); if (old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 3000); img.style.filter = TV.cssFilter(v); } catch (_) {}
                return;
            }
            if (TV.needsPixels(v)) {
                this.enh = this.enh || TV.enhancer(u => { const cur = this.viewOf(this.enhFor)?.querySelector('img.ep-photo'); if (!cur || !TV.needsPixels(this.viewFor(this.enhFor) || {})) return; cur.style.filter = ''; cur.src = u; });
                if (this.enh.ok) {
                    if (this.enhFor !== im || !this.enh.hasSource()) { this.enhFor = im; const el = new Image(); el.src = orig; await el.decode().catch(() => {}); if (!(await this.enh.source(el, el.naturalWidth, el.naturalHeight))) { this.enhFor = null; } }
                    if (this.enhFor === im && seq === this.viewSeq) { this.enh.render(v, {preview}); return; }
                }
            }
            if (img.getAttribute('src') !== orig) img.src = orig;
            img.style.filter = TV.cssFilter(v);
        }
        applyFilter() { this.shownImages().forEach(im => this.applyView(im)); }

        /* ─── la scène : une, deux côte à côte ou toutes ─── */
        shownImages() {
            if (this.st.view === 'mosaic' && this.images.length > 1) return this.images;
            if (this.st.view === 'side' && this.images.length > 1) { const a = this.img, b = this.images[(this.st.cur + 1) % this.images.length]; return [a, b]; }
            return this.img ? [this.img] : [];
        }
        renderStage() {
            const stage = this.dlg.querySelector('[data-ep-stage]'); if (!stage) return;
            const list = this.shownImages();
            stage.className = `ep-stage is-${list.length > 1 ? this.st.view : 'one'}`; stage.dataset.tool = this.st.tool;
            if (!list.length) { stage.innerHTML = A().emptyState ? A().emptyState({icon: '🖼', text: T('Aucune image dans cette enquête'), hint: T('« ＋ Ajouter une photo ou un document… » au-dessus.'), action: this.ro ? null : {label: T('＋ Ajouter une photo ou un document…'), attrs: 'data-empty-click="[data-ep-add]"'}}) : ''; return; }
            stage.innerHTML = list.map(im => {
                const isImg = im.media?.media_type === 'image' && im.media?.filename && !im.media?.missing;
                return `<div class="ep-view${im === this.img ? ' is-cur' : ''}" data-ep-view-img="${im.id}"><span class="ep-vlabel">${esc(this.letterOf(im))}</span>
                    <div class="ep-canvas">${isImg ? `<img class="ep-photo" src="${esc(mediaSrc(im.media))}" alt="${esc(im.media.title || '')}" draggable="false"><svg class="ep-svg" xmlns="http://www.w3.org/2000/svg"></svg>` : `<div class="ep-file"><span aria-hidden="true">📄</span><small>${esc(im.media?.title || im.media?.filename || T('Pas de fichier'))}</small></div>`}</div></div>`;
            }).join('');
            stage.querySelectorAll('img.ep-photo').forEach(imgEl => { const done = () => { this.paintShapes(this.imgById(imgEl.closest('[data-ep-view-img]').dataset.epViewImg)); this.applyZoom(); }; if (imgEl.complete && imgEl.naturalWidth) done(); else imgEl.addEventListener('load', done, {once: true}); });
            this.applyFilter(); this.applyZoom(); this.bindStage(stage);
            ext.enquetePhotoSuite?.onStage?.(this.api(), stage); // ▦ grille de lecture, 🔢 personnes numérotées (heritage-enquete-photo-suite.js)
        }
        viewOf(im) { return this.dlg.querySelector(`[data-ep-view-img="${im?.id}"]`); }
        applyZoom() { const z = this.st.zoom; this.dlg.querySelectorAll('.ep-view .ep-canvas').forEach(c => { c.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.k})`; }); }
        zoomBy(f, cx = null, cy = null) {
            const z = this.st.zoom, k = Math.max(0.2, Math.min(12, z.k * f)), r = k / z.k;
            if (cx != null) { z.x = cx - (cx - z.x) * r; z.y = cy - (cy - z.y) * r; } else { z.x *= r; z.y *= r; }
            z.k = k; this.applyZoom();
        }
        fit() { this.st.zoom = {k: 1, x: 0, y: 0}; this.applyZoom(); }
        /** coordonnées 0–1 sur l'image, d'après la souris (le zoom compris) */
        norm(e, view) { const img = view.querySelector('img.ep-photo'); const r = img.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
        bindStage(stage) {
            stage.onwheel = e => { e.preventDefault(); const v = e.target.closest('.ep-view'); const r = (v || stage).getBoundingClientRect(); this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); };
            stage.onpointerdown = e => {
                const view = e.target.closest('.ep-view'); if (!view || e.button > 1) return;
                const im = this.imgById(view.dataset.epViewImg); if (!im) return;
                if (im !== this.img) { this.st.cur = this.images.indexOf(im); this.renderStrip(); this.renderLayers(); this.renderSide(); this.dlg.querySelectorAll('.ep-view').forEach(v => v.classList.toggle('is-cur', v === view)); }
                const hasImg = !!view.querySelector('img.ep-photo');
                if (this.st.tool === 'hand' || this.ro || e.button === 1 || !hasImg) {
                    const sh = e.target.closest('[data-shape]');
                    if (sh && e.button === 0) { this.select(sh.dataset.shape); }
                    else if (e.button === 0) this.select(null);
                    const z = this.st.zoom, x0 = e.clientX, y0 = e.clientY, zx = z.x, zy = z.y; let moved = false;
                    const mv = ev => { moved = true; z.x = zx + ev.clientX - x0; z.y = zy + ev.clientY - y0; this.applyZoom(); };
                    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); stage.classList.remove('is-panning'); };
                    stage.classList.add('is-panning'); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
                }
                e.preventDefault(); this.startDraw(e, view, im);
            };
            stage.ondblclick = e => { const sh = e.target.closest('[data-shape]'); if (sh) { const s = this.findShape(sh.dataset.shape); if (s?.clue) this.openClue(this.clues.find(c => c.id === s.clue)); else if (s && !this.ro) this.shapeToClue(s); } };
            stage.oncontextmenu = e => {
                const sh = e.target.closest('[data-shape]'); if (!sh) return; e.preventDefault(); e.stopPropagation();
                const s = this.findShape(sh.dataset.shape); if (!s) return; this.select(s.id);
                const clue = this.clues.find(c => c.id === s.clue), items = [];
                if (clue) items.push({icon: '↗', label: T('Ouvrir l’indice {n}', {n: clue.num}), run: () => this.openClue(clue)});
                else if (!this.ro && !['vline', 'shadow', 'line', 'crop'].includes(s.t)) items.push({icon: '＋', label: T('En faire un indice…'), run: () => this.shapeToClue(s)});
                if (s.t === 'crop' && ext.enquetePhotoAides) items.push({icon: '🌐', label: T('Comparer en ligne…'), run: () => ext.enquetePhotoAides.compareOnline(this.api(), s)}, {icon: '🪞', label: T('Reflets : agrandir et retourner'), run: () => ext.enquetePhotoAides.mirror(this.api(), s)});
                if (!this.ro) items.push('-', {icon: '🗑', label: T('Effacer la forme'), danger: true, run: () => this.deleteShape(s.id)});
                UI().menuAt?.({x: e.clientX, y: e.clientY}, items);
            };
        }

        /* ─── les calques ─── */
        layersOf(im) { if (!Array.isArray(im.layers)) im.layers = []; return im.layers; }
        findShape(id, im = this.img) { for (const l of this.layersOf(im || {})) { const s = l.shapes.find(x => x.id === id); if (s) return s; } return null; }
        layerOfShape(id, im = this.img) { return this.layersOf(im).find(l => l.shapes.some(x => x.id === id)) || null; }
        notesLayer(im) { const ls = this.layersOf(im); let l = ls.find(x => x.id === 'notes'); if (!l) { l = {id: 'notes', name: T('Mes notes'), visible: true, locked: false, shapes: []}; ls.push(l); } return l; }
        snapshot(im) { return {id: im.id, layers: JSON.stringify(this.layersOf(im))}; }
        change(im, fn) { if (this.ro) return; this.hist.push(this.snapshot(im)); if (this.hist.length > 80) this.hist.shift(); this.fut = []; fn(); this.dirty.add(im.id); this.paintShapes(im); this.renderLayers(); this.queueSave(); }
        undo() { const h = this.hist.pop(); if (!h) return; const im = this.imgById(h.id); if (!im) return; this.fut.push(this.snapshot(im)); im.layers = JSON.parse(h.layers); this.dirty.add(im.id); this.paintShapes(im); this.renderLayers(); this.queueSave(); }
        redo() { const h = this.fut.pop(); if (!h) return; const im = this.imgById(h.id); if (!im) return; this.hist.push(this.snapshot(im)); im.layers = JSON.parse(h.layers); this.dirty.add(im.id); this.paintShapes(im); this.renderLayers(); this.queueSave(); }
        queueSave() { this.status('saving'); clearTimeout(this.saveT); this.saveT = setTimeout(() => this.flush(), 500); }
        async flush() {
            clearTimeout(this.saveT); const ids = [...this.dirty]; this.dirty.clear(); if (!ids.length) return;
            try { for (const id of ids) { const im = this.imgById(id); if (im) await post('image_save', {image_id: id, layers: this.layersOf(im)}); } this.status('saved'); }
            catch (e) { ids.forEach(id => this.dirty.add(id)); this.status('error'); toast(e.message, 'error', {retry: () => this.flush()}); }
        }
        select(id) { this.st.sel = id; this.dlg.querySelectorAll('[data-shape]').forEach(n => n.classList.toggle('is-sel', n.dataset.shape === id)); }
        deleteShape(id) {
            const im = this.img, l = this.layerOfShape(id, im); if (!l || this.ro) return;
            if (l.locked) return toast(T('Ce calque est verrouillé 🔒.'), 'error');
            this.change(im, () => { l.shapes = l.shapes.filter(s => s.id !== id); if (!l.shapes.length && l.id !== 'notes') this.layersOf(im).splice(this.layersOf(im).indexOf(l), 1); });
            this.st.sel = null;
            undoToast(T('Forme effacée'), {undo: () => this.undo(), redo: () => this.redo()});
        }
        renderLayers() {
            const box = this.dlg.querySelector('[data-ep-layers]'); if (!box) return;
            const im = this.img; if (!im) { box.innerHTML = ''; return; }
            const ls = this.layersOf(im);
            box.innerHTML = `<details class="ep-layerbox" ${ls.length ? 'open' : ''}><summary>${esc(T('Calques ({n})', {n: ls.length}))}</summary>
                ${ls.length ? `<ul class="ep-layerlist">${ls.map(l => `<li data-layer="${esc(l.id)}" class="${l.visible ? '' : 'is-hidden'}${l.locked ? ' is-locked' : ''}"><span class="ep-ln">${esc(l.name || T('Calque'))}</span><small>${esc(plural(l.shapes.length, 'forme'))}</small>
                    <button type="button" class="icon-button small" data-layer-eye aria-pressed="${l.visible}" title="${esc(l.visible ? T('Masquer') : T('Montrer'))}" aria-label="${esc(l.visible ? T('Masquer') : T('Montrer'))}">${l.visible ? '👁' : '◌'}</button>
                    <button type="button" class="icon-button small" data-layer-lock aria-pressed="${l.locked}" title="${esc(l.locked ? T('Déverrouiller') : T('Verrouiller'))}" aria-label="${esc(l.locked ? T('Déverrouiller') : T('Verrouiller'))}" ${this.ro ? 'disabled' : ''}>${l.locked ? '🔒' : '🔓'}</button></li>`).join('')}</ul>` : `<p class="ui-hint">${esc(T('Entoure ce que tu vois : chaque chose entourée devient un indice numéroté, sur son calque.'))}</p>`}
                <p class="ep-exportline">⤓ <button type="button" class="link-button" data-ep-exp="with">${esc(T('Exporter l’image avec les calques'))}</button> · <button type="button" class="link-button" data-ep-exp="without">${esc(T('sans les calques'))}</button> <small class="muted">${esc(T('l’image d’origine n’est jamais modifiée.'))}</small></p></details>`;
            box.onclick = e => {
                const x = e.target.closest('[data-ep-exp]'); if (x) return this.exportImage(x.dataset.epExp === 'with');
                const li = e.target.closest('[data-layer]'); if (!li) return; const l = ls.find(y => y.id === li.dataset.layer); if (!l) return;
                if (e.target.closest('[data-layer-eye]')) { l.visible = !l.visible; this.dirty.add(im.id); this.queueSave(); this.paintShapes(im); this.renderLayers(); }
                else if (e.target.closest('[data-layer-lock]') && !this.ro) { l.locked = !l.locked; this.dirty.add(im.id); this.queueSave(); this.renderLayers(); }
            };
            box.ondblclick = async e => { const li = e.target.closest('[data-layer]'); if (!li || this.ro) return; const l = ls.find(y => y.id === li.dataset.layer); const v = await A().askText?.({title: T('Nom du calque'), value: l.name}); if (v) this.change(im, () => { l.name = v; }); };
        }

        /* ─── dessiner ─── */
        startDraw(e, view, im) {
            const t = this.st.tool, [x0, y0] = this.norm(e, view);
            if (t === 'text') { this.addText(im, x0, y0); return; }
            const shape = {id: uid(), t, x: x0, y: y0, w: 0, h: 0};
            if (t === 'free') shape.pts = [[x0, y0]];
            if (t === 'vline' || t === 'shadow' || t === 'line') shape.pts = [[x0, y0], [x0, y0]];
            this.drawing = {shape, view, im};
            const mv = ev => { const [x, y] = this.norm(ev, view);
                if (shape.pts && t === 'free') shape.pts.push([x, y]); else if (shape.pts) shape.pts[1] = [x, y]; else { shape.w = x - x0; shape.h = y - y0; }
                this.paintShapes(im, shape); };
            const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (!this.drawing) return; this.drawing = null; this.endDraw(im, shape); };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        }
        cancelDraw() { const d = this.drawing; this.drawing = null; if (d) this.paintShapes(d.im); }
        endDraw(im, s) {
            if (!s.pts && s.w < 0) { s.x += s.w; s.w = -s.w; } if (!s.pts && s.h < 0) { s.y += s.h; s.h = -s.h; }
            const tiny = s.pts ? (s.t === 'free' ? s.pts.length < 3 : Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) < 0.01) : (s.t !== 'arrow' && (s.w < 0.005 || s.h < 0.005));
            if (s.t === 'arrow') { s.w = s.w || 0; s.h = s.h || 0; if (Math.hypot(s.w, s.h) < 0.01) return this.paintShapes(im); }
            else if (tiny) return this.paintShapes(im);
            if (ext.enquetePhotoPlus?.onDraw?.(this.api(), im, s)) return; // 📏 mesure, 🏙 profil des toits : sur leur propre calque
            if (s.t === 'vline' || s.t === 'shadow') { // ☀️ objet droit + son ombre : rangés par paire (le 1ᵉʳ objet, sa 1ʳᵉ ombre…)
                const ls = this.layersOf(im); let l = ls.find(x => x.id === 'sun'); if (!l) { l = {id: 'sun', name: T('☀️ Ombres'), visible: true, locked: false, shapes: []}; }
                const n = l.shapes.filter(x => x.t === s.t).length + 1; s.n = n;
                this.change(im, () => { if (!ls.includes(l)) ls.push(l); l.shapes.push(s); });
                if (s.t === 'vline') { toast(T('Objet droit tracé : trace maintenant le bout de son ombre (🌑), depuis le pied de l’objet.')); this.setTool('shadow'); }
                else { this.setTool('hand'); ext.enquetePhotoAides?.shadow(this.api()); }
                return;
            }
            if (s.t === 'line') { const ls = this.layersOf(im); let l = ls.find(x => x.id === 'persp'); if (!l) l = {id: 'persp', name: T('📐 Perspective'), visible: true, locked: false, shapes: []};
                this.change(im, () => { if (!ls.includes(l)) ls.push(l); l.shapes.push(s); }); if (l.shapes.length >= 2) ext.enquetePhotoAides?.perspective(this.api()); return; }
            if (s.t === 'crop') { const ls = this.layersOf(im); let l = ls.find(x => x.id === 'crops'); if (!l) l = {id: 'crops', name: T('✂ Morceaux'), visible: true, locked: false, shapes: []};
                this.change(im, () => { if (!ls.includes(l)) ls.push(l); l.shapes.push(s); }); this.setTool('hand');
                const items = [{icon: '🌐', label: T('Comparer en ligne…'), run: () => ext.enquetePhotoAides?.compareOnline(this.api(), s)}, {icon: '🪞', label: T('Reflets : agrandir et retourner'), run: () => ext.enquetePhotoAides?.mirror(this.api(), s)}, {icon: '⤓', label: T('Enregistrer le morceau'), run: () => ext.enquetePhotoAides?.saveCrop(this.api(), s)}];
                const r = this.viewOf(im)?.getBoundingClientRect(); UI().menuAt?.(r ? {x: r.left + r.width / 2, y: r.top + 40} : document.body, items, {title: T('✂ Le morceau découpé')}); return; }
            if (s.t === 'fontframe') { this.setTool('hand'); this.paintShapes(im); ext.enquetePhotoAides?.fontGuess(this.api(), {frame: {x: s.x, y: s.y, w: s.w, h: s.h}}); return; } // 🔤 le cadre d'un essai de police
            if (s.t === 'blur') { this.change(im, () => this.notesLayer(im).shapes.push(s)); toast(T('Visage flouté sur l’image affichée et dans les exports (l’image d’origine ne change pas).')); return; }
            if (s.t === 'free') { this.change(im, () => this.notesLayer(im).shapes.push(s)); return; }
            // ◯ ▭ ➚ : « chaque chose entourée devient un indice numéroté »
            this.change(im, () => this.notesLayer(im).shapes.push(s));
            this.shapeToClue(s);
        }
        async addText(im, x, y) {
            const v = await A().askText?.({title: T('Écrire sur l’image'), placeholder: T('clocher à bulbe ?')}); if (!v) return;
            this.change(im, () => this.notesLayer(im).shapes.push({id: uid(), t: 'text', x, y, w: 0, h: 0, text: v}));
        }
        /** une forme entourée → un indice (sur son propre calque « 3 · Deux soldats ») */
        shapeToClue(s) {
            const im = this.img;
            this.editClue({kind: this.st.openQ && ['lieu', 'gens', 'objet', 'texte', 'date', 'support', 'dos'].includes(this.qKind(this.st.openQ)) ? this.qKind(this.st.openQ) : 'lieu', shape_id: s.id, images: {[im.id]: 'yes'}}, {
                title: T('Qu’as-tu entouré ?'), onSaved: clue => this.change(im, () => { const l0 = this.layerOfShape(s.id, im); if (!l0) return; l0.shapes = l0.shapes.filter(x => x.id !== s.id); if (!l0.shapes.length && l0.id === 'notes') this.layersOf(im).splice(this.layersOf(im).indexOf(l0), 1); s.clue = clue.id; s.n = clue.num;
                    this.layersOf(im).push({id: `c${clue.id}`, name: `${clue.num} · ${clue.text.slice(0, 40)}`, visible: true, locked: false, shapes: [s]}); })});
        }
        qKind(q) { return {support: 'support', dos: 'dos', texte: 'texte', lieu: 'lieu', gens: 'gens', objets: 'objet', date: 'date'}[q] || 'lieu'; }

        /** le dessin des formes (SVG au-dessus de l'image, à la taille de l'image) */
        paintShapes(im, extra = null) {
            const view = this.viewOf(im); const svg = view?.querySelector('svg.ep-svg'), img = view?.querySelector('img.ep-photo'); if (!svg || !img?.naturalWidth) return;
            const W = img.naturalWidth, H = img.naturalHeight, u = Math.max(W, H) / 400, src = img.getAttribute('src');
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            const P = (x, y) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`;
            const one = (s, layer) => {
                const col = s.color || ({vline: '#1a7f37', shadow: '#5b3fbf', line: '#0a6cff', crop: '#d1242f', blur: '#888'}[s.t] || '#ffd84d');
                const st = `stroke="${col}" stroke-width="${(u * 1.2).toFixed(1)}" fill="none" vector-effect="non-scaling-stroke"`;
                const lock = layer?.locked ? ' data-locked="1"' : '';
                const num = s.n && prefs().numbers && !['vline', 'shadow', 'line'].includes(s.t) ? `<g class="ep-num"><circle cx="${(s.x * W).toFixed(1)}" cy="${(s.y * H).toFixed(1)}" r="${(u * 7).toFixed(1)}" fill="#055dff"/><text x="${(s.x * W).toFixed(1)}" y="${(s.y * H + u * 3).toFixed(1)}" font-size="${(u * 9).toFixed(1)}" text-anchor="middle" fill="#fff" font-weight="700">${esc(String(s.n))}</text></g>` : '';
                let body = '';
                if (s.t === 'circle') body = `<ellipse cx="${((s.x + s.w / 2) * W).toFixed(1)}" cy="${((s.y + s.h / 2) * H).toFixed(1)}" rx="${(Math.abs(s.w) * W / 2).toFixed(1)}" ry="${(Math.abs(s.h) * H / 2).toFixed(1)}" ${st}/>`;
                else if (s.t === 'rect' || s.t === 'crop' || s.t === 'fontframe') body = `<rect x="${(Math.min(s.x, s.x + s.w) * W).toFixed(1)}" y="${(Math.min(s.y, s.y + s.h) * H).toFixed(1)}" width="${(Math.abs(s.w) * W).toFixed(1)}" height="${(Math.abs(s.h) * H).toFixed(1)}" ${st}${s.t === 'crop' ? ' stroke-dasharray="6 4"' : ''}/>`;
                else if (s.t === 'arrow') body = `<line x1="${(s.x * W).toFixed(1)}" y1="${(s.y * H).toFixed(1)}" x2="${((s.x + s.w) * W).toFixed(1)}" y2="${((s.y + s.h) * H).toFixed(1)}" ${st} marker-end="url(#ep-arrow-${im.id})"/>`;
                else if (s.t === 'text') body = `<text x="${(s.x * W).toFixed(1)}" y="${(s.y * H).toFixed(1)}" font-size="${(u * 11).toFixed(1)}" fill="${s.color || '#ffd84d'}" stroke="#000" stroke-width="${(u * 0.35).toFixed(1)}" paint-order="stroke" font-weight="700">${esc(s.text || '')}</text>`;
                else if (s.t === 'free') body = `<polyline points="${(s.pts || []).map(p => P(p[0], p[1])).join(' ')}" ${st} stroke-linejoin="round" stroke-linecap="round"/>`;
                else if (s.t === 'vline' || s.t === 'shadow' || s.t === 'line') { const [a, b] = s.pts || [[0, 0], [0, 0]]; body = `<line x1="${(a[0] * W).toFixed(1)}" y1="${(a[1] * H).toFixed(1)}" x2="${(b[0] * W).toFixed(1)}" y2="${(b[1] * H).toFixed(1)}" ${st}${s.t === 'shadow' ? ' stroke-dasharray="8 5"' : ''}/><circle cx="${(a[0] * W).toFixed(1)}" cy="${(a[1] * H).toFixed(1)}" r="${(u * 2.2).toFixed(1)}" fill="${col}"/>${s.n ? `<text x="${(b[0] * W + u * 4).toFixed(1)}" y="${(b[1] * H).toFixed(1)}" font-size="${(u * 8).toFixed(1)}" fill="${col}" stroke="#fff" stroke-width="${(u * 0.4).toFixed(1)}" paint-order="stroke">${s.t === 'vline' ? '📏' : s.t === 'shadow' ? '🌑' : ''}${s.n}</text>` : ''}`; }
                else if (s.t === 'blur') { const x = Math.min(s.x, s.x + s.w) * W, y = Math.min(s.y, s.y + s.h) * H, w = Math.abs(s.w) * W, h = Math.abs(s.h) * H, cid = `ep-c-${im.id}-${s.id}`;
                    body = `<clipPath id="${cid}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/></clipPath><image href="${esc(src)}" x="0" y="0" width="${W}" height="${H}" clip-path="url(#${cid})" filter="url(#ep-blur-${im.id})"/><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="transparent" stroke="${col}" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`; }
                return `<g class="ep-shape is-${s.t}" data-shape="${esc(s.id)}"${lock}>${body}${num}</g>`;
            };
            const defs = `<defs><marker id="ep-arrow-${im.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ffd84d"/></marker><filter id="ep-blur-${im.id}"><feGaussianBlur stdDeviation="${(u * 6).toFixed(1)}"/></filter></defs>`;
            const body = this.layersOf(im).filter(l => l.visible).map(l => l.shapes.map(s => one(s, l)).join('')).join('') + (extra ? one(extra) : '');
            svg.innerHTML = defs + body;
            if (this.st.sel) svg.querySelector(`[data-shape="${CSS.escape(this.st.sel)}"]`)?.classList.add('is-sel');
            ext.enquetePhotoAides?.paintFonts?.(this.api(), im, view); // 🔤 les essais de police posés sur la photo
        }

        /** l'image avec (ou sans) ses calques, dans un <canvas> ; blurOnly : seulement les visages floutés (partage sans risque) */
        async composite(im, {layers = true, blurOnly = false, extraBlur = []} = {}) {
            const img = new Image(); img.src = mediaSrc(im.media);
            await img.decode().catch(() => new Promise(r => { img.onload = r; img.onerror = r; }));
            const W = img.naturalWidth || 1, H = img.naturalHeight || 1, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0); const u = Math.max(W, H) / 400;
            const shapes = this.layersOf(im).filter(l => l.visible).flatMap(l => l.shapes);
            const blurs = [...shapes.filter(s => s.t === 'blur'), ...extraBlur];
            blurs.forEach(s => { const x = Math.min(s.x, s.x + s.w) * W, y = Math.min(s.y, s.y + s.h) * H, w = Math.abs(s.w) * W, h = Math.abs(s.h) * H; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.filter = `blur(${Math.max(6, u * 6)}px)`; g.drawImage(img, 0, 0); g.filter = 'none';
                // un flou qui ne laisse rien lire : des carrés par-dessus
                const step = Math.max(6, Math.round(Math.min(w, h) / 6)); for (let yy = y; yy < y + h; yy += step) for (let xx = x; xx < x + w; xx += step) { const d = g.getImageData(Math.min(W - 1, Math.round(xx)), Math.min(H - 1, Math.round(yy)), 1, 1).data; g.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`; g.fillRect(xx, yy, step, step); }
                g.restore(); });
            if (layers && !blurOnly) {
                g.lineWidth = u * 1.4; g.lineJoin = 'round'; g.lineCap = 'round';
                shapes.forEach(s => {
                    g.strokeStyle = s.color || ({vline: '#1a7f37', shadow: '#5b3fbf', line: '#0a6cff', crop: '#d1242f'}[s.t] || '#ffd84d'); g.fillStyle = g.strokeStyle; g.beginPath();
                    if (s.t === 'circle') { g.ellipse((s.x + s.w / 2) * W, (s.y + s.h / 2) * H, Math.abs(s.w) * W / 2, Math.abs(s.h) * H / 2, 0, 0, Math.PI * 2); g.stroke(); }
                    else if (s.t === 'rect' || s.t === 'crop') { g.strokeRect(Math.min(s.x, s.x + s.w) * W, Math.min(s.y, s.y + s.h) * H, Math.abs(s.w) * W, Math.abs(s.h) * H); }
                    else if (s.t === 'arrow') { const x1 = s.x * W, y1 = s.y * H, x2 = (s.x + s.w) * W, y2 = (s.y + s.h) * H, a = Math.atan2(y2 - y1, x2 - x1), k = u * 7; g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - k * Math.cos(a - 0.45), y2 - k * Math.sin(a - 0.45)); g.lineTo(x2 - k * Math.cos(a + 0.45), y2 - k * Math.sin(a + 0.45)); g.closePath(); g.fill(); }
                    else if (s.t === 'text') { g.font = `bold ${u * 11}px system-ui, sans-serif`; g.lineWidth = u * 0.7; g.strokeStyle = '#000'; g.strokeText(s.text || '', s.x * W, s.y * H); g.fillStyle = s.color || '#ffd84d'; g.fillText(s.text || '', s.x * W, s.y * H); g.lineWidth = u * 1.4; }
                    else if (s.pts) { s.pts.forEach((p, i) => (i ? g.lineTo(p[0] * W, p[1] * H) : g.moveTo(p[0] * W, p[1] * H))); g.stroke(); }
                    if (s.n && prefs().numbers && !['vline', 'shadow', 'line'].includes(s.t)) { g.beginPath(); g.fillStyle = '#055dff'; g.arc(s.x * W, s.y * H, u * 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${u * 9}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(String(s.n), s.x * W, s.y * H + u * 3); g.textAlign = 'start'; }
                });
            }
            return cv;
        }
        async exportImage(withLayers) {
            const im = this.img; if (!im || im.media?.media_type !== 'image') return toast(T('Choisis d’abord une image.'), 'error');
            try { const cv = await this.composite(im, {layers: withLayers}); const name = (A().safeExportFilename ? A().safeExportFilename(`${this.inq.title} ${this.letterOf(im)}${withLayers ? ' calques' : ''}`) : 'enquete-photo') + '.png';
                cv.toBlob(b => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(b), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
                post('log_export', {id: this.inq.id, what: withLayers ? 'image_calques' : 'image'}).catch(() => {});
            } catch (e) { toast(e.message, 'error'); }
        }
        exportMenu(btn) {
            const X = ext.enquetePhotoAides, items = [{icon: '🖼', label: T('L’image avec les calques (PNG)'), run: () => this.exportImage(true)}, {icon: '🖼', label: T('L’image sans les calques (PNG)'), run: () => this.exportImage(false)}];
            if (X) items.push('-', {icon: '📖', label: T('Raconter l’enquête…'), run: () => X.story(this.api())}, {icon: '🛡', label: T('Partager sans risque…'), run: () => X.safeShare(this.api())}, {icon: '✉️', label: T('Demander à un cousin (fiche à imprimer)…'), run: () => X.cousin(this.api())}, {icon: '📄', label: T('Le dossier en tableau (CSV)'), run: () => this.exportCsv()});
            UI().menuAt?.(btn || document.body, items, {title: T('⤓ Exporter')});
        }
        exportCsv() {
            const rows = [[T('N°'), T('Sorte'), T('Indice'), T('Certitude'), T('Pourquoi'), T('D’où il vient'), T('Pas avant'), T('Pas après'), T('Images'), T('Lien')],
                ...this.clues.map(c => [c.num, T(kindOf(c.kind)[2]), c.text, T(CERT[c.certainty]?.[0] || ''), c.why, T(SOURCES[c.source] || c.source), c.date_from || '', c.date_to || '', Object.keys(c.images || {}).map(i => this.letterOf(this.imgById(i)) || '').join(' '), c.url])];
            if (UI().exportRows) return UI().exportRows(rows, {name: this.inq.title, title: this.inq.title});
            const csv = rows.map(r => r.map(v => (A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`)).join(';')).join('\r\n');
            const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'})), download: 'enquete-photo.csv'}); document.body.appendChild(a); a.click(); a.remove();
        }
        openPrefs() {
            const p = prefs();
            ext.openDialog?.({eyebrow: T('ENQUÊTE PHOTO'), title: T('⚙️ Personnaliser l’enquête photo'), submitLabel: T('Fermer'), body: `
                <label class="ui-toggle"><input type="checkbox" data-pf="ai" ${p.ai ? 'checked' : ''}><i></i>${esc(T('🤖 L’IA de cet ordinateur peut aider (Ollama)'))}</label>
                <p class="ui-hint">${esc(T('Éteinte au départ. Elle tourne sur l’ordinateur : la photo ne part pas sur Internet. Ce qu’elle dit arrive en piste à vérifier (Supposé au plus).'))}</p>
                <label class="ui-toggle"><input type="checkbox" data-pf="guided" ${p.guided ? 'checked' : ''}><i></i>${esc(T('Questions guidées, une à la fois'))}</label>
                <label class="ui-toggle"><input type="checkbox" data-pf="numbers" ${p.numbers ? 'checked' : ''}><i></i>${esc(T('Numéroter les zones entourées'))}</label>
                <label class="ui-toggle"><input type="checkbox" data-pf="tenMinutes" ${p.tenMinutes ? 'checked' : ''}><i></i>${esc(T('⏱ Mode « 10 minutes » : trois questions, les plus utiles'))}</label>
                <label>${esc(T('Marge de l’ombre (degrés)'))} <input type="number" min="1" max="20" step="1" value="${p.tol}" data-pf="tol"></label>
                <p class="ui-hint">${esc(T('Une ombre mesurée sur une photo n’est jamais exacte : 6° conseillés.'))}</p>${ext.enquetePhotoSuite?.prefsHtml?.(p) || ''}`,
                onOpen: dg => { const save = () => { const g = k => dg.querySelector(`[data-pf="${k}"]`); setPrefs({ai: g('ai').checked, guided: g('guided').checked, numbers: g('numbers').checked, tenMinutes: g('tenMinutes').checked, tol: Math.max(1, Math.min(20, Number(g('tol').value) || 6)), ...(ext.enquetePhotoSuite?.prefsRead?.(dg) || {})}); this.renderSide(); this.images.forEach(im => this.paintShapes(im)); };
                    if (UI().autoSaveDialog) UI().autoSaveDialog(dg, {keys: [KEY], save, reload: () => {}}); else dg.addEventListener('change', save); dg.addEventListener('change', save); },
                onSubmit: () => true});
        }

        /* ═════════ le panneau de droite : Questions · Indices · Recherches · Aides ═════════ */
        renderSide() {
            const box = this.dlg.querySelector('[data-ep-side]'); if (!box) return;
            const nS = ext.enquetePhotoAides?.suggestions ? ext.enquetePhotoAides.suggestions(this.api()).length : 0;
            const tabs = [['questions', T('Questions')], ['clues', T('Indices ({n})', {n: this.clues.length})], ['search', T('Recherches ({n})', {n: nS})], ['aides', T('Aides')]];
            box.innerHTML = `<div class="ui-tabs ep-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="${this.st.panel === k ? 'is-active' : ''}" aria-selected="${this.st.panel === k}" data-ep-panel="${k}">${esc(l)}</button>`).join('')}</div><div class="ep-panel" data-ep-pane></div>`;
            box.querySelector('.ep-tabs').onclick = e => { const b = e.target.closest('[data-ep-panel]'); if (b) { this.st.panel = b.dataset.epPanel; this.renderSide(); } };
            const pane = box.querySelector('[data-ep-pane]');
            if (this.st.panel === 'font' && ext.enquetePhotoAides?.renderFont) ext.enquetePhotoAides.renderFont(this.api(), pane);
            else if (this.st.panel === 'clues') this.renderClues(pane);
            else if (this.st.panel === 'search') ext.enquetePhotoAides ? ext.enquetePhotoAides.renderSearches(this.api(), pane) : (pane.innerHTML = '');
            else if (this.st.panel === 'aides') ext.enquetePhotoAides ? ext.enquetePhotoAides.renderAides(this.api(), pane) : (pane.innerHTML = '');
            else this.renderQuestions(pane);
        }

        /* ─── § 2 les questions guidées ─── */
        renderQuestions(pane) {
            const Q = C().QUESTIONS, marks = this.inq.settings?.marks || {}, p = prefs();
            const only = p.tenMinutes ? C().tenMinutes(this.inq) : null;
            const titles = {support: T('Le support'), dos: T('Le dos'), texte: T('Y a-t-il du texte sur l’image ?'), lieu: T('Le lieu : un bâtiment, un paysage remarquable ?'), gens: T('Les gens : habits, uniforme, décorations ?'), objets: T('Les objets : voiture, outil, affiche ?'), date: T('La date : quand a-t-elle été prise ?'), conclusion: T('Ma conclusion')};
            const done = q => C().questionDone(q, this.clues, marks);
            const cur = this.st.openQ || (Q.find(q => !done(q) && (!only || only.includes(q.k)))?.k) || 'conclusion';
            // 🗂 une photo de groupe sans verso n'a pas d'étape « dos »
            const list = Q.filter(q => (q.k !== 'dos' || this.images.some(i => i.side === 'verso') || this.images.length === 1 && /carte|postale|verso|dos/i.test(this.img?.media?.title || '') || marks.dos) && (!only || only.includes(q.k) || q.k === 'conclusion'));
            pane.innerHTML = `${ext.enquetePhotoSuite?.reopenNotice?.(this.api()) || ''}${only ? `<p class="ui-notice ep-ten">⏱ ${esc(T('Mode « 10 minutes » : les trois questions les plus utiles.'))} <button type="button" class="link-button" data-ep-ten-next>${esc(T('Photo suivante sans enquête →'))}</button></p>` : ''}
                <ol class="ep-qs">${list.map((q, i) => { const d = done(q), on = q.k === cur, sum = this.qSummary(q.k);
                    return `<li class="ep-q${on ? ' is-open' : ''}${d ? ' is-done' : ''}" data-ep-q="${q.k}"><button type="button" class="ep-qh" data-ep-qopen="${q.k}" aria-expanded="${on}"><span class="ep-qn">${d ? '✓' : i + 1}</span><span class="ep-qt">${esc(titles[q.k])}</span>${!on && sum ? `<small class="ep-qs-sum">${esc(sum)}</small>` : ''}${on && !d ? `<small class="ep-qs-sum">${esc(T('en cours'))}</small>` : ''}</button>
                        ${on ? `<div class="ep-qb">${this.qBody(q.k)}</div>` : ''}</li>`; }).join('')}</ol>
                <p class="ui-hint">${esc(T('On peut sauter une question, revenir, ou tout répondre dans le désordre.'))}</p>
                <div class="ep-qfoot">${prefs().ai && !this.ro ? `<button type="button" class="button small secondary" data-ep-ai>🤖 ${esc(T('L’IA regarde aussi'))}</button>` : ''}<button type="button" class="button small secondary" data-ep-ten>${esc(p.tenMinutes ? T('Toutes les questions') : T('⏱ Mode « 10 minutes »'))}</button>${this.ro ? '' : `<button type="button" class="button small secondary is-danger ep-qdel" data-ep-delinq>🗑 ${esc(T('Supprimer l’enquête'))}</button><button type="button" class="button small" data-ep-pause>${esc(T('Terminer pour l’instant'))}</button>`}</div>`;
            pane.onclick = e => this.qClick(e, pane);
            bindCert(pane);
            if (cur === 'conclusion') this.bindConclusion(pane);
        }
        qSummary(k) {
            const cs = this.clues.filter(c => c.kind === this.qKind(k) && c.certainty !== 'refuted');
            if (k === 'conclusion') { const c = this.inq.conclusion || {}; return [c.place?.name, c.date?.text].filter(Boolean).join(' · '); }
            if ((this.inq.settings?.marks || {})[k] && !cs.length) return T('passée');
            return cs.slice(0, 2).map(c => c.text).join(' · ');
        }
        chips(group, list) { return `<div class="ep-chipset" data-ep-chips="${group}">${list.map(c => `<button type="button" class="ep-tag" data-ep-chip="${esc(c)}" ${this.ro ? 'disabled' : ''}>${esc(T(c))}</button>`).join('')}</div>`; }
        qBody(k) {
            const X = ext.enquetePhotoAides, XP = ext.enquetePhotoPlus, roOk = ['frise', 'missing', 'journal', 'nearby', 'sisters', ...(XP?.READONLY || [])];
            const mk = (attrs, label, cls = 'button small secondary') => `<button type="button" class="${cls}" ${attrs} ${this.ro && !(/data-ep-guide/.test(attrs) || roOk.some(k => attrs.includes(`data-ep-aide="${k}"`))) ? 'disabled' : ''}>${esc(label)}</button>`;
            const plus = XP?.stepButtons ? XP.stepButtons(k, mk) : '';
            const skip = this.ro ? '' : `<button type="button" class="link-button" data-ep-skip="${k}">${esc(T('Passer cette question'))}</button>`;
            const clueList = this.clues.filter(c => c.kind === this.qKind(k)).map(c => this.clueRow(c, true)).join('');
            const head = clueList ? `<ul class="ep-clues is-mini">${clueList}</ul>` : '';
            if (k === 'support') return `<p class="ui-hint">${esc(T('Photo papier, carte postale, carte de visite… : le support donne souvent une fourchette de dates.'))}</p>${head}
                ${this.chips('support', ['Photo papier', 'Carte postale', 'Carte de visite', 'Carte cabinet', 'Daguerréotype', 'Ferrotype', 'Plaque de verre', 'Diapositive', 'Photo numérique', 'Lettre ou document'])}
                <div class="ep-row">${mk('data-ep-guide="tirages"', T('🖼 Type de tirage (guide)'))}${mk('data-ep-aide="exif"', T('🏷 Métadonnées cachées (EXIF)'))}${mk('data-ep-aide="photographe"', T('📮 Le photographe'))}${mk('data-ep-aide="recadrage"', T('✂ Recadrage d’origine'))}</div>${plus}${skip}`;
            if (k === 'dos') return `<p class="ui-hint">${esc(T('Retourne la photo : texte, tampon, cachet, timbre.'))}</p>${head}
                ${this.chips('dos', ['Dos divisé', 'Dos non divisé', 'Tampon du photographe', 'Texte au crayon', 'Texte à l’encre', 'Cachet de la poste', 'Timbre', 'Rien au dos'])}
                <div class="ep-row">${mk('data-ep-guide="cartepostale"', T('✉️ Le papier de la carte postale'))}${mk('data-ep-aide="timbre"', T('📮 Timbre et oblitération'))}${mk('data-ep-aide="ecriture"', T('✍ L’écriture au dos'))}</div>${plus}${skip}`;
            if (k === 'texte') return `<p class="ui-hint">${esc(T('Entoure chaque texte, puis recopie ce que tu lis. Un mot illisible : mets « ? ».'))}</p>${head}
                <div class="ep-row">${mk('data-ep-newtext', T('＋ Un autre texte'))}${mk('data-ep-atelier', T('📜 Lire avec l’atelier'))}${prefs().ai ? mk('data-ep-ai="texte"', T('🤖 Demander à l’IA')) : ''}${mk('data-ep-notext', T('Pas de texte'))}</div>
                <div class="ep-row">${mk('data-ep-aide="police"', T('🔤 Essayer une police'))}<small class="ui-hint">${esc(T('Une enseigne à moitié cachée : écris ce que tu crois lire, et pose-le sur la photo dans une police qui ressemble.'))}</small></div>
                <div class="ep-row">${mk('data-ep-aide="affiches"', T('🪧 Affiches et enseignes'))}${mk('data-ep-guide="panneaux"', T('🪧 Panneaux et langue'))}${mk('data-ep-guide="plaques"', T('🔢 Plaques et numéros'))}</div>${plus}${skip}`;
            if (k === 'lieu') return `<p class="ui-hint">${esc(T('Décris-le même sans savoir ce que c’est.'))}</p>${head}
                ${this.chips('lieu', ['Clocher', 'Château', 'Pont', 'Montagne', 'Mer', 'Usine', 'Gare', 'Monument aux morts', 'Place', 'Rue', 'Ferme', 'Studio de photographe'])}
                ${this.chips('lieu2', ['à bulbe', 'pointu', 'carré', 'toit d’ardoise', 'toit de tuiles'])}
                <div class="ep-row" data-ep-landmarks></div>
                <div class="ep-row">${mk('data-ep-aide="nearby"', T('📍 Mes photos proches'))}${mk('data-ep-aide="avantapres"', T('↔ Avant / après'))}${mk('data-ep-aide="horizon"', T('⛰ Ligne d’horizon'))}${mk('data-ep-aide="monument"', T('🗿 Monument aux morts'))}${mk('data-ep-aide="arbres"', T('🌳 Les arbres'))}${mk('data-ep-aide="cadastre"', T('🗺 Cadastre et vieux plans'))}${mk('data-ep-aide="hypmap"', T('🗺 Carte des hypothèses'))}</div>${plus}${skip}`;
            if (k === 'gens') return `<p class="ui-hint">${esc(T('Habits, uniforme, décorations : tu notes ce que tu vois. L’IA ne regarde jamais les visages ; « 👤 Qui est-ce ? » compare seulement, sur l’ordinateur, aux visages que tu as identifiés toi-même.'))}</p>${head}
                ${this.chips('gens', ['Coiffe', 'Chapeau', 'Uniforme', 'Décoration', 'Habit de travail', 'Brassard de deuil', 'Robe noire', 'Communion', 'Mariage', 'Conscrits', 'Photo de classe'])}
                <div class="ep-row">${mk('data-ep-guide="uniformes"', T('🎖 Uniformes (guide)'))}${mk('data-ep-guide="insignes"', T('🎖 Insignes et décorations'))}${mk('data-ep-guide="civils"', T('📯 Uniformes civils'))}${mk('data-ep-aide="mode"', T('📅 Dater par la mode'))}</div>
                <div class="ep-row">${mk('data-ep-aide="age"', T('🧒 Âge apparent'))}${mk('data-ep-aide="missing"', T('👥 Qui manque ?'))}${mk('data-ep-aide="fete"', T('🎉 La fête du jour'))}${mk('data-ep-aide="deuil"', T('🖤 Deuil'))}${mk('data-ep-aide="classe"', T('🏫 Photo de classe'))}</div>${plus}${skip}`;
            if (k === 'objets') return `<p class="ui-hint">${esc(T('Une voiture, un vélo, une affiche donnent souvent un « pas avant telle année ».'))}</p>${head}
                ${this.chips('objet', ['Voiture', 'Vélo', 'Tramway', 'Train', 'Outil', 'Affiche', 'Drapeau', 'Plaque de rue'])}
                <div class="ep-row">${mk('data-ep-guide="vehicules"', T('🚲 Véhicules (guide)'))}${mk('data-ep-guide="drapeaux"', T('🚩 Drapeaux'))}${mk('data-ep-guide="retouches"', T('🖌 Retouches anciennes'))}</div>${plus}${skip}`;
            if (k === 'date') { const w = C().dateWindow(this.clues);
                return `<p class="ui-hint">${esc(T('Chaque indice réduit la fenêtre de dates : « pas avant 1904 », « pas après 1915 ».'))}</p>${head}
                <div class="ep-frise-mini" data-ep-frise>${X ? X.friseHtml(this.api()) : esc(w.from || w.to ? `${w.from || '…'} – ${w.to || '…'}` : '')}</div>
                ${this.chips('date', ['Tampon de la poste', 'Date écrite', 'Saison : feuilles aux arbres', 'Saison : arbres nus', 'Neige', 'Gens en manteau'])}
                <div class="ep-row">${mk('data-ep-newdate', T('＋ Pas avant / pas après…'))}${mk('data-ep-aide="mode"', T('📅 Par la mode'))}${mk('data-ep-aide="shadow"', T('☀️ Par les ombres'))}${mk('data-ep-aide="lune"', T('🌙 La lune'))}${mk('data-ep-aide="meteo"', T('🌧 Météo du jour'))}${mk('data-ep-aide="exif"', T('🏷 EXIF'))}</div>${plus}${skip}`; }
            if (k === 'conclusion') return this.conclusionHtml() + plus;
            return '';
        }
        async qClick(e, pane) {
            const t = e.target;
            const qo = t.closest('[data-ep-qopen]'); if (qo) { this.st.openQ = this.st.openQ === qo.dataset.epQopen && qo.getAttribute('aria-expanded') === 'true' ? '__none' : qo.dataset.epQopen; this.renderQuestions(pane); if (this.st.openQ !== '__none') this.loadLandmarks(pane); return; }
            if (t.closest('[data-ep-ten]')) { setPrefs({tenMinutes: !prefs().tenMinutes}); this.st.openQ = ''; return this.renderQuestions(pane); }
            if (t.closest('[data-ep-ten-next]')) return ext.enquetePhotoAides?.nextUnnamed(this.api());
            if (t.closest('[data-ep-pause]')) return this.setStatus('done');
            if (t.closest('[data-ep-delinq]')) return this.remove(); // 🗑 tout de suite, ↶ Annuler la remet
            const sk = t.closest('[data-ep-skip]'); if (sk) { await this.mark(sk.dataset.epSkip); const Q = C().QUESTIONS; const i = Q.findIndex(q => q.k === sk.dataset.epSkip); this.st.openQ = Q[i + 1]?.k || 'conclusion'; return this.renderQuestions(pane); }
            const ch = t.closest('[data-ep-chip]'); if (ch && !this.ro) { const grp = ch.closest('[data-ep-chips]').dataset.epChips; return this.chipClue(grp, ch.dataset.epChip); }
            const g = t.closest('[data-ep-guide]'); if (g) return ext.enquetePhotoAides?.guide(g.dataset.epGuide, this.api());
            const a = t.closest('[data-ep-aide]'); if (a) return ext.enquetePhotoAides?.open(a.dataset.epAide, this.api());
            if (t.closest('[data-ep-newtext]')) { this.setTool('rect'); this.st.openQ = 'texte'; return toast(T('Encadre le texte sur l’image (▭), puis recopie-le.')); }
            if (t.closest('[data-ep-atelier]')) { const im = this.img; return ext.openActTranscriber ? ext.openActTranscriber({mediaId: im.media_id, filename: im.media?.filename, title: im.media?.title || ''}) : toast(T('L’Atelier de transcription n’est pas encore chargé.'), 'error'); }
            if (t.closest('[data-ep-notext]')) { await this.mark('texte'); this.st.openQ = ''; return this.renderQuestions(pane); }
            if (t.closest('[data-ep-newdate]')) return this.editClue({kind: 'date', images: {[this.img?.id]: 'yes'}});
            const ai = t.closest('[data-ep-ai]'); if (ai) return ext.enquetePhotoAides?.ai(this.api(), ai.dataset.epAi || this.st.openQ || 'lieu');
            const lm = t.closest('[data-ep-lm]'); if (lm) { const r = this.landmarks?.find(x => String(x.id) === lm.dataset.epLm); if (r) return this.editClue({kind: r.kind || 'lieu', text: T('Même repère que « {name} » ?', {name: r.label}), certainty: 'supposed', source: 'repere', place_id: r.place_id || null, images: {[this.img?.id]: 'yes'}}); }
            const cr = t.closest('[data-ep-clue]'); if (cr && !t.closest('button')) return this.openClue(this.clues.find(c => c.id === Number(cr.dataset.epClue)));
            const cm = t.closest('[data-ep-cmore]'); if (cm) return this.clueMenu(this.clues.find(c => c.id === Number(cm.dataset.epCmore)), cm);
            if (t.closest('[data-ep-apply]')) return this.applyConclusion();
            if (t.closest('[data-ep-csave]')) return this.saveConclusion(pane);
        }
        async loadLandmarks(pane) {
            const box = pane.querySelector('[data-ep-landmarks]'); if (!box) return;
            try { this.landmarks = (await get('landmarks')).landmarks || []; } catch (_) { this.landmarks = []; }
            box.innerHTML = this.landmarks.length ? `<span class="pk-lab">${esc(T('📒 Mes repères'))}</span>${this.landmarks.slice(0, 12).map(l => `<button type="button" class="ep-tag" data-ep-lm="${l.id}" ${this.ro ? 'disabled' : ''}>${esc(l.label)}${l.place_name ? ` · ${esc(l.place_name)}` : ''}</button>`).join('')}` : '';
        }
        async mark(k) { if (this.ro) return; const s = {...(this.inq.settings || {})}; s.marks = {...(s.marks || {}), [k]: 1}; this.inq.settings = s; try { await post('update', {id: this.inq.id, settings: s}); } catch (e) { toast(e.message, 'error'); } }
        /** une pastille de réponse → un indice déjà rempli (on le modifie avant de l'enregistrer) */
        chipClue(group, label) {
            const kind = {support: 'support', dos: 'dos', lieu: 'lieu', lieu2: 'lieu', gens: 'gens', objet: 'objet', date: 'date'}[group] || 'autre';
            const guide = ext.enquetePhotoAides?.chipHint?.(label) || {};
            this.editClue({kind, text: T(label), certainty: guide.certainty || 'probable', date_from: guide.from || null, date_to: guide.to || null, why: guide.why || '', url: guide.url || '', images: {[this.img?.id]: 'yes'}});
        }

        /* ─── § 3 les indices ─── */
        clueRow(c, mini = false) {
            const k = kindOf(c.kind), imgs = Object.keys(c.images || {}).map(i => this.imgById(i)).filter(Boolean);
            const seen = Object.values(c.images || {}).filter(v => v === 'yes').length;
            const up = seen >= 2 && c.certainty === 'supposed' ? `<small class="ep-up">${esc(T('vu sur {n} images : peut monter d’un cran', {n: seen}))}</small>` : '';
            const range = c.date_from || c.date_to ? ` · 📅 ${c.date_from ? esc(T('pas avant {y}', {y: c.date_from})) : ''}${c.date_from && c.date_to ? ', ' : ''}${c.date_to ? esc(T('pas après {y}', {y: c.date_to})) : ''}` : '';
            return `<li class="ep-clue${c.certainty === 'refuted' ? ' is-refuted' : ''}" data-ep-clue="${c.id}" data-ctx-menu><span class="ep-cnum">${c.num}</span><div class="ep-cbody"><b>${esc(k[1])} ${esc(c.text)}</b>
                ${mini ? '' : `<small class="muted">${esc([c.why, T(SOURCES[c.source] || ''), c.lang].filter(Boolean).join(' · '))}${range}${imgs.length > 1 || this.images.length > 1 ? ` · ${esc(T('images'))} ${imgs.map(im => esc(this.letterOf(im))).join(', ')}` : ''}</small>${c.url ? ` ${UI().extLink ? UI().extLink(c.url, '') : ''}${c.consulted_at ? ` <small class="muted">${esc(T('consulté le {d}', {d: c.consulted_at}))}</small>` : ''}` : ''}${up}`}</div>
                ${certBadge(c.certainty)}<button type="button" class="icon-button small" data-ep-cmore="${c.id}" aria-label="${esc(T('Plus d’actions'))}" title="${esc(T('Plus d’actions'))}">⋯</button></li>`;
        }
        renderClues(pane) {
            const f = this.st.clueFilter || '', all = this.clues, list = f ? all.filter(c => c.kind === f) : all;
            const n = k => all.filter(c => c.kind === k).length;
            const filt = `<div class="ui-filters ep-cfilt">${[['', T('Tous ({n})', {n: all.length})], ...KINDS.filter(k => n(k[0])).map(k => [k[0], `${k[1]} ${T(k[2])} (${n(k[0])})`])].map(([k, l]) => `<button type="button" class="${f === k ? 'is-active' : ''}" data-ep-cf="${k}">${esc(l)}</button>`).join('')}</div>`;
            const conc = this.inq.conclusion || {};
            const summary = conc.place || conc.date ? `<div class="ep-csum">${conc.place ? `<p>🗺 ${esc(T('Lieu : {name}', {name: conc.place.name || '…'}))} ${certBadge(conc.place.certainty)}</p>` : ''}${conc.date ? `<p>📅 ${esc(T('Date : {d}', {d: conc.date.text || [conc.date.from, conc.date.to].filter(Boolean).join(' – ')}))} ${certBadge(conc.date.certainty)}</p>` : ''}</div>` : '';
            pane.innerHTML = `${all.length ? filt : ''}
                ${list.length ? `<ul class="ep-clues">${list.map(c => this.clueRow(c)).join('')}</ul>` : (A().empty ? A().empty(all.length ? T('Aucun indice de cette sorte.') : T('Aucun indice pour l’instant : entoure ce que tu vois sur l’image, ou réponds aux questions.'), {icon: '🔎', action: this.ro ? null : {label: T('＋ Un indice'), attrs: 'data-empty-click="[data-ep-cnew]"'}}) : '')}
                ${this.ro ? '' : `<div class="ep-row"><button type="button" class="button small" data-ep-cnew>＋ ${esc(T('Un indice'))}</button><button type="button" class="button small secondary" data-ep-cmatrix ${this.images.length > 1 ? '' : 'hidden'}>▦ ${esc(T('Quel indice pour quelle image'))}</button></div>`}
                ${this.images.length > 1 ? `<div class="ep-matrix" data-ep-matrix>${this.matrixHtml()}</div>` : ''}
                ${summary}
                <section class="ep-hyps" data-ep-hyps>${ext.enquetePhotoAides ? ext.enquetePhotoAides.hypothesesHtml(this.api()) : ''}</section>
                <section class="ep-linksec">${this.linksHtml()}</section>`;
            pane.onclick = e => {
                const t = e.target, cf = t.closest('[data-ep-cf]'); if (cf) { this.st.clueFilter = cf.dataset.epCf; return this.renderClues(pane); }
                if (t.closest('[data-ep-cnew]')) return this.editClue({kind: f || 'autre', images: {[this.img?.id]: 'yes'}});
                if (t.closest('[data-ep-cmatrix]')) return pane.querySelector('[data-ep-matrix]')?.scrollIntoView({block: 'nearest'});
                const cell = t.closest('[data-ep-cell]'); if (cell && !this.ro) return this.toggleCell(Number(cell.dataset.epCell), Number(cell.dataset.img));
                const cm = t.closest('[data-ep-cmore]'); if (cm) return this.clueMenu(this.clues.find(c => c.id === Number(cm.dataset.epCmore)), cm);
                const li = t.closest('[data-ep-clue]'); if (li && !t.closest('button, a')) return this.openClue(this.clues.find(c => c.id === Number(li.dataset.epClue)));
                const lk = t.closest('[data-ep-link]'); if (lk) return this.openLink(this.inq.links.find(x => x.id === Number(lk.dataset.epLink)));
                const lx = t.closest('[data-ep-unlink]'); if (lx) return this.unlink(this.inq.links.find(x => x.id === Number(lx.dataset.epUnlink)));
                if (t.closest('[data-ep-linkadd]')) return this.linkMenu(t.closest('[data-ep-linkadd]'));
                if (ext.enquetePhotoAides?.hypClick(this.api(), e)) return;
            };
        }
        matrixHtml() {
            const ims = this.images, rows = C().matrix(this.clues.filter(c => c.certainty !== 'refuted' || true), ims);
            if (!rows.length) return '';
            return `<table class="ep-mx"><thead><tr><th>${esc(T('Indice'))}</th>${ims.map((im, i) => `<th title="${esc(im.label || im.media?.title || '')}">${LETTER(i)}</th>`).join('')}<th>${esc(T('Certitude'))}</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.clue.certainty === 'refuted' ? 'is-refuted' : ''}"><td>${r.clue.num} · ${esc(r.clue.text)}</td>${r.cells.map((v, i) => `<td><button type="button" class="ep-cell" data-ep-cell="${r.clue.id}" data-img="${ims[i].id}" aria-label="${esc(v === 'yes' ? T('vu sur cette image') : v === 'check' ? T('pas encore vérifié sur cette image') : T('rien sur cette image'))}" title="${esc(v === 'yes' ? T('vu sur cette image') : v === 'check' ? T('pas encore vérifié sur cette image') : T('rien sur cette image'))}" ${this.ro ? 'disabled' : ''}>${v === 'yes' ? '●' : v === 'check' ? '○' : '·'}</button></td>`).join('')}<td>${certBadge(r.clue.certainty)}</td></tr>`).join('')}</tbody></table>
                <p class="ui-hint">${esc(T('● vu sur l’image · ○ pas encore vérifié · un clic pour changer. Ce qu’on trouve sur l’une profite aux autres.'))}</p>`;
        }
        async toggleCell(cid, iid) {
            const c = this.clues.find(x => x.id === cid); if (!c) return;
            const cur = (c.images || {})[iid] || '', next = cur === '' ? 'yes' : cur === 'yes' ? 'check' : '';
            const images = {...(c.images || {})}; if (next) images[iid] = next; else delete images[iid];
            try { const r = await post('clue_save', {id: cid, images}); Object.assign(c, r.clue); this.renderSide(); } catch (e) { toast(e.message, 'error'); }
        }
        clueMenu(c, anchor) {
            if (!c) return; const X = ext.enquetePhotoAides, seen = Object.values(c.images || {}).filter(v => v === 'yes').length;
            const items = [{icon: '↗', label: T('Ouvrir'), run: () => this.openClue(c)}];
            if (!this.ro) items.push({icon: '✎', label: T('Modifier'), run: () => this.editClue(c)});
            if (!this.ro && c.certainty === 'supposed' && seen >= 2) items.push({icon: '↑', label: T('Monter d’un cran (vu sur {n} images)', {n: seen}), run: () => this.setCert(c, C().bump(c.certainty))});
            if (!this.ro && c.certainty !== 'refuted') items.push({icon: '✗', label: T('Marquer comme réfuté (reste visible, barré)'), run: () => this.setCert(c, 'refuted')});
            if (X) items.push({icon: '🧰', label: T('Chercher dans les données'), run: () => X.searchData(this.api(), c)});
            if (!this.ro && X) items.push({icon: '📒', label: T('Garder comme repère'), run: () => X.keepLandmark(this.api(), c)});
            if (ext.connexions?.take) items.push({icon: '🧺', label: T('Mettre dans le panier'), run: () => ext.connexions.take([{kind: 'text', title: `🔎 ${c.text}`, value: [T(CERT[c.certainty][0]), c.why].filter(Boolean).join(' · '), origin: {kind: 'photo_inquiry', id: this.inq.id, label: this.inq.title}}])});
            if (!this.ro) items.push('-', {icon: '🗑', label: T('Supprimer'), danger: true, run: () => this.deleteClue(c)});
            UI().menuAt?.(anchor, items, {title: `${c.num} · ${c.text.slice(0, 40)}`});
        }
        async setCert(c, cert) { const before = c.certainty; try { const r = await post('clue_save', {id: c.id, certainty: cert}); Object.assign(c, r.clue); this.renderSide(); undoToast(T('Indice {n} : {c}', {n: c.num, c: T(CERT[c.certainty][0])}), {undo: async () => { const x = await post('clue_save', {id: c.id, certainty: before}); Object.assign(c, x.clue); this.renderSide(); }}); } catch (e) { toast(e.message, 'error'); } }
        async deleteClue(c) {
            try { await post('clue_delete', {id: c.id}); } catch (e) { return toast(e.message, 'error'); }
            const im = this.images.find(x => this.layersOf(x).some(l => l.shapes.some(s => s.clue === c.id)));
            this.inq.clues = this.clues.filter(x => x.id !== c.id); this.renderSide();
            A().undoDelete ? A().undoDelete({type: 'photo_inquiry_clue', id: c.id, message: T('Indice {n} supprimé', {n: c.num}), redo: () => post('clue_delete', {id: c.id}), after: () => this.reload()}) : toast(T('Indice supprimé.'));
            if (im) this.paintShapes(im);
        }
        openClue(c) { if (!c) return; this.st.panel = 'clues'; this.renderSide(); const li = this.dlg.querySelector(`.ep-clues [data-ep-clue="${c.id}"]`); li?.scrollIntoView({block: 'nearest'}); li?.classList.add('is-flash'); setTimeout(() => li?.classList.remove('is-flash'), 1200);
            const im = this.images.find(x => this.layersOf(x).some(l => l.shapes.some(s => s.clue === c.id))); if (im && im !== this.img) { this.st.cur = this.images.indexOf(im); this.renderStrip(); this.renderStage(); this.renderLayers(); }
            const s = im && this.layersOf(im).flatMap(l => l.shapes).find(x => x.clue === c.id); if (s) setTimeout(() => this.select(s.id), 60);
            if (!this.ro) this.editClue(c); }
        /** la fenêtre d'un indice : ce qu'on voit, sa sorte, sa certitude, pourquoi, « pas avant / pas après », lieu, images */
        editClue(c0 = {}, {title = '', onSaved = null} = {}) {
            if (this.ro) return;
            const c = {kind: 'autre', text: '', certainty: 'supposed', why: '', source: 'moi', images: {}, ...c0}, isNew = !c.id;
            const P = window.LCNDA_PICKER;
            const imgs = this.images.length > 1 ? `<fieldset class="ep-fs"><legend>${esc(T('Sur quelles images ?'))}</legend>${this.images.map((im, i) => `<label class="ep-ck"><input type="checkbox" name="img_${im.id}" ${c.images?.[im.id] ? 'checked' : ''}> ${LETTER(i)} · ${esc(im.label || im.media?.title || '')}</label>`).join('')}</fieldset>` : '';
            const certs = c.source === 'ia' && !c.confirmed ? ['supposed', 'refuted'] : c.source === 'visage' ? ['probable', 'supposed', 'refuted'] : ['proven', 'probable', 'supposed', 'refuted'];
            ext.openDialog?.({eyebrow: T('🔎 INDICE'), title: title || (isNew ? T('Nouvel indice') : T('Indice {n}', {n: c.num})), submitLabel: isNew ? T('Ajouter l’indice') : T('Enregistrer'), wide: false,
                body: `<div class="form-grid one-column ep-cform">
                    <label>${esc(T('Ce que tu vois'))}<input name="text" value="${esc(c.text)}" maxlength="600" required placeholder="${esc(T('Enseigne « HÔTEL DE LA POSTE », clocher à bulbe, képi…'))}" data-error="${esc(T('Écris l’indice (ce que tu vois).'))}"></label>
                    <label>${esc(T('Sorte'))}<select name="kind">${KINDS.map(k => `<option value="${k[0]}"${c.kind === k[0] ? ' selected' : ''}>${k[1]} ${esc(T(k[2]))}</option>`).join('')}</select></label>
                    <div><span class="pk-lab">${esc(T('Sûr ?'))}</span>${certSeg('certainty', c.certainty, certs)}<p class="ui-hint">${esc(c.source === 'ia' ? T('Une réponse de l’IA ne monte jamais seule au-dessus de « Supposé ».') : c.source === 'visage' ? T('Une ressemblance de visage : « Supposé » seule, « Probable » seulement confirmée par un autre indice, jamais « Prouvé ».') : T('« Prouvé » seulement avec une trace solide : texte lu, légende au dos, tampon.'))}</p></div>
                    <label>${esc(T('Pourquoi j’y crois (ou pas)'))}<textarea name="why" rows="2" placeholder="${esc(T('Le nom de l’éditeur ne prouve pas le lieu, il le rend probable'))}">${esc(c.why)}</textarea></label>
                    <div class="ep-2"><label>${esc(T('Pas avant (année)'))}<input name="date_from" inputmode="numeric" value="${esc(c.date_from || '')}" placeholder="1904"></label><label>${esc(T('Pas après (année)'))}<input name="date_to" inputmode="numeric" value="${esc(c.date_to || '')}" placeholder="1915"></label></div>
                    ${c.kind === 'texte' || isNew ? `<label>${esc(T('Langue du texte'))}<input name="lang" value="${esc(c.lang || '')}" placeholder="${esc(T('français'))}" data-ep-lang></label><p class="ui-hint" data-ep-langhint></p>` : ''}
                    <div><span class="pk-lab">${esc(T('Lieu (si l’indice en désigne un)'))}</span>${P?.pickerField ? P.pickerField({name: 'place_id', kind: 'place', value: c.place_id || null}) : ''}</div>
                    <label>${esc(T('Lien (page trouvée, source)'))}<input name="url" value="${esc(c.url || '')}" placeholder="https://…" inputmode="url"></label>
                    ${imgs}</div>`,
                onOpen: dg => { bindCert(dg); const tx = dg.querySelector('[name=text]'), lg = dg.querySelector('[data-ep-lang]'), hint = dg.querySelector('[data-ep-langhint]');
                    const guess = () => { if (!lg || !hint) return; const g = ext.enquetePhotoAides?.guessLang?.(tx.value); hint.textContent = g ? T('Langue : {l} · probable (mots {w})', {l: T(g.lang), w: g.words.map(w => `« ${w} »`).join(', ')}) : ''; if (g && !lg.value) lg.placeholder = T(g.lang); };
                    tx.addEventListener('input', guess); guess(); setTimeout(() => tx.focus(), 30); },
                onSubmit: async f => {
                    const v = A().formObject ? A().formObject(f) : Object.fromEntries(new FormData(f));
                    const images = {}; if (this.images.length > 1) this.images.forEach(im => { if (f.elements[`img_${im.id}`]?.checked) images[im.id] = c.images?.[im.id] === 'check' ? 'check' : 'yes'; }); else if (this.img) images[this.img.id] = 'yes';
                    const lang = v.lang || (f.elements.lang && !v.lang ? (ext.enquetePhotoAides?.guessLang?.(v.text)?.lang ? T(ext.enquetePhotoAides.guessLang(v.text).lang) : '') : '');
                    const body = {id: c.id || 0, inquiry_id: this.inq.id, text: v.text, kind: v.kind, certainty: f.elements.certainty?.value || c.certainty, why: v.why, date_from: v.date_from || null, date_to: v.date_to || null,
                        place_id: Number(v.place_id) || null, url: v.url, images, source: c.source || 'moi', shape_id: c.shape_id || '', lang: lang || c.lang || '', data: c.data || {}, consulted_at: c.consulted_at || (c.url !== v.url && v.url ? new Date().toISOString().slice(0, 10) : c.consulted_at || ''), confirmed: c.confirmed ? 1 : 0};
                    const r = await post('clue_save', body);
                    if (isNew) this.inq.clues = [...this.clues, r.clue]; else Object.assign(this.clues.find(x => x.id === c.id) || {}, r.clue);
                    onSaved?.(r.clue); this.renderSide(); this.refreshCount();
                    if (isNew) undoToast(T('Indice {n} ajouté', {n: r.clue.num}), {undo: async () => { await post('clue_delete', {id: r.clue.id}); await this.reload(); }});
                }});
        }
        refreshCount() { const el = this.dlg.querySelector('.ep-count'); if (el) el.textContent = `${plural(this.images.length, 'image')} · ${plural(this.clues.length, 'indice')}`; }
        /** ajouté par une aide : enregistré tout de suite (+ ↶ Annuler) */
        async addClue(o) {
            if (this.ro) return null;
            try { const r = await post('clue_save', {inquiry_id: this.inq.id, images: {[this.img?.id]: 'yes'}, ...o}); this.inq.clues = [...this.clues, r.clue]; this.renderSide(); this.refreshCount();
                undoToast(T('Indice {n} ajouté', {n: r.clue.num}), {undo: async () => { await post('clue_delete', {id: r.clue.id}); await this.reload(); }}); return r.clue; }
            catch (e) { toast(e.message, 'error'); return null; }
        }

        /* ─── la conclusion ─── */
        conclusionHtml() {
            const c = this.inq.conclusion || {}, P = window.LCNDA_PICKER, w = C().dateWindow(this.clues);
            const placeClues = this.clues.filter(x => x.kind === 'lieu' || x.place_id);
            const pour = placeClues.filter(x => ['proven', 'probable'].includes(x.certainty)).length, check = placeClues.filter(x => x.certainty === 'supposed').length, contre = placeClues.filter(x => x.certainty === 'refuted').length;
            const miss = C().missing(this.inq).map(m => ext.enquetePhotoAides?.missingText?.(m)).filter(Boolean);
            return `<div class="ep-conc">
                <div><span class="pk-lab">🗺 ${esc(T('Lieu'))}</span>${P?.pickerField ? P.pickerField({name: 'c_place', kind: 'place', value: c.place?.place_id || null}) : ''}${certSeg('c_pcert', c.place?.certainty || 'probable')}
                    <label>${esc(T('Pourquoi'))}<input name="c_pwhy" value="${esc(c.place?.why || '')}" ${this.ro ? 'readonly' : ''}></label>
                    <p class="ui-hint">${esc(T('Pour : {a} · À vérifier : {b} · Contre : {c}.', {a: pour, b: check, c: contre}))}</p></div>
                <div><span class="pk-lab">📅 ${esc(T('Date'))}</span><input name="c_date" value="${esc(c.date?.text || (w.from || w.to ? T('entre {a} et {b}', {a: w.from || '…', b: w.to || '…'}) : ''))}" placeholder="${esc(T('vers 1910, entre 1905 et 1915…'))}" data-ep-cdate ${this.ro ? 'readonly' : ''}><small class="ui-hint" data-ep-cdate-ok></small>${certSeg('c_dcert', c.date?.certainty || 'probable')}
                    <label>${esc(T('Pourquoi'))}<input name="c_dwhy" value="${esc(c.date?.why || w.steps.map(s => `${s.text}${s.from ? ` (${T('après {y}', {y: s.from})})` : ''}${s.to ? ` (${T('avant {y}', {y: s.to})})` : ''}`).join(' · '))}" ${this.ro ? 'readonly' : ''}></label></div>
                ${miss.length ? `<p class="ui-notice">❓ ${esc(T('Pour aller plus loin :'))} ${miss.map(esc).join(' ')}</p>` : ''}
                ${ext.enquetePhotoSuite?.becauseHtml?.(this.api()) || ''}
                ${this.ro ? '' : `<div class="ep-row"><button type="button" class="button small secondary" data-ep-csave>✎ ${esc(T('Enregistrer la conclusion'))}</button><button type="button" class="button small" data-ep-apply>📍 ${esc(T('Mettre ce lieu sur la photo'))}</button></div>
                <p class="ui-hint">${esc(T('« Mettre ce lieu sur la photo » remplit le lieu et la date de l’image, avec la certitude et un lien vers l’enquête comme source. ↶ Annuler.'))}</p>`}
                <div data-ep-linksmini>${this.linksHtml()}</div></div>`;
        }
        bindConclusion(pane) {
            const d = pane.querySelector('[data-ep-cdate]'), ok = pane.querySelector('[data-ep-cdate-ok]');
            const show = () => { if (!d || !ok) return; const r = d.value.trim() && UI().readDate ? UI().readDate(d.value) : null; ok.textContent = r ? (r.ok ? `✓ ${T('Compris : {d}', {d: r.label})}` : `⚠️ ${r.text || ''}`) : ''; };
            d?.addEventListener('input', show); show();
        }
        collectConclusion(pane) {
            const v = n => pane.querySelector(`[name="${n}"]`)?.value || '';
            const pid = Number(v('c_place')) || null, dateText = v('c_date').trim(), y = C().yearOf(dateText);
            const nums = (dateText.match(/\b1[5-9]\d\d|20\d\d\b/g) || []).map(Number);
            const conc = {...(this.inq.conclusion || {})};
            conc.place = pid ? {place_id: pid, certainty: v('c_pcert') || 'probable', why: v('c_pwhy')} : null;
            conc.date = dateText ? {text: dateText, from: nums.length ? Math.min(...nums) : y, to: nums.length ? Math.max(...nums) : y, certainty: v('c_dcert') || 'probable', why: v('c_dwhy')} : null;
            if (!conc.place) delete conc.place; if (!conc.date) delete conc.date;
            return conc;
        }
        async saveConclusion(pane) {
            const before = this.inq.conclusion || {}, conc = this.collectConclusion(pane);
            try { const r = await post('conclusion', {id: this.inq.id, conclusion: conc, because: Number(pane.querySelector('[name="c_because"]')?.value) || 0}); this.inq.conclusion = r.conclusion; await this.reload(); undoToast(T('Conclusion enregistrée'), {undo: async () => { await post('conclusion', {id: this.inq.id, conclusion: before}); await this.reload(); }}); return true; }
            catch (e) { toast(e.message, 'error'); return false; }
        }
        async applyConclusion() {
            const pane = this.dlg.querySelector('[data-ep-pane]'); if (pane?.querySelector('[name="c_date"]') && !(await this.saveConclusion(pane))) return;
            try { const r = await post('apply', {id: this.inq.id});
                undoToast(T('Lieu et date mis sur {n}', {n: plural(r.n, 'image')}), {icon: '📍', undo: async () => { await post('unapply', {token: r.token}); await this.reload(); }}); await this.reload(); }
            catch (e) { toast(e.message, 'error'); }
        }

        /* ─── § 7 relier ─── */
        linksHtml() {
            const L = this.inq.links || [], icon = {person: '👤', place: '📍', event: '📅', investigation: '🕵️', source: '📚', board: '🧩'};
            return `<span class="pk-lab">${esc(T('Relier à…'))}</span><div class="ep-links">${L.map(l => `<span class="ep-link"><button type="button" class="link-button" data-ep-link="${l.id}">${icon[l.kind] || '•'} ${esc(l.label)}</button>${this.ro ? '' : `<button type="button" class="icon-button small" data-ep-unlink="${l.id}" aria-label="${esc(T('Retirer'))}" title="${esc(T('Retirer'))}">×</button>`}</span>`).join('')}${this.ro ? '' : `<button type="button" class="button small secondary" data-ep-linkadd>🔗 ${esc(T('Relier…'))}</button>`}</div>`;
        }
        linkMenu(anchor) {
            const P = window.LCNDA_PICKER, pick = async (kind, label) => {
                const it = P?.openPicker ? await P.openPicker({kind, title: label}) : null; if (!it || !Number(it.id)) return;
                try { const r = await post('link_save', {inquiry_id: this.inq.id, kind, ref_id: Number(it.id)}); this.inq.links = r.links; this.renderSide(); undoToast(T('Enquête reliée'), {undo: async () => { await post('link_delete', {id: r.id}); await this.reload(); }}); } catch (e) { toast(e.message, 'error'); }
            };
            const items = [['person', '👤', T('Une personne')], ['place', '📍', T('Un lieu')], ['event', '📅', T('Un événement')], ['investigation', '🕵️', T('Une enquête')], ['source', '📚', T('Une source')], ['board', '🧩', T('Un tableau')]].map(([k, i, l]) => ({icon: i, label: l, run: () => pick(k, l)}));
            if (ext.connexions?.putInto) items.push('-', {icon: '🧺', label: T('Un panier précis…'), run: () => ext.connexions.putInto([{kind: 'text', title: `🔎 ${this.inq.title}`, value: this.summaryText(), origin: {kind: 'photo_inquiry', id: this.inq.id, label: this.inq.title}}], {anchor})});
            if (ext.sendTo && this.img?.media) items.push({icon: '📍', label: T('Mettre dans… (retouche, mise en page, présentation)'), run: () => ext.sendTo('image', {media: {id: this.img.media_id, filename: this.img.media.filename, title: this.img.media.title}}, {anchor, exclude: ['enquete-photo']})});
            UI().menuAt?.(anchor, items, {title: T('Relier à… plusieurs choix possibles')});
        }
        summaryText() { const c = this.inq.conclusion || {}; return [c.place?.name && `${T('Lieu')} : ${c.place.name} (${T(CERT[c.place.certainty]?.[0] || '')})`, c.date?.text && `${T('Date')} : ${c.date.text}`, plural(this.clues.length, 'indice')].filter(Boolean).join(' · '); }
        async unlink(l) { if (!l) return; try { const r = await post('link_delete', {id: l.id}); await this.reload(); undoToast(T('Lien retiré'), {undo: async () => { await post('link_save', {inquiry_id: this.inq.id, kind: r.row.kind, ref_id: r.row.ref_id}); await this.reload(); }}); } catch (e) { toast(e.message, 'error'); } }
        openLink(l) {
            if (!l || !l.ref_id) return; const a = A();
            if (l.kind === 'person') { this.dlg.close(); return a.openPersonById?.(l.ref_id) || a.selectPerson?.(l.ref_id); }
            if (l.kind === 'place') return ext.openPlace ? ext.openPlace(l.ref_id) : null;
            if (l.kind === 'investigation') { this.dlg.close(); return ext.openInvestigation ? ext.openInvestigation(l.ref_id) : a.setModule?.('enquetes'); }
            if (l.kind === 'board') return ext.openBoard?.(l.ref_id);
            toast(l.label);
        }

        /** ce que les aides reçoivent : l'enquête et de quoi agir dessus */
        api() {
            const self = this;
            return {get inq() { return self.inq; }, get img() { return self.img; }, get images() { return self.images; }, get clues() { return self.clues; }, get ro() { return self.ro; }, get privacy() { return self.privacy; }, dlg: self.dlg,
                letterOf: im => self.letterOf(im), layersOf: im => self.layersOf(im), composite: (im, o) => self.composite(im, o), addClue: o => self.addClue(o), editClue: (c, o) => self.editClue(c, o), reload: () => self.reload(), render: () => self.renderSide(),
                setTool: t => self.setTool(t), setPanel: k => { self.st.panel = k; self.renderSide(); }, paint: (im = self.img) => self.paintShapes(im), viewOf: im => self.viewOf(im), change: (im, fn) => self.change(im, fn), get: (op, q) => get(op, {id: self.inq.id, ...q}), post: (op, b) => post(op, b), mediaSrc, prefs, certBadge, CERT, KINDS, SOURCES, open: (id, o) => open(id, o), create, mark: k => self.mark(k), get t0() { return self.t0; }, betterSee: o => self.betterSee(o)};
        }
    }

    /* ═════════════════════════ LES PORTES D'ENTRÉE (§ 1) ═════════════════════════ */
    /** la page d'un document : le bouton dit où en est l'enquête (« 🔎 Enquête · 5 indices · lieu probable ») */
    async function decorate(root = document) {
        const btns = [...root.querySelectorAll('[data-ep-media]')]; if (!btns.length) return;
        for (const b of btns) {
            const id = Number(b.dataset.epMedia); if (!id || b.dataset.epDone === String(id)) continue; b.dataset.epDone = String(id);
            let list = []; try { list = (await get('media', {media_id: id})).inquiries || []; } catch (_) {}
            if (!list.length) { if (kiosk()) b.hidden = true; continue; }
            const q = list[0], cp = q.conclusion?.place;
            b.textContent = [`🔎 ${T('Enquête')}`, plural(q.n_clues, 'indice'), cp?.certainty ? T('lieu {c}', {c: T(CERT[cp.certainty]?.[0] || '').toLowerCase()}) : ''].filter(Boolean).join(' · ');
            b.title = list.length > 1 ? T('{n} enquêtes sur cette image : choisir laquelle rouvrir', {n: list.length}) : T('Rouvrir l’enquête où on en était');
        }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ep-media]'); if (!b) return;
        e.preventDefault(); forMedia([Number(b.dataset.epMedia)], {anchor: document.querySelectorAll('[data-ep-media]').length && b.textContent.includes('·') ? null : null, title: b.dataset.epTitle || ''});
    });
    /** la visionneuse (Listes → Médias) : « 🔎 Enquêter » à côté de « 📜 Atelier » */
    function lightboxButton() {
        const at = document.getElementById('act-transcriber-open'); if (!at || document.getElementById('ep-lightbox-open')) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary'; b.id = 'ep-lightbox-open'; b.textContent = `🔎 ${T('Enquêter')}`; b.title = T('🔎 Enquête photo : relever les indices (lieu, date, uniformes, texte…)');
        at.after(b);
        b.addEventListener('click', () => { const S = A().state, it = S?.lightboxMedia?.[S.lightboxIndex]; if (!it) return; forMedia([Number(it.id)], {anchor: b, title: it.title || ''}); });
    }
    /** le clic droit sur n'importe quelle image de l'app (fiche, cartes postales, trésors, recueils, tableaux…) */
    function ctxImage(e) {
        const img = e.target.closest?.('img'); if (!img) return [];
        const src = img.getAttribute('src') || '', m = /(?:^|\/)media\/([^?#"]+)/.exec(src); if (!m) return [];
        if (img.closest('dialog.ep-dlg')) return [];
        const file = decodeURIComponent(m[1]); const known = counts?.files?.[file];
        return [{icon: '🔎', label: known ? T('Enquête photo…') : T('Enquêter sur cette photo…'), inEditor: true, run: async () => {
            let id = known || Number(img.closest('[data-media-id]')?.dataset.mediaId || img.dataset.mediaId || 0);
            if (!id) { try { id = Number((await get('by_file', {file})).media?.id || 0); } catch (_) {} }
            if (!id) return toast(T('Cette image n’est pas dans les médias de la généalogie.'), 'error');
            forMedia([id], {anchor: {x: e.clientX, y: e.clientY}});
        }}];
    }
    ctxImage._ep = true;
    const UIr = window.LCNDA_UI = window.LCNDA_UI || {};
    if (!(UIr.ctxExtras || []).some(f => f._ep)) (UIr.ctxExtras = UIr.ctxExtras || []).push(ctxImage);
    /** 📤 Envoyer vers… / 📍 Mettre dans… */
    (ext.sendTargets = ext.sendTargets || []);
    const target = {key: 'enquete-photo', icon: '🔎', label: 'Dans une enquête photo', group: 'Enquête photo', kinds: ['image', 'images'], ready: () => !kiosk(),
        run: (k, d) => forMedia(k === 'images' ? d.medias.map(m => m.id) : [d.media.id])};
    const putTarget = () => { const L = ext.sendTargets; if (Array.isArray(L) && !L.some(t => t.key === 'enquete-photo')) L.push(target); };
    putTarget(); setTimeout(putTarget, 0);
    /** 🧺 le panier → une enquête : les images du panier */
    (ext.dropTargets = ext.dropTargets || []).push({id: 'enquete_photo', icon: '🔎', label: 'Enquête photo', group: 'Chercher', kinds: ['media'],
        here: () => (tool ? {label: T('Ici : l’enquête « {name} »', {name: tool.inq.title}), id: tool.inq.id} : null),
        choose: async () => ({id: 0, label: T('Une nouvelle enquête photo')}),
        explain: (items, ctx) => (ctx?.id ? T('les images dans l’enquête') : T('une nouvelle enquête avec ces images')),
        receive: async (items, ctx) => {
            const ids = items.filter(i => i.kind === 'media').map(i => Number(i.ref_id)).filter(Boolean);
            if (ctx?.id && tool) { await tool.addImages(ids); return {message: T('{n} dans l’enquête', {n: plural(ids.length, 'image')})}; }
            const r = await post('create', {media_ids: ids}); open(r.id);
            return {message: T('Enquête photo commencée'), undo: async () => { await post('delete', {id: r.id}); document.querySelector('dialog.ep-dlg')?.close(); }};
        }});
    /** Listes → Outils de modification → 🔎 Enquête photo (les enquêtes, ＋ Nouvelle, 🧱 Mur des photos sans nom, 🎓 Exercice) */
    const listeners = new Set();
    function refreshLists() { listeners.forEach(f => { try { f(); } catch (_) {} }); }
    (ext.editToolsExtra = ext.editToolsExtra || []).push({key: 'enquete_photo', icon: '🔎', label: 'Enquête photo', what: 'enquête',
        load: async () => ((await get('list')).inquiries || []).map(q => ({id: q.id, name: q.title, date: q.updated_at, thumb: q.thumb ? `<img src="${esc(mediaSrc({filename: q.thumb}))}" alt="">` : '<span class="h-et-ico">🔎</span>',
            info: [plural(q.n_images, 'image'), plural(q.n_clues, 'indice'), q.place?.name ? `🗺 ${q.place.name}` : '', q.date?.text ? `📅 ${q.date.text}` : '', q.status === 'done' ? T('terminée pour l’instant') : '', (q.reopen || []).length ? `🔔 ${T('Du nouveau')} : ${q.reopen[0].label}` : ''].filter(Boolean).join(' · ')})),
        open: (id, again) => { listeners.add(again); return open(id, {onClose: again}); },
        create: async again => { listeners.add(again); const P = window.LCNDA_PICKER; const it = await P?.openMediaPicker?.({multiple: true, eyebrow: T('🔎 ENQUÊTE PHOTO'), title: T('Sur quelles images enquêter ?')}); if (it && it.length) { await create(it.map(x => x.id)); again?.(); } },
        rename: (id, name) => post('update', {id, title: name}),
        remove: async id => { await post('delete', {id}); return {undo: () => A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'photo_inquiry', entity_id: id}})}; }, undo: true,
        createLabel: '＋ Nouvelle enquête photo',
        get extra() { return `<button type="button" class="button secondary" data-et-x="wall">🧱 ${esc(T('Mur des photos sans nom'))}</button><button type="button" class="button secondary" data-et-x="exercice">🎓 ${esc(T('Exercice'))}</button><button type="button" class="button secondary" data-et-x="photographes">📮 ${esc(T('Photographes'))}</button><button type="button" class="button secondary" data-et-x="reperes">📒 ${esc(T('Repères'))}</button>`; },
        onExtra: (k, again) => { listeners.add(again); return ext.enquetePhotoAides?.openGlobal(k, {open, create, again}); }});
    /** 🔎 « Ce qui le concerne » : sur la fiche d'une personne et la page d'un lieu */
    const summaryLine = q => `<li><button type="button" class="link-button" data-ep-open="${q.id}">🔎 ${esc(q.title)}</button> <small class="muted">${esc([plural(q.n_clues, 'indice'), q.place?.name ? T('lieu {c} : {name}', {c: T(CERT[q.place.certainty]?.[0] || '').toLowerCase(), name: q.place.name}) : '', q.date?.text || ''].filter(Boolean).join(' · '))}</small></li>`;
    (ext.dataSources = ext.dataSources || []).push(
        {id: 'enquete_photo_personne', icon: '🔎', label: 'Enquêtes photo', group: 'La personne', needs: ['person'], online: false, installed: () => true,
            run: async (ctx, host) => { const pid = Number(ctx?.person?.id ?? ctx?.person ?? 0); if (!pid || !host) return false; let r; try { r = await get('person', {person_id: pid}); } catch (_) { return false; }
                const L = r.inquiries || []; if (!L.length) { host.innerHTML = ''; return false; } host.innerHTML = `<p>${esc(T('🔎 {n}', {n: plural(L.length, 'enquête photo', 'enquêtes photo')}))}</p><ul class="ep-ds">${L.map(summaryLine).join('')}</ul>`; return true; }},
        {id: 'enquete_photo_lieu', icon: '🔎', label: 'Photos de ce lieu et leurs enquêtes', group: 'Le lieu', needs: ['place'], online: false, installed: () => true,
            run: async (ctx, host) => { const plid = Number(ctx?.place?.id ?? ctx?.place?.place_id ?? 0); if (!plid || !host) return false; let r; try { r = await get('place', {place_id: plid}); } catch (_) { return false; }
                const L = r.inquiries || []; if (!L.length) { host.innerHTML = A().empty ? A().empty(T('Aucune enquête photo sur ce lieu.'), {icon: '🔎'}) : ''; return false; } host.innerHTML = `<ul class="ep-ds">${L.map(summaryLine).join('')}</ul>`; return true; }});
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-ep-open]'); if (b && !b.closest('dialog.ep-dlg')) { e.preventDefault(); open(Number(b.dataset.epOpen)); } });

    /** 🔎 N : la pastille des images qui ont une enquête (Documents, médias, fenêtre des images, cartes postales…) */
    const PILL_HOSTS = '.ong-docrow, [data-ong-card], .media-card, .media-tile, .media-thumb, .mpk-tile, .ui-card, .h-pcard, .h-tr-card';
    let pillT = 0;
    function decorateAll() {
        if (!counts) return;
        document.querySelectorAll(PILL_HOSTS).forEach(host => {
            const img = host.querySelector('img[src*="media/"]'); let id = Number(host.dataset.ongDoc || host.dataset.mediaId || host.querySelector('[data-ong-doc]')?.dataset.ongDoc || 0);
            if (!id && img) { const m = /media\/([^?#"]+)/.exec(img.getAttribute('src') || ''); if (m) id = Number(counts.files[decodeURIComponent(m[1])] || 0); }
            const n = id ? countFor(id) : 0, old = host.querySelector(':scope > .ep-pill, :scope .ep-pill');
            if (!n) { old?.remove(); return; }
            if (old) { old.textContent = `🔎 ${n}`; return; }
            const p = document.createElement('span'); p.className = 'ep-pill'; p.textContent = `🔎 ${n}`; p.title = T('{n} sur cette image', {n: plural(n, 'enquête photo', 'enquêtes photo')}); p.setAttribute('aria-label', p.title);
            if (getComputedStyle(host).position === 'static') host.classList.add('ep-pill-host');
            host.appendChild(p);
        });
    }
    const mo = new MutationObserver(() => { clearTimeout(pillT); pillT = setTimeout(() => { if (counts && Object.keys(counts.by).length) decorateAll(); lightboxButton(); const ws = document.getElementById('workspace'); if (ws) decorate(ws); }, 180); });
    const boot = () => { mo.observe(document.body, {childList: true, subtree: true}); lightboxButton(); setTimeout(() => loadCounts().then(decorateAll), 1500); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true}); else boot();

    ext.enquetePhoto = {open, create, forMedia, decorate, decorateAll, loadCounts, get current() { return tool; }, prefs, setPrefs, KEY, _get: get, _post: post};
})();
