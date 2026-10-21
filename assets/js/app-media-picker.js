/* LCNDA — 🖼 La fenêtre unique pour choisir une image, un son ou une vidéo de la base (maquette validée docs/design/choix-image.html).
 * Mode d'emploi : docs/PICKER.md (« Choisir une image »). Recherche côté serveur : lib/picker.php (picker_search, kind=media).
 *
 *   item  = await LCNDA_PICKER.openMediaPicker({types: ['image']})                 → un média ou null
 *   items = await LCNDA_PICKER.openMediaPicker({multiple: true, person: 12})       → liste (vide si rien) ou null (Annuler)
 *   html  = LCNDA_PICKER.mediaField({name: 'media_id', person: 12})                → pastille du champ, se lie toute seule
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const plural = (n, one, many) => { try { if (A().plural) return A().plural(n, one, many); } catch (_) {} return `${n} ${n > 1 ? (many || one + 's') : one}`; };
    const toast = (msg, type) => { try { (A().toast || (m => console.info(m)))(msg, type); } catch (_) {} };
    const num = n => Number(n || 0).toLocaleString('fr-FR');
    const TYPES = ['image', 'audio', 'video', 'document'];
    const mediaUrl = f => `media/${encodeURIComponent(f || '')}`;

    // ── petites mémoires du navigateur (taille des vignettes, médias choisis dernièrement) ──
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    };
    const SIZE_KEY = 'lcnda-media-picker-size', RECENT_KEY = 'lcnda-media-picker-recent';
    const recentIds = () => (store.get(RECENT_KEY, []) || []).filter(n => Number(n) > 0).slice(0, 40);
    const remember = items => store.set(RECENT_KEY, [...new Set([...items.map(it => Number(it.id)), ...recentIds()])].slice(0, 40));

    // ── appels au serveur ──
    async function search(params) {
        if (A().api) return A().api('picker_search', params);
        const url = new URL('api.php', location.href); url.searchParams.set('action', 'picker_search');
        Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && url.searchParams.set(k, v));
        const r = await fetch(url, {headers: {Accept: 'application/json'}}); const d = await r.json(); if (d.error) throw new Error(d.error); return d;
    }
    const itemsOf = d => (d.groups || []).flatMap(g => g.items || []);
    /** Relit des médias dont on n'a que le numéro. */
    async function loadMedia(ids, withText = false) {
        ids = [...new Set(ids.map(Number).filter(n => n > 0))]; if (!ids.length) return [];
        try { return itemsOf(await search({kind: 'media', ids: ids.join(','), ...(withText ? {with_text: 1} : {})})); } catch (_) { return []; }
    }
    const PEOPLE = new Map();
    async function loadPeople(ids) {
        const todo = ids.filter(id => !PEOPLE.has(id)); if (todo.length) { try { itemsOf(await search({kind: 'person', ids: todo.join(',')})).forEach(p => PEOPLE.set(Number(p.id), p)); } catch (_) {} todo.forEach(id => PEOPLE.has(id) || PEOPLE.set(id, null)); }
        return ids.map(id => PEOPLE.get(id)).filter(Boolean);
    }

    /** Envoie un fichier de l'ordinateur dans les médias (même envoi que la retouche : api.php?action=retouch_media). */
    async function importFile(file, types) {
        const kind = /^audio\//.test(file.type) ? 'audio' : /^video\//.test(file.type) ? 'video' : /^image\//.test(file.type) ? 'image' : '';
        if (!kind) throw new Error(`« ${file.name || 'Ce fichier'} » n’est ni une image, ni un son, ni une vidéo.`);
        if (!types.includes(kind)) throw new Error(`Ici, il faut ${types.includes('image') ? 'une image' : types.includes('audio') ? 'un son' : 'une vidéo'}.`);
        const csrf = A().state?.csrf || '', title = String(file.name || '').replace(/\.[^.]+$/, '') || (kind === 'image' ? 'Image collée' : 'Fichier importé');
        const fd = new FormData(); fd.append('file', file, file.name || `image-${Date.now()}.png`); fd.append('kind', kind); fd.append('title', title); fd.append('csrf', csrf);
        if (kind !== 'image') { const d = await avDuration(file); if (d) fd.append('duration', String(d)); }
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': csrf}});
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
        const id = Number(j.result?.media_id), [it] = await loadMedia([id]);
        return it || {kind: 'media', id, title, filename: j.result?.filename || '', thumbnail: kind === 'image' ? j.result?.filename || '' : '', media_type: kind, thumb: kind === 'image' ? mediaUrl(j.result?.filename) : '', tag: kind === 'image' ? 'PHOTO' : kind === 'audio' ? 'SON' : 'VIDÉO', sort: kind === 'image' ? 'photo' : kind};
    }
    function avDuration(file) {
        return new Promise(res => { try { const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio'), u = URL.createObjectURL(file); el.preload = 'metadata'; el.onloadedmetadata = () => { URL.revokeObjectURL(u); res(Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : 0); }; el.onerror = () => res(0); el.src = u; setTimeout(() => res(0), 4000); } catch (_) { res(0); } });
    }

    // ── petits morceaux de rendu ──
    const dur = s => { s = Math.round(Number(s) || 0); if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
    const isAV = it => it.media_type === 'audio' || it.media_type === 'video';
    const SORT_LABEL = {photo: 'Photo', document: 'Document', audio: 'Son', video: 'Vidéo'};
    /** Ligne grise d'une vignette : « année · lieu », sinon la cote. */
    const tileSub = it => [it.year, it.place].filter(Boolean).join(' · ') || it.cote || (isAV(it) ? SORT_LABEL[it.sort] || '' : '');
    function markText(text, q) {
        text = String(text ?? ''); const fq = fold(q).trim(); if (fq.length < 2) return esc(text);
        const i = fold(text).indexOf(fq); if (i < 0) return esc(text);
        const chars = [...text]; return esc(chars.slice(0, i).join('')) + '<mark>' + esc(chars.slice(i, i + fq.length).join('')) + '</mark>' + esc(chars.slice(i + fq.length).join(''));
    }
    function visual(it, cls = 'mpk-im') {
        if (it.media_type === 'video' && it.filename && !it.thumb) return `<span class="${cls} av"><video src="${esc(mediaUrl(it.filename))}#t=0.5" preload="metadata" muted playsinline tabindex="-1"></video><span class="mpk-play" aria-hidden="true">▶</span>${it.duration ? `<span class="mpk-dur">${esc(dur(it.duration))}</span>` : ''}</span>`;
        if (isAV(it)) return `<span class="${cls} av${it.thumb ? '' : ' snd'}"${it.thumb ? ` style="background-image:url('${esc(it.thumb)}')"` : ''}>${it.thumb ? '' : '<span class="mpk-note" aria-hidden="true">♪</span>'}<span class="mpk-play" aria-hidden="true">▶</span>${it.duration ? `<span class="mpk-dur">${esc(dur(it.duration))}</span>` : ''}</span>`;
        if (it.thumb) return `<span class="${cls}"><img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async"></span>`;
        return `<span class="${cls} doc"><span aria-hidden="true">${esc(it.icon || '📄')}</span></span>`;
    }
    /** Taille d'impression à 300 ppp : A4, A5, A6, sinon écran seulement. */
    function printFit(w, h) {
        const L = Math.max(w, h), S = Math.min(w, h);
        for (const [f, l, s] of [['A4', 3508, 2480], ['A5', 2480, 1748], ['A6', 1748, 1240]]) if (L >= l && S >= s) return `assez grande pour imprimer en ${f}`;
        return 'petite : écran seulement';
    }

    /** Les médias d'une liste de types, pour les textes : « image », « son », « média »… */
    function nouns(types) {
        if (types.length === 1) return {image: ['image', 'images', true], audio: ['son', 'sons', false], video: ['vidéo', 'vidéos', true], document: ['document', 'documents', false]}[types[0]];
        return ['média', 'médias', false];
    }
    const chosenWord = (n, fem) => `${num(n)} ${fem ? (n > 1 ? 'choisies' : 'choisie') : (n > 1 ? 'choisis' : 'choisi')}`;

    // ═══════════════ la fenêtre ═══════════════
    function openMediaPicker(o = {}) {
        return new Promise(resolve => {
            const types = (Array.isArray(o.types) ? o.types : o.types ? String(o.types).split(',') : ['image']).map(t => String(t).trim()).filter(t => TYPES.includes(t));
            if (!types.length) types.push('image');
            const multiple = !!o.multiple, allowImport = o.allowImport !== false && types.some(t => t !== 'document');
            const [one, many, fem] = nouns(types);
            const title = o.title || (multiple ? `Choisir des ${many}` : `Choisir ${fem ? 'une' : 'un'} ${one}`);
            const flags = o.flags ? [['notr', '📝 Pas encore transcrites'], ['tr', '✅ Déjà transcrites'], ['sig', '✍ Avec une signature repérée']] : [];
            const personIn = o.person && typeof o.person === 'object' ? o.person : Number(o.person) > 0 ? {id: Number(o.person), title: ''} : null;
            const st = {q: '', sort: 'all', person: personIn, personOn: !!personIn, recent: false, portraits: !!o.portraits, flag: flags.some(f => f[0] === o.flag) ? o.flag : '',
                size: ['big', 'small', 'list'].includes(store.get(SIZE_KEY, 'big')) ? store.get(SIZE_KEY, 'big') : 'big',
                items: [], total: 0, counts: null, more: false, next: 0, loading: false, seq: 0, active: -1, chosen: new Map(), imported: [], timer: 0};
            (Array.isArray(o.value) ? o.value : o.value ? [o.value] : []).forEach(v => { const id = Number(typeof v === 'object' ? v.id : v); if (id > 0) st.chosen.set(id, typeof v === 'object' ? v : {id}); });

            const d = document.createElement('dialog'); d.className = 'modal mpk-dialog';
            d.setAttribute('aria-label', title);
            d.innerHTML = `<div class="mpk-head"><div><span class="eyebrow">${esc(o.eyebrow || 'MÉDIAS DE L’APP')}</span><h2>${esc(/^\p{Extended_Pictographic}/u.test(title) ? title : `${types.length === 1 && types[0] === 'audio' ? '🎧' : types.length === 1 && types[0] === 'video' ? '🎬' : '🖼'} ${title}`)}</h2>${o.intro ? `<p class="mpk-intro">${esc(o.intro)}</p>` : ''}</div><button type="button" class="icon-button" data-mp="close" aria-label="Fermer" data-ia-done="1">×</button></div>
                <div class="mpk-bar"><div class="pk mpk-search"><div class="pk-box"><span class="pk-ico" aria-hidden="true">🔍</span><input type="text" class="pk-input" data-mpk-q autocomplete="off" spellcheck="false" placeholder="Chercher…" aria-label="Chercher : titre, cote, personne, lieu, année"><span class="pk-kbd">Titre, cote, personne, lieu, année…</span></div></div>
                    <div class="mpk-filters" data-mpk-filters role="toolbar" aria-label="Filtres"></div>
                    <select class="mpk-size" data-mpk-size aria-label="Taille des vignettes" data-ia-done="1"><option value="big">▦ Grandes</option><option value="small">▪ Petites</option><option value="list">☰ Liste</option></select></div>
                <div class="mpk-body"><div class="mpk-gridwrap" data-mpk-scroll><div class="mpk-cnt"><span data-mpk-count>…</span><span class="mpk-keys">${multiple ? '↑ ↓ ← → · Espace : cocher · Entrée : valider' : '↑ ↓ ← → · Entrée : valider'}</span></div>
                    <div class="mpk-grid size-${st.size}" data-mpk-grid role="listbox" tabindex="0" aria-multiselectable="${multiple}" aria-label="${esc(many)}"></div>
                    ${allowImport ? `<div class="mpk-drop" data-mpk-drop>📁 Glisse ${fem ? 'une' : 'un'} ${esc(one)} ici, colle-${fem ? 'la' : 'le'} (⌘V) ou <button type="button" class="mpk-linkbtn" data-mp="import" data-ia-done="1">importe-${fem ? 'la' : 'le'} depuis l’ordinateur</button> : ${fem ? 'elle' : 'il'} entre dans les médias et se coche.</div>` : ''}</div>
                    <aside class="mpk-prev" data-mpk-prev aria-live="polite"></aside></div>
                <div class="mpk-foot">${allowImport ? `<button type="button" class="button secondary" data-mp="import" data-ia-done="1">📁 Importer…</button>${types.includes('image') ? '<button type="button" class="button secondary" data-mp="paste" data-ia-done="1">📋 Coller</button>' : ''}` : ''}<span class="spacer"></span><button type="button" class="button secondary" data-mp="close" data-ia-done="1">Annuler</button><button type="button" class="button" data-mp="ok" data-ia-done="1" disabled>${esc(o.okLabel || (multiple ? `Utiliser ces ${many}` : `Utiliser ${fem ? 'cette' : 'ce'} ${one}`))}</button></div>`;
            if (o.extra) { const ex = document.createElement('div'); ex.className = 'mpk-extra'; ex.innerHTML = o.extra; d.querySelector('.mpk-bar').appendChild(ex); }
            document.body.appendChild(d);
            const $ = s => d.querySelector(s), grid = $('[data-mpk-grid]'), scroller = $('[data-mpk-scroll]'), qIn = $('[data-mpk-q]'), prev = $('[data-mpk-prev]'), okBtn = $('[data-mp="ok"]');
            $('[data-mpk-size]').value = st.size;
            let result = null, done = false;
            const finish = v => { if (done) return; done = true; result = v; if (v) remember(Array.isArray(v) ? v : [v]); d.close(); };
            d.addEventListener('close', () => { document.removeEventListener('paste', onPaste, true); d.remove(); resolve(result); });
            // Échap (C1) : une recherche tapée se vide d'abord ; la fenêtre se ferme à l'Échap suivant
            d.addEventListener('cancel', e => { e.preventDefault(); if (qIn && qIn.value && (document.activeElement === qIn || d.contains(document.activeElement))) { qIn.value = ''; qIn.dispatchEvent(new Event('input', {bubbles: true})); qIn.focus(); return; } finish(null); });
            d._mpFinish = it => finish(multiple ? (Array.isArray(it) ? it : [it]) : it); // pour les boutons ajoutés par l'outil (« extra »)

            // ── filtres ──
            function filtersHtml() {
                const c = st.counts || {}, n = k => (st.counts ? ` (${num(c[k] || 0)})` : '');
                const sorts = [['photo', '📷 Photos', types.includes('image')], ['document', '📄 Documents', types.includes('image') || types.includes('document')], ['audio', '🎧 Sons', types.includes('audio')], ['video', '🎬 Vidéos', types.includes('video')]].filter(s => s[2]);
                let h = `<button type="button" class="mpk-chip${st.sort === 'all' ? ' on' : ''}" data-mpk-sort="all" aria-pressed="${st.sort === 'all'}" data-ia-done="1">Tout${n('all')}</button>`;
                if (sorts.length > 1) h += sorts.map(([k, l]) => `<button type="button" class="mpk-chip${st.sort === k ? ' on' : ''}" data-mpk-sort="${k}" aria-pressed="${st.sort === k}" data-ia-done="1"${st.counts && !c[k] && st.sort !== k ? ' disabled' : ''}>${l}${n(k)}</button>`).join('');
                if (st.person) h += `<span class="mpk-chip mpk-person${st.personOn ? ' on' : ''}"><button type="button" data-mp="person-toggle" aria-pressed="${st.personOn}" data-ia-done="1" title="${st.personOn ? 'Seulement ses médias' : 'Montrer seulement ses médias'}">👤 ${esc(st.person.title || '…')}</button>${st.personOn ? '<button type="button" class="x" data-mp="person-off" aria-label="Retirer le filtre de la personne" data-ia-done="1">×</button>' : ''}</span>`;
                else h += '<button type="button" class="mpk-chip" data-mp="person-pick" data-ia-done="1">👤 Une personne…</button>';
                h += `<button type="button" class="mpk-chip${st.recent ? ' on' : ''}" data-mp="recent" aria-pressed="${st.recent}" data-ia-done="1">🕘 Récentes${n('recent')}</button>`;
                if (types.includes('image')) h += `<button type="button" class="mpk-chip${st.portraits ? ' on' : ''}" data-mp="portraits" aria-pressed="${st.portraits}" data-ia-done="1">⭐ Portraits${n('portraits')}</button>`;
                h += flags.map(([k, l]) => `<button type="button" class="mpk-chip${st.flag === k ? ' on' : ''}" data-mpk-flag="${k}" aria-pressed="${st.flag === k}" data-ia-done="1">${l}</button>`).join('');
                return h;
            }
            const renderFilters = () => { $('[data-mpk-filters]').innerHTML = filtersHtml(); };
            if (st.person && !st.person.title) search({kind: 'person', ids: st.person.id}).then(r => { const p = itemsOf(r)[0]; if (p) { st.person = p; renderFilters(); } }).catch(() => {});

            // ── recherche ──
            function params(more) {
                const p = {kind: 'media', q: st.q, media_types: types.join(','), offset: more ? st.next : 0, limit: 40};
                if (st.person && st.personOn) p.person_id = st.person.id;
                if (st.sort !== 'all') p.media_sort = st.sort;
                if (st.portraits) p.portraits = 1;
                p.recent_ids = recentIds().join(','); // pour « 🕘 Récentes » et son compteur
                if (st.recent) p.recent = 1;
                if (st.flag) p.media_flag = st.flag;
                if (!more) p.counts = 1;
                return p;
            }
            async function load(more = false) {
                const my = ++st.seq; st.loading = true;
                if (!more) { st.q = qIn.value.trim(); grid.setAttribute('aria-busy', 'true'); }
                let r; try { r = await search(params(more)); } catch (e) { if (my === st.seq) { st.loading = false; toast(e.message || 'Recherche impossible', 'error'); } return; }
                if (my !== st.seq) return;
                st.loading = false; grid.removeAttribute('aria-busy');
                const got = itemsOf(r);
                if (more) st.items.push(...got.filter(it => !st.items.some(x => x.id === it.id)));
                else {
                    // une image importée reste en tête, même si elle ne répond pas au filtre
                    st.items = [...st.imported, ...got.filter(it => !st.imported.some(x => x.id === it.id))];
                    st.counts = r.counts || st.counts; renderFilters();
                    st.total = (r.groups || []).reduce((a, g) => a + (g.total || 0), 0) + st.imported.filter(x => !got.some(it => it.id === x.id)).length;
                }
                st.more = !!r.more; st.next = r.next_offset || 0;
                if (!more) {
                    st.active = st.items.length ? 0 : -1;
                    if (!multiple && st.chosen.size) { const i = st.items.findIndex(it => st.chosen.has(Number(it.id))); if (i >= 0) st.active = i; }
                }
                // les choisis qu'on n'a que par leur numéro : complétés quand ils passent
                st.items.forEach(it => { if (st.chosen.has(Number(it.id))) st.chosen.set(Number(it.id), it); });
                render(more);
                requestAnimationFrame(maybeMore);
            }
            function maybeMore() { if (st.more && !st.loading && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 160) load(true); }
            scroller.addEventListener('scroll', maybeMore, {passive: true});

            // ── rendu de la grille ──
            function tileHtml(it, i) {
                const on = st.chosen.has(Number(it.id)), cur = i === st.active;
                return `<div class="mpk-tile${on ? ' on' : ''}${cur ? ' cur' : ''}" role="option" id="mpk-o-${i}" data-i="${i}" aria-selected="${on}" title="${esc(it.title)}">${visual(it)}${multiple ? `<span class="mpk-ck" aria-hidden="true">${on ? '✓' : ''}</span>` : ''}<span class="mpk-ty">${esc(it.tag || (SORT_LABEL[it.sort] || 'Média').toUpperCase())}</span><span class="mpk-tt"><b>${markText(it.title, st.q)}</b><small>${markText(tileSub(it), st.q) || '&nbsp;'}</small></span></div>`;
            }
            function render(more) {
                const top = scroller.scrollTop;
                if (!st.items.length) {
                    const what = st.q ? `Aucun${fem ? 'e' : ''} ${one} pour « ${st.q} ».` : (st.personOn || st.sort !== 'all' || st.recent || st.portraits || st.flag) ? `Aucun${fem ? 'e' : ''} ${one} avec ces filtres.` : `Aucun${fem ? 'e' : ''} ${one} dans tes médias pour l’instant.`;
                    const hint = (st.q ? 'Vérifie l’orthographe, enlève un filtre' : st.personOn ? 'Retire le filtre de la personne' : '') + (allowImport ? `${st.q || st.personOn ? ', ou importe' : 'Importe'}-${fem ? 'la' : 'le'} depuis l’ordinateur.` : '.');
                    grid.innerHTML = A().emptyState ? A().emptyState({icon: '🖼', text: what, hint: hint.replace(/^\./, ''), action: allowImport ? {label: '📁 Importer…', attrs: 'data-mp="import" data-ia-done="1"'} : null}) : `<p class="pk-empty">${esc(what)}</p>`;
                } else grid.innerHTML = st.items.map(tileHtml).join('') + (st.more ? '<div class="mpk-more"><span class="pk-spin"></span> La suite arrive en descendant…</div>' : '');
                if (more) scroller.scrollTop = top;
                counter(); preview();
                if (st.active >= 0) grid.setAttribute('aria-activedescendant', `mpk-o-${st.active}`); else grid.removeAttribute('aria-activedescendant');
            }
            function counter() {
                const n = st.chosen.size;
                $('[data-mpk-count]').textContent = `${plural(st.total, one, many)}${multiple ? ` · ${chosenWord(n, fem)}` : ''}`;
                if (multiple) { okBtn.disabled = !n; okBtn.textContent = o.okLabel ? o.okLabel : n === 1 ? `Utiliser ${fem ? 'cette' : 'ce'} ${one}` : n ? `Utiliser ces ${num(n)} ${many}` : `Utiliser ces ${many}`; }
                else okBtn.disabled = !(st.chosen.size || st.items[st.active]);
            }
            function refreshTiles() {
                grid.querySelectorAll('.mpk-tile').forEach(t => {
                    const i = Number(t.dataset.i), it = st.items[i], on = st.chosen.has(Number(it?.id)), cur = i === st.active;
                    t.classList.toggle('on', on); t.classList.toggle('cur', cur); t.setAttribute('aria-selected', String(on));
                    const ck = t.querySelector('.mpk-ck'); if (ck) ck.textContent = on ? '✓' : '';
                });
                if (st.active >= 0) grid.setAttribute('aria-activedescendant', `mpk-o-${st.active}`);
                counter(); preview();
            }

            // ── aperçu à droite ──
            let prevId = 0;
            function preview() {
                const it = st.items[st.active] || (multiple ? [...st.chosen.values()].pop() : null);
                if (!it || !it.title) { prevId = 0; prev.innerHTML = `<div class="mpk-prev-empty">${allowImport ? `Clique sur ${fem ? 'une' : 'un'} ${esc(one)} pour ${fem ? 'la' : 'le'} voir ici en grand.` : `Clique sur ${fem ? 'une' : 'un'} ${esc(one)} pour ${fem ? 'la' : 'le'} voir ici.`}</div>`; return; }
                if (prevId === it.id) return; prevId = it.id;
                const src = mediaUrl(it.filename);
                const big = it.media_type === 'image' ? `<div class="mpk-big"><img src="${esc(src)}" alt="" data-mpk-bigimg></div>`
                    : it.media_type === 'video' ? `<div class="mpk-big av"><video src="${esc(src)}" controls preload="metadata" data-mpk-bigav></video></div>`
                    : it.media_type === 'audio' ? `<div class="mpk-big av snd"><span class="mpk-note" aria-hidden="true">♪</span><audio src="${esc(src)}" controls preload="metadata" data-mpk-bigav></audio></div>`
                    : `<div class="mpk-big doc"><span aria-hidden="true">📄</span></div>`;
                const line1 = [SORT_LABEL[it.sort] || 'Média', it.year || it.date_text, it.place].filter(Boolean).join(' · ');
                prev.innerHTML = `${big}<h4>${esc(it.title)}</h4><div class="m">${esc(line1)}<br><span data-mpk-dim>${it.media_type === 'image' ? 'Taille : …' : isAV(it) ? (it.duration ? `Durée : ${esc(dur(it.duration))}` : '<span data-mpk-dur></span>') : ''}</span>${it.cote ? `<br>Cote : ${esc(it.cote)}` : ''}</div><div class="mpk-ppl" data-mpk-ppl></div><button type="button" class="button secondary mpk-open" data-mp="open" data-ia-done="1">↗ Ouvrir le média</button>`;
                const im = prev.querySelector('[data-mpk-bigimg]');
                if (im) { const show = () => { const w = im.naturalWidth, h = im.naturalHeight, el = prev.querySelector('[data-mpk-dim]'); if (el && w) el.textContent = `${num(w)} × ${num(h)} px — ${printFit(w, h)}`; }; if (im.complete) show(); else im.addEventListener('load', show, {once: true}); }
                const av = prev.querySelector('[data-mpk-bigav]'), dEl = prev.querySelector('[data-mpk-dur]');
                if (av && dEl) av.addEventListener('loadedmetadata', () => { if (Number.isFinite(av.duration)) dEl.textContent = `Durée : ${dur(av.duration)}`; }, {once: true});
                const ids = (it.people_ids || []).map(Number).filter(Boolean);
                if (ids.length) loadPeople(ids).then(ps => {
                    const box = prev.querySelector('[data-mpk-ppl]'); if (!box || prevId !== it.id) return;
                    box.innerHTML = ps.map(p => `<button type="button" class="pk-chip mpk-pchip" data-mpk-person="${Number(p.id)}" data-ia-done="1" title="Voir ses médias">${window.LCNDA_UI?.avatarOn?.() ? window.LCNDA_UI.avatar({...p, name: p.title, photo: p.thumb || ''}, 22) : p.thumb ? `<span class="pk-av ${p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u'} photo" style="background-image:url('${esc(p.thumb)}')"></span>` : `<span class="pk-av ${p.kind === 'animal' ? 'a' : p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u'}">${esc(p.initials || '?')}</span>`}<b>${esc(p.title)}</b></button>`).join('') + (it.people_count > ps.length ? `<small>+ ${num(it.people_count - ps.length)}</small>` : '');
                });
            }

            // ── choisir ──
            const cur = () => st.items[st.active];
            function setActive(i, scroll = true) {
                if (!st.items.length) return;
                st.active = Math.max(0, Math.min(st.items.length - 1, i));
                if (!multiple) { st.chosen.clear(); st.chosen.set(Number(cur().id), cur()); }
                refreshTiles();
                if (scroll) grid.querySelector(`.mpk-tile[data-i="${st.active}"]`)?.scrollIntoView({block: 'nearest'});
                if (st.active >= st.items.length - 6) maybeMore();
            }
            function toggle(i) {
                const it = st.items[i]; if (!it) return;
                const id = Number(it.id);
                if (st.chosen.has(id)) st.chosen.delete(id); else st.chosen.set(id, it);
                st.active = i; refreshTiles();
            }
            function validate() {
                if (multiple) { if (!st.chosen.size && cur()) st.chosen.set(Number(cur().id), cur()); if (!st.chosen.size) return; finish([...st.chosen.values()]); return; }
                const it = cur() && st.chosen.has(Number(cur().id)) ? cur() : [...st.chosen.values()][0] || cur();
                if (it?.title) finish(it); else if (it?.id) loadMedia([it.id]).then(([x]) => x && finish(x));
            }
            const perRow = () => { if (st.size === 'list') return 1; const ts = grid.querySelectorAll('.mpk-tile'); if (ts.length < 2) return 1; const top = ts[0].offsetTop; let n = 0; for (const t of ts) { if (t.offsetTop !== top) break; n++; } return n || 1; };

            // ── import : fichier, glisser-déposer, coller ──
            async function addFiles(files) {
                files = [...files].filter(Boolean); if (!files.length) return;
                if (!multiple) files = files.slice(0, 1);
                const drop = $('[data-mpk-drop]'); drop?.classList.add('busy');
                for (const f of files) {
                    try {
                        const it = await importFile(f, types); it.imported = true;
                        st.imported.unshift(it);
                        if (!multiple) st.chosen.clear();
                        st.chosen.set(Number(it.id), it);
                        toast(`« ${it.title} » est entré${fem ? 'e' : ''} dans tes médias.`);
                    } catch (e) { toast(e.message, 'error'); }
                }
                drop?.classList.remove('busy');
                await load();
                const i = st.items.findIndex(x => st.chosen.has(Number(x.id))); if (i >= 0) { st.active = i; refreshTiles(); }
            }
            function pickFiles() {
                const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = multiple;
                inp.accept = types.filter(t => t !== 'document').map(t => `${t}/*`).join(',');
                inp.addEventListener('change', () => addFiles(inp.files));
                inp.click();
            }
            function onPaste(e) {
                if (!d.open || [...document.querySelectorAll('dialog[open]')].pop() !== d) return;
                const files = [...(e.clipboardData?.files || [])].filter(f => /^(image|audio|video)\//.test(f.type));
                if (!files.length) return; // du texte : il va dans la case de recherche
                e.preventDefault(); e.stopImmediatePropagation(); addFiles(files); // l'outil dessous ne la reçoit pas en double
            }
            document.addEventListener('paste', onPaste, true);
            async function pasteButton() {
                try {
                    const list = await navigator.clipboard.read(), files = [];
                    for (const c of list) { const t = c.types.find(x => x.startsWith('image/')); if (t) { const b = await c.getType(t); files.push(new File([b], `image-collée-${new Date().toISOString().slice(0, 10)}.${t.split('/')[1] || 'png'}`, {type: t})); } }
                    if (files.length) addFiles(files); else toast('Aucune image dans le presse-papiers. Copie une image, puis réessaie.');
                } catch (_) { toast('Appuie sur ⌘V (ou Ctrl+V) pour coller l’image ici.'); }
            }
            let dragDepth = 0;
            d.addEventListener('dragenter', e => { if (!allowImport || ![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); dragDepth++; d.classList.add('mpk-dragging'); });
            d.addEventListener('dragover', e => { if (allowImport && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
            d.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; d.classList.remove('mpk-dragging'); } });
            d.addEventListener('drop', e => { if (!allowImport) return; e.preventDefault(); dragDepth = 0; d.classList.remove('mpk-dragging'); addFiles(e.dataTransfer?.files || []); });

            // ── clics ──
            d.addEventListener('click', async e => {
                const t = e.target;
                const tile = t.closest('.mpk-tile');
                if (tile) { const i = Number(tile.dataset.i); if (multiple) toggle(i); else setActive(i, false); return; }
                const s = t.closest('[data-mpk-sort]'); if (s) { st.sort = s.dataset.mpkSort; return load(); }
                const fl = t.closest('[data-mpk-flag]'); if (fl) { st.flag = st.flag === fl.dataset.mpkFlag ? '' : fl.dataset.mpkFlag; return load(); }
                const pp = t.closest('[data-mpk-person]'); if (pp) { const p = PEOPLE.get(Number(pp.dataset.mpkPerson)); if (p) { st.person = p; st.personOn = true; load(); } return; } // une personne liée : ses médias
                const b = t.closest('[data-mp]'); if (!b) return;
                switch (b.dataset.mp) {
                    case 'close': return finish(null);
                    case 'ok': return validate();
                    case 'import': return pickFiles();
                    case 'paste': return pasteButton();
                    case 'recent': st.recent = !st.recent; return load();
                    case 'portraits': st.portraits = !st.portraits; return load();
                    case 'person-toggle': st.personOn = !st.personOn; return load();
                    case 'person-off': st.personOn = false; return load();
                    case 'person-pick': {
                        const P = window.LCNDA_PICKER; if (!P?.openPicker) return;
                        const p = await P.openPicker({kind: 'person', title: 'Les médias de quelle personne ?'});
                        if (p) { st.person = p; st.personOn = true; load(); }
                        return;
                    }
                    case 'open': { const it = st.items[st.active] || [...st.chosen.values()].pop(); if (it) openMedia(it); return; }
                }
            });
            d.addEventListener('dblclick', e => { const tile = e.target.closest('.mpk-tile'); if (!tile) return; const i = Number(tile.dataset.i); if (multiple) { if (!st.chosen.has(Number(st.items[i]?.id))) toggle(i); } else setActive(i, false); validate(); });
            $('[data-mpk-size]').addEventListener('change', e => { st.size = e.target.value; store.set(SIZE_KEY, st.size); grid.className = `mpk-grid size-${st.size}`; });
            qIn.addEventListener('input', () => { clearTimeout(st.timer); st.timer = setTimeout(() => load(), 200); });

            // ── clavier : ↑ ↓ ← → Espace Entrée (Échap ferme la fenêtre) ──
            d.addEventListener('keydown', e => {
                if (e.defaultPrevented || e.isComposing) return;
                const inQ = e.target === qIn, inGrid = e.target === grid || grid.contains(e.target);
                if (!inQ && !inGrid) return; // boutons, filtres, menu : leur comportement habituel
                const n = perRow(), a = st.active < 0 ? -1 : st.active;
                const move = j => { e.preventDefault(); setActive(j); };
                if (e.key === 'ArrowRight' && (!inQ || qIn.selectionStart === qIn.value.length)) return move(a + 1);
                if (e.key === 'ArrowLeft' && (!inQ || qIn.selectionEnd === 0) && a > 0) return move(a - 1);
                if (e.key === 'ArrowDown') { if (inQ) { grid.focus({preventScroll: true}); return move(a < 0 ? 0 : a); } return move(a < 0 ? 0 : a + n); } // de la case de recherche : on entre dans la grille
                if (e.key === 'ArrowUp') { if (inGrid && a - n < 0) { e.preventDefault(); qIn.focus(); return; } return move(a - n); }
                if (e.key === 'Home' && inGrid) return move(0);
                if (e.key === 'End' && inGrid) return move(st.items.length - 1);
                if (e.key === ' ' && inGrid) { e.preventDefault(); if (multiple) toggle(Math.max(0, a)); else setActive(Math.max(0, a)); return; }
                if (e.key === 'Enter') { e.preventDefault(); validate(); }
            });

            d.showModal();
            renderFilters();
            // boutons ajoutés par l'outil (« extra ») : il les branche ici ; finish(item) choisit, close() ferme sans rien choisir
            if (typeof o.onOpen === 'function') { try { o.onOpen(d, {finish: d._mpFinish, close: () => finish(null)}); } catch (e) { console.error(e); } }
            qIn.focus();
            if (st.chosen.size) loadMedia([...st.chosen.keys()]).then(list => { list.forEach(it => st.chosen.set(Number(it.id), it)); counter(); });
            load();
        });
    }

    /** « ↗ Ouvrir » : la visionneuse de l'app (lecture seule), par-dessus la fenêtre. */
    function openMedia(it) {
        const ev = new CustomEvent('picker-open', {bubbles: true, cancelable: true, detail: {kind: 'media', id: it.id, item: it}});
        document.dispatchEvent(ev); if (ev.defaultPrevented) return;
        const m = {id: it.id, filename: it.filename, thumbnail: it.thumbnail || '', media_type: it.media_type || 'image', title: it.title, date_text: it.date_text || '', document_reference: it.cote || ''};
        if (A().openLightbox && m.filename && !document.getElementById('lightbox')?.open) { // déjà ouverte dessous : elle resterait cachée, on ouvre le fichier à part
            // la visionneuse sert aussi aux outils ouverts dessous (retouche…) : on leur rend leur média à la fermeture
            const st = A().state || {}, keep = [st.lightboxMedia, st.lightboxIndex, st.lightboxReadOnly], lb = document.getElementById('lightbox');
            try {
                A().openLightbox([m], 0, true);
                lb?.addEventListener('close', () => { [st.lightboxMedia, st.lightboxIndex, st.lightboxReadOnly] = keep; }, {once: true});
                return;
            } catch (_) {}
        }
        if (m.filename) window.open(mediaUrl(m.filename), '_blank', 'noopener');
    }

    // ═══════════════ le champ : pastille + champ caché ═══════════════
    const CTRL = new WeakMap();
    function mediaField(o = {}) {
        const opts = {name: o.name == null ? 'media_id' : String(o.name), types: (Array.isArray(o.types) ? o.types : o.types ? String(o.types).split(',') : ['image']).filter(t => TYPES.includes(t)),
            multiple: !!o.multiple, person: o.person && typeof o.person === 'object' ? {id: Number(o.person.id), title: o.person.title || ''} : Number(o.person) || 0,
            title: o.title || '', okLabel: o.okLabel || '', placeholder: o.placeholder || '', allowImport: o.allowImport !== false, eyebrow: o.eyebrow || ''};
        if (!opts.types.length) opts.types = ['image'];
        const items = normList(o.value, opts.multiple);
        const c = {opts, items, el: null};
        return `<div class="mf${opts.multiple ? ' mf-multi' : ''}" data-media-field data-mf-opts="${esc(JSON.stringify(opts))}" data-mf-value="${esc(JSON.stringify(items))}">${mfInner(c)}</div>`;
    }
    function normList(v, multiple) {
        const list = Array.isArray(v) ? v : typeof v === 'string' && v.includes(',') ? v.split(',') : v == null || v === '' || v === 0 ? [] : [v];
        const out = list.map(x => typeof x === 'object' && x ? {...x, id: Number(x.id)} : {id: Number(x)}).filter(x => x.id > 0);
        return multiple ? out : out.slice(0, 1);
    }
    const mfHidden = c => c.opts.multiple ? c.items.map(it => it.id).join(',') : String(c.items[0]?.id || '');
    function mfChip(it, i, small) {
        const pic = it.thumb ? `<span class="pk-ic thumb has-img" style="background-image:url('${esc(it.thumb)}')" aria-hidden="true"></span>` : `<span class="pk-ic" aria-hidden="true">${it.media_type === 'audio' ? '🎧' : it.media_type === 'video' ? '🎬' : it.title ? (it.icon || '🖼') : '…'}</span>`;
        const t = it.title || (it.id ? `Média #${it.id}` : ''), y = it.year || '';
        if (small) return `<span class="pk-chip mf-chip" data-i="${i}">${pic}<b>${esc(t)}</b>${y ? `<small>${esc(y)}</small>` : ''}<button type="button" class="go" data-mf="open" data-i="${i}" data-ia-done="1" title="Ouvrir">↗</button><button type="button" class="x" data-mf="remove" data-i="${i}" data-ia-done="1" title="Retirer" aria-label="Retirer ${esc(t)}">×</button></span>`;
        return `<span class="pk-chip mf-chip" data-i="${i}">${pic}<span><b>${esc(t)}</b>${y ? ` <small>${esc(y)}</small>` : ''}</span><button type="button" class="go" data-mf="open" data-i="${i}" data-ia-done="1">↗ Ouvrir</button><button type="button" class="go" data-mf="change" data-i="${i}" data-ia-done="1">🖼 Changer</button><button type="button" class="x" data-mf="remove" data-i="${i}" data-ia-done="1" title="Retirer" aria-label="Retirer ${esc(t)}">×</button></span>`;
    }
    function mfInner(c) {
        const o = c.opts, [one, , fem] = nouns(o.types);
        const add = o.placeholder || (o.multiple ? `＋ Ajouter ${fem ? 'une' : 'un'} ${one}…` : `Choisir ${fem ? 'une' : 'un'} ${one}…`);
        const box = `<button type="button" class="pk-box mf-add" data-mf="pick" data-ia-done="1"${!o.multiple && c.items.length ? ' hidden' : ''}><span class="pk-ico" aria-hidden="true">🖼</span><span class="mf-ph">${esc(add)}</span></button>`;
        return `<input type="hidden"${o.name ? ` name="${esc(o.name)}"` : ''} value="${esc(mfHidden(c))}"><div class="${o.multiple ? 'pk-chips' : 'pk-chosen'}">${c.items.map((it, i) => mfChip(it, i, o.multiple)).join('')}</div>${box}`;
    }
    function mfRender(c) { c.el.innerHTML = mfInner(c); c.el.dataset.mfValue = JSON.stringify(c.items); }
    function mfEmit(c) {
        const o = c.opts, value = mediaValue(c.el), detail = {name: o.name, kind: 'media', value, ...(o.multiple ? {items: c.items} : {item: c.items[0] || null})};
        c.el.dispatchEvent(new CustomEvent('media-change', {bubbles: true, detail}));
        c.el.dispatchEvent(new CustomEvent('picker-change', {bubbles: true, detail}));
        c.el.querySelector(':scope > input[type=hidden]').dispatchEvent(new Event('change', {bubbles: true}));
    }
    function mfBind(el) {
        if (CTRL.has(el)) return CTRL.get(el);
        let opts = {}, items = []; try { opts = JSON.parse(el.dataset.mfOpts || '{}'); } catch (_) {} try { items = JSON.parse(el.dataset.mfValue || '[]'); } catch (_) {}
        opts = {name: 'media_id', types: ['image'], multiple: false, ...opts};
        const c = {opts, items: normList(items, opts.multiple), el}; CTRL.set(el, c);
        if (!el.querySelector(':scope > input[type=hidden]')) mfRender(c);
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-mf]'); if (!b || !el.contains(b)) return;
            e.preventDefault(); const i = Number(b.dataset.i);
            if (b.dataset.mf === 'remove') { c.items.splice(i, 1); mfRender(c); mfEmit(c); el.querySelector('.mf-add')?.focus(); }
            else if (b.dataset.mf === 'open') { if (c.items[i]) openMedia(c.items[i]); }
            else mfPick(c, b.dataset.mf === 'change' ? i : -1);
        });
        mfLoad(c);
        return c;
    }
    async function mfPick(c, i) {
        const o = c.opts;
        const r = await openMediaPicker({types: o.types, multiple: o.multiple, person: o.person || null, title: o.title || undefined, okLabel: o.okLabel || undefined, allowImport: o.allowImport, eyebrow: o.eyebrow || undefined, value: o.multiple ? [] : c.items.map(it => it.id)});
        if (!r) return;
        if (o.multiple) (Array.isArray(r) ? r : [r]).forEach(it => { if (!c.items.some(x => Number(x.id) === Number(it.id))) c.items.push(it); });
        else c.items = [r];
        mfRender(c); mfEmit(c);
        c.el.querySelector('[data-mf="change"], .mf-add')?.focus();
    }
    async function mfLoad(c) {
        const todo = c.items.filter(it => !it.title); if (!todo.length) return;
        const found = await loadMedia(todo.map(it => it.id));
        c.items = c.items.map(it => found.find(f => Number(f.id) === Number(it.id)) || {...it, title: it.title || `Média #${it.id}`});
        if (c.el) mfRender(c);
    }
    function mediaValue(fieldEl) {
        const el = fieldEl?.closest?.('[data-media-field]') || fieldEl; if (!el) return null;
        const c = CTRL.get(el) || mfBind(el), raw = el.querySelector(':scope > input[type=hidden]')?.value || '';
        return c.opts.multiple ? (raw ? raw.split(',').map(Number) : []) : raw ? Number(raw) : null;
    }
    /** Remplit le champ (numéro, objet, liste) sans déclencher media-change. */
    function mediaSet(fieldEl, value) {
        const el = fieldEl?.closest?.('[data-media-field]') || fieldEl; if (!el) return;
        const c = CTRL.get(el) || mfBind(el); c.items = normList(value, c.opts.multiple); mfRender(c); mfLoad(c);
    }

    // ── liaison automatique ──
    const scan = root => { if (root.matches?.('[data-media-field]')) mfBind(root); root.querySelectorAll?.('[data-media-field]').forEach(mfBind); };
    new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scan(n); }))).observe(document.documentElement, {childList: true, subtree: true});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document)); else scan(document);

    const api = {openMediaPicker, mediaField, mediaValue, mediaSet, openMedia, loadMedia, importMediaFile: importFile};
    const expose = () => {
        if (window.LCNDA_PICKER) Object.assign(window.LCNDA_PICKER, api);
        const app = window.LCNDA_APP; if (!app) return false;
        Object.assign(app, api); if (app.picker) Object.assign(app.picker, api); return !!window.LCNDA_PICKER;
    };
    window.LCNDA_MEDIA_PICKER = api;
    if (!expose()) { let n = 0; const t = setInterval(() => { if (expose() || ++n > 200) clearInterval(t); }, 50); }
})();
