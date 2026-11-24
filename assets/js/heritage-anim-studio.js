/* LCNDA — 🎞 Studio d'animation : l'écran (maquette docs/design/studio-animation.html).
 * Un petit logiciel de montage : les scènes à gauche, l'aperçu au milieu (lecture, curseur, caméra à la souris), les réglages à droite
 * (la scène choisie, ou le film : musique, voix, textes, police), la ligne de temps en bas (le film entier ; et pour la scène : temps,
 * caméra ◆, légendes, images). Chaque changement : ↶ Annuler / ↷ Rétablir, enregistrement tout seul. Export : heritage-anim-export.js.
 * Ouvrir : Listes → 🛠️ Outils de modification → 🎞 Studio d'animation ; « 🎞 Animer » sous un diagramme daté ; le 🎬 Film de la famille.
 *   ext.openAnimStudio({id, diagram: {spec, name}, template: 'migrations' | 'grandfilm' | …})
 * Serveur : lib/anim_studio.php. Essai : tests/test-anim-studio-ui.js.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const RN = () => ext.animRender, EX = () => ext.animExport;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const uid = () => Math.random().toString(36).slice(2, 9);
    const fmtT = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
    const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
    const set = (o, path, v) => { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach(k => { if (!x[k] || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; };

    /* ═════ réglages par défaut (⚙️ Réglages par défaut des nouveaux films) — valeurs recommandées ═════ */
    const DEF_KEY = 'genealogie-anim-defaults';
    const RECO = {format: '16:9', quality: 1080, fps: 30, font: 'system', bg: '#111111', trans: 'fade', transDur: .8, smooth: true, colorBy: 'surname', camMode: 'follow', maxZoom: 3,
        autoCap: true, capKinds: ['depart', 'mariage'], capMax: 10, slow: true, basemap: 'light', trails: true, fadeDead: true, life: 25, dot: 6, captionStyle: 'dark', yearPos: 'tr', legend: 'br', exportFormat: 'mp4', srt: true, toMedia: false};
    const defs = () => { try { return {...RECO, ...(JSON.parse(localStorage.getItem(DEF_KEY) || '{}') || {})}; } catch (_) { return {...RECO}; } };
    const saveDefs = d => { try { localStorage.setItem(DEF_KEY, JSON.stringify(d)); } catch (_) {} };

    /* ═════ les sortes de scènes : un nom, une icône, une scène neuve ═════ */
    const TYPES = {
        title: {icon: '🎬', label: 'Titre', make: d => ({dur: 4, title: T('Notre famille'), subtitle: '', bg: '#141414', color: '#ffffff', align: 'center', size: 1})},
        image: {icon: '🖼', label: 'Photo', make: d => ({dur: 5, media: null, z0: 1, z1: 1.15, x0: .5, y0: .5, x1: .5, y1: .5, fit: 'cover', text: ''})},
        diagram: {icon: '📊', label: 'Diagramme', make: d => ({dur: 20, spec: null, smooth: d.smooth, cam: {mode: 'fit', keys: []}, ease: 'linear'})},
        migrations: {icon: '🧭', label: 'Migrations de la famille', make: d => ({dur: 40, title: T('La famille au fil des siècles'), who: 'all', root: 0, surname: '', colorBy: d.colorBy, colors: {}, maxKeys: 8, otherColor: '#8a8f99', basemap: d.basemap, dim: .18, tone: '', trails: d.trails, trailStay: false, fadeDead: d.fadeDead, life: d.life, dot: d.dot, shape: 'circle', labels: 'places',
            cam: {mode: d.camMode, maxZoom: d.maxZoom, keys: []}, autoCap: {on: d.autoCap, kinds: d.capKinds, max: d.capMax}, slow: d.slow, ease: 'linear'})},
        race: {icon: '🏁', label: 'Course des noms et prénoms', make: d => ({dur: 25, title: T('Les noms de la famille, décennie après décennie'), what: 'surname', mode: 'decade', window: 20, top: 10, colors: {}, fixedScale: false, bg: '#ffffff', ease: 'linear'})},
        pyramid: {icon: '👥', label: 'La pyramide qui vit', make: d => ({dur: 20, title: T('Qui vivait, année après année'), step: 5, maxAge: 100, colors: {m: '#2a6a9a', f: '#c0392b'}, fixedScale: true, bg: '#ffffff', ease: 'linear'})},
        line: {icon: '📈', label: 'La courbe qui se dessine', make: d => ({dur: 15, title: T('Les naissances dans la famille'), what: 'births', per: 'year', cumulative: false, color: '#2a6a9a', fill: true, bg: '#ffffff', ease: 'linear'})},
        borders: {icon: '🏛', label: 'Les frontières qui changent', make: d => ({dur: 30, title: T('La France et ses frontières, 1760-1925'), from: 1760, to: 1925, view: 'napoleon', color: '#2a5fa8', sea: '#dfe8ee', land: '#f1eee6', events: true, ease: 'linear'})},
        tree: {icon: '🌳', label: 'L’arbre qui pousse', make: d => ({dur: 15, title: T('Nos ancêtres, génération après génération'), root: 0, gens: 7, colorBy: 'branch', color: '#c9b48a', names: true, bg: '#ffffff'})},
    };
    function newScene(type, extra = {}) {
        const d = defs();
        return {id: uid(), type, name: T(TYPES[type].label), trans: d.trans, transDur: d.transDur, captions: [], pics: [], ...TYPES[type].make(d), ...extra};
    }
    function newProject(scenes = []) {
        const d = defs();
        return {v: 1, format: d.format, quality: d.quality, fps: d.fps, font: d.font, bg: d.bg, watermark: '', overlays: {year: d.yearPos, legend: d.legend, caption: 'bottom', captionStyle: d.captionStyle, yearSize: 1, captionSize: 1, titleSize: .042},
            music: null, voices: [], scenes};
    }
    const TEMPLATES = {
        migrations: () => [newScene('title', {title: T('La famille au fil des siècles'), dur: 4}), newScene('migrations')],
        race: () => [newScene('race')], pyramid: () => [newScene('pyramid')], line: () => [newScene('line')], tree: () => [newScene('tree')], borders: () => [newScene('borders')],
        life: () => [newScene('migrations', {who: 'desc', title: T('Une vie en 60 secondes'), dur: 60})],
        grandfilm: () => [newScene('title', {title: T('Le grand film de la famille'), subtitle: '', dur: 5}), newScene('migrations'), newScene('race', {trans: 'black'}), newScene('pyramid'), newScene('tree'), newScene('title', {title: T('Fin'), subtitle: T('Sources : les actes et les archives de la famille'), dur: 5, trans: 'black'})],
    };

    /* ═════ ouvrir le Studio ═════ */
    async function open({id = 0, diagram = null, template = '', onClose = null, toMontage = null, image = null} = {}) {
        if (!RN() || !EX()) return A().toast(T('Le Studio d’animation n’est pas encore chargé : réessaie dans un instant.'), 'error');
        let P = {id: 0, title: T('Mon film'), data: newProject()};
        if (id) { try { const r = await A().api('anim_project', {id}); P = {id: r.project.id, title: r.project.title, data: {...newProject(), ...(r.project.data || {})}}; } catch (e) { return A().toast(e.message, 'error'); } }
        else if (diagram?.spec) { P.title = diagram.name || T('Mon diagramme animé'); P.data.scenes = [newScene('diagram', {spec: diagram.spec, name: diagram.name || T('Diagramme'), title: diagram.name || ''})]; }
        else if (template && TEMPLATES[template]) { P.data.scenes = TEMPLATES[template](); P.title = P.data.scenes.find(s => s.title)?.title || P.title; }
        else if (image?.filename) { P.title = image.title || T('Mon film'); P.data.scenes = []; }
        else P.data.scenes = [newScene('title', {title: T('Mon film')})];
        // 📤 une image envoyée par le vectoriel ou la retouche (heritage-envoyer.js) : une scène « photo » à la fin, zoom doux
        if (image?.filename) { P.data.scenes.push(newScene('image', {media: {id: image.id, filename: image.filename, title: image.title}, name: image.title || T('Photo')})); P.dirtyFromSend = true; }
        studio(P, onClose, toMontage);
    }
    ext.openAnimStudio = open;

    /* ═════ l'écran ═════ */
    function studio(P, onClose, toMontage = null) { // toMontage(media) : ouvert depuis le 🎬 Montage vidéo, le film y retourne
        const ro = kiosk(), D = () => P.data;
        let sel = 0, t = 0, playing = false, raf = 0, hist = [], hpos = -1, dirty = false, saveT = 0, tab = 'scene', liveCam = null, drawing = false, again = false, lastPrevW = 0;
        const dlg = document.createElement('dialog'); dlg.className = 'modal an-dlg'; dlg.dataset.ownClose = '1';
        dlg.innerHTML = `<div class="an">
            <header class="an-top"><span class="an-logo" aria-hidden="true">🎞</span><input class="an-name" data-an-name value="${esc(P.title)}" maxlength="200" aria-label="${esc(T('Nom du film'))}" ${ro ? 'readonly' : ''}>
                <span class="segmented an-fmt" role="radiogroup" aria-label="${esc(T('Format'))}" data-an-fmt></span>
                <span class="an-hist"><button type="button" class="icon-button small" data-an="undo" title="${esc(T('Annuler'))}" aria-label="${esc(T('Annuler'))}">↶</button><button type="button" class="icon-button small" data-an="redo" title="${esc(T('Rétablir'))}" aria-label="${esc(T('Rétablir'))}">↷</button></span>
                <span class="spacer"></span><span class="ui-status" data-ui-status></span>
                <button type="button" class="button small secondary" data-an="playall">▶ ${esc(T('Tout regarder'))}</button>
                <button type="button" class="button small" data-an="export">⤓ ${esc(T('Exporter…'))}</button>
                <button type="button" class="icon-button small" data-an="more" title="${esc(T('Plus'))}" aria-label="${esc(T('Plus'))}">⋯</button>
                ${ext.fullButton ? ext.fullButton('anim') : ''}<button type="button" class="icon-button" data-an="close" aria-label="${esc(T('Fermer'))}" title="${esc(T('Fermer'))}">×</button></header>
            <div class="an-main">
                <aside class="an-scenes"><div data-an-list data-ord-off></div><button type="button" class="button small secondary an-add" data-an="add" ${ro ? 'hidden' : ''}>＋ ${esc(T('Scène'))}</button></aside>
                <section class="an-stage"><div class="an-view" data-an-view><canvas data-an-cv></canvas><div class="an-camhint" data-an-camhint hidden></div><div class="an-wait" data-an-wait hidden>⏳ ${esc(T('Préparation (données, fond de carte)…'))}</div></div>
                    <div class="an-ctl"><button type="button" class="icon-button small" data-an="prev" title="${esc(T('Scène d’avant'))}" aria-label="${esc(T('Scène d’avant'))}">⏮</button><button type="button" class="button small an-play" data-an="play" aria-label="${esc(T('Lire'))}">▶</button><button type="button" class="icon-button small" data-an="next" title="${esc(T('Scène suivante'))}" aria-label="${esc(T('Scène suivante'))}">⏭</button>
                        <input type="range" class="an-scrub" data-an-scrub data-ui-done="1" min="0" max="1000" step="1" value="0" aria-label="${esc(T('Moment du film'))}"><span class="an-time" data-an-time></span><span class="an-cambar" data-an-cambar></span></div></section>
                <aside class="an-side"><nav class="segmented an-tabs"><button type="button" data-an-tab="scene">${esc(T('Scène'))}</button><button type="button" data-an-tab="film">${esc(T('Film'))}</button></nav><div class="an-pane" data-an-pane></div></aside>
            </div>
            <footer class="an-time-area"><div data-an-tl></div></footer></div>`;
        document.body.appendChild(dlg); ext.fullInit?.(dlg, 'anim', true); dlg.showModal();
        const $ = s => dlg.querySelector(s), cv = $('[data-an-cv]'), g = cv.getContext('2d');
        const S = () => D().scenes[sel] || null;
        const total = () => RN().totalDur(D());
        const sceneStart = i => D().scenes.slice(0, i).reduce((a, s) => a + RN().durOf(s), 0);
        const status = st => { const el = $('[data-ui-status]'); if (!el) return; if (UI().savedStatus) UI().savedStatus(el, st); else el.textContent = {saved: T('✓ Enregistré'), dirty: T('• modifié'), saving: T('Enregistrement…'), error: T('⚠️ Pas enregistré')}[st] || ''; };

        /* ── historique et enregistrement ── */
        const snap = () => JSON.stringify({title: P.title, data: P.data});
        const pushHist = () => { hist = hist.slice(0, hpos + 1); hist.push(snap()); if (hist.length > 120) hist.shift(); hpos = hist.length - 1; };
        pushHist();
        function changed({redraw = true, list = true, pane = false, tl = true} = {}) {
            if (ro) return;
            pushHist(); dirty = true; status('dirty'); clearTimeout(saveT); saveT = setTimeout(save, 1500);
            if (list) paintList(); if (pane) paintPane(); if (tl) paintTimeline(); if (redraw) draw();
        }
        async function save() {
            if (ro || !dirty) return; clearTimeout(saveT); status('saving');
            try { const r = await A().api('save_anim_project', {}, {method: 'POST', body: {id: P.id, title: P.title, data: P.data}}); P.id = (r.result || r).id || P.id; dirty = false; status('saved'); }
            catch (e) { status('error'); A().toast(e.message, 'error'); }
        }
        const restore = s => { const o = JSON.parse(s); P.title = o.title; P.data = o.data; $('[data-an-name]').value = P.title; sel = clamp(sel, 0, Math.max(0, D().scenes.length - 1)); dirty = true; status('dirty'); clearTimeout(saveT); saveT = setTimeout(save, 1500); paintAll(); };
        const undo = () => { if (hpos > 0) { hpos--; restore(hist[hpos]); } };
        const redo = () => { if (hpos < hist.length - 1) { hpos++; restore(hist[hpos]); } };

        /* ── l'aperçu ── */
        function sizePreview() {
            const [W, H] = RN().sizeOf(D().format, 540), view = $('[data-an-view]');
            if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
            const bw = view.clientWidth || 640, bh = view.clientHeight || 360, k = Math.min(bw / W, bh / H);
            cv.style.width = Math.round(W * k) + 'px'; cv.style.height = Math.round(H * k) + 'px'; lastPrevW = W * k;
        }
        async function draw() {
            if (drawing) { again = true; return; }
            drawing = true; const busy = setTimeout(() => { const w = $('[data-an-wait]'); if (w) w.hidden = false; }, 350);
            try {
                sizePreview();
                let proj = D();
                if (liveCam && S()) { proj = {...proj, scenes: proj.scenes.map((s, i) => (i === sel ? {...s, cam: {...(s.cam || {}), mode: 'keys', keys: [{t: 0, ...liveCam}]}} : s))}; }
                const info = await RN().drawFrame(g, proj, t, cv.width, cv.height, {preview: true});
                const tot = total(), at = RN().scenesAt(D(), t);
                $('[data-an-time]').textContent = `${fmtT(t)} / ${fmtT(tot)}${Number.isFinite(info?.year) ? ` · ${Math.floor(info.year + 1e-6)}` : ''}`;
                if (!playing) $('[data-an-scrub]').value = String(tot ? Math.round(t / tot * 1000) : 0);
                if (at && at.i !== sel && playing) { sel = at.i; paintList(); }
                paintPlayhead();
            } catch (e) { console.error(e); }
            clearTimeout(busy); const w = $('[data-an-wait]'); if (w) w.hidden = true;
            drawing = false;
            if (again) { again = false; draw(); }
        }
        function play(from = null) {
            if (playing) return stopPlay();
            playing = true; $('[data-an="play"]').textContent = '⏸'; const tot = total();
            if (from !== null) t = from; else if (t >= tot - .05) t = 0;
            let last = performance.now();
            const step = async now => { if (!playing || !dlg.isConnected) return; t += (now - last) / 1000; last = now; if (t >= tot) { t = tot; stopPlay(); draw(); return; } $('[data-an-scrub]').value = String(Math.round(t / tot * 1000)); await draw(); raf = requestAnimationFrame(step); };
            raf = requestAnimationFrame(step);
        }
        function stopPlay() { playing = false; cancelAnimationFrame(raf); const b = $('[data-an="play"]'); if (b) b.textContent = '▶'; }
        const goScene = i => { sel = clamp(i, 0, D().scenes.length - 1); t = sceneStart(sel) + .01; liveCam = null; paintAll(); };

        /* ── les scènes ── */
        function paintList() {
            const L = $('[data-an-list]');
            L.innerHTML = D().scenes.map((s, i) => `<div class="an-sc${i === sel ? ' is-on' : ''}" data-an-sc="${i}" role="button" tabindex="0" aria-pressed="${i === sel}"><span class="an-sc-ico" aria-hidden="true">${TYPES[s.type]?.icon || '•'}</span><span class="an-sc-txt"><b>${i + 1} · ${esc(s.name || T(TYPES[s.type]?.label || ''))}</b><small>${esc(T('{s} s', {s: String(Math.round(RN().durOf(s) * 10) / 10)}))}${s.type !== 'title' && s.type !== 'image' && (s.from || s._from) ? ` · ${esc(String(s.from || s._from || ''))} → ${esc(String(s.to || s._to || ''))}` : ''}</small></span>
                ${ro ? '' : `<span class="an-sc-act"><button type="button" class="icon-button small" data-an-mv="${i}|-1" title="${esc(T('Monter'))}" aria-label="${esc(T('Monter'))}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button small" data-an-mv="${i}|1" title="${esc(T('Descendre'))}" aria-label="${esc(T('Descendre'))}" ${i < D().scenes.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-button small" data-an-scm="${i}" title="${esc(T('Plus'))}" aria-label="${esc(T('Plus'))}">⋯</button></span>`}</div>`).join('')
                || `<p class="muted">${esc(T('Aucune scène : « ＋ Scène ».'))}</p>`;
        }
        function addMenu(btn) {
            // les photos et les vidéos se montent dans le 🎬 Montage vidéo (pas de doublon) : ici, ce qui s'anime à partir de la base
            const items = Object.entries(TYPES).filter(([k]) => k !== 'image').map(([k, v]) => ({icon: v.icon, label: T(v.label), run: () => addScene(k)}));
            if (ext.openAvEditor) items.push('-', {icon: '🎬', label: T('Photos et vidéos : dans le Montage vidéo (⤓ Exporter → Continuer dans le Montage)'), run: () => exportDialog()});
            items.push('-', {icon: '🎬', label: T('Modèle : le grand film de la famille'), run: () => { const list = TEMPLATES.grandfilm(); D().scenes.splice(sel + 1, 0, ...list); sel = sel + 1; changed({pane: true}); }});
            UI().menuAt?.(btn, items, {title: T('Ajouter une scène')});
        }
        async function addScene(type) {
            const extra = {};
            if (type === 'image') { const m = await pickImage(); if (!m) return; extra.media = m; extra.name = m.title || T('Photo'); }
            if (type === 'diagram') { const d = await pickDiagram(); if (!d) return; Object.assign(extra, d); }
            D().scenes.splice(sel + 1, 0, newScene(type, extra)); sel = Math.min(sel + 1, D().scenes.length - 1); t = sceneStart(sel) + .01; tab = 'scene'; changed({pane: true});
        }
        async function pickImage() {
            const P2 = window.LCNDA_MEDIA_PICKER || window.LCNDA_PICKER; if (!P2?.openMediaPicker) { A().toast(T('La fenêtre des images n’est pas chargée.'), 'error'); return null; }
            const it = await P2.openMediaPicker({types: ['image']}); return it && it.filename ? {id: Number(it.id), filename: it.filename, title: it.title || ''} : null;
        }
        async function pickAudio() {
            const P2 = window.LCNDA_MEDIA_PICKER || window.LCNDA_PICKER; if (!P2?.openMediaPicker) { A().toast(T('La fenêtre des médias n’est pas chargée.'), 'error'); return null; }
            const it = await P2.openMediaPicker({types: ['audio']}); return it && it.filename ? {id: Number(it.id), filename: it.filename, title: it.title || ''} : null;
        }
        async function pickDiagram() {
            let list = []; try { list = (await A().api('diagrams')).diagrams || []; } catch (e) { A().toast(e.message, 'error'); return null; }
            if (!list.length) { A().toast(T('Aucun diagramme enregistré : fais-en un dans Graphiques → Diagrammes, puis « 🎞 Animer ».'), 'error'); return null; }
            const timed = d => !!ext.diagramPerso?.timeInfo?.({...(d.spec || {}), kind: d.kind});
            return new Promise(res => {
                const dg = document.createElement('dialog'); dg.className = 'modal an-pick';
                dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🎞 ${esc(T('Studio d’animation'))}</span><h2>${esc(T('Choisir un diagramme'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(T('Fermer'))}">×</button></div>
                    <p class="muted">${esc(T('Ceux qui ont des dates (⏱) bougent dans le temps ; les autres restent fixes (la caméra peut quand même bouger).'))}</p>
                    <input type="search" data-q placeholder="${esc(T('Chercher un diagramme…'))}" aria-label="${esc(T('Chercher un diagramme'))}"><div class="an-pick-list" data-l></div></form>`;
                document.body.appendChild(dg); dg.showModal();
                const paint = q => { dg.querySelector('[data-l]').innerHTML = list.filter(d => !q || d.name.toLowerCase().includes(q.toLowerCase())).map(d => `<button type="button" class="an-pick-it" data-id="${d.id}"><b>${timed(d) ? '⏱ ' : ''}${esc(d.name)}</b><small class="muted">${esc(d.kind)}</small></button>`).join(''); };
                paint('');
                const done = v => { dg.close(); dg.remove(); res(v); };
                dg.querySelector('[data-q]').addEventListener('input', e => paint(e.target.value));
                dg.querySelector('[data-x]').addEventListener('click', () => done(null));
                dg.addEventListener('cancel', () => done(null));
                dg.querySelector('[data-l]').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; const d = list.find(x => x.id === Number(b.dataset.id)); done({spec: {...(d.spec || {}), kind: d.kind}, name: d.name, title: d.name}); });
            });
        }
        function sceneMenu(btn, i) {
            const s = D().scenes[i];
            UI().menuAt?.(btn, [
                {icon: '⧉', label: T('Dupliquer'), run: () => { D().scenes.splice(i + 1, 0, {...JSON.parse(JSON.stringify(s)), id: uid(), name: T('{n} (copie)', {n: s.name || ''})}); sel = i + 1; changed({pane: true}); }},
                {icon: '✎', label: T('Renommer'), run: async () => { const n = await A().askText({title: T('Nom de la scène'), value: s.name || '', okLabel: T('Renommer')}); if (n?.trim()) { s.name = n.trim().slice(0, 120); changed({pane: true}); } }},
                '-', {icon: '🗑', label: T('Supprimer la scène'), danger: true, run: () => { const copy = D().scenes.splice(i, 1)[0]; sel = clamp(sel, 0, Math.max(0, D().scenes.length - 1)); changed({pane: true}); A().undoToast?.(T('Scène supprimée.'), {undo: () => { D().scenes.splice(i, 0, copy); sel = i; changed({pane: true}); }}); }},
            ], {title: s.name || ''});
        }

        /* ── les réglages ── */
        const SEL = (k, opts) => ({k, type: 'select', opts});
        const NUM = (k, min, max, st = 1) => ({k, type: 'number', min, max, st});
        const TOG = (k, dflt = false) => ({k, type: 'toggle', dflt});
        const COL = k => ({k, type: 'color'});
        const TXT = k => ({k, type: 'text'});
        const BASEMAPS = () => { const html = A()?.mapBackgroundSelectHtml ? A().mapBackgroundSelectHtml('') : ''; const opts = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => [m[1], m[2]]); return [['none', T('Sans fond (couleur)')], ['offline', T('Fond hors ligne')], ...opts.filter(([v]) => v && v !== 'offline' && v !== 'grid')]; };
        function fieldsFor(s) {
            const common = [['Nom de la scène', TXT('name')], ['Durée (secondes)', NUM('dur', .5, 600, .5)], ['Passage depuis la scène d’avant', SEL('trans', [['fade', 'Fondu'], ['black', 'Par le noir'], ['cut', 'Coupe nette']])], ['Durée du passage (s)', NUM('transDur', 0, 5, .1)]];
            const titled = [['Titre en haut', TXT('title')], ['Montrer le titre', TOG('showTitle', true)]];
            const timeF = [['Première année (vide : la première des données)', NUM('from', -3000, 3000)], ['Dernière année (vide : la dernière)', NUM('to', -3000, 3000)], ['Vitesse dans le temps', SEL('ease', [['linear', 'Régulière'], ['inout', 'Lente au début et à la fin'], ['out', 'Rapide puis lente']])]];
            const by = {
                title: [['Titre', TXT('title')], ['Sous-titre', TXT('subtitle')], ['Couleur du fond', COL('bg')], ['Couleur du texte', COL('color')], ['Taille du titre', NUM('size', .4, 2.5, .1)], ['Alignement', SEL('align', [['center', 'Centré'], ['left', 'À gauche']])]],
                image: [['Texte sous la photo', TXT('text')], ['Zoom au début', NUM('z0', 1, 4, .05)], ['Zoom à la fin', NUM('z1', 1, 4, .05)], ['Remplir l’image', SEL('fit', [['cover', 'Oui (bords coupés)'], ['contain', 'Non (photo entière)']])]],
                diagram: [...titled, ...timeF, ['Passer d’une année à l’autre', SEL('smooth', [[true, 'En douceur (fondu)'], [false, 'Par sauts']])], ['Caméra', SEL('cam.mode', [['fit', 'Tout le diagramme'], ['keys', 'Points de caméra ◆'], ['kenburns', 'Avance doucement']])], ['Fond', COL('bg')]],
                migrations: [...titled, ...timeF, ['Qui', SEL('who', [['all', 'Toute la base'], ['desc', 'Descendants de la personne de départ'], ['asc', 'Ancêtres de la personne de départ']])], ['Personne de départ (n° de fiche, vide : celle de la base)', NUM('root', 0, 1e9)], ['Un seul nom de famille (facultatif)', TXT('surname')],
                    ['Couleurs selon', SEL('colorBy', [['surname', 'Le nom de famille'], ['event', 'La sorte d’événement'], ['gender', 'Homme ou femme'], ['one', 'Une seule couleur']])], ['Nombre de couleurs', NUM('maxKeys', 1, 16)], ['Couleur des autres', COL('otherColor')],
                    ['Fond de carte', SEL('basemap', BASEMAPS())], ['Éclaircir le fond (0 à 0,9)', NUM('dim', 0, .9, .05)], ['Teinte du fond', SEL('tone', [['', 'Naturelle'], ['sepia', 'Sépia'], ['grey', 'Noir et blanc']])], ['Couleur de la mer (sans fond)', COL('sea')],
                    ['Taille des points', NUM('dot', 1, 30)], ['Forme des points', SEL('shape', [['circle', 'Ronds'], ['square', 'Carrés']])], ['Chemins (une personne qui change de lieu)', TOG('trails', true)], ['Les chemins restent', TOG('trailStay')], ['Effacer peu à peu les anciens événements', TOG('fadeDead', true)], ['Durée de vie d’un point (années)', NUM('life', 1, 200)], ['Noms des lieux', SEL('labels', [['places', 'Oui, au moment de l’événement'], ['off', 'Non']])],
                    ['Caméra', SEL('cam.mode', [['follow', 'Suit la famille'], ['fit', 'Toute la carte, fixe'], ['keys', 'Points de caméra ◆'], ['kenburns', 'Avance doucement']])], ['Zoom maximum de la caméra', NUM('cam.maxZoom', 1, 8, .5)],
                    ['Ralentir là où il se passe beaucoup', TOG('slow', true)], ['Légendes faites seules', TOG('autoCap.on', true)], ['Nombre de légendes', NUM('autoCap.max', 1, 60)]],
                race: [...titled, ...timeF, ['Quoi', SEL('what', [['surname', 'Les noms de famille'], ['first', 'Les prénoms'], ['firstm', 'Les prénoms des garçons'], ['firstf', 'Les prénoms des filles'], ['place', 'Les lieux de naissance']])], ['Compter', SEL('mode', [['decade', 'Les naissances des dernières années'], ['cumulative', 'Toutes les naissances jusque-là'], ['alive', 'Ceux qui vivent']])], ['Sur combien d’années', NUM('window', 1, 100)], ['Nombre de barres', NUM('top', 3, 30)], ['Échelle fixe (toute la durée)', TOG('fixedScale')], ['Fond', COL('bg')]],
                pyramid: [...titled, ...timeF, ['Tranches d’âge (années)', NUM('step', 1, 20)], ['Âge maximum', NUM('maxAge', 50, 120)], ['Couleur des hommes', COL('colors.m')], ['Couleur des femmes', COL('colors.f')], ['Échelle fixe (toute la durée)', TOG('fixedScale')], ['Fond', COL('bg')]],
                line: [...titled, ...timeF, ['Quoi', SEL('what', [['births', 'Les naissances'], ['deaths', 'Les décès'], ['marriages', 'Les mariages'], ['alive', 'Les vivants'], ['agedeath', 'L’âge moyen au décès']])], ['Par', SEL('per', [['year', 'Année'], ['decade', 'Décennie']])], ['En cumulé', TOG('cumulative')], ['Couleur', COL('color')], ['Remplir sous la courbe', TOG('fill', true)], ['Fond', COL('bg')]],
                borders: [...titled, ...timeF, ['Cadrage', SEL('view', [['france', 'La France'], ['napoleon', 'La France et ses voisins'], ['europe', 'L’Europe de l’Ouest']])], ['Couleur de la France', COL('color')], ['Couleur des autres pays', COL('land')], ['Couleur de la mer', COL('sea')], ['Les dates qui comptent', TOG('events', true)]],
                tree: [...titled, ['Personne de départ (n° de fiche, vide : celle de la base)', NUM('root', 0, 1e9)], ['Générations', NUM('gens', 2, 10)], ['Couleurs', SEL('colorBy', [['branch', 'Côté du père / de la mère'], ['gen', 'Par génération'], ['one', 'Une seule']])], ['Couleur (une seule)', COL('color')], ['Noms', TOG('names', true)], ['Fond', COL('bg')]],
            };
            return [...common, ...(by[s.type] || [])];
        }
        const filmFields = () => [['Police', SEL('font', [['system', 'Moderne'], ['serif', 'Classique (empattements)'], ['rounded', 'Arrondie'], ['mono', 'Machine à écrire']])], ['Fond entre les scènes', COL('bg')], ['Signature en bas à droite', TXT('watermark')],
            ['Grande année', SEL('overlays.year', [['tr', 'En haut à droite'], ['tl', 'En haut à gauche'], ['br', 'En bas à droite'], ['bl', 'En bas à gauche'], ['off', 'Cachée']])], ['Taille de l’année', NUM('overlays.yearSize', .3, 3, .1)], ['Couleur de l’année', COL('overlays.yearColor')],
            ['Légende des couleurs', SEL('overlays.legend', [['br', 'En bas à droite'], ['bl', 'En bas à gauche'], ['tr', 'En haut à droite'], ['tl', 'En haut à gauche'], ['off', 'Cachée']])],
            ['Légendes de texte', SEL('overlays.caption', [['bottom', 'En bas'], ['top', 'En haut'], ['off', 'Cachées']])], ['Style des légendes', SEL('overlays.captionStyle', [['dark', 'Cadre sombre'], ['light', 'Cadre clair'], ['band', 'Bande sur toute la largeur']])], ['Taille des légendes', NUM('overlays.captionSize', .5, 2.5, .1)],
            ['Taille des titres', NUM('overlays.titleSize', .02, .1, .002)], ['Couleur des titres', COL('overlays.titleColor')]];
        function fieldHtml(obj, [label, f]) { // obj : la scène (ou le film) ; ses années trouvées (_from, _to) en exemple
            const v = get(obj, f.k), id = 'an-f-' + f.k.replace(/\W/g, '-');
            if (f.type === 'toggle') return `<label class="ui-toggle an-f an-ftog"><input type="checkbox" data-an-f="${esc(f.k)}" ${(v === undefined || v === null || v === '' ? f.dflt : v !== false) ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i>${esc(T(label))}</label>`;
            const ctl = f.type === 'select' ? `<select id="${id}" data-an-f="${esc(f.k)}" ${ro ? 'disabled' : ''}>${f.opts.map(([k, l]) => `<option value="${esc(String(k))}" ${String(v) === String(k) ? 'selected' : ''}>${esc(T(l))}</option>`).join('')}</select>`
                : f.type === 'number' ? `<input id="${id}" type="number" data-an-f="${esc(f.k)}" value="${esc(v ?? '')}" min="${f.min}" max="${f.max}" step="${f.st}" ${(f.k === 'from' || f.k === 'to') && obj['_' + f.k] != null ? `placeholder="${esc(String(obj['_' + f.k]))}"` : ''} ${ro ? 'readonly' : ''}>`
                : f.type === 'color' ? `<input id="${id}" type="color" data-an-f="${esc(f.k)}" value="${esc(/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#888888')}" ${ro ? 'disabled' : ''}>`
                : `<input id="${id}" type="text" data-an-f="${esc(f.k)}" value="${esc(v ?? '')}" maxlength="300" ${ro ? 'readonly' : ''}>`;
            return `<label class="an-f" for="${id}"><span>${esc(T(label))}</span>${ctl}</label>`;
        }
        function paintPane() {
            dlg.querySelectorAll('[data-an-tab]').forEach(b => { const on = b.dataset.anTab === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
            const pane = $('[data-an-pane]'), s = S();
            if (tab === 'film') {
                const mus = D().music, vs = D().voices || [];
                pane.innerHTML = `<h4>🎵 ${esc(T('Musique'))}</h4>${mus?.media ? `<p class="an-media">🎵 ${esc(mus.media.title || mus.media.filename)} <button type="button" class="link-button" data-an="musdel">${esc(T('Retirer'))}</button></p>
                        ${[['Volume (0 à 1,5)', NUM('music.vol', 0, 1.5, .05)], ['Fondu au début (s)', NUM('music.fadeIn', 0, 30, .5)], ['Fondu à la fin (s)', NUM('music.fadeOut', 0, 30, .5)], ['Commencer la musique à (s)', NUM('music.start', 0, 3600, 1)], ['En boucle si elle est trop courte', TOG('music.loop', true)], ['Plus bas quand une voix parle', TOG('music.duck', true)], ['Volume sous la voix (0 à 1)', NUM('music.duckLevel', 0, 1, .05)]].map(x => fieldHtml(D(), x)).join('')}`
                    : `<p class="muted">${esc(T('Une musique à toi (un son des médias, ou importé de l’ordinateur).'))}</p>`}${ro ? '' : `<button type="button" class="button small secondary" data-an="mus">🎵 ${esc(mus?.media ? T('Changer la musique…') : T('Choisir une musique…'))}</button>`}
                    <h4>🎙 ${esc(T('Voix'))}</h4>${vs.map((v, i) => `<div class="an-voice"><span>🎙 ${esc(v.media?.title || T('Voix {n}', {n: String(i + 1)}))} · ${esc(fmtT(v.at || 0))}</span><label>${esc(T('Volume'))}<input type="number" min="0" max="2" step=".1" value="${esc(v.vol ?? 1)}" data-an-vvol="${i}" ${ro ? 'readonly' : ''}></label>${ro ? '' : `<button type="button" class="link-button" data-an-vdel="${i}">${esc(T('Retirer'))}</button>`}</div>`).join('') || `<p class="muted">${esc(T('Enregistre ta voix en regardant le film : la musique baisse quand tu parles.'))}</p>`}
                    ${ro ? '' : `<div class="an-row"><button type="button" class="button small secondary" data-an="rec">🎙 ${esc(T('Enregistrer ma voix d’ici'))}</button><button type="button" class="button small secondary" data-an="voicepick">＋ ${esc(T('Un son des médias'))}</button></div>`}
                    <h4>🔤 ${esc(T('Textes et apparence'))}</h4>${filmFields().map(x => fieldHtml(D(), x)).join('')}
                    <h4>⚙️ ${esc(T('Réglages par défaut'))}</h4><p class="muted">${esc(T('Les nouveaux films et les nouvelles scènes partent de ces réglages.'))}</p><button type="button" class="button small secondary" data-an="defaults">${esc(T('Réglages par défaut des nouveaux films…'))}</button>`;
                return;
            }
            if (!s) { pane.innerHTML = `<p class="muted">${esc(T('Ajoute une scène : « ＋ Scène ».'))}</p>`; return; }
            const mediaRow = s.type === 'image' ? `<p class="an-media">🖼 ${esc(s.media?.title || s.media?.filename || T('Aucune photo'))} ${ro ? '' : `<button type="button" class="link-button" data-an="imgpick">${esc(T('Changer…'))}</button>`}</p>` : '';
            const diaRow = s.type === 'diagram' ? `<p class="an-media">📊 ${esc(s.title || s.name || '')} ${ro ? '' : `<button type="button" class="link-button" data-an="diapick">${esc(T('Changer…'))}</button>`}</p>` : '';
            const colorRows = (s.type === 'migrations' && (s.colorBy || 'surname') !== 'one') || s.type === 'race' ? `<h4>🎨 ${esc(T('Couleurs'))}</h4><div class="an-colors" data-an-colors></div>` : '';
            pane.innerHTML = `<h4>${TYPES[s.type]?.icon || ''} ${esc(T(TYPES[s.type]?.label || ''))}</h4>${mediaRow}${diaRow}${fieldsFor(s).map(x => fieldHtml(s, x)).join('')}${colorRows}
                ${['migrations', 'diagram', 'image'].includes(s.type) ? `<h4>📷 ${esc(T('Caméra'))}</h4><p class="muted">${esc(T('« Points de caméra ◆ » : sur l’aperçu, glisse pour déplacer, molette pour zoomer, puis « 📷 Garder ce cadrage ici ». Entre deux points, la caméra glisse.'))}</p>` : ''}`;
            if (colorRows) paintColors();
        }
        async function paintColors() {
            const s = S(), box = $('[data-an-colors]'); if (!box) return;
            const [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H);
            const keys = s.type === 'race' ? (st.R ? st.R.keys.slice(0, 30) : []) : st.keys || [];
            if (!$('[data-an-colors]')) return;
            box.innerHTML = keys.map((k, i) => `<label class="an-col"><input type="color" value="${esc(s.colors?.[k] || RN().PALETTE[i % RN().PALETTE.length])}" data-an-color="${esc(k)}" ${ro ? 'disabled' : ''}><span>${esc(k)}</span></label>`).join('') || `<p class="muted">${esc(T('Les couleurs apparaissent quand les données sont lues.'))}</p>`;
        }

        /* ── la ligne de temps ── */
        const pOfScene = () => { const s = S(); if (!s) return 0; const d = RN().durOf(s); return clamp((t - sceneStart(sel)) / d, 0, 1); };
        async function yearToP(s, y) { const [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H), rg = RN().range(s); for (let j = 0; j <= 300; j++) if (RN().yearAt(rg, j / 300, st.warp) >= y) return j / 300; return 1; }
        async function paintTimeline() {
            const box = $('[data-an-tl]'), s = S(), tot = total() || 1;
            const film = `<div class="an-trk-row"><b>🎞 ${esc(T('Film'))}</b><div class="an-trk an-film" data-an-film>${D().scenes.map((x, i) => `<button type="button" class="an-blk${i === sel ? ' is-on' : ''}" style="left:${sceneStart(i) / tot * 100}%;width:${RN().durOf(x) / tot * 100}%" data-an-go="${i}" title="${esc(x.name || '')}">${TYPES[x.type]?.icon || ''} ${esc(x.name || '')}</button>`).join('')}<span class="an-head" data-an-head></span></div></div>
                <div class="an-trk-row"><b>🎵 ${esc(T('Musique'))}</b><div class="an-trk">${D().music?.media ? `<span class="an-wave" style="left:0;width:100%"></span>` : ''}<span class="an-head" data-an-head></span></div></div>
                <div class="an-trk-row"><b>🎙 ${esc(T('Voix'))}</b><div class="an-trk" data-an-voices>${(D().voices || []).map((v, i) => `<span class="an-blk g" style="left:${(Number(v.at) || 0) / tot * 100}%;width:${Math.max(1, (Number(v.len) || 4) / tot * 100)}%" data-an-voice="${i}" title="${esc(T('Glisser pour changer le moment'))}">🎙</span>`).join('')}<span class="an-head" data-an-head></span></div></div>`;
            let scene = '';
            if (s) {
                const [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H), rg = RN().range(s), dated = Number.isFinite(Number(rg.from)) && Number.isFinite(Number(rg.to)) && rg.to > rg.from;
                const ticks = dated ? Array.from({length: 5}, (_, j) => Math.round(rg.from + (rg.to - rg.from) * j / 4)) : Array.from({length: 5}, (_, j) => fmtT(RN().durOf(s) * j / 4));
                const capPos = async c => (Number.isFinite(c.year) ? await yearToP(s, c.year) : Number(c.t) || 0);
                const caps = await Promise.all((s.captions || []).map(async (c, i) => `<span class="an-blk v" style="left:${(await capPos(c)) * 100}%;width:${Math.max(4, (Number(c.dur) || 3.5) / RN().durOf(s) * 100)}%" data-an-cap="${i}" title="${esc(T('Glisser : changer le moment · double-clic : écrire'))}">${esc(c.text || '…')}</span>`));
                const autos = await Promise.all((st.caps || []).map(async c => `<span class="an-blk v is-auto${(s.hiddenAuto || []).includes(c.text) ? ' is-off' : ''}" style="left:${(await capPos(c)) * 100}%;width:${Math.max(4, 3.5 / RN().durOf(s) * 100)}%" data-an-acap="${esc(c.text)}" title="${esc(T('Légende faite seule : clic pour la cacher ou la montrer, double-clic pour l’écrire à ta façon'))}">${esc(c.text)}</span>`));
                const keys = (s.cam?.keys || []).map((k, i) => `<span class="an-key" style="left:${k.t * 100}%" data-an-key="${i}" title="${esc(T('Point de caméra : clic pour y aller, glisser pour le déplacer, double-clic pour l’enlever'))}"></span>`).join('');
                const pics = (s.pics || []).map((pc, i) => `<span class="an-blk g" style="left:${(Number(pc.t) || 0) * 100}%;width:${Math.max(4, (Number(pc.dur) || 3) / RN().durOf(s) * 100)}%" data-an-pic="${i}" title="${esc(T('Glisser : changer le moment · clic : réglages'))}">🖼 ${esc(pc.media?.title || '')}</span>`).join('');
                scene = `<div class="an-tl-head"><b>${TYPES[s.type]?.icon || ''} ${esc(s.name || '')}</b><span class="an-ticks">${ticks.map(x => `<span>${esc(String(x))}</span>`).join('')}</span></div>
                    ${dated ? `<div class="an-trk-row"><b>📅 ${esc(T('Temps'))}</b><div class="an-trk"><span class="an-blk" style="left:0;width:100%">${esc(String(rg.from))} → ${esc(String(rg.to))}${s.slow !== false && s.type === 'migrations' ? ` · ${esc(T('ralenti là où il se passe beaucoup'))}` : ''}</span><span class="an-head" data-an-shead></span></div></div>` : ''}
                    ${['migrations', 'diagram'].includes(s.type) ? `<div class="an-trk-row"><b>📷 ${esc(T('Caméra'))}</b><div class="an-trk" data-an-keys>${keys}<span class="an-head" data-an-shead></span></div>${ro ? '' : `<button type="button" class="link-button" data-an="camkey">📷 ${esc(T('Garder ce cadrage ici'))}</button>`}</div>` : ''}
                    <div class="an-trk-row"><b>💬 ${esc(T('Légendes'))}</b><div class="an-trk" data-an-caps>${autos.join('')}${caps.join('')}<span class="an-head" data-an-shead></span></div>${ro ? '' : `<button type="button" class="link-button" data-an="capadd">＋ ${esc(T('Légende ici'))}</button>`}</div>
                    ${s.type !== 'title' ? `<div class="an-trk-row"><b>🖼 ${esc(T('Images'))}</b><div class="an-trk" data-an-pics>${pics}<span class="an-head" data-an-shead></span></div>${ro ? '' : `<button type="button" class="link-button" data-an="picadd">＋ ${esc(T('Image ici'))}</button>`}</div>` : ''}`;
            }
            box.innerHTML = `<div class="an-tl">${film}${scene}</div>`;
            paintPlayhead();
        }
        function paintPlayhead() {
            const tot = total() || 1;
            dlg.querySelectorAll('[data-an-head]').forEach(h => { h.style.left = (t / tot * 100) + '%'; });
            const p = pOfScene(); dlg.querySelectorAll('[data-an-shead]').forEach(h => { h.style.left = (p * 100) + '%'; });
            const s = S(), cb = $('[data-an-cambar]');
            if (cb) cb.innerHTML = s && s.cam?.mode === 'keys' && !ro ? `<button type="button" class="link-button" data-an="camkey">📷 ${esc(T('Garder ce cadrage ici'))}</button>${liveCam ? ` <button type="button" class="link-button" data-an="camreset">${esc(T('Annuler le cadrage'))}</button>` : ''}` : '';
            const hint = $('[data-an-camhint]'); if (hint) { hint.hidden = !(s && s.cam?.mode === 'keys'); hint.textContent = T('Glisser : déplacer · molette : zoomer'); }
        }
        const paintFmt = () => { $('[data-an-fmt]').innerHTML = [['16:9', '16:9'], ['1:1', T('Carré')], ['9:16', T('Vertical')], ['4:3', '4:3']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${D().format === k}" class="${D().format === k ? 'is-active' : ''}" data-an-fmtv="${k}" ${ro ? 'disabled' : ''}>${esc(l)}</button>`).join(''); };
        function paintAll() { paintFmt(); paintList(); paintPane(); paintTimeline(); draw(); }

        /* ── glisser sur la ligne de temps ── */
        function dragOn(track, el, onMove, onEnd) {
            const r = track.getBoundingClientRect(); let moved = false;
            const mv = e => { moved = true; onMove(clamp((e.clientX - r.left) / r.width, 0, 1)); };
            const up = e => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); onEnd(moved, clamp((e.clientX - r.left) / r.width, 0, 1)); };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        }
        $('[data-an-tl]').addEventListener('pointerdown', async e => {
            if (ro) return;
            const s = S(), key = e.target.closest('[data-an-key]'), cap = e.target.closest('[data-an-cap]'), pic = e.target.closest('[data-an-pic]'), voice = e.target.closest('[data-an-voice]');
            if (key) { e.preventDefault(); const i = Number(key.dataset.anKey); dragOn(key.parentElement, key, p => { s.cam.keys[i].t = p; key.style.left = p * 100 + '%'; }, moved => { if (moved) changed({tl: true}); else { t = sceneStart(sel) + s.cam.keys[i].t * RN().durOf(s); liveCam = null; draw(); } }); return; }
            if (cap) { e.preventDefault(); const i = Number(cap.dataset.anCap), c = s.captions[i], startL = parseFloat(cap.style.left) / 100, r = cap.parentElement.getBoundingClientRect(), off = (e.clientX - r.left) / r.width - startL;
                dragOn(cap.parentElement, cap, p => { cap.style.left = clamp(p - off, 0, 1) * 100 + '%'; }, async (moved, p) => { if (!moved) return; const np = clamp(p - off, 0, 1); if (Number.isFinite(c.year)) { const rg = RN().range(s), [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H); c.year = Math.round(RN().yearAt(rg, np, st.warp)); } else c.t = np; changed(); }); return; }
            if (pic) { e.preventDefault(); const i = Number(pic.dataset.anPic), pc = s.pics[i], r = pic.parentElement.getBoundingClientRect(), off = (e.clientX - r.left) / r.width - (Number(pc.t) || 0);
                dragOn(pic.parentElement, pic, p => { pic.style.left = clamp(p - off, 0, 1) * 100 + '%'; }, (moved, p) => { if (moved) { pc.t = clamp(p - off, 0, 1); changed(); } else picMenu(pic, i); }); return; }
            if (voice) { e.preventDefault(); const i = Number(voice.dataset.anVoice), v = D().voices[i], tot = total() || 1, r = voice.parentElement.getBoundingClientRect(), off = (e.clientX - r.left) / r.width - (Number(v.at) || 0) / tot;
                dragOn(voice.parentElement, voice, p => { voice.style.left = clamp(p - off, 0, 1) * 100 + '%'; }, (moved, p) => { if (moved) { v.at = Math.round(clamp(p - off, 0, 1) * tot * 10) / 10; changed({pane: true}); } }); return; }
        });
        $('[data-an-tl]').addEventListener('click', e => {
            const go = e.target.closest('[data-an-go]'); if (go) { goScene(Number(go.dataset.anGo)); return; }
            const ac = e.target.closest('[data-an-acap]'); if (ac && !ro) { const s = S(), k = ac.dataset.anAcap; s.hiddenAuto = s.hiddenAuto || []; const i = s.hiddenAuto.indexOf(k); if (i >= 0) s.hiddenAuto.splice(i, 1); else s.hiddenAuto.push(k); changed(); return; }
            const tr = e.target.closest('.an-trk'); if (tr && !e.target.closest('.an-blk, .an-key')) { const r = tr.getBoundingClientRect(), p = clamp((e.clientX - r.left) / r.width, 0, 1); if (tr.matches('[data-an-film], [data-an-voices]') || tr.closest('.an-trk-row')?.querySelector('[data-an-head]')) t = p * total(); else t = sceneStart(sel) + p * RN().durOf(S()); liveCam = null; stopPlay(); draw(); }
        });
        $('[data-an-tl]').addEventListener('dblclick', async e => {
            if (ro) return; const s = S();
            const key = e.target.closest('[data-an-key]'); if (key) { s.cam.keys.splice(Number(key.dataset.anKey), 1); changed(); return; }
            const cap = e.target.closest('[data-an-cap]'); if (cap) { const c = s.captions[Number(cap.dataset.anCap)]; const n = await A().askText({title: T('Légende'), message: T('Vide : enlever la légende.'), value: c.text || '', okLabel: T('Valider')}); if (n === null || n === undefined) return; if (!n.trim()) s.captions.splice(Number(cap.dataset.anCap), 1); else c.text = n.trim().slice(0, 300); changed(); return; }
            const ac = e.target.closest('[data-an-acap]'); if (ac) { const [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H), c = (st.caps || []).find(x => x.text === ac.dataset.anAcap); if (!c) return; const n = await A().askText({title: T('Légende'), value: c.text, okLabel: T('Valider')}); if (!n?.trim()) return; s.hiddenAuto = [...new Set([...(s.hiddenAuto || []), c.text])]; s.captions.push({year: c.year, text: n.trim().slice(0, 300), dur: 3.5}); changed(); }
        });
        function picMenu(btn, i) {
            const s = S(), pc = s.pics[i];
            UI().menuAt?.(btn, [
                ...[['tl', 'En haut à gauche'], ['tr', 'En haut à droite'], ['bl', 'En bas à gauche'], ['br', 'En bas à droite'], ['center', 'Au milieu']].map(([k, l]) => ({icon: (pc.pos || 'tr') === k ? '✓' : '', label: T(l), run: () => { pc.pos = k; changed(); }})),
                '-', ...[[.2, 'Petite'], [.3, 'Moyenne'], [.45, 'Grande']].map(([k, l]) => ({icon: Math.abs((pc.size || .28) - k) < .06 ? '✓' : '', label: T(l), run: () => { pc.size = k; changed(); }})),
                '-', ...[[2, '2 s'], [3, '3 s'], [5, '5 s'], [8, '8 s']].map(([k, l]) => ({icon: (pc.dur || 3) === k ? '✓' : '', label: l, run: () => { pc.dur = k; changed(); }})),
                '-', {icon: '🗑', label: T('Enlever l’image'), danger: true, run: () => { s.pics.splice(i, 1); changed(); }},
            ], {title: pc.media?.title || T('Image')});
        }

        /* ── la caméra à la souris, sur l'aperçu ── */
        const view = $('[data-an-view]');
        view.addEventListener('pointerdown', e => {
            const s = S(); if (ro || !s || s.cam?.mode !== 'keys') return; e.preventDefault();
            const base = liveCam || RN().camAt(s.cam, pOfScene()), r = cv.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
            const mv = ev => { liveCam = {x: clamp(base.x - (ev.clientX - x0) / r.width / base.z, 0, 1), y: clamp(base.y - (ev.clientY - y0) / r.height / base.z, 0, 1), z: base.z}; draw(); };
            const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); paintPlayhead(); };
            window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
        view.addEventListener('wheel', e => { const s = S(); if (ro || !s || s.cam?.mode !== 'keys') return; e.preventDefault(); const base = liveCam || RN().camAt(s.cam, pOfScene()); liveCam = {...base, z: clamp(base.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1, 12)}; draw(); paintPlayhead(); }, {passive: false});

        /* ── les boutons ── */
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('[data-an]'), d = b?.dataset.an;
            const sc = e.target.closest('[data-an-sc]'), mvb = e.target.closest('[data-an-mv]'), scm = e.target.closest('[data-an-scm]'), tb = e.target.closest('[data-an-tab]'), fm = e.target.closest('[data-an-fmtv]');
            if (mvb) { const [i, dir] = mvb.dataset.anMv.split('|').map(Number), j = i + dir; if (j < 0 || j >= D().scenes.length) return; const L = D().scenes; [L[i], L[j]] = [L[j], L[i]]; sel = j; changed(); return; }
            if (scm) { sceneMenu(scm, Number(scm.dataset.anScm)); return; }
            if (sc && !b) { goScene(Number(sc.dataset.anSc)); return; }
            if (tb) { tab = tb.dataset.anTab; paintPane(); return; }
            if (fm && !ro) { D().format = fm.dataset.anFmtv; RN().clearCache(); changed({pane: false}); paintFmt(); return; }
            const s = S();
            switch (d) {
                case 'close': return close();
                case 'undo': return undo();
                case 'redo': return redo();
                case 'play': return play();
                case 'playall': return play(0);
                case 'prev': return goScene(sel - (t - sceneStart(sel) > .5 ? 0 : 1));
                case 'next': return goScene(sel + 1);
                case 'add': return addMenu(b);
                case 'export': return exportDialog();
                case 'more': return moreMenu(b);
                case 'imgpick': { const m = await pickImage(); if (m) { s.media = m; changed({pane: true}); } return; }
                case 'diapick': { const x = await pickDiagram(); if (x) { Object.assign(s, x); RN().clearCache(); changed({pane: true}); } return; }
                case 'camkey': { const c = liveCam || RN().camAt(s.cam, pOfScene()); s.cam = {...(s.cam || {}), mode: 'keys'}; s.cam.keys = (s.cam.keys || []).filter(k => Math.abs(k.t - pOfScene()) > .01); s.cam.keys.push({t: Math.round(pOfScene() * 1000) / 1000, x: c.x, y: c.y, z: c.z}); liveCam = null; changed(); return; }
                case 'camreset': liveCam = null; draw(); paintPlayhead(); return;
                case 'capadd': { const n = await A().askText({title: T('Nouvelle légende'), message: T('Elle s’affiche à ce moment-là, quelques secondes.'), okLabel: T('Ajouter')}); if (!n?.trim()) return; const [W, H] = RN().sizeOf(D().format, 540), st = await RN().prepare(s, W, H), rg = RN().range(s), y = RN().yearAt(rg, pOfScene(), st.warp);
                    s.captions.push(Number.isFinite(y) ? {year: Math.round(y), text: n.trim().slice(0, 300), dur: 3.5} : {t: pOfScene(), text: n.trim().slice(0, 300), dur: 3.5}); changed(); return; }
                case 'picadd': { const m = await pickImage(); if (!m) return; s.pics.push({media: m, t: pOfScene(), dur: 3, pos: 'tr', size: .28}); changed(); return; }
                case 'mus': { const m = await pickAudio(); if (!m) return; D().music = {media: m, vol: .7, fadeIn: 2, fadeOut: 3, loop: true, duck: true, duckLevel: .3, start: 0, ...(D().music || {}), media: m}; changed({pane: true}); return; }
                case 'musdel': { const old = D().music; D().music = null; changed({pane: true}); A().undoToast?.(T('Musique retirée.'), {undo: () => { D().music = old; changed({pane: true}); }}); return; }
                case 'voicepick': { const m = await pickAudio(); if (!m) return; D().voices.push({media: m, at: Math.round(t * 10) / 10, vol: 1, len: 5}); changed({pane: true}); return; }
                case 'rec': return recordVoice();
                case 'defaults': return defaultsDialog();
            }
        });
        dlg.addEventListener('change', e => {
            const f = e.target.closest('[data-an-f]'), col = e.target.closest('[data-an-color]'), vv = e.target.closest('[data-an-vvol]');
            if (vv) { D().voices[Number(vv.dataset.anVvol)].vol = clamp(Number(vv.value) || 0, 0, 2); changed({pane: false}); return; }
            if (col) { const s = S(); s.colors = {...(s.colors || {}), [col.dataset.anColor]: col.value}; changed(); return; }
            if (!f || ro) return;
            const k = f.dataset.anF, onFilm = tab === 'film', obj = onFilm ? D() : S(); if (!obj) return;
            let v = f.type === 'checkbox' ? f.checked : f.type === 'number' ? (f.value === '' ? '' : Number(f.value)) : f.value;
            if (f.tagName === 'SELECT' && (v === 'true' || v === 'false')) v = v === 'true';
            set(obj, k, v);
            if (k === 'cam.mode' && v === 'keys' && !(obj.cam.keys || []).length) obj.cam.keys = [{t: 0, x: .5, y: .5, z: 1}];
                        changed({pane: ['colorBy', 'cam.mode', 'type', 'what'].includes(k)});
        });
        $('[data-an-name]').addEventListener('change', e => { P.title = e.target.value.trim().slice(0, 200) || T('Mon film'); changed({list: false, tl: false, redraw: false}); });
        $('[data-an-scrub]').addEventListener('input', e => { stopPlay(); t = Number(e.target.value) / 1000 * total(); liveCam = null; const at = RN().scenesAt(D(), t); if (at && at.i !== sel) { sel = at.i; paintList(); paintPane(); paintTimeline(); } draw(); });
        dlg.addEventListener('keydown', e => {
            if (e.target.closest('input, select, textarea')) return;
            if (e.key === ' ') { e.preventDefault(); play(); }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        });
        dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        const ro2 = new ResizeObserver(() => { sizePreview(); }); ro2.observe(view);
        async function close() { stopPlay(); if (dirty) await save(); ro2.disconnect(); dlg.close(); dlg.remove(); onClose?.(); }
        function moreMenu(btn) {
            UI().menuAt?.(btn, [
                {icon: '💾', label: T('Enregistrer maintenant'), run: save},
                {icon: '⧉', label: T('Dupliquer le film'), run: async () => { await save(); P.id = 0; P.title = T('{n} (copie)', {n: P.title}); $('[data-an-name]').value = P.title; dirty = true; await save(); A().toast(T('Copie faite : tu travailles maintenant sur la copie.')); }},
                {icon: '🎬', label: T('Ajouter les scènes du grand film de la famille'), run: () => { D().scenes.push(...TEMPLATES.grandfilm()); changed({pane: true}); }},
                {icon: '🔄', label: T('Relire la base (nouvelles fiches)'), run: () => { RN().clearCache(); draw(); paintTimeline(); }},
                {icon: '⚙️', label: T('Réglages par défaut des nouveaux films…'), run: defaultsDialog},
            ], {title: P.title});
        }
        /* ── 🎙 enregistrer sa voix en regardant le film ── */
        async function recordVoice() {
            if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return A().toast(T('Cet ordinateur ne sait pas enregistrer le son.'), 'error');
            let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (_) { return A().toast(T('Le micro n’est pas autorisé.'), 'error'); }
            const at = t, rec = new MediaRecorder(stream), chunks = []; rec.ondataavailable = ev => { if (ev.data?.size) chunks.push(ev.data); };
            const stopped = new Promise(r => { rec.onstop = r; });
            const bar = document.createElement('div'); bar.className = 'an-recbar'; bar.innerHTML = `<span class="an-recdot"></span>${esc(T('Enregistrement… parle en regardant le film.'))} <button type="button" class="button small">■ ${esc(T('Arrêter'))}</button>`; $('.an-stage').prepend(bar);
            rec.start(); play(at);
            await new Promise(r => { bar.querySelector('button').addEventListener('click', r, {once: true}); const iv = setInterval(() => { if (!playing) { clearInterval(iv); r(); } }, 300); });
            rec.stop(); stopPlay(); stream.getTracks().forEach(x => x.stop()); await stopped; bar.remove();
            const blob = new Blob(chunks, {type: rec.mimeType || 'audio/webm'}), len = Math.max(.5, t - at);
            try {
                const P2 = window.LCNDA_MEDIA_PICKER; const file = new File([blob], `${T('Voix')} ${P.title} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.${/ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : 'webm'}`, {type: blob.type});
                const it = await P2.importMediaFile(file, ['audio']); D().voices.push({media: {id: Number(it.id), filename: it.filename, title: it.title}, at: Math.round(at * 10) / 10, vol: 1, len: Math.round(len * 10) / 10}); tab = 'film'; changed({pane: true}); A().toast(T('Voix enregistrée (elle est aussi dans les Médias).'));
            } catch (err) { A().toast(err.message, 'error'); }
        }
        /* ── ⚙️ les réglages par défaut ── */
        function defaultsDialog() {
            const d = defs(), F = [['format', 'Format', [['16:9', '16:9'], ['1:1', 'Carré'], ['9:16', 'Vertical'], ['4:3', '4:3']]], ['quality', 'Qualité', [[720, '720p'], [1080, '1080p'], [2160, '4K']]], ['fps', 'Images par seconde', [[24, '24'], [30, '30'], [60, '60']]], ['trans', 'Passage entre les scènes', [['fade', 'Fondu'], ['black', 'Par le noir'], ['cut', 'Coupe nette']]], ['smooth', 'D’une année à l’autre', [[true, 'En douceur'], [false, 'Par sauts']]], ['camMode', 'Caméra des cartes', [['follow', 'Suit la famille'], ['fit', 'Toute la carte'], ['keys', 'Points de caméra']]], ['colorBy', 'Couleurs des cartes', [['surname', 'Nom de famille'], ['event', 'Sorte d’événement'], ['gender', 'Homme ou femme'], ['one', 'Une seule']]], ['autoCap', 'Légendes faites seules', [[true, 'Oui'], [false, 'Non']]], ['slow', 'Ralentir où il se passe beaucoup', [[true, 'Oui'], [false, 'Non']]], ['captionStyle', 'Style des légendes', [['dark', 'Cadre sombre'], ['light', 'Cadre clair'], ['band', 'Bande']]], ['exportFormat', 'Export', [['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF']]]];
            ext.openDialog?.({eyebrow: '🎞 ' + T('Studio d’animation'), title: T('Réglages par défaut des nouveaux films'), submitLabel: T('Enregistrer'),
                body: `<div class="form-grid">${F.map(([k, l, o]) => `<label>${esc(T(l))}<select name="${k}">${o.map(([v, x]) => `<option value="${esc(String(v))}" ${String(d[k]) === String(v) ? 'selected' : ''}>${esc(T(x))}${String(RECO[k]) === String(v) ? ' ' + esc(T('(recommandé)')) : ''}</option>`).join('')}</select></label>`).join('')}</div><p class="muted">${esc(T('Les films déjà faits ne changent pas.'))}</p><button type="button" class="link-button" data-reco>${esc(T('Revenir aux réglages recommandés'))}</button>`,
                onOpen: f => f.querySelector('[data-reco]')?.addEventListener('click', () => F.forEach(([k]) => { f.querySelector(`[name="${k}"]`).value = String(RECO[k]); })),
                onSubmit: f => { const v = {...d}; F.forEach(([k]) => { const x = f.querySelector(`[name="${k}"]`).value; v[k] = x === 'true' ? true : x === 'false' ? false : /^\d+$/.test(x) ? Number(x) : x; }); saveDefs(v); A().toast(T('Réglages par défaut enregistrés.')); return true; }});
        }
        /* ── ⤓ exporter ── */
        async function exportDialog() {
            stopPlay(); if (dirty) save();
            const d = defs(), [W0, H0] = RN().sizeOf(D().format, D().quality || 1080), cap = await EX().capabilities(W0, H0);
            const fastTxt = fmt => (fmt === 'gif' || fmt === 'png' ? '' : (fmt === 'mp4' ? cap.avc : cap.vp9 || cap.vp8) && cap.webcodecs ? T('⚡ Rapide : image par image, plus vite que le temps réel.') : T('⏱ En temps réel : cet ordinateur fabrique la vidéo pendant qu’elle se joue ({s}).', {s: fmtT(total())}));
            const dg = document.createElement('dialog'); dg.className = 'modal an-exp';
            dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🎞 ${esc(P.title)}</span><h2>⤓ ${esc(T('Exporter le film'))}</h2></div><button type="button" class="icon-button" data-x aria-label="${esc(T('Fermer'))}">×</button></div>
                <div class="an-exp-body"><p class="an-row"><span class="segmented" data-fmt>${[['mp4', 'Vidéo MP4'], ['webm', 'WebM'], ['gif', 'GIF'], ['png', 'Images (une par seconde)']].map(([k, l]) => `<button type="button" data-v="${k}" class="${k === d.exportFormat ? 'is-active' : ''}">${esc(T(l))}</button>`).join('')}</span></p>
                <p class="an-row"><label>${esc(T('Qualité'))} <select data-q>${[[720, '720p'], [1080, '1080p'], [2160, '4K']].map(([k, l]) => `<option value="${k}" ${Number(D().quality || 1080) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>${esc(T('Images par seconde'))} <select data-fps>${[24, 30, 60].map(k => `<option value="${k}" ${Number(D().fps || 30) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label></p>
                <p class="an-row"><label class="ui-toggle"><input type="checkbox" data-srt ${d.srt ? 'checked' : ''}><i></i>${esc(T('Sous-titres à part (.srt)'))}</label><label class="ui-toggle"><input type="checkbox" data-media ${d.toMedia ? 'checked' : ''}><i></i>${esc(T('Ranger aussi dans les médias'))}</label></p>
                <p class="muted" data-how></p><div class="h-progress" data-bar hidden><span></span></div><p class="muted" data-st></p></div>
                <div class="modal-actions"><button type="button" class="button secondary" data-stop hidden>■ ${esc(T('Arrêter'))}</button>${(toMontage || ext.openAvEditor) && !ro ? `<button type="button" class="button ${toMontage ? '' : 'secondary'}" data-montage title="${esc(T('La vidéo est rangée dans les médias puis ouverte dans le Montage vidéo : tu y ajoutes tes photos, tes vidéos, des titres, et tu coupes.'))}">🎬 ${esc(toMontage ? T('Ajouter au montage') : T('Continuer dans le Montage vidéo'))}</button>` : ''}<button type="button" class="button" data-go>⤓ ${esc(T('Fabriquer'))}</button></div></form>`;
            document.body.appendChild(dg); dg.showModal();
            let fmt = d.exportFormat, ctrl = null;
            const how = () => { dg.querySelector('[data-how]').textContent = fastTxt(fmt) + (fmt === 'gif' ? T(' GIF : sans son, 640 pixels de large, 10 images par seconde.') : ''); };
            how();
            const done = () => { ctrl?.abort(); dg.close(); dg.remove(); };
            dg.querySelector('[data-x]').addEventListener('click', done); dg.addEventListener('cancel', e => { e.preventDefault(); done(); });
            dg.querySelector('[data-fmt]').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; fmt = b.dataset.v; dg.querySelectorAll('[data-fmt] [data-v]').forEach(x => x.classList.toggle('is-active', x === b)); how(); });
            dg.querySelector('[data-stop]').addEventListener('click', () => ctrl?.abort());
            /* 🎬 la suite dans le Montage vidéo : le film fabriqué (MP4, sinon WebM) devient une vidéo des médias, ouverte dans le montage */
            dg.querySelector('[data-montage]')?.addEventListener('click', async () => {
                const q = Number(dg.querySelector('[data-q]').value), fps = Number(dg.querySelector('[data-fps]').value), [W, H] = RN().sizeOf(D().format, q), bar = dg.querySelector('[data-bar]'), st = dg.querySelector('[data-st]');
                bar.hidden = false; dg.querySelectorAll('[data-go], [data-montage]').forEach(b => { b.disabled = true; }); dg.querySelector('[data-stop]').hidden = false; ctrl = new AbortController();
                try {
                    const vf = fmt === 'webm' ? 'webm' : 'mp4', out = await EX().makeVideo(D(), {format: vf, W, H, fps, onProgress: (k, m) => { bar.firstElementChild.style.width = Math.round(k * 100) + '%'; st.textContent = m || ''; }, signal: ctrl.signal});
                    st.textContent = T('Rangement dans les médias…');
                    const it = await window.LCNDA_MEDIA_PICKER.importMediaFile(new File([out.blob], `${P.title}.${out.ext}`, {type: out.blob.type}), ['video']);
                    ctrl = null; done(); await close();
                    const media = {...it, id: Number(it.id), media_type: 'video'};
                    if (toMontage) await toMontage(media); else ext.openAvEditor(media);
                } catch (e) { st.textContent = e.name === 'AbortError' ? T('Arrêté.') : T('Pas réussi : {e}', {e: e.message}); dg.querySelectorAll('[data-go], [data-montage]').forEach(b => { b.disabled = false; }); dg.querySelector('[data-stop]').hidden = true; ctrl = null; }
            });
            dg.querySelector('[data-go]').addEventListener('click', async () => {
                const q = Number(dg.querySelector('[data-q]').value), fps = Number(dg.querySelector('[data-fps]').value), srtOn = dg.querySelector('[data-srt]').checked, toMedia = dg.querySelector('[data-media]').checked;
                if (!ro) { D().quality = q; D().fps = fps; changed({list: false, tl: false, redraw: false}); }
                saveDefs({...defs(), exportFormat: fmt, srt: srtOn, toMedia});
                const [W, H] = RN().sizeOf(D().format, fmt === 'gif' ? Math.min(360, q) : q), bar = dg.querySelector('[data-bar]'), st = dg.querySelector('[data-st]');
                bar.hidden = false; dg.querySelector('[data-go]').disabled = true; dg.querySelector('[data-stop]').hidden = false; ctrl = new AbortController();
                const onProgress = (k, m) => { bar.firstElementChild.style.width = Math.round(k * 100) + '%'; st.textContent = m || ''; };
                try {
                    const out = fmt === 'gif' ? await EX().makeGif(D(), {W, H, fps: 10, onProgress, signal: ctrl.signal}) : fmt === 'png' ? await EX().makePngZip(D(), {W, H, every: 1, onProgress, signal: ctrl.signal}) : await EX().makeVideo(D(), {format: fmt, W, H, fps, onProgress, signal: ctrl.signal});
                    const base = (A().safeExportFilename ? A().safeExportFilename(P.title) : P.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim()) || 'film';
                    download(out.blob, `${base}.${out.ext}`);
                    if (srtOn && fmt !== 'png') { const cues = await EX().cues(D(), W, H); if (cues.length) download(new Blob([EX().srt(cues)], {type: 'text/plain'}), `${base}.srt`); }
                    if (toMedia && (out.ext === 'mp4' || out.ext === 'webm' || out.ext === 'gif')) { try { await window.LCNDA_MEDIA_PICKER.importMediaFile(new File([out.blob], `${base}.${out.ext}`, {type: out.blob.type}), out.ext === 'gif' ? ['image'] : ['video']); st.textContent = T('Fini : téléchargé et rangé dans les médias.'); } catch (e2) { st.textContent = T('Téléchargé, mais pas rangé dans les médias : {e}', {e: e2.message}); } }
                    else st.textContent = out.realtime ? T('Fini (fait en temps réel).') : T('Fini.');
                } catch (e) { st.textContent = e.name === 'AbortError' ? T('Arrêté.') : T('Pas réussi : {e}', {e: e.message}); console.error(e); }
                dg.querySelector('[data-go]').disabled = false; dg.querySelector('[data-stop]').hidden = true; ctrl = null;
            });
        }
        const download = (blob, name) => { const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name}); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };

        if (ro) status(null); else status(P.id ? 'saved' : 'dirty');
        if (!P.id && !ro) { dirty = true; save(); }
        paintAll();
        ext.__anim = {P, draw, get t() { return t; }, set t(v) { t = v; }, save, changed, sel: () => sel}; // pour les essais
    }

    /* ═════ dans Listes → 🛠️ Outils de modification ═════ */
    ext.editToolsExtra = ext.editToolsExtra || [];
    ext.editToolsExtra.push({key: 'anim', icon: '🎞', label: 'Studio d’animation (cartes et graphiques qui bougent)', what: 'film',
        load: async () => ((await A().api('anim_projects')).projects || []).map(p => ({id: p.id, name: p.title, date: p.updated_at, thumb: '<span class="h-et-ico">🎞</span>', info: [T('{n} scènes', {n: String(p.scenes)}), fmtT(p.seconds), p.format].join(' · ')})),
        open: (id, again) => open({id, onClose: again}), create: again => open({onClose: again}),
        rename: (id, name) => A().api('rename_anim_project', {}, {method: 'POST', body: {id, title: name}}),
        remove: async id => { const r = await A().api('delete_anim_project', {}, {method: 'POST', body: {id}}), row = (r.result || r).row; return {undo: () => A().api('restore_anim_project', {}, {method: 'POST', body: {row}})}; },
        createLabel: '＋ Nouveau film',
        get extra() { return ['migrations', 'grandfilm', 'race', 'pyramid', 'line', 'tree', 'borders'].map(k => `<button type="button" class="button secondary" data-an-tpl="${k}">${esc({migrations: '🧭 ' + T('Migrations de la famille'), grandfilm: '🎬 ' + T('Le grand film de la famille'), race: '🏁 ' + T('Course des noms'), pyramid: '👥 ' + T('Pyramide qui vit'), line: '📈 ' + T('Courbe qui se dessine'), tree: '🌳 ' + T('Arbre qui pousse'), borders: '🏛 ' + T('Frontières qui changent')}[k])}</button>`).join(''); }});
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-an-tpl]'); if (b) { e.preventDefault(); open({template: b.dataset.anTpl}); } });
})();
