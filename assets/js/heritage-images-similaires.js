/* LCNDA — 🔍 Chercher une image semblable (recherche inversée) et 👯 Doublons d'images.
 * Le moteur : assets/js/app-image-prints.js (window.LCNDA_IMGPRINT) ; le serveur : lib/image_prints.php.
 * - Les empreintes des photos se calculent sur cet ordinateur, en tâche de fond, par petits paquets (4 photos), et sont
 *   rangées dans la base : si on ferme l'app, le calcul reprend où il en était. Une photo retouchée, tournée ou remplacée
 *   est recalculée toute seule (le serveur compare la taille et la date du fichier).
 * - « 🔍 Chercher une image semblable » : depuis la visionneuse, le ⋯ (ou le clic droit) d'une vignette de Médias, ou une
 *   image de l'ordinateur déposée / collée (⌘V) : elle n'entre pas dans les médias. Résultats classés : identique, très
 *   proche, recadrée / zoomée, ressemblante, avec le pourcentage ; aperçu côte à côte et « 🔍 Comparer deux photos ».
 * - « 👯 Doublons d'images » (Listes → Médias, à la place de l'ancienne « Recherche de doublons ») : groupes parfaits,
 *   retouchés, recadrés / zoomés, redimensionnés, autre format ; sensibilité (C3) ; garder la meilleure (la plus grande
 *   proposée), fusionner les liens, les autres à la corbeille ou en versions ; « Ce n'est pas un doublon » ; tout avec
 *   « ↶ Annuler » (H7), et la « 🗑 Corbeille des doublons » pour remettre une fusion plus tard. Mode d'emploi : docs/UI.md.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_IMGPRINT;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, one, many) => A()?.plural ? A().plural(n, one, many) : `${fmt(n)} ${Math.abs(n) < 2 ? one : many || one + 's'}`;
    const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const readOnly = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const mediaUrl = f => `media/${encodeURIComponent(f || '')}`;
    const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|heic)$/i;
    const isImage = row => !!row && IMG_EXT.test(String(row.filename || '')) && !['audio', 'video'].includes(String(row.media_type || '').toLowerCase());
    const kb = n => n >= 1048576 ? `${(n / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo` : `${Math.max(1, Math.round(n / 1024)).toLocaleString('fr-FR')} Ko`;
    const dims = it => it.w && it.h ? `${fmt(it.w)} × ${fmt(it.h)} px` : '';
    const titleOf = it => it.title || it.filename || (it.id ? `Média n° ${it.id}` : 'Image');
    const SIZE_KEY = 'lcnda-imgdup-sens';

    /* ═════════ L'empreinte d'une image : dans un fil à part (la page reste libre), sinon ici ═════════ */
    async function printHere(blob) {
        const bmp = await createImageBitmap(blob);
        const w = bmp.width, h = bmp.height;
        if (!w || !h) throw new Error('Image vide');
        const ws = P().workSize(w, h), c = document.createElement('canvas');
        c.width = ws.w; c.height = ws.h;
        const g = c.getContext('2d', {willReadFrequently: true});
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.fillStyle = '#fff'; g.fillRect(0, 0, ws.w, ws.h);
        g.drawImage(bmp, 0, 0, ws.w, ws.h); bmp.close?.();
        return {w, h, print: P().fromPixels(g.getImageData(0, 0, ws.w, ws.h).data, ws.w, ws.h, {w, h})};
    }
    const WK = {w: null, broken: typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined', seq: 0, wait: new Map()};
    function worker() {
        if (WK.broken) return null;
        if (WK.w) return WK.w;
        try { WK.w = new Worker('assets/js/image-prints-worker.js?v=1'); }
        catch (_) { WK.broken = true; return null; }
        WK.w.onmessage = e => { const d = e.data || {}, p = WK.wait.get(d.id); if (!p) return; WK.wait.delete(d.id); if (d.error) p.ko(new Error(d.error)); else p.ok({w: d.w, h: d.h, print: d.print}); };
        WK.w.onerror = () => { WK.broken = true; WK.w = null; WK.wait.forEach(p => p.retry()); WK.wait.clear(); };
        return WK.w;
    }
    function viaWorker(msg, fallback) {
        const w = worker(); if (!w) return fallback();
        return new Promise((ok, ko) => { const id = ++WK.seq; WK.wait.set(id, {ok, ko, retry: () => fallback().then(ok, ko)}); w.postMessage({...msg, id}); });
    }
    const printFromBlob = blob => viaWorker({blob}, () => printHere(blob));
    async function printFromUrl(url) {
        return viaWorker({url: new URL(url, location.href).href}, async () => { const r = await fetch(url, {cache: 'no-cache'}); if (!r.ok) throw new Error(`Fichier introuvable (${r.status})`); return printHere(await r.blob()); });
    }
    /** écriture discrète (sans relancer le compte des personnes ni prévenir tout l'écran à chaque paquet) */
    async function post(action, body) {
        const csrf = A()?.state?.csrf || '';
        const r = await fetch(`api.php?action=${encodeURIComponent(action)}`, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})});
        const d = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || d.error) { const e = new Error(d.error || `Erreur ${r.status}`); e.status = r.status; throw e; }
        return d;
    }

    /* ═════════ Le calcul en tâche de fond (par paquets, reprend tout seul) ═════════ */
    const JOB = {running: null, done: 0, total: 0, error: '', dirty: false, ran: false, listeners: new Set()};
    const emit = () => JOB.listeners.forEach(fn => { try { fn(JOB); } catch (_) {} });
    const idle = () => new Promise(r => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), {timeout: 600}) : setTimeout(r, 120)));
    function runPrints() {
        if (JOB.running) return JOB.running;
        if (readOnly() || !P()) return Promise.resolve(null);
        JOB.ran = true; JOB.error = '';
        JOB.running = (async () => {
            const algo = P().ALGO;
            const st = await api('image_prints_status', {algo});
            JOB.total = st.readable; JOB.done = st.done; emit();
            for (let guard = 0; guard < 100000 && !readOnly(); guard++) {
                const todo = await api('image_prints_todo', {algo, limit: 4});
                if (!todo.items?.length) break;
                const items = [];
                for (const it of todo.items) {
                    try { const r = await printFromUrl(mediaUrl(it.filename)); items.push({media_id: it.id, filename: it.filename, w: r.w, h: r.h, print: r.print}); }
                    catch (e) { items.push({media_id: it.id, filename: it.filename, error: String(e?.message || 'Image illisible').slice(0, 150)}); }
                    await idle();
                }
                await post('image_prints_save', {algo, items});
                JOB.dirty = true;
                JOB.done = Math.max(JOB.done, JOB.total - (todo.remaining - todo.items.length)); emit();
            }
        })().catch(e => { JOB.error = e?.message || String(e); }).finally(() => { JOB.running = null; JOB.done = Math.min(JOB.done, JOB.total); emit(); });
        emit();
        return JOB.running;
    }
    ext.imagePrints = {run: runPrints, job: JOB, printFromBlob, printFromUrl, load: (f) => loadAll(f), inWorker: () => !!WK.w && !WK.broken};

    // tout seul : quand on regarde la liste des Médias (une fois par séance), et après une retouche ou une rotation
    let wasMedia = false;
    setInterval(() => {
        const st = A()?.state; const onMedia = !!st && st.module === 'listes' && st.listType === 'media';
        if (onMedia && !wasMedia && !JOB.running && !readOnly()) setTimeout(() => runPrints(), 1500);
        wasMedia = onMedia;
    }, 3000);
    window.addEventListener('lcnda:data-changed', e => {
        if (!JOB.ran || !/media|retouch|rotate/.test(e.detail?.action || '')) return;
        clearTimeout(JOB.t); JOB.t = setTimeout(() => runPrints(), 2500);
    });

    /* ═════════ Les empreintes de la base ═════════ */
    let ALL = null;
    async function loadAll(force = false) {
        if (ALL && !force && !JOB.dirty) return ALL;
        JOB.dirty = false;
        const d = await api('image_prints_all', {algo: P().ALGO});
        ALL = {items: d.items || [], status: d.status || {}};
        return ALL;
    }

    /* petits morceaux communs */
    const thumbOf = it => { if (it._local) return `<img src="${esc(it._local)}" alt="">`; const src = [it.thumbnail, it.filename].find(f => f && IMG_EXT.test(f)); return src ? `<img src="${esc(mediaUrl(src))}" alt="" loading="lazy">` : `<span class="ui-card-ico">${/audio/.test(it.media_type || '') ? '🔊' : /video/.test(it.media_type || '') ? '🎬' : '📄'}</span>`; };
    const fileLine = it => [dims(it), it.ext ? String(it.ext).toUpperCase().replace('JPEG', 'JPG') : '', it.size ? kb(it.size) : ''].filter(Boolean).join(' · ');
    const linksLine = l => {
        if (!l || !l.n) return 'Aucun lien';
        const parts = [[l.persons, '👤'], [l.events, '📅'], [l.families, '👪'], [l.sources, '📚'], [l.labels, '🏷'], [l.albums, '📒'], [l.portraits, '🖼'], [l.tags, '⬚'], [l.other, '🔗']].filter(([n]) => n).map(([n, i]) => `${i} ${fmt(n)}`);
        return parts.join(' · ');
    };
    const SHORT = {identique: 'Identique', proche: 'Très proche', recadree: 'Recadrée', ressemblante: 'Ressemblante'};
    const kindBadge = r => ({text: r.kind === 'identique' ? 'Identique' : `${SHORT[r.kind] || ''} ${r.score} %`, kind: P().KINDS[r.kind]?.badge || 'grey', title: kindText(r)});
    const kindText = r => { const K = P().KINDS[r.kind]; if (!K) return ''; if (r.kind === 'identique') return '＝ Identique (même fichier)'; if (r.kind === 'recadree') return r.sub === 'zoom' ? '⬚ Zoomée' : '⬚ Recadrée'; const sub = P().SUBS[r.sub]; return `${K.icon} ${K.label}${sub ? ` (${sub})` : ''}`; };
    function progressHtml() {
        if (JOB.error) return UI().notice('error', `Le calcul des empreintes s’est arrêté : ${JOB.error}`);
        if (!JOB.running) return '';
        const pct = JOB.total ? Math.round(JOB.done / JOB.total * 100) : 0;
        return `<div class="isim-progress" role="status"><span class="ui-spin" aria-hidden="true"></span><span>Empreintes des photos : <b>${fmt(JOB.done)} / ${fmt(JOB.total)}</b> (calcul sur cet ordinateur, par petits paquets — tu peux fermer, ça reprendra). Les résultats se complètent tout seuls.</span><span class="isim-bar"><i style="width:${pct}%"></i></span></div>`;
    }

    function dialogShell(cls, eyebrow, title, intro) {
        const d = document.createElement('dialog');
        d.className = `modal modal-xl isim-dlg ${cls}`;
        d.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p class="muted isim-intro">${intro}</p>` : ''}</div><button type="button" class="icon-button" data-isim-close aria-label="Fermer">×</button></div>
            <div class="isim-body"></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-isim-close>Fermer</button></div>`;
        document.body.appendChild(d);
        d.addEventListener('click', e => { if (e.target.closest('[data-isim-close]')) d.close(); });
        d.addEventListener('close', () => { d._off?.(); d.remove(); });
        d.showModal();
        return d;
    }
    function openMedia(it) {
        if (!it?.id) return;
        A().openLightbox?.([{id: Number(it.id), filename: it.filename, thumbnail: it.thumbnail, title: titleOf(it), media_type: 'image', date_text: it.date_text || ''}], 0, true);
    }
    function compareTwo(a, b) {
        if (!a?.id || !b?.id) return toast('« Comparer deux photos » marche avec deux photos de la base.', 'error');
        if (!ext.openPhotoCompare) return toast('L’outil « Comparer deux photos » n’est pas encore chargé : réessaie dans un instant.', 'error');
        ext.openPhotoCompare({a: Number(a.id), b: Number(b.id)});
    }

    /* ═════════ 🔍 Chercher une image semblable ═════════ */
    async function openSimilar(opts = {}) {
        if (!P()) return toast('Le moteur des images n’est pas encore chargé : réessaie dans un instant.', 'error');
        const d = dialogShell('isim-search', 'MÉDIAS', '🔍 Chercher une image semblable', 'Retrouve une photo de la base, même recadrée, zoomée, retouchée ou dans un autre format. Tout se calcule sur cet ordinateur.');
        const body = d.querySelector('.isim-body');
        const st = {q: null, results: [], filter: 'all', sel: null, busy: false, seq: 0};
        body.innerHTML = `<div class="isim-top"><div class="isim-query" data-isim-query></div><div class="isim-from"><button type="button" class="button secondary" data-isim-pick>🖼 Choisir dans les médias…</button><div data-isim-drop></div></div></div>
            <div data-isim-progress></div><div class="ui-filters isim-filters" data-isim-filters role="toolbar" aria-label="Filtres"></div>
            <div class="isim-main"><div class="isim-results" data-isim-results></div><aside class="isim-prev" data-isim-prev aria-live="polite"></aside></div>`;
        const $ = s => body.querySelector(s);
        const drop = UI().dropZone({accept: 'image/*', multiple: false, text: '📁 Glisse une image ici, colle-la (⌘V) ou choisis-la sur l’ordinateur', hint: 'Elle sert seulement à chercher : elle n’entre pas dans les médias.', onFiles: files => setFile(files[0])});
        $('[data-isim-drop]').appendChild(drop);
        const paintQuery = () => {
            const q = st.q;
            $('[data-isim-query]').innerHTML = q ? `<span class="isim-qthumb">${thumbOf(q)}</span><span class="isim-qtxt"><span class="eyebrow">${q.id ? 'Photo de la base' : 'Image de ton ordinateur'}</span><b>${esc(titleOf(q))}</b><small class="muted">${esc(fileLine(q))}</small></span>`
                : UI().notice('info', 'Choisis une photo dans les médias, ou dépose une image de ton ordinateur : l’app cherche les photos qui lui ressemblent.');
        };
        const counts = () => { const c = {all: st.results.length, identique: 0, proche: 0, recadree: 0, ressemblante: 0}; st.results.forEach(r => { c[r.kind]++; }); return c; };
        const paintFilters = () => {
            const c = counts();
            const L = {all: 'Tout', identique: '＝ Identiques', proche: '≈ Très proches', recadree: '⬚ Recadrées / zoomées', ressemblante: '～ Ressemblantes'};
            $('[data-isim-filters]').innerHTML = st.q ? Object.keys(L).map(k => `<button type="button" class="${st.filter === k ? 'is-active' : ''}" data-isim-filter="${k}">${esc(L[k])} (${fmt(c[k])})</button>`).join('') : '';
        };
        const card = r => {
            const it = r.item, K = P().KINDS[r.kind];
            return {thumb: thumbOf(it), name: titleOf(it), open: `data-isim-sel="${it.id}"`, openLabel: 'Voir', cls: st.sel === Number(it.id) ? 'is-picked' : '',
                lines: [kindText(r), fileLine(it) || it.date_text],
                badges: [{text: `${r.score} %`, kind: K?.badge || 'grey', title: 'Ressemblance'}],
                menu: [`<button type="button" data-isim-open="${it.id}">↗ Ouvrir le média</button>`, st.q?.id ? `<button type="button" data-isim-cmp="${it.id}">🔍 Comparer deux photos</button>` : '', `<button type="button" data-isim-from="${it.id}">🔍 Chercher depuis celle-ci</button>`]};
        };
        const paintResults = () => {
            const box = $('[data-isim-results]');
            if (!st.q) { box.innerHTML = ''; $('[data-isim-prev]').innerHTML = ''; return; }
            if (st.busy && !st.results.length) { box.innerHTML = UI().spinner('Recherche des photos semblables…'); return; }
            const rows = st.results.filter(r => st.filter === 'all' || r.kind === st.filter);
            const ready = ALL?.items?.length || 0;
            box.innerHTML = rows.length ? `<p class="muted isim-count">${plural(rows.length, 'photo trouvée', 'photos trouvées')} parmi ${plural(ready, 'photo prête', 'photos prêtes')}${JOB.running ? ' (la recherche continue)' : ''}</p>${UI().cardsHtml(rows.map(card), {size: 's'})}`
                : A().emptyState({icon: '🔍', text: st.results.length ? 'Aucune photo de cette sorte' : 'Aucune photo semblable', hint: JOB.running ? 'Les empreintes ne sont pas toutes prêtes : la recherche se complète toute seule.' : `Parmi ${plural(ready, 'photo de la base', 'photos de la base')}.`});
            paintPreview();
        };
        const paintPreview = () => {
            const pv = $('[data-isim-prev]'), r = st.results.find(x => Number(x.item.id) === st.sel);
            if (!r) { pv.innerHTML = `<div class="isim-prev-empty muted">Clique sur « Voir » pour poser les deux images côte à côte.</div>`; return; }
            const it = r.item, q = st.q;
            // la zone : où est la plus petite dans la plus grande
            const zone = r.zone && r.kind !== 'proche' && r.kind !== 'identique' ? r.zone : null;
            const onCand = zone && r.part !== 'a_in_b', onQuery = zone && r.part === 'a_in_b';
            const box = (x, z, label) => `<figure class="isim-fig"><span class="isim-figimg">${x._local ? `<img src="${esc(x._local)}" alt="">` : `<img src="${esc(mediaUrl(x.filename))}" alt="">`}${z ? `<i class="isim-zone" style="left:${(z.x * 100).toFixed(2)}%;top:${(z.y * 100).toFixed(2)}%;width:${(z.w * 100).toFixed(2)}%;height:${(z.h * 100).toFixed(2)}%"></i>` : ''}</span><figcaption><b>${esc(label)}</b> ${esc(titleOf(x))}<small class="muted">${esc(fileLine(x))}</small></figcaption></figure>`;
            const why = r.kind === 'recadree' ? (r.part === 'a_in_b' ? `Cette photo est un morceau de ton image (environ ${Math.round((r.cover || 0) * 100)} % de sa surface), cadre en bleu.` : `Ton image est un morceau de cette photo (environ ${Math.round((r.cover || 0) * 100)} % de sa surface), cadre en bleu.`)
                : r.kind === 'identique' ? 'Exactement le même fichier.' : r.kind === 'proche' ? `La même image (${P().SUBS[r.sub] || 'très proche'}).` : 'Elles se ressemblent : même scène ou même document, peut-être une autre prise.';
            pv.innerHTML = `<div class="isim-pair">${box(q, onQuery ? zone : null, 'Ton image')}${box(it, onCand ? zone : null, 'Trouvée')}</div>
                <p class="isim-why">${UI().badge ? UI().badge(`${r.score} %`, P().KINDS[r.kind]?.badge || 'grey') : ''} <b>${esc(kindText(r))}</b><br><span class="muted">${esc(why)}</span></p>
                <div class="isim-prev-act">${q.id ? `<button type="button" class="button small" data-isim-cmp="${it.id}">🔍 Comparer deux photos</button>` : ''}<button type="button" class="button small secondary" data-isim-open="${it.id}">↗ Ouvrir le média</button></div>`;
        };
        const paint = () => { $('[data-isim-progress]').innerHTML = progressHtml(); paintQuery(); paintFilters(); paintResults(); };
        async function run() {
            if (!st.q) return paint();
            const seq = ++st.seq; st.busy = true; paint();
            try {
                const all = await loadAll();
                const qid = Number(st.q.id) || 0;
                const res = await P().search(st.q, all.items, {exclude: qid || null});
                if (seq !== st.seq || !d.isConnected) return;
                st.results = res;
                if (st.sel && !res.some(r => Number(r.item.id) === st.sel)) st.sel = null;
                if (!st.sel && res[0]) st.sel = Number(res[0].item.id);
            } catch (e) { if (seq === st.seq) $('[data-isim-results]').innerHTML = UI().notice('error', e.message || String(e)); st.busy = false; return; }
            st.busy = false; paint();
        }
        async function setMedia(m) {
            if (!m) return;
            const id = Number(m.id) || 0;
            st.q = {id, title: m.title || '', filename: m.filename || '', thumbnail: m.thumbnail || '', ext: String(m.filename || '').split('.').pop().toLowerCase()};
            st.results = []; st.sel = null; st.filter = 'all'; paint();
            try {
                const all = await loadAll();
                const found = all.items.find(x => Number(x.id) === id);
                if (found) st.q = found;
                else { // pas encore d'empreinte : calculée tout de suite (et rangée)
                    const r = await printFromUrl(mediaUrl(st.q.filename));
                    st.q = {...st.q, w: r.w, h: r.h, print: r.print};
                    if (!readOnly()) post('image_prints_save', {algo: P().ALGO, items: [{media_id: id, filename: st.q.filename, w: r.w, h: r.h, print: r.print}]}).then(() => { JOB.dirty = true; }).catch(() => {});
                }
            } catch (e) { $('[data-isim-results]').innerHTML = UI().notice('error', `Cette image n’a pas pu être lue (${e.message || e}).`); return; }
            run();
        }
        async function setFile(file) {
            if (!file) return;
            if (!/^image\//.test(file.type || '') && !IMG_EXT.test(file.name || '')) return toast('Choisis une image (JPG, PNG, WebP…).', 'error');
            try {
                const r = await printFromBlob(file);
                let sha1 = '';
                try { const h = new Uint8Array(await crypto.subtle.digest('SHA-1', await file.arrayBuffer())); sha1 = Array.from(h, x => x.toString(16).padStart(2, '0')).join(''); } catch (_) {}
                if (st.q?._local) URL.revokeObjectURL(st.q._local);
                st.q = {id: 0, title: file.name || 'Image collée', filename: '', ext: String(file.name || '').split('.').pop().toLowerCase() || String(file.type).split('/')[1] || '', size: file.size, sha1, w: r.w, h: r.h, print: r.print, _local: URL.createObjectURL(file)};
                st.results = []; st.sel = null; st.filter = 'all';
                run();
            } catch (e) { toast(`Cette image n’a pas pu être lue (${e.message || e}).`, 'error'); }
        }
        body.addEventListener('click', async e => {
            const t = e.target;
            const f = t.closest('[data-isim-filter]'); if (f) { st.filter = f.dataset.isimFilter; paintFilters(); paintResults(); return; }
            const s = t.closest('[data-isim-sel]'); if (s) { st.sel = Number(s.dataset.isimSel); paintResults(); $('[data-isim-prev]')?.scrollIntoView?.({block: 'nearest', behavior: 'smooth'}); return; }
            const byId = id => st.results.find(r => Number(r.item.id) === Number(id))?.item;
            const o = t.closest('[data-isim-open]'); if (o) { openMedia(byId(o.dataset.isimOpen)); return; }
            const c = t.closest('[data-isim-cmp]'); if (c) { compareTwo(st.q, byId(c.dataset.isimCmp)); return; }
            const fr = t.closest('[data-isim-from]'); if (fr) { setMedia(byId(fr.dataset.isimFrom)); return; }
            if (t.closest('[data-isim-pick]')) {
                const it = await window.LCNDA_PICKER?.openMediaPicker?.({types: ['image', 'document'], eyebrow: 'CHERCHER UNE IMAGE SEMBLABLE', title: 'La photo de départ', okLabel: 'Chercher'});
                if (it) setMedia(it);
            }
        });
        const onJob = () => { if (!d.isConnected) return; $('[data-isim-progress]').innerHTML = progressHtml(); clearTimeout(st.jt); st.jt = setTimeout(() => { if (st.q) run(); }, JOB.running ? 2500 : 200); };
        JOB.listeners.add(onJob); d._off = () => { JOB.listeners.delete(onJob); if (st.q?._local) URL.revokeObjectURL(st.q._local); };
        paint();
        runPrints();
        if (opts.file) setFile(opts.file);
        else if (opts.media) setMedia(typeof opts.media === 'object' ? opts.media : {id: opts.media});
        return d;
    }

    /* ═════════ 👯 Doublons d'images ═════════ */
    const CATS = [['parfaits', '＝ Parfaits'], ['retouches', '🎨 Retouchés'], ['recadres', '⬚ Recadrés / zoomés'], ['taille', '↔ Redimensionnés'], ['format', '🗂 Autre format']];
    const pairKey = (a, b) => { a = Number(a); b = Number(b); return a < b ? `${a}:${b}` : `${b}:${a}`; };
    async function openDuplicates() {
        if (!P()) return toast('Le moteur des images n’est pas encore chargé : réessaie dans un instant.', 'error');
        const d = dialogShell('isim-dups', 'MÉDIAS', '👯 Doublons d’images', 'Les mêmes photos rangées plusieurs fois, même retouchées, recadrées, zoomées ou dans un autre format. Garde la meilleure : ses liens réunissent ceux des autres.');
        const body = d.querySelector('.isim-body');
        const st = {groups: [], filter: 'all', keep: new Map(), mode: ls('lcnda-imgdup-mode', 'trash') === 'version' ? 'version' : 'trash', dismissed: new Set(), dismissedList: [], merges: [], busy: true, prog: 0, seq: 0, others: []};
        const sens = () => Math.max(0, Math.min(100, Number(ls(SIZE_KEY, 50)) || 50));
        body.innerHTML = `<div class="isim-dtop"><div data-isim-sens></div><div class="isim-mode" role="group" aria-label="Ce qu’on fait des autres photos"><span class="muted">Les autres photos :</span><span class="segmented"><button type="button" data-isim-mode="trash">🗑 À la corbeille</button><button type="button" data-isim-mode="version">🗂 En versions</button></span><span data-help="Corbeille : les autres photos sont retirées de la liste des médias (le fichier reste sur le disque) et reviennent avec « ↶ Remettre ». Versions : leur fichier devient une version de la photo gardée (visionneuse → versions)."></span></div></div>
            <div data-isim-progress></div><div class="ui-filters isim-filters" data-isim-filters role="toolbar" aria-label="Filtres"></div><div class="isim-groups" data-isim-groups></div>`;
        const $ = s => body.querySelector(s);
        const rf = UI().rangeField({label: 'Sensibilité', min: 0, max: 100, step: 5, value: sens(), unit: '%', default: 50});
        rf.dataset.help = 'Plus haut : l’app propose aussi des photos plus retouchées ou plus recadrées (plus de fausses alertes). Plus bas : seulement les doublons évidents.';
        $('[data-isim-sens]').appendChild(rf);
        rf.input.addEventListener('change', () => { lsSet(SIZE_KEY, Number(rf.input.value)); compute(); });
        const paintMode = () => body.querySelectorAll('[data-isim-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.isimMode === st.mode));
        paintMode();
        const catCount = c => st.groups.filter(g => g.cats.has(c)).length;
        const paintFilters = () => {
            $('[data-isim-filters]').innerHTML = [['all', 'Tout', st.groups.length], ...CATS.map(([k, l]) => [k, l, catCount(k)]), ['dismissed', '🙈 Pas des doublons', st.dismissedList.length], ['trash', '🗑 Corbeille des doublons', st.merges.length]]
                .map(([k, l, n]) => `<button type="button" class="${st.filter === k ? 'is-active' : ''}" data-isim-filter="${k}">${esc(l)} (${fmt(n)})</button>`).join('');
        };
        const keepOf = g => st.keep.get(g.id) || Number(g.best.id);
        const relation = (g, it) => {
            const k = keepOf(g); if (Number(it.id) === k) return null;
            const p = g.pairs.find(p => (Number(p.a.id) === k && Number(p.b.id) === Number(it.id)) || (Number(p.b.id) === k && Number(p.a.id) === Number(it.id))) || g.pairs.find(p => Number(p.a.id) === Number(it.id) || Number(p.b.id) === Number(it.id));
            return p ? p.r : null;
        };
        const groupHtml = (g, i) => {
            const k = keepOf(g), best = Number(g.best.id);
            const cards = UI().cardsHtml(g.items.map(it => {
                const r = relation(g, it), kept = Number(it.id) === k;
                return {thumb: thumbOf(it), name: titleOf(it), open: it.filename ? `data-isim-open="${it.id}"` : '', cls: kept ? 'is-kept' : '',
                    lines: [fileLine(it) || it.date_text || '', `${r ? `${kindText(r)} · ` : ''}${linksLine(it.links)}`],
                    badges: [kept ? {text: '★ Gardée', kind: 'green'} : null, Number(it.id) === best && it.w ? {text: 'La plus grande', kind: 'blue'} : null, r ? kindBadge(r) : null].filter(Boolean),
                    quick: kept ? '' : `<button type="button" class="button small secondary" data-isim-keep="${g.id}:${it.id}" title="Garder celle-ci à la place">★ Garder</button>`,
                    menu: [`<button type="button" data-isim-open="${it.id}">↗ Ouvrir le média</button>`, !kept && it.w ? `<button type="button" data-isim-cmp2="${g.id}:${it.id}">🔍 Comparer avec la photo gardée</button>` : '', it.w ? `<button type="button" data-isim-similar="${it.id}">🔍 Chercher une image semblable</button>` : '', `<button type="button" data-isim-out="${g.id}:${it.id}">🙈 Pas un doublon des autres</button>`]};
            }), {size: 's'});
            const cats = [...g.cats].map(c => CATS.find(x => x[0] === c)?.[1]).filter(Boolean).join(' · ');
            return `<section class="isim-group" data-isim-group="${g.id}"><header class="isim-ghead"><div><b>Groupe ${i + 1} · ${plural(g.items.length, 'photo')}</b> <small class="muted">${esc(cats)}</small></div>
                <div class="isim-gact"><button type="button" class="button small secondary" data-isim-notdup="${g.id}">🙈 Ce n’est pas un doublon</button><button type="button" class="button small" data-isim-merge="${g.id}">👯 Garder ★ et fusionner ${plural(g.items.length - 1, 'autre')}</button></div></header>${cards}</section>`;
        };
        const thumbRow = list => list.map(x => `<span class="isim-mini" title="${esc(titleOf(x))}">${x.filename || x.thumbnail ? `<img src="${esc(mediaUrl(x.thumbnail || x.filename))}" alt="" loading="lazy">` : '🖼'}</span>`).join('');
        const paintGroups = () => {
            const box = $('[data-isim-groups]');
            if (st.filter === 'dismissed') {
                box.innerHTML = st.dismissedList.length ? `<div class="ui-rows">${st.dismissedList.map(([a, b]) => { const ia = byId(a), ib = byId(b); return `<div class="ui-row"><span class="ui-row-thumb isim-pairthumbs">${thumbRow([ia || {id: a}, ib || {id: b}])}</span><div class="ui-row-main"><b class="ui-row-name">${esc(titleOf(ia || {id: a}))} ↔ ${esc(titleOf(ib || {id: b}))}</b><small class="muted">Tu as dit : ce n’est pas un doublon.</small></div><span></span><div class="ui-row-act"><button type="button" class="button small secondary" data-isim-redo="${a}:${b}">↺ Signaler de nouveau</button></div></div>`; }).join('')}</div>`
                    : A().empty('Aucune paire écartée.', {icon: '🙈'});
                return;
            }
            if (st.filter === 'trash') {
                box.innerHTML = st.merges.length ? `<div class="ui-rows">${st.merges.map(m => `<div class="ui-row"><span class="ui-row-thumb isim-pairthumbs">${thumbRow(m.others || [])}<b aria-hidden="true">→</b>${thumbRow([m.keep])}</span><div class="ui-row-main"><b class="ui-row-name">${esc(m.summary)}</b><small class="muted">${m.mode === 'version' ? 'Gardées en versions de la photo gardée' : 'Le fichier est toujours sur le disque'}</small></div><small class="muted ui-row-date">${UI().when ? UI().when(m.created_at, {label: 'Fusionné'}) : esc(m.created_at)}</small><div class="ui-row-act"><button type="button" class="button small secondary" data-isim-undo="${esc(m.token)}">↶ Remettre</button></div></div>`).join('')}</div>`
                    : A().empty('La corbeille des doublons est vide.', {icon: '🗑'});
                return;
            }
            if (st.busy && !st.groups.length) { box.innerHTML = UI().spinner(st.prog ? `Comparaison des photos… ${st.prog} %` : 'Comparaison des photos…'); return; }
            const rows = st.groups.filter(g => st.filter === 'all' || g.cats.has(st.filter));
            const ready = ALL?.items?.length || 0;
            box.innerHTML = rows.length ? `<p class="muted isim-count">${plural(rows.length, 'groupe de doublons', 'groupes de doublons')} parmi ${plural(ready + st.others.length, 'média comparé', 'médias comparés')}${st.busy ? ' — comparaison en cours…' : ''}</p>${rows.map(g => groupHtml(g, st.groups.indexOf(g))).join('')}`
                : A().emptyState({icon: '👯', text: st.groups.length ? 'Aucun groupe de cette sorte' : 'Aucun doublon trouvé', hint: JOB.running ? 'Les empreintes ne sont pas toutes prêtes : la liste se complète toute seule.' : `Parmi ${plural(ready, 'photo', 'photos')}. Monte la sensibilité pour voir les photos plus différentes.`});
        };
        const byId = id => (ALL?.items || []).find(x => Number(x.id) === Number(id)) || st.others.find(x => Number(x.id) === Number(id));
        const paint = () => { $('[data-isim-progress]').innerHTML = progressHtml(); paintFilters(); paintGroups(); };
        async function loadState() {
            const s = await api('image_dup_state');
            st.dismissedList = s.dismissed || []; st.dismissed = new Set(st.dismissedList.map(([a, b]) => pairKey(a, b))); st.merges = s.merges || [];
        }
        async function compute() {
            const seq = ++st.seq; st.busy = true; st.prog = 0; paint();
            try {
                const [all] = await Promise.all([loadAll(), loadState()]);
                // les fichiers identiques qui ne sont pas des photos (sons, PDF…) : l'ancienne recherche de doublons, reprise ici
                if (!st.othersLoaded) {
                    st.othersLoaded = true;
                    try {
                        const md = await api('media_duplicates');
                        st.otherGroups = (md.groups || []).filter(g => (g.items || []).some(it => !isImage(it))).map(g => g.items.map(it => ({id: Number(it.id), title: it.title || it.document_title || '', filename: it.filename, thumbnail: it.thumbnail, media_type: it.media_type, ext: String(it.filename || '').split('.').pop().toLowerCase(), size: it.size_bytes, w: 0, h: 0, sha1: g.hash, links: {n: (it.people_links || []).length, persons: (it.people_links || []).length}})));
                        st.others = st.otherGroups.flat();
                    } catch (_) { st.otherGroups = []; }
                }
                const groups = await P().duplicates(all.items, {sens: sens() / 100, dismissed: st.dismissed, onProgress: (a, b) => { if (seq === st.seq && d.isConnected) { const p = Math.round(a / b * 100); if (p !== st.prog) { st.prog = p; if (!st.groups.length) paintGroups(); } } }});
                for (const items of st.otherGroups || []) {
                    const live = items.filter(x => !st.gone?.has(Number(x.id)));
                    const pairs = []; for (let i = 1; i < live.length; i++) if (!st.dismissed.has(pairKey(live[0].id, live[i].id))) pairs.push({a: live[0], b: live[i], r: {kind: 'identique', sub: 'parfait', score: 100}});
                    if (pairs.length) groups.push({items: [live[0], ...pairs.map(p => p.b)], pairs, cats: new Set(['parfaits']), best: live[0]});
                }
                if (seq !== st.seq || !d.isConnected) return;
                groups.forEach(g => { g.id = g.items.map(x => Number(x.id)).sort((a, b) => a - b).join('-'); });
                st.groups = groups;
            } catch (e) { if (seq === st.seq) $('[data-isim-groups]').innerHTML = UI().notice('error', e.message || String(e)); st.busy = false; return; }
            st.busy = false; paint();
        }
        const groupOf = id => st.groups.find(g => g.id === id);
        async function merge(g) {
            const keep = byId(keepOf(g)), others = g.items.filter(x => Number(x.id) !== Number(keep.id));
            const payload = {keep: Number(keep.id), mode: st.mode, others: others.map(o => { let map = null; if (keep.print && o.print) { const r = P().compare(keep, o, {sens: .8}); if (r.map && r.kind) map = r.map; } return {id: Number(o.id), map}; })};
            const btn = body.querySelector(`[data-isim-merge="${g.id}"]`); if (btn) btn.disabled = true;
            let res;
            try { res = await api('image_dup_merge', {}, {method: 'POST', body: payload}); }
            catch (e) { if (btn) btn.disabled = false; return toast(e.message, 'error', {retry: () => merge(g)}); }
            const gone = new Set(res.removed.map(Number));
            st.gone = new Set([...(st.gone || []), ...gone]);
            if (ALL) ALL.items = ALL.items.filter(x => !gone.has(Number(x.id)));
            st.groups = st.groups.filter(x => x !== g);
            await loadState().catch(() => {}); paint();
            let token = res.token;
            A().undoToast(res.summary, {icon: '👯',
                undo: async () => { await api('image_dup_undo', {}, {method: 'POST', body: {token}}); st.gone = new Set([...(st.gone || [])].filter(x => !gone.has(x))); await loadAll(true); if (d.isConnected) compute(); A().refreshScreen?.(); },
                redo: async () => { const r2 = await api('image_dup_merge', {}, {method: 'POST', body: payload}); token = r2.token; st.gone = new Set([...(st.gone || []), ...gone]); await loadAll(true); if (d.isConnected) compute(); A().refreshScreen?.(); }});
            A().refreshScreen?.();
        }
        async function dismiss(pairs, message) {
            try { await api('image_dup_dismiss', {}, {method: 'POST', body: {pairs}}); } catch (e) { return toast(e.message, 'error'); }
            pairs.forEach(([a, b]) => st.dismissed.add(pairKey(a, b)));
            await compute();
            A().undoToast(message, {icon: '🙈', undo: async () => { await api('image_dup_dismiss', {}, {method: 'POST', body: {pairs, undo: true}}); if (d.isConnected) compute(); }, redo: async () => { await api('image_dup_dismiss', {}, {method: 'POST', body: {pairs}}); if (d.isConnected) compute(); }});
        }
        body.addEventListener('click', async e => {
            const t = e.target;
            const f = t.closest('[data-isim-filter]'); if (f) { st.filter = f.dataset.isimFilter; paint(); return; }
            const m = t.closest('[data-isim-mode]'); if (m) { st.mode = m.dataset.isimMode; lsSet('lcnda-imgdup-mode', st.mode); paintMode(); return; }
            const k = t.closest('[data-isim-keep]'); if (k) { const [gid, id] = k.dataset.isimKeep.split(':'); st.keep.set(gid, Number(id)); paintGroups(); return; }
            const o = t.closest('[data-isim-open]'); if (o) { const it = byId(o.dataset.isimOpen); if (it && isImage(it)) openMedia(it); else if (it) window.open(mediaUrl(it.filename), '_blank', 'noopener'); return; }
            const c2 = t.closest('[data-isim-cmp2]'); if (c2) { const [gid, id] = c2.dataset.isimCmp2.split(':'); const g = groupOf(gid); if (g) compareTwo(byId(keepOf(g)), byId(id)); return; }
            const sm = t.closest('[data-isim-similar]'); if (sm) { openSimilar({media: byId(sm.dataset.isimSimilar)}); return; }
            const mg = t.closest('[data-isim-merge]'); if (mg) { const g = groupOf(mg.dataset.isimMerge); if (g) merge(g); return; }
            const nd = t.closest('[data-isim-notdup]'); if (nd) { const g = groupOf(nd.dataset.isimNotdup); if (!g) return; const pairs = []; for (let i = 0; i < g.items.length; i++) for (let j = i + 1; j < g.items.length; j++) pairs.push([Number(g.items[i].id), Number(g.items[j].id)]); dismiss(pairs, `Groupe de ${plural(g.items.length, 'photo')} : ce ne sont pas des doublons`); return; }
            const out = t.closest('[data-isim-out]'); if (out) { const [gid, id] = out.dataset.isimOut.split(':'); const g = groupOf(gid); if (!g) return; dismiss(g.items.filter(x => Number(x.id) !== Number(id)).map(x => [Number(id), Number(x.id)]), `« ${titleOf(byId(id) || {})} » n’est pas un doublon des autres`); return; }
            const rd = t.closest('[data-isim-redo]'); if (rd) { const pair = rd.dataset.isimRedo.split(':').map(Number); try { await api('image_dup_dismiss', {}, {method: 'POST', body: {pairs: [pair], undo: true}}); } catch (er) { return toast(er.message, 'error'); } st.dismissed.delete(pairKey(...pair)); await compute(); A().undoToast('Paire signalée de nouveau', {undo: async () => { await api('image_dup_dismiss', {}, {method: 'POST', body: {pairs: [pair]}}); if (d.isConnected) compute(); }}); return; }
            const un = t.closest('[data-isim-undo]'); if (un) { const token = un.dataset.isimUndo; un.disabled = true; try { await api('image_dup_undo', {}, {method: 'POST', body: {token}}); } catch (er) { un.disabled = false; return toast(er.message, 'error'); } st.gone = new Set(); await loadAll(true); toast('Fusion annulée : les photos sont revenues avec leurs liens.', 'success'); compute(); A().refreshScreen?.(); }
        });
        const onJob = () => { if (!d.isConnected) return; $('[data-isim-progress]').innerHTML = progressHtml(); clearTimeout(st.jt); if (!JOB.running) st.jt = setTimeout(() => compute(), 200); };
        JOB.listeners.add(onJob); d._off = () => JOB.listeners.delete(onJob);
        paint();
        runPrints();
        compute();
        return d;
    }

    ext.openSimilarImages = openSimilar;
    ext.openImageDuplicates = openDuplicates;

    /* ═════════ Les portes d'entrée ═════════ */
    document.addEventListener('click', e => {
        const b = e.target.closest?.('#similar-media');
        if (b) { const S = A()?.state, it = S?.lightboxMedia?.[S.lightboxIndex]; if (it) openSimilar({media: it}); return; }
        const c = e.target.closest?.('[data-similar-media]');
        if (c) { e.preventDefault(); const id = Number(c.dataset.similarMedia); const row = (A()?.state?.currentListRows || []).find(r => Number(r.id) === id); openSimilar({media: row || {id}}); return; }
        if (e.target.closest?.('[data-similar-open]')) { e.preventDefault(); openSimilar({}); return; }
        if (e.target.closest?.('[data-image-dups-open]')) { e.preventDefault(); openDuplicates(); }
    });
})();
