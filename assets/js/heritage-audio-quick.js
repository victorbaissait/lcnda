/**
 * ⚡ Son rapide (maquette « Studio son » § 1 et § 2, validée) et l'aiguillage des sons.
 *  - Par défaut, « ✂️ Modifier » un son ouvre l'éditeur d'avant (« 🎧 Modifier le son », heritage-studio-av.js) : réglage
 *    Réglages → Montage, retouche, mise en page et son → « 🎧 Son » → « ⚡ Son rapide : Comme avant / Nouveau ⚡ Son rapide »
 *    (localStorage « genealogie-audio-quick-design » = 'new' ; gardé tout seul, K2 ; dans les 💾 Réglages enregistrés).
 *  - Le nouveau design : gros interrupteurs (souffle, clics, bourdonnement trouvé tout seul, voix plus claire, volume égal,
 *    couper le début et la fin avec poignées, raccourcir les blancs), force Doux / Moyen / Fort, « ✨ Tout nettoyer »,
 *    👂 Avant / ✨ Après au même endroit de la lecture (deux lectures en même temps, on bascule le volume ; touche A maintenue),
 *    les 4 boutons du bas de la retouche rapide, les versions.
 *  - Rapide ⇄ 🎚️ Studio : le travail suit (boutons ⇄ effets du rack, moteur heritage-audio-engine.js) ; dernier choix retenu
 *    (« genealogie-audio-mode »), avec l'ancien design comme avec le nouveau.
 * Expose ext.openSound(media, {onDone, proj, carry}), ext.openQuickSound(…), ext.audioUi (outils partagés avec le Studio).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UI = () => window.LCNDA_UI || {};
    const AE = () => ext.audioEngine;
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const url = f => `media/${encodeURIComponent(f)}`;
    const MODE_KEY = 'genealogie-audio-mode', DESIGN_KEY = 'genealogie-audio-quick-design', PRESETS_KEY = 'genealogie-audio-fx-presets';
    const ls = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const fmt = (sec, tenths = true) => { if (!isFinite(sec) || sec < 0) sec = 0; if (UI().clock) return UI().clock(sec, {tenths}); const m = Math.floor(sec / 60), s = sec - m * 60; return `${m}:${tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0')}`; };
    const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
    const isMac = () => !!(A()?.keys?.isMac ?? /Mac|iPhone|iPad/.test(navigator.platform || ''));

    /* ═════════════ Outils partagés (⚡ Son rapide, 🎚️ Studio son) ═════════════ */
    const css = (el, n) => getComputedStyle(el).getPropertyValue(n).trim();
    /** Dessine une onde. o : {buf, peaks, view:{start,dur}, sel:{a,b}, cursor, playhead, cuts:[{a,b}], handles:{a,b}, regions:[], color, vzoom} */
    function drawWave(cv, o) {
        const g = cv.getContext('2d'), dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
        if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
        g.clearRect(0, 0, W, H);
        const b = o.buf; if (!b) return;
        const view = o.view || {start: 0, dur: b.duration}, X = t => (t - view.start) / view.dur * W, mid = H / 2, blue = o.color || css(cv, '--ui-blue') || '#055dff', vz = o.vzoom || 1;
        (o.regions || []).forEach(r => { if (r.kind === 'marker') return; const x0 = X(r.start), x1 = X(r.end); if (x1 < 0 || x0 > W) return; g.fillStyle = (r.color || '#d6336c') + '22'; g.fillRect(x0, 0, x1 - x0, H); });
        if (o.sel) { const x0 = X(o.sel.a), x1 = X(o.sel.b); g.fillStyle = 'rgba(5,93,255,.16)'; g.fillRect(x0, 0, x1 - x0, H); }
        const pk = o.peaks || (o.peaks = AE().peaks(b, 256)), sr = b.sampleRate, s0 = view.start * sr, spp = view.dur * sr / W, d0 = b.getChannelData(0);
        g.fillStyle = blue;
        for (let x = 0; x < W; x++) {
            const i0 = Math.floor(s0 + x * spp), i1 = Math.max(i0 + 1, Math.floor(s0 + (x + 1) * spp)); let lo = 1, hi = -1;
            if (spp > pk.step * 2) { for (let k = Math.floor(i0 / pk.step); k < Math.min(pk.mn.length, Math.ceil(i1 / pk.step)); k++) { if (pk.mn[k] < lo) lo = pk.mn[k]; if (pk.mx[k] > hi) hi = pk.mx[k]; } }
            else for (let i = Math.max(0, i0); i < Math.min(b.length, i1); i++) { if (d0[i] < lo) lo = d0[i]; if (d0[i] > hi) hi = d0[i]; }
            if (hi < lo) continue;
            const top = Math.max(-1, Math.min(1, hi * vz)), bot = Math.max(-1, Math.min(1, lo * vz));
            g.fillRect(x, mid - top * mid * 0.95, 1, Math.max(1, (top - bot) * mid * 0.95));
        }
        // zones coupées : hachures
        (o.cuts || []).forEach(c => { const x0 = Math.max(0, X(c.a)), x1 = Math.min(W, X(c.b)); if (x1 <= x0) return; g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip(); g.fillStyle = 'rgba(128,128,128,.30)'; g.fillRect(x0, 0, x1 - x0, H); g.strokeStyle = 'rgba(100,100,100,.8)'; g.lineWidth = dpr; g.beginPath(); for (let x = x0 - H; x < x1; x += 10 * dpr) { g.moveTo(x, H); g.lineTo(x + H, 0); } g.stroke(); g.restore(); });
        if (o.handles) [o.handles.a, o.handles.b].forEach(t => { const x = X(t); if (x < -4 || x > W + 4) return; g.fillStyle = css(cv, '--ui-ink') || '#111'; g.fillRect(x - 3 * dpr, H * 0.3, 6 * dpr, H * 0.4); });
        (o.regions || []).filter(r => r.kind === 'marker').forEach(r => { const x = X(r.start); if (x < 0 || x > W) return; g.fillStyle = r.color || '#d6336c'; g.fillRect(x - dpr / 2, 0, 1.5 * dpr, H); });
        const mark = (t, col) => { const x = X(t); if (x < 0 || x > W) return; g.fillStyle = col; g.fillRect(x - dpr / 2, 0, Math.max(1, dpr * 1.5), H); };
        if (o.cursor != null) mark(o.cursor, '#e08a00');
        if (o.playhead != null) mark(o.playhead, '#d33');
    }
    /** Graduations sous une onde */
    const ticksHtml = (dur, n = 5) => [...Array(n).keys()].map(i => `<span>${fmt(dur * i / (n - 1), false)}</span>`).join('');
    /** Le format d'enregistrement : sans perte (FLAC) si le son l'était, sinon MP3 de bonne qualité */
    const formatFor = media => /\.(wav|flac|aiff?)$/i.test(media?.filename || media?.src || '') ? {fmt: 'flac', ext: 'flac'} : {fmt: 'mp3', ext: 'mp3', kbps: 192};
    async function versionsOf(media) { if (!media?.id) return []; try { return (await A().api('media_versions', {id: media.id})).versions || []; } catch (_) { return []; } }
    /** 💾 Projet son : le son de travail (FLAC sans perte) + le reste (rack, zones, mode…) */
    async function saveProject({media, proj, name, buf, data, asNew = false, onStep = null}) {
        const blob = await AE().encodeFlac(buf, onStep);
        const send = async id => { const fd = new FormData(); fd.append('file', blob, 'projet.flac'); fd.append('id', String(id)); fd.append('name', name); fd.append('media_id', String(media?.id || 0)); fd.append('source', proj?.source || media?.filename || ''); fd.append('duration', String(buf.duration)); fd.append('data', JSON.stringify({v: 1, ...data})); fd.append('csrf', S().csrf);
            const r = await fetch('api.php?action=save_audio_project', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); return [r, await r.json().catch(() => ({error: 'Réponse illisible du serveur'}))]; };
        let [r, j] = await send(asNew ? 0 : (proj?.id || 0));
        if (!asNew && proj?.id && /introuvable/i.test(j.error || '')) [r, j] = await send(0);
        if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
        return j.result;
    }
    /** Enlève des morceaux d'un tampon (temps en secondes), avec un petit fondu à chaque raccord */
    function removeSegments(b, cuts) {
        const sr = b.sampleRate, list = (cuts || []).map(c => [Math.max(0, Math.round(c.a * sr)), Math.min(b.length, Math.round(c.b * sr))]).filter(c => c[1] > c[0]).sort((x, y) => x[0] - y[0]);
        if (!list.length) return b;
        const parts = []; let from = 0; list.forEach(([a, z]) => { if (a > from) parts.push(AE().sliceBuf(b, from, a)); from = Math.max(from, z); }); if (from < b.length) parts.push(AE().sliceBuf(b, from, b.length));
        const n = Math.round(sr * 0.01); parts.forEach(p => AE().chans(p).forEach(d => { for (let i = 0; i < Math.min(n, d.length); i++) { const u = i / n; d[i] *= u; d[d.length - 1 - i] *= u; } }));
        return AE().concatBufs(parts.filter(p => p.length > 1), b.numberOfChannels, sr);
    }
    const designNew = () => ls(DESIGN_KEY) === 'new';
    const lastMode = () => ls(MODE_KEY) === 'studio' ? 'studio' : 'quick';
    /** 💾 Réglages enregistrés des effets (partagés entre Son rapide et Studio) : [{name, date, kind:'quick'|'rack', quick, rack}] */
    const userPresets = () => { try { const v = JSON.parse(ls(PRESETS_KEY, '[]')); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 60) : []; } catch (_) { return []; } };
    const saveUserPresets = list => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list.slice(0, 60))); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage.', 'error'); return false; } };
    const cleanQuick = q => ({on: Object.fromEntries(AE().QUICK_KEYS.filter(k => q?.on?.[k]).map(k => [k, true])), force: ['doux', 'moyen', 'fort'].includes(q?.force) ? q.force : 'moyen'});
    /** Le cadre « 💾 Réglages enregistrés » commun (UI.presetsFrame) : ensembles prêts + les miens ; apply(p) reçoit {quick} ou {rack} */
    function presetsFrame({id, now, apply}) {
        const U = UI(); if (!U.presetsFrame) return document.createElement('div');
        const all = () => [...AE().BUILTIN_PRESETS.map(p => ({...p, builtin: true, date: ''})), ...userPresets()];
        const today = () => new Date().toISOString();
        const fr = U.presetsFrame({id, what: 'ces réglages du son', list: () => all().map(p => ({name: p.builtin ? `${p.name} — ${p.summary} (prêt)` : p.name, date: p.date})),
            apply: async i => { const p = all()[i]; if (!p) return false; await apply(p); toast(`Réglages « ${p.name} » appliqués.`); return false; }, quietApply: true,
            save: name => { const list = userPresets(), it = {name, date: today(), ...now()}; const at = list.findIndex(x => x.name === name); if (at >= 0) list[at] = it; else list.push(it); return saveUserPresets(list); },
            replace: i => { const n = AE().BUILTIN_PRESETS.length; if (i < n) { toast('Un ensemble prêt ne se remplace pas : enregistre les réglages sous un autre nom.', 'error'); return false; } const list = userPresets(); list[i - n] = {...list[i - n], date: today(), ...now()}; return saveUserPresets(list); },
            rename: (i, name) => { const n = AE().BUILTIN_PRESETS.length; if (i < n) return false; const list = userPresets(); list[i - n] = {...list[i - n], name}; return saveUserPresets(list); },
            duplicate: i => { const p = all()[i]; if (!p) return false; const list = userPresets(), name = U.freeName(p.builtin ? p.name.replace(/^\S+\s/, '') : p.name, list.map(x => x.name)); list.push({name, date: today(), ...(p.builtin ? (p.quick ? {kind: 'quick', quick: p.quick} : {kind: 'rack', rack: p.rack()}) : {kind: p.kind, quick: p.quick, rack: p.rack})}); return saveUserPresets(list); },
            exportOne: i => { const p = all()[i]; if (!p) return false; const data = p.builtin ? (p.quick ? {kind: 'quick', quick: p.quick} : {kind: 'rack', rack: p.rack()}) : {kind: p.kind, quick: p.quick, rack: p.rack}; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({lcnda: 'reglage', outil: 'son', nom: p.name, version: 1, donnees: data}, null, 1)], {type: 'application/json'})); a.download = `lcnda-reglage-son-${(p.name || 'son').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().slice(0, 40)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return false; },
            remove: i => { const n = AE().BUILTIN_PRESETS.length; if (i < n) { toast('Un ensemble prêt ne se supprime pas.', 'error'); return false; } const list = userPresets(), it = list[i - n]; A().undoLocalChange ? A().undoLocalChange(`Réglage « ${it.name} » supprimé`, [PRESETS_KEY], () => { list.splice(i - n, 1); saveUserPresets(list); }, () => fr.isConnected && fr.refresh()) : (list.splice(i - n, 1), saveUserPresets(list)); },
            importOne: async () => { const f = await new Promise(ok => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.addEventListener('change', () => ok(inp.files?.[0] || null), {once: true}); inp.click(); }); if (!f) return false;
                let d; try { d = JSON.parse(await f.text()); } catch (_) { toast('Ce fichier n’est pas un réglage LCNDA.', 'error'); return false; }
                if (d?.lcnda !== 'reglage' || d.outil !== 'son' || !d.donnees) { toast('Ce fichier n’est pas un réglage du son.', 'error'); return false; }
                const list = userPresets(), name = String(d.nom || 'Réglage importé').replace(/[<>"`]/g, '').slice(0, 60); list.push({name: list.some(x => x.name === name) ? U.freeName(name, list.map(x => x.name)) : name, date: today(), kind: d.donnees.kind === 'rack' ? 'rack' : 'quick', quick: d.donnees.quick ? cleanQuick(d.donnees.quick) : undefined, rack: d.donnees.rack ? AE().cleanRack(d.donnees.rack) : undefined}); saveUserPresets(list); }});
        return fr;
    }
    /** Ce qu'il faut pour rejouer un réglage enregistré : {quick} (Son rapide) ou {rack} */
    const presetData = p => p.builtin ? (p.quick ? {quick: p.quick} : {rack: p.rack()}) : (p.kind === 'rack' ? {rack: AE().cleanRack(p.rack)} : {quick: cleanQuick(p.quick)});

    /** L'aiguillage : le dernier mode choisi (⚡ rapide ou 🎚️ Studio) ; un projet du Studio (rack, multipiste) s'ouvre dans le Studio */
    function openSound(media, {onDone = null, proj = null, carry = null, mode = null} = {}) {
        const d = proj?.data || {};
        const m = mode || (proj ? (d.mode === 'studio' || d.multi?.tracks?.length ? 'studio' : d.mode === 'quick' || d.mode === 'classic' ? 'quick' : lastMode()) : lastMode());
        if (m === 'studio' && ext.openAudioStudio) return ext.openAudioStudio(media, {onDone, proj, carry});
        if (designNew()) return openQuick(media, {onDone, proj, carry});
        return ext._av?.openAudio(media, onDone, proj, carry);
    }

    /* ═════════════ ⚡ Son rapide (nouveau design) ═════════════ */
    const TOGGLES = [
        ['Nettoyer', [['hiss', '🧹', 'Nettoyer le souffle', 'le « chhh » de la cassette'], ['clicks', '✨', 'Clics et craquements', 'disque, bande abîmée'], ['hum', '〰️', 'Enlever le bourdonnement', 'le « mmm » du courant']]],
        ['Rendre agréable', [['voice', '🗣️', 'Voix plus claire', 'on comprend mieux les mots'], ['level', '📏', 'Volume égal', 'les voix lointaines remontent, les cris baissent']]],
        ['Raccourcir', [['trim', '✂️', 'Couper le début et la fin', 'trouvé tout seul, poignées sur l’onde'], ['silences', '⏩', 'Raccourcir les blancs', 'plus de 2 s → 0,5 s']]],
    ];
    async function openQuick(media, {onDone = null, proj = null, carry = null, guide = false} = {}) {
        const E = AE(), ctx = E.ctx();
        let base;
        try { base = carry?.buf || await E.load(media.src || url(media.filename)); } catch (e) { toast('Impossible de lire ce son : ' + e.message, 'error'); return; }
        // ce que le Son rapide sait montrer revient en boutons ; le reste reste appliqué (pastille)
        const fromRack = E.rackToQuick(carry?.rack || proj?.data?.rack || []);
        const q = {on: {...fromRack.q.on}, force: fromRack.q.force || 'moyen'};
        if (proj?.data?.quick && !carry) Object.assign(q, cleanQuick(proj.data.quick));
        let extras = fromRack.extras, regions = carry?.regions || proj?.data?.regions || [];
        const analysis = {hum: E.detectHum(base), edges: E.edgeSilences(base)};
        let trim = fromRack.q.trim || proj?.data?.quick?.trim || {...analysis.edges};
        let projId = proj?.id || 0, projName = proj?.name || '', saved = true, ab = 'after', proc = null, procKey = '', busy = 0, versions = await versionsOf(media);
        const steps = [], future = [];
        const snap = () => JSON.stringify({q, trim});
        const dl = document.createElement('dialog'); dl.className = 'modal h-modal h-aq'; dl.dataset.edKind = 'audio-quick';
        const tb = ext.tbButton ? ext.tbButton('audio-quick') : '';
        dl.innerHTML = `<div class="h-aq-bar ui-topbar"><span class="ui-topbar-icon" aria-hidden="true">⚡</span><input class="ui-topbar-name h-aq-name" data-aq-name value="${esc(carry?.name || projName || media.title || media.filename || 'Son')}" maxlength="160" aria-label="Nom du son">
                <span class="ui-topbar-hist"><button type="button" class="icon-button small" data-aq-cmd="undo" disabled title="Annuler" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-aq-cmd="redo" disabled title="Rétablir" data-shortcut="⇧⌘Z">↷</button></span>
                <button type="button" class="button small secondary" data-aq-cmd="studio" title="Le 🎚️ Studio son : chaque bouton allumé devient un effet réglable ; ton travail suit">🎚️ Studio son</button>
                <button type="button" class="button small secondary" data-aq-cmd="all" title="Souffle, clics, bourdonnement, voix, volume et coupe du début et de la fin, d’un coup">✨ Tout nettoyer en une fois</button>
                <span class="ui-topbar-spacer"></span><span class="ui-status" data-ui-status></span>${tb}
                <button type="button" class="button small secondary" data-aq-cmd="export" title="Exporter un fichier (MP3, WAV, FLAC…), et si tu veux une copie dans les médias">⤓ Exporter ▾</button>
                <button type="button" class="button small" data-aq-cmd="save" data-shortcut="⌘S" title="Enregistrer et afficher cette version (l’original est gardé)">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('audio-quick') : ''}<button type="button" class="icon-button" data-aq-cmd="close" aria-label="Fermer" title="Fermer">×</button></div>
            <div class="h-aq-body">
                <div class="h-aq-main">
                    <div class="h-aq-guide" data-aq-guide hidden></div>
                    <div class="h-aq-top"><span class="h-aq-time"><b data-aq-cur>0:00.0</b> / <span data-aq-total>${fmt(base.duration)}</span></span><span class="spacer"></span>
                        <span class="segmented h-aq-ab" role="group" aria-label="Avant ou après"><button type="button" data-aq-ab="before" title="Le son tel qu’il est (garde la touche A appuyée)">👂 Avant</button><button type="button" class="is-active" data-aq-ab="after" title="Le son nettoyé">✨ Après</button></span></div>
                    <div class="h-aq-wave"><canvas data-aq-canvas></canvas></div>
                    <div class="h-aq-ticks" data-aq-ticks>${ticksHtml(base.duration)}</div>
                    <div class="h-aq-transport" data-tbg="aq-transport" data-tbg-label="Lecture"><button type="button" class="button" data-aq-cmd="play" data-shortcut="Espace">▶ Écouter</button><button type="button" class="button small secondary" data-aq-cmd="home" title="Au début">⏮</button>
                        <span class="muted h-aq-tip">Garde <kbd>A</kbd> appuyée pour entendre l’avant, au même endroit.</span></div>
                    <div data-aq-notice></div><div data-aq-extras></div>
                    <div class="h-aq-versions" data-aq-versions></div>
                </div>
                <aside class="h-aq-side" data-tbg="aq-side" data-tbg-label="Les boutons">
                    ${TOGGLES.map(([t, list]) => `<section class="h-aq-group"><h4>${esc(t)}</h4><div class="h-aq-grid">${list.map(([k, ic, l, h]) => `<button type="button" class="h-aq-tog" data-aq-tog="${k}" aria-pressed="false"><span class="h-aq-ic" aria-hidden="true">${ic}</span><b>${esc(l)} <i class="h-aq-check" aria-hidden="true">✓</i></b><small data-aq-help="${k}">${esc(h)}</small></button>`).join('')}</div></section>`).join('')}
                    <div class="h-aq-force"><b>Force :</b><span class="segmented" role="group" aria-label="Force">${[['doux', 'Doux'], ['moyen', 'Moyen'], ['fort', 'Fort']].map(([k, l]) => `<button type="button" data-aq-force="${k}">${l}</button>`).join('')}</span><span data-help="Doux : on nettoie peu, la voix reste naturelle. Fort : on enlève plus de bruit, au risque d’un son un peu « métallique ». Écoute avec 👂 Avant / ✨ Après." data-help-faq="Son rapide">?</span></div>
                    <div data-aq-presets></div>
                </aside>
            </div>
            <div class="modal-actions h-aq-actions"><button type="button" class="button small secondary" data-aq-cmd="projects" title="Revenir sur un son en cours de travail">📂 Projets…</button><span class="h-mt-projname" data-aq-projname></span><span class="spacer"></span>
                <button type="button" class="button secondary" data-aq-cmd="close">Annuler</button>${media.id ? '<button type="button" class="button secondary" data-aq-save="copy" title="Un autre son, rattaché aux mêmes fiches">Copie séparée</button><button type="button" class="button secondary" data-aq-save="keep" title="Gardée dans les versions, le son affiché ne change pas">Enregistrer sans l’afficher</button><button type="button" class="button" data-aq-save="show">Enregistrer et afficher cette version</button>' : '<button type="button" class="button" data-aq-save="new">Enregistrer dans les médias</button>'}</div>`;
        document.body.appendChild(dl);
        const $ = s => dl.querySelector(s), cv = $('[data-aq-canvas]'), status = $('[data-ui-status]');
        ext.tbApply?.(dl, 'audio-quick'); ext.fullInit?.(dl, 'audio-quick'); ext.editorKeysAttach?.(dl, 'audio-quick');
        const sm = $('[data-aq-cmd="save"]'); if (UI().saveMenu && media.id) UI().saveMenu(sm, () => [
            {icon: '💾', label: 'Enregistrer et afficher cette version', shortcut: '⌘S', run: () => $('[data-aq-save="show"]').click()},
            {label: 'Enregistrer sans l’afficher', run: () => $('[data-aq-save="keep"]').click()}, {icon: '⧉', label: 'Copie séparée', run: () => $('[data-aq-save="copy"]').click()},
            '-', {icon: '📁', label: 'Enregistrer le projet (pour continuer plus tard)', run: () => saveProj()}]);
        const setStatus = st => UI().savedStatus?.(status, st);
        const paintProj = () => { $('[data-aq-projname]').textContent = projId ? `⚡ ${projName}` : ''; };
        paintProj();
        // ── l'état, la mémoire ↶ ↷ ──
        const syncHist = () => { $('[data-aq-cmd="undo"]').disabled = !steps.length; $('[data-aq-cmd="redo"]').disabled = !future.length; };
        const touch = () => { saved = false; setStatus('dirty'); };
        const record = () => { steps.push(snapPrev); if (steps.length > 100) steps.shift(); future.length = 0; snapPrev = snap(); syncHist(); };
        let snapPrev = snap();
        const restore = s0 => { const o = JSON.parse(s0); q.on = o.q.on; q.force = o.q.force; trim = o.trim; snapPrev = s0; paint(); rerender(); };
        const change = fn => { fn(); record(); touch(); paint(); rerender(); };
        // ── les cuts (début, fin, blancs) : sur le son de départ ──
        const cuts = () => { const out = []; if (q.on.trim) { if (trim.a > 0.01) out.push({a: 0, b: trim.a}); if (trim.b < base.duration - 0.01) out.push({a: trim.b, b: base.duration}); }
            if (q.on.silences) { const f = {doux: 0, moyen: 1, fort: 2}[q.force]; const min = [3, 2, 1.2][f], keep = 0.5; E.silenceRuns(base, min).forEach(r => { const a = Math.max(r.a + keep / 2, q.on.trim ? trim.a : 0), b = Math.min(r.b - keep / 2, q.on.trim ? trim.b : base.duration); if (b - a > 0.05) out.push({a, b}); }); }
            return out.sort((x, y) => x.a - y.a); };
        /** le rack « même durée » (sans les coupes) : les boutons + ce qui reste du Studio (sans ce qui change la durée) */
        const effects = () => [...E.quickToRack({...q, trim: null, hum: analysis.hum}).filter(x => !E.FX[x.type].lengthChange), ...extras.filter(x => !E.FX[x.type]?.lengthChange)];
        const cache = new Map();
        let renderToken = 0;
        async function rerender() {
            const key = JSON.stringify(effects().map(x => [x.type, x.params, x.range || null])); if (key === procKey && proc) { drawNow(); return; }
            const tok = ++renderToken; busy++; status.innerHTML = '<span class="ui-status-txt is-saving"><span class="ui-spin" aria-hidden="true"></span>Calcul…</span>';
            try { const out = await E.renderRack(base, effects(), {cache, source: base}); if (tok !== renderToken) return; proc = out; procKey = key; procPeaks = null; if (playing) restartAt(curTime()); }
            catch (e) { toast(e.message || String(e), 'error'); }
            finally { busy--; if (!busy) { if (saved) status.textContent = ''; else setStatus('dirty'); } drawNow(); }
        }
        // ── l'écoute : deux lectures en même temps (avant, après), on bascule le volume ──
        let src = [], gains = [], playing = false, t0 = 0, from = 0, raf = 0, cursor = 0, basePeaks = null, procPeaks = null;
        const curTime = () => playing ? Math.min(base.duration, from + (ctx.currentTime - t0)) : cursor;
        function stopPlay() { src.forEach(s => { try { s.onended = null; s.stop(); } catch (_) {} }); src = []; playing = false; cancelAnimationFrame(raf); $('[data-aq-cmd="play"]').textContent = '▶ Écouter'; }
        function restartAt(t) {
            src.forEach(s => { try { s.onended = null; s.stop(); } catch (_) {} }); src = []; if (ctx.state === 'suspended') ctx.resume();
            gains = [ctx.createGain(), ctx.createGain()]; gains.forEach(g => g.connect(ctx.destination)); setAB(ab, true);
            [base, proc || base].forEach((b, i) => { const s = ctx.createBufferSource(); s.buffer = b; s.connect(gains[i]); s.start(0, Math.min(t, b.duration - 0.01)); src.push(s); });
            src[0].onended = () => { if (!playing) return; stopPlay(); cursor = 0; drawNow(); };
            from = t; t0 = ctx.currentTime; playing = true; $('[data-aq-cmd="play"]').textContent = '⏸ Pause';
            const tick = () => { let t1 = curTime(); if (ab === 'after') { const c = cuts().find(c0 => t1 >= c0.a && t1 < c0.b - 0.02); if (c) { if (c.b >= base.duration - 0.02) { stopPlay(); cursor = 0; drawNow(); return; } restartAt(c.b); return; } } drawNow(t1); raf = requestAnimationFrame(tick); };
            cancelAnimationFrame(raf); tick();
        }
        function setAB(v, quiet = false) {
            ab = v; dl.querySelectorAll('[data-aq-ab]').forEach(b => { const on = b.dataset.aqAb === v; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            if (gains.length === 2) { const now = ctx.currentTime; gains[0].gain.setTargetAtTime(v === 'before' ? 1 : 0, now, quiet ? 0.001 : 0.012); gains[1].gain.setTargetAtTime(v === 'before' ? 0 : 1, now, quiet ? 0.001 : 0.012); }
            drawNow();
        }
        const drawNow = (ph = null) => {
            const showProc = ab === 'after' && proc, b = showProc ? proc : base;
            const o = {buf: b, peaks: showProc ? (procPeaks || (procPeaks = E.peaks(proc))) : (basePeaks || (basePeaks = E.peaks(base))), view: {start: 0, dur: base.duration}, cuts: ab === 'after' ? cuts() : [], handles: q.on.trim ? trim : null, cursor: playing ? null : cursor, playhead: ph ?? (playing ? curTime() : null), regions};
            drawWave(cv, o); $('[data-aq-cur]').textContent = fmt(ph ?? curTime());
        };
        $('[data-aq-cmd="play"]').addEventListener('click', () => { if (playing) { cursor = curTime(); stopPlay(); drawNow(); } else restartAt(cursor >= base.duration - 0.05 ? 0 : cursor); });
        $('[data-aq-cmd="home"]').addEventListener('click', () => { cursor = 0; if (playing) restartAt(0); else drawNow(); });
        dl.querySelectorAll('[data-aq-ab]').forEach(b => b.addEventListener('click', () => setAB(b.dataset.aqAb)));
        // ── l'onde : clic = se placer ; poignées noires = début et fin gardés ──
        const tAt = e => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(base.duration, (e.clientX - r.left) / r.width * base.duration)); };
        cv.addEventListener('pointerdown', e => {
            e.preventDefault(); const t = tAt(e), r = cv.getBoundingClientRect(), px = base.duration / r.width * 8;
            const h = q.on.trim ? (Math.abs(t - trim.a) < px ? 'a' : Math.abs(t - trim.b) < px ? 'b' : null) : null;
            if (!h) { cursor = t; if (playing) restartAt(t); else drawNow(); return; }
            cv.setPointerCapture(e.pointerId); const before = snap();
            const mv = ev => { const t1 = tAt(ev); if (h === 'a') trim.a = Math.min(t1, trim.b - 0.2); else trim.b = Math.max(t1, trim.a + 0.2); paintNotice(); drawNow(); };
            const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); if (snap() !== before) { steps.push(before); future.length = 0; snapPrev = snap(); syncHist(); touch(); } };
            cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        });
        cv.addEventListener('pointermove', e => { if (!q.on.trim) { cv.style.cursor = ''; return; } const t = tAt(e), px = base.duration / cv.getBoundingClientRect().width * 8; cv.style.cursor = Math.abs(t - trim.a) < px || Math.abs(t - trim.b) < px ? 'ew-resize' : ''; });
        // ── les boutons ──
        function paintNotice() {
            const parts = []; if (q.on.trim) { if (trim.a > 0.05) parts.push(`${fmt(trim.a, false)} au début`); if (trim.b < base.duration - 0.05) parts.push(`${fmt(base.duration - trim.b, false)} à la fin`); }
            const sil = q.on.silences ? cuts().filter(c => c.a > (q.on.trim ? trim.a : 0) + 0.01 && c.b < (q.on.trim ? trim.b : base.duration) - 0.01) : [];
            if (sil.length) parts.push(A().plural(sil.length, 'blanc raccourci', 'blancs raccourcis'));
            $('[data-aq-notice]').innerHTML = parts.length ? (UI().notice ? UI().notice('info', `Les zones hachurées seront coupées (${parts.join(' ; ')}). ${q.on.trim ? 'Glisse les poignées noires pour changer.' : ''}`) : `<p class="muted">Les zones hachurées seront coupées (${esc(parts.join(' ; '))}).</p>`) : '';
            const ex = extras.filter(x => x.on !== false);
            $('[data-aq-extras]').innerHTML = ex.length ? `<div class="h-as-rackpill"><span>⚠️ ${esc(A().plural(ex.length, 'réglage du Studio reste appliqué', 'réglages du Studio restent appliqués'))} (${esc(ex.map(x => x.type === 'repair' ? `${A().plural(x.params?.masks?.length || 0, 'réparation au pinceau', 'réparations au pinceau')}` : (E.FX[x.type]?.label || x.type).toLowerCase()).join(', '))}).</span> <button type="button" class="link-button" data-aq-cmd="studio">↗ Les voir dans le Studio</button></div>` : '';
        }
        function paint() {
            dl.querySelectorAll('[data-aq-tog]').forEach(b => { const on = !!q.on[b.dataset.aqTog]; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            dl.querySelectorAll('[data-aq-force]').forEach(b => b.classList.toggle('is-active', b.dataset.aqForce === q.force));
            const hb = $('[data-aq-help="hum"]'); if (hb) hb.textContent = analysis.hum ? `le « mmm » du courant (trouvé tout seul : ${analysis.hum} Hz)` : 'le « mmm » du courant (aucun trouvé : 50 Hz par défaut)';
            const sb = $('[data-aq-help="silences"]'); if (sb) sb.textContent = `plus de ${String([3, 2, 1.2][{doux: 0, moyen: 1, fort: 2}[q.force]]).replace('.', ',')} s → 0,5 s`;
            paintNotice(); drawNow();
        }
        dl.querySelectorAll('[data-aq-tog]').forEach(b => b.addEventListener('click', () => change(() => { const k = b.dataset.aqTog; q.on[k] = !q.on[k]; if (k === 'trim' && q.on.trim && !(trim.b > trim.a)) trim = {...analysis.edges}; })));
        dl.querySelectorAll('[data-aq-force]').forEach(b => b.addEventListener('click', () => { if (q.force !== b.dataset.aqForce) change(() => { q.force = b.dataset.aqForce; }); }));
        const allClean = () => change(() => { q.on = {hiss: true, clicks: true, hum: !!analysis.hum, voice: true, level: true, trim: true, silences: !!q.on.silences}; q.force = 'moyen'; trim = {...analysis.edges}; });
        // 💾 Réglages enregistrés (Cassette, Dictaphone, Vidéo de mariage + les miens)
        const pf = presetsFrame({id: 'son-rapide', now: () => ({kind: 'quick', quick: cleanQuick(q)}), apply: async p => { const d = presetData(p); change(() => { if (d.quick) { q.on = {...cleanQuick(d.quick).on}; q.force = cleanQuick(d.quick).force; if (q.on.trim) trim = {...analysis.edges}; } else { const r = E.rackToQuick(d.rack); q.on = r.q.on; q.force = r.q.force; extras = [...extras.filter(x => x.type === 'repair'), ...r.extras]; } }); }});
        $('[data-aq-presets]').appendChild(pf);
        // ── versions ──
        function paintVersions() { // L3 : une ligne ; le reste dans la fenêtre commune « 🕘 Versions »
            const box = $('[data-aq-versions]'), sh = versions.find(v => v.shown) || versions[0];
            box.innerHTML = versions.length > 1 && media.id ? `<p class="ui-vers-line"><button type="button" class="button small secondary" data-aq-vwin title="Écouter, comparer A / B, montrer partout, renommer, supprimer">🕘 Versions (${versions.length})…</button><small>l’original est toujours gardé · montrée : ${esc(sh?.label || 'Original')}</small></p>` : '';
        }
        paintVersions();
        $('[data-aq-versions]').addEventListener('click', e => {
            if (!e.target.closest('[data-aq-vwin]') || !window.LCNDA_UI?.openMediaVersions) return;
            stopPlay();
            window.LCNDA_UI.openMediaVersions(media, {kind: 'audio', tool: 'Son rapide', onShown: (file, vs) => { versions = vs; paintVersions(); onDone?.(); }});
        });
        // ── le son fini ──
        const finalBuf = async () => { const eff = effects(); let out = await E.renderRack(base, eff, {cache, source: base}); out = removeSegments(out, cuts()); const late = extras.filter(x => E.FX[x.type]?.lengthChange); return late.length ? E.renderRack(out, late) : out; };
        const nameNow = () => ($('[data-aq-name]').value || '').trim() || media.title || 'Son';
        const rackNow = () => [...E.quickToRack({...q, trim, hum: analysis.hum}), ...extras];
        async function doSave(mode, btn) {
            stopPlay(); const label = btn?.textContent; dl.querySelectorAll('.modal-actions button, [data-aq-cmd="save"]').forEach(x => { x.disabled = true; }); if (btn) btn.textContent = 'Préparation…';
            try {
                const out = await finalBuf(), f = formatFor(media);
                const blob = await E.encode(f.fmt, out, {kbps: f.kbps || 192, onStep: x => { if (btn) btn.textContent = `Compression… ${Math.round(x * 100)} %`; }});
                if (btn) btn.textContent = 'Envoi…';
                const res = await ext._av.uploadResult(media, blob, f.ext, {mode: mode === 'copy' ? 'copy' : mode === 'new' ? 'new' : 'version', show: mode === 'show', duration: out.duration, note: 'Son rapide', title: mode === 'copy' ? `${nameNow()} (nettoyé)` : nameNow()});
                saved = true; setStatus('saved');
                toast(mode === 'copy' ? 'Copie nettoyée ajoutée aux mêmes fiches.' : mode === 'show' ? 'Nouvelle version affichée. L’original est gardé dans les versions.' : mode === 'new' ? 'Son enregistré : il est dans Listes → Audios.' : 'Version enregistrée (non affichée).');
                onDone?.(); dl.close(); return res;
            } catch (err) { toast(err.message || String(err), 'error'); }
            finally { dl.querySelectorAll('.modal-actions button, [data-aq-cmd="save"]').forEach(x => { x.disabled = false; }); if (btn && label) btn.textContent = label; }
        }
        dl.querySelectorAll('[data-aq-save]').forEach(b => b.addEventListener('click', () => doSave(b.dataset.aqSave, b)));
        async function saveProj(asNew = false) {
            let name = nameNow(); if (asNew) { const n = await A().askText({title: 'Enregistrer le projet son', message: 'Nom du projet :', value: name, okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160) || name; }
            setStatus('saving');
            try { const r = await saveProject({media, proj: projId ? {id: projId, source: proj?.source} : null, name, buf: base, asNew, data: {mode: 'quick', quick: {...cleanQuick(q), trim}, rack: extras, regions}}); projId = r.id; projName = r.name; saved = true; setStatus('saved'); paintProj(); }
            catch (err) { setStatus('error'); toast(err.message, 'error'); }
        }
        // ── ⤓ Exporter (E3) ──
        const exportNow = async () => { stopPlay(); if (!ext.audioExport) return toast('L’export n’est pas encore prêt.', 'error'); await ext.audioExport({title: nameNow(), media, getBuffer: finalBuf, regions, onDone}); };
        // ── passer au Studio : chaque bouton allumé devient un effet du rack ; les coupes deviennent des coupes de l'onde ──
        async function toStudio() {
            stopPlay(); if (!ext.openAudioStudio) return toast('Le Studio son n’est pas encore prêt.', 'error');
            lsSet(MODE_KEY, 'studio'); const wasDirty = !saved; saved = true; dl.close();
            const rack = [...E.quickToRack({...q, trim: null, hum: analysis.hum}).filter(x => x.type !== 'silences'), ...extras];
            const edits = []; if (q.on.trim) { if (trim.b < base.duration - 0.01) edits.push({label: `Couper la fin (${fmt(base.duration - trim.b, false)})`, a: trim.b, b: base.duration}); if (trim.a > 0.01) edits.push({label: `Couper le début (${fmt(trim.a, false)})`, a: 0, b: trim.a}); }
            if (q.on.silences) { const sil = cuts().filter(c => !(q.on.trim && (c.a < trim.a + 0.01 || c.b > trim.b - 0.01))); if (sil.length) edits.push({label: `Raccourcir ${A().plural(sil.length, 'blanc', 'blancs')}`, cuts: sil}); }
            ext.openAudioStudio(media, {onDone, proj: projId ? {id: projId, name: projName, source: proj?.source || media.filename || ''} : null, carry: {buf: base, rack, regions, name: nameNow(), dirty: wasDirty, edits, from: 'quick'}});
        }
        // ── les commandes (barre, menus, raccourcis) ──
        const close = async () => { if (!saved && !await A().confirmBox('Les réglages du son seront perdus.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; stopPlay(); saved = true; dl.close(); };
        const CMD = {undo: () => { const s0 = steps.pop(); if (!s0) return; future.push(snap()); restore(s0); syncHist(); touch(); }, redo: () => { const s0 = future.pop(); if (!s0) return; steps.push(snap()); restore(s0); syncHist(); touch(); },
            studio: toStudio, all: allClean, export: exportNow, save: () => $(media.id ? '[data-aq-save="show"]' : '[data-aq-save="new"]').click(), close, projects: () => ext._av.audioProjectsDialog({current: projId, onOpen: async p => { if (!saved && !await A().confirmBox('Les réglages en cours seront perdus.', {title: 'Ouvrir un autre projet sans enregistrer ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; saved = true; stopPlay(); dl.close(); await ext.openAudioProject(p.id, onDone); }})};
        dl.addEventListener('click', e => { const b = e.target.closest('[data-aq-cmd]'); if (!b || b.disabled || ['play', 'home'].includes(b.dataset.aqCmd)) return; CMD[b.dataset.aqCmd]?.(); });
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); close(); });
        dl.addEventListener('close', () => { stopPlay(); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); dl.remove(); });
        let aHeld = false;
        const onKey = e => {
            if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl || e.target.closest?.('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable]')) return;
            const mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = e.key.toLowerCase();
            if (mod && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); CMD[e.shiftKey ? 'redo' : 'undo'](); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) saveProj(true); else CMD.save(); return; }
            if (!mod && e.key === ' ') { e.preventDefault(); $('[data-aq-cmd="play"]').click(); return; }
            if (!mod && k === 'a' && !e.repeat) { e.preventDefault(); aHeld = ab; setAB('before'); }
        };
        const onKeyUp = e => { if (e.key.toLowerCase() === 'a' && aHeld) { setAB(aHeld === 'before' ? 'before' : 'after'); aHeld = false; } };
        window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true);
        new ResizeObserver(() => drawNow()).observe(cv);
        // E4 : un son glissé sur l'onde entre dans les médias et s'ouvre à la place
        UI().bindFileDrop?.($('.h-aq-wave'), async files => {
            const f = files[0]; if (!f) return;
            if (!await A().confirmBox('Le son est ajouté aux médias. Les réglages en cours sur ce son-ci sont abandonnés.', {title: `Nettoyer « ${f.name} » à la place ?`, okLabel: 'Ouvrir ce son'})) return;
            try { const fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'audio'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', S().csrf); const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                saved = true; dl.close(); openQuick({id: j.result.media_id, filename: j.result.filename, title: f.name.replace(/\.[^.]+$/, ''), media_type: 'audio'}, {onDone}); }
            catch (err) { toast(`${f.name} : ${err.message}`, 'error'); }
        }, {accept: 'audio/*'});
        dl.showModal(); dl.querySelector('.h-aq-wave').tabIndex = -1; dl.querySelector('.h-aq-wave').focus({preventScroll: true});
        if (carry?.dirty) touch();
        paint(); rerender();
        // 🧭 Sauver une vieille cassette : le pas à pas, sur ce même Son rapide
        let gStep = guide ? 0 : -1;
        const GUIDE = [
            {t: '👂 Écoute d’abord', d: 'Clique « ▶ Écouter ». Une vieille cassette fait souvent « chhh » (le souffle), « mmm » (le courant) ou des clics. Rien n’est abîmé : tout se règle avant d’enregistrer.'},
            {t: '🧹 Le souffle', d: 'Le bouton « Nettoyer le souffle » est allumé : l’app a pris toute seule le passage le plus calme comme exemple du bruit. Compare 👂 Avant / ✨ Après (ou garde A appuyée). Trop fort ? Choisis « Doux ».', on: ['hiss']},
            {t: '〰️ Le bourdonnement et les clics', d: () => analysis.hum ? `Un ronflement du courant a été trouvé (${analysis.hum} Hz) : il est enlevé, avec les clics. Écoute la différence.` : 'Aucun ronflement trouvé : rien à enlever de ce côté. Les clics et craquements sont nettoyés.', on: () => analysis.hum ? ['hum', 'clicks'] : ['clicks']},
            {t: '🗣️ La voix', d: '« Voix plus claire » et « Volume égal » sont allumés : on comprend mieux les mots, les voix lointaines remontent, les cris baissent.', on: ['voice', 'level']},
            {t: '✂️ Le début et la fin', d: 'Le silence du début (le bouton « Lecture ») et la cassette qui tourne à vide à la fin sont hachurés : ils seront coupés. Glisse les poignées noires si besoin.', on: ['trim']},
            {t: '💾 C’est prêt', d: media.id ? 'Clique « Enregistrer et afficher cette version » : l’original reste gardé dans les versions.' : 'Clique « Enregistrer dans les médias ».'},
        ];
        function paintGuide() {
            const box = $('[data-aq-guide]'); if (gStep < 0) { box.hidden = true; return; }
            const g = GUIDE[gStep], d = typeof g.d === 'function' ? g.d() : g.d; box.hidden = false;
            box.innerHTML = `<span class="h-aq-gstep">🧭 Étape ${gStep + 1} sur ${GUIDE.length}</span><b>${esc(g.t)}</b><p>${esc(d)}</p><div class="h-aq-gbtns">${gStep ? '<button type="button" class="button small secondary" data-aq-g="prev">← Retour</button>' : ''}${gStep < GUIDE.length - 1 ? '<button type="button" class="button small" data-aq-g="next">Suivant →</button>' : ''}<button type="button" class="link-button" data-aq-g="stop">Fermer le guide</button></div>`;
            dl.querySelectorAll('.h-aq-tog, [data-aq-save]').forEach(b => b.classList.remove('is-guided'));
            (typeof g.on === 'function' ? g.on() : g.on || []).forEach(k => dl.querySelector(`[data-aq-tog="${k}"]`)?.classList.add('is-guided'));
            if (gStep === GUIDE.length - 1) dl.querySelector('[data-aq-save="show"], [data-aq-save="new"]')?.classList.add('is-guided');
        }
        $('[data-aq-guide]').addEventListener('click', e => { const k = e.target.closest('[data-aq-g]')?.dataset.aqG; if (!k) return;
            if (k === 'stop') { gStep = -1; dl.querySelectorAll('.is-guided').forEach(b => b.classList.remove('is-guided')); return paintGuide(); }
            gStep = clampN(gStep + (k === 'next' ? 1 : -1), 0, GUIDE.length - 1); const g = GUIDE[gStep], on = typeof g.on === 'function' ? g.on() : g.on || [];
            if (k === 'next' && on.some(x => !q.on[x])) change(() => { on.forEach(x => { q.on[x] = true; }); if (on.includes('trim')) trim = {...analysis.edges}; });
            paintGuide(); });
        paintGuide();
        // pour les essais
        dl._aq = {guideStep: () => gStep, q: () => q, trim: () => trim, set: (k, v) => change(() => { q.on[k] = v; }), proc: () => proc, base: () => base, cuts, finalBuf, rackNow, extras: () => extras, ab: () => ab, analysis, busy: () => busy, toStudio};
        return dl;
    }

    ext.openSound = openSound;
    ext.openQuickSound = openQuick;
    ext.audioUi = {drawWave, ticksHtml, formatFor, versionsOf, saveProject, removeSegments, presetsFrame, presetData, userPresets, cleanQuick, designNew, lastMode, fmt, MODE_KEY, DESIGN_KEY, PRESETS_KEY};
    void isMac;
})();
