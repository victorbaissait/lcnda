/**
 * 🎚️ Studio son (maquette « Studio son » § 3 à § 10, validée) : la version complète, façon Adobe Audition, sur le moteur commun
 * (heritage-audio-engine.js). Nouveau dans tous les cas (le réglage du ⚡ Son rapide ne le change pas).
 *  - Barre E1 (menus Fichier, Édition, Effets, Marqueurs, Affichage, Fenêtre ; ↶ ↷ ; ⚡ Son rapide ; ✓ Enregistré ; ⚙️ ; ⤓ ; 💾 ▾ ; ⛶ ; ×),
 *    panneau E2 (sections repliables retenues), barre du bas K18 (où l'on est, aide, zoom).
 *  - Forme d'onde : sélection (souris, ⇧ ← →), loupe temporelle, zoom (et zoom vertical), marqueurs 🚩 et zones nommées en couleur,
 *    VU-mètres, historique cliquable ↶ ↷, coupes (Édition, clic droit K14).
 *  - Rack d'effets non destructif (⠿ ranger, 👁 éteindre, × retirer, « Seulement sur la sélection », « Appliquer pour de bon »).
 *  - Spectre et pinceau / lasso de réparation ; Multipiste (heritage-audio-multi.js) ; passages reliés à une personne ou un événement
 *    (menu de choix unique) et bloc « 🎧 On l'entend » de la fiche ; transcription à la main avec l'heure ; export E3 complété.
 * Serveur : lib/audio_studio.php (zones, liens, transcription), lib/audio_projects.php (projet : FLAC + rack, zones, multipiste).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UI = () => window.LCNDA_UI || {};
    const AE = () => ext.audioEngine;
    const AU = () => ext.audioUi;
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const url = f => `media/${encodeURIComponent(f)}`;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const fmt = (s, t = true) => AU().fmt(s, t);
    const plural = (n, a, b) => A().plural(n, a, b);
    const SPEC_KEY = 'genealogie-audio-studio-spectrum';
    const ls = (k, d = '') => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const COLORS = ['#d6336c', '#2f9e44', '#1971c2', '#e8590c', '#7048e8', '#0c8599', '#c2255c', '#5c940d'];
    const ROLE_LIST = ['parle', 'chante', 'raconte', 'interviewe', 'est cité', 'joue', 'témoin'];
    let uid = 0; const nid = p => p + (++uid) + Date.now().toString(36).slice(-4);
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); };
    const safeName = n => (A().safeExportFilename ? A().safeExportFilename(n, 'son') : String(n || 'son').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'son');

    /* ═════════════ ⤓ Exporter (E3 complété) : MP3, M4A, WAV, FLAC, Ogg Opus, AIFF, texte et repères, dans les médias ═════════════ */
    /** o : {title, media, getBuffer() → AudioBuffer (tout le son), getSelection?, regions, lines, tracks:[{id,name}], getTrack(id), toMedia(), onDone} */
    ext.audioExport = async o => {
        const E = AE(), U = UI(); if (!U.openExportDialog) return toast('La fenêtre d’export n’est pas prête.', 'error');
        let full; try { full = await o.getBuffer(); } catch (e) { return toast(e.message, 'error'); }
        const mb = bps => Math.max(1, Math.round(full.duration * bps / 1048576)), pcm = full.sampleRate * full.numberOfChannels * 2;
        const [opus, m4a] = await Promise.all([E.opusSupported(), E.m4aSupported()]);
        const zones = (o.regions || []).filter(r => r.kind !== 'marker' && r.end > r.start), lossy = ['mp3', 'm4a', 'ogg'];
        const people = [...new Set((o.regions || []).flatMap(r => (r.links || []).filter(l => l.type === 'person').map(l => l.title)))];
        const tagsFor = (title, regs) => ({title, artist: people.join(', '), comment: 'LCNDA', chapters: (regs || []).filter(r => r.kind !== 'marker').map(r => ({title: r.name + ((r.links || []).length ? ' — ' + r.links.map(l => l.title).join(', ') : ''), start: r.start, end: r.end}))});
        const runAudio = fmtId => async opt => {
            const F = opt.fields, write = opt.checks.tags, kbps = Number(F.kbps) || 192, rate = Number(F.rate) || 0, ch = F.ch === 'mono' ? 1 : F.ch === 'stereo' ? 2 : 0, go = document.querySelector('dialog.ui-export[open] [data-ui-go]');
            const step = x => { if (go) go.textContent = `Compression… ${Math.round(x * 100)} %`; };
            const files = [];
            if (F.what === 'zones') { if (!zones.length) throw new Error('Il n’y a pas de zone : crée-en une (Marqueurs → Nouvelle zone).'); for (const z of zones) files.push({name: safeName(z.name), buf: E.sliceBuf(full, z.start * full.sampleRate, z.end * full.sampleRate), regs: [{...z, start: 0, end: z.end - z.start}]}); }
            else if (F.what === 'tracks') { if (!o.tracks?.length) throw new Error('Pas de pistes : passe en mode 🎛️ Multipiste.'); for (const t of o.tracks) files.push({name: safeName(`${opt.base}-${t.name}`), buf: await o.getTrack(t.id), regs: []}); }
            else if (F.what === 'sel') { const s = o.getSelection?.(); if (!s) throw new Error('Pas de sélection : glisse sur l’onde pour en faire une.'); files.push({name: opt.base, buf: E.sliceBuf(full, s.a * full.sampleRate, s.b * full.sampleRate), regs: []}); }
            else files.push({name: opt.base, buf: full, regs: o.regions || []});
            for (const [i, f] of files.entries()) {
                const blob = await E.encode(fmtId, f.buf, {kbps, rate, channels: ch, tags: write ? tagsFor(files.length > 1 ? f.name : o.title, f.regs) : null, onStep: x => step((i + x) / files.length)});
                const ext0 = fmtId === 'ogg' ? 'ogg' : fmtId; download(blob, `${f.name}.${ext0}`);
                if (opt.saveCopy && fmtId !== 'aiff' && ext._av?.uploadResult) await ext._av.uploadResult(o.media || {id: 0}, blob, ext0, {mode: o.media?.id ? 'copy' : 'new', duration: f.buf.duration, title: `${files.length > 1 ? f.name : o.title} (${fmtId.toUpperCase()})`});
                if (files.length > 1) await new Promise(r => setTimeout(r, 350)); // plusieurs fichiers : le navigateur les prend un par un
            }
            if (opt.saveCopy) { toast(files.length > 1 ? `${plural(files.length, 'fichier téléchargé', 'fichiers téléchargés')}, et rangés dans les médias.` : 'Fichier téléchargé, et une copie est rangée dans les médias.'); o.onDone?.(); }
        };
        const runText = async opt => {
            const kind = opt.fields.text || 'txt', lines = o.lines || [];
            const txt = kind === 'srt' ? E.toSrt(lines, full.duration) : kind === 'vtt' ? E.toVtt(lines, full.duration, o.regions) : kind === 'cue' ? E.toCue(o.regions, `${opt.base}.mp3`, o.title) : E.toTxt(lines, (o.regions || []).map(r => ({...r, people: (r.links || []).map(l => l.title)})), o.title);
            if (kind === 'srt' && !lines.length) throw new Error('Pas encore de transcription (Fenêtre → Transcription).');
            download(new Blob([txt], {type: kind === 'vtt' ? 'text/vtt' : 'text/plain;charset=utf-8'}), `${opt.base}.${kind}`);
        };
        const formats = [{id: 'mp3', label: '🎵 MP3', hint: `lu partout · ~${mb(24000)} Mo`, ext: 'mp3', run: runAudio('mp3')}];
        if (m4a) formats.push({id: 'm4a', label: '🍏 M4A (AAC)', hint: `iPhone, iTunes · ~${mb(20000)} Mo`, ext: 'm4a', run: runAudio('m4a')});
        formats.push({id: 'wav', label: '🎚 WAV', hint: `sans perte · ~${mb(pcm)} Mo`, ext: 'wav', run: runAudio('wav')}, {id: 'flac', label: '🗜 FLAC', hint: `sans perte, léger · ~${mb(pcm * .55)} Mo`, ext: 'flac', run: runAudio('flac')});
        if (opus) formats.push({id: 'ogg', label: '🗣 Ogg Opus', hint: `le plus léger · ~${mb(12000)} Mo`, ext: 'ogg', run: runAudio('ogg')});
        formats.push({id: 'aiff', label: '🍎 AIFF', hint: 'GarageBand, Logic', ext: 'aiff', run: runAudio('aiff'), copy: false},
            {id: 'text', label: '📝 Texte et repères', hint: '.txt, .srt, .vtt, .cue', ext: 'txt', run: runText, copy: false, goLabel: '⤓ Exporter le texte'});
        if (o.toMedia) formats.push({id: 'base', label: '💾 Dans les médias', hint: 'nouvelle version, copie', ext: '', run: async () => { setTimeout(() => o.toMedia(), 60); }, copy: false, goLabel: '💾 Choisir comment le garder…'});
        // aperçu : l'onde du résultat, « ▶ Écouter 10 s du résultat », durée, canaux, fréquence, sonie, crête
        const prev = document.createElement('div'); prev.className = 'h-as-exprev';
        prev.innerHTML = `<canvas class="h-as-expwave"></canvas><button type="button" class="button small secondary" data-as-ex10>▶ Écouter 10 s du résultat</button><small class="muted" data-as-exinfo>${fmt(full.duration, false)} · ${full.numberOfChannels > 1 ? 'stéréo' : 'mono'} · ${(full.sampleRate / 1000).toLocaleString('fr-FR')} kHz</small>`;
        let s10 = null;
        prev.querySelector('[data-as-ex10]').addEventListener('click', () => { const c = E.ctx(); if (s10) { try { s10.stop(); } catch (_) {} s10 = null; return; } s10 = c.createBufferSource(); s10.buffer = full; s10.connect(c.destination); const at = Math.max(0, Math.min(full.duration - 10, full.duration * 0.3)); s10.start(0, at, 10); s10.onended = () => { s10 = null; }; });
        setTimeout(async () => { const cv = prev.querySelector('canvas'); if (cv.isConnected) AU().drawWave(cv, {buf: full}); const pk = E.linToDb(E.peakOf(full)), L = await E.lufs(full); const i = prev.querySelector('[data-as-exinfo]'); if (i) i.textContent = `${o.sourceDuration && Math.abs(o.sourceDuration - full.duration) > 0.5 ? `${fmt(o.sourceDuration, false)} → ` : ''}${fmt(full.duration, false)} · ${full.numberOfChannels > 1 ? 'stéréo' : 'mono'} · ${(full.sampleRate / 1000).toLocaleString('fr-FR')} kHz · sonie ${Math.round(L)} LUFS · crête ${pk.toFixed(1).replace('.', ',')} dB`; }, 120);
        const isAudio = f => !['text', 'base'].includes(f);
        const res = await U.openExportDialog({title: o.title, defaultName: o.title, quality: false, saveCopy: true, copyChecked: false, info: '', preview: () => prev, formats,
            fields: [
                {id: 'kbps', label: 'Qualité', value: '192', options: [['192', 'Bonne (192 kbit/s)'], ['128', 'Légère (128 kbit/s)'], ['320', 'Très bonne (320 kbit/s)']], show: f => lossy.includes(f)},
                {id: 'what', label: 'Quoi', value: 'all', options: [['all', 'Tout le son'], ...(o.getSelection?.() ? [['sel', 'La sélection']] : []), ...(zones.length ? [['zones', `Chaque zone dans un fichier (${zones.length})`]] : []), ...(o.tracks?.length ? [['tracks', `Chaque piste dans un fichier (${o.tracks.length})`]] : [])], show: isAudio},
                {id: 'ch', label: 'Canaux', value: 'keep', options: [['keep', `Comme l’original (${full.numberOfChannels > 1 ? 'stéréo' : 'mono'})`], ['mono', 'Mono'], ['stereo', 'Stéréo']], show: isAudio},
                {id: 'rate', label: 'Fréquence', value: '0', options: [['0', `Comme l’original (${(full.sampleRate / 1000).toLocaleString('fr-FR')} kHz)`], ['44100', '44,1 kHz'], ['48000', '48 kHz'], ['22050', '22,05 kHz (voix, plus léger)']], show: isAudio},
                {id: 'text', label: 'Fichier', value: 'txt', options: [['txt', '.txt — la transcription et les zones'], ['srt', '.srt — sous-titres'], ['vtt', '.vtt — sous-titres et chapitres'], ['cue', '.cue — repères (chapitres)']], show: f => f === 'text'},
            ],
            checks: [{id: 'tags', label: 'Écrire les zones et les personnes dans le fichier (titre, chapitres)', checked: !!(o.regions || []).length, show: f => ['mp3', 'flac', 'ogg', 'm4a'].includes(f)}],
            onPick: (f, dlg) => { const ne = dlg.querySelector('[data-ui-ext]'); if (f === 'text' && ne) { const sel = dlg.querySelector('[data-ui-fsel="text"]'); ne.textContent = '.' + (sel?.value || 'txt'); if (sel && !sel._b) { sel._b = 1; sel.addEventListener('change', () => { ne.textContent = '.' + sel.value; }); } } }});
        if (s10) { try { s10.stop(); } catch (_) {} }
        return res;
    };

    /* ═════════════ 🎚️ Studio son ═════════════ */
    async function openAudioStudio(media, {onDone = null, onSaved = null, proj = null, carry = null} = {}) {
        const E = AE(), ctx = E.ctx();
        let base;
        try { base = carry?.buf || await E.load(media.src || url(media.filename)); } catch (e) { toast('Impossible de lire ce son : ' + e.message, 'error'); return; }
        const data = proj?.data || {};
        const st = {
            rack: E.cleanRack(carry?.rack || data.rack || []),
            regions: cleanRegions(carry?.regions || data.regions || []),
            multi: data.multi && typeof data.multi === 'object' ? data.multi : null,
            transcript: Array.isArray(data.transcript) ? data.transcript : [],
        };
        const srcFile = media.id && !carry?.buf && !proj ? String(media.filename || '') : ''; // les temps valent pour ce fichier tant qu'on n'a rien coupé
        let pristine = !!srcFile, projId = proj?.id || 0, projName = proj?.name || '', saved = !carry?.dirty, view = {start: 0, dur: base.duration}, vzoom = 1, sel = null, cursor = 0, mode = 'wave', tool = 'sel', selFx = null, selRegion = null;
        let spectrumOn = ls(SPEC_KEY, '1') !== '0', rendered = null, renderKey = '', rendering = null, peaks = null, rpeaks = null, brush = 16, paintMasks = [], lasso = null, clipboard = null, loop = false;
        const cache = new Map();
        // ── l'historique (↶ ↷ et la liste cliquable) ──
        const hist = []; let hpos = -1;
        const stateOf = label => ({label, base, rack: JSON.stringify(st.rack), regions: JSON.stringify(st.regions), multi: JSON.stringify(st.multi), pristine});
        const commit = (label, {dirty = true} = {}) => { hist.splice(hpos + 1); hist.push(stateOf(label)); if (hist.length > 60) { hist.shift(); } hpos = hist.length - 1; if (dirty) { saved = false; status('dirty'); } paintHist(); };
        const goHist = i => { if (i < 0 || i >= hist.length || i === hpos) return; const h = hist[i]; hpos = i; if (h.base !== base) { base = h.base; peaks = null; } st.rack = JSON.parse(h.rack); st.regions = JSON.parse(h.regions); st.multi = JSON.parse(h.multi); pristine = h.pristine; clampView(); saved = false; status('dirty'); stopPlay(); invalidate(); paintAll(); scheduleRegionSave(); multi?.reload?.(); };

        const dl = document.createElement('dialog'); dl.className = 'modal h-modal h-as'; dl.dataset.edKind = 'audio-studio';
        const sec = (title, key, body, open = true) => UI().panelSection ? UI().panelSection({title, key: 'as-' + key, open, body}) : `<details ${open ? 'open' : ''} data-ui-section="as-${key}"><summary>${esc(title)}</summary><div class="ui-section-body">${body}</div></details>`;
        const CMDS = [['play', '▶ Écouter / pause'], ['home', '⏮ Au début'], ['loop', '🔁 Lire en boucle'], ['rec', '● Enregistrer au micro'], ['undo', '↶ Annuler'], ['redo', '↷ Rétablir'], ['marker', '🚩 Marqueur ici'], ['zone', '＋ Nouvelle zone'],
            ['cut', '✂️ Couper (dans le presse-papiers)'], ['copy', 'Copier'], ['paste', 'Coller'], ['del', 'Supprimer la sélection'], ['keep', 'Garder seulement la sélection'], ['silence', 'Silence'], ['selall', 'Tout sélectionner'], ['insert', 'Insérer un son…'], ['mono', 'Mono'], ['bake', 'Appliquer le rack pour de bon'],
            ['zoomsel', 'Zoom sur la sélection'], ['zoomfit', 'Tout voir'], ['zoomin', 'Zoom avant'], ['zoomout', 'Zoom arrière'], ['vzin', 'Zoom vertical +'], ['vzout', 'Zoom vertical −'], ['spectrum', 'Spectre : montrer / cacher'], ['wave', '〰️ Forme d’onde'], ['multi', '🎛️ Multipiste'],
            ['tool:sel', '⌶ Sélection'], ['tool:brush', '🖌 Pinceau de réparation'], ['tool:lasso', '➰ Lasso de réparation'], ['tool:marker', '🚩 Poser des marqueurs'], ['tool:razor', '✂️ Couper un morceau (multipiste)'], ['repair', '🩹 Réparer'], ['clearpaint', 'Effacer le dessin'],
            ['quick', '⚡ Son rapide'], ['projects', '📂 Projets…'], ['saveproj', '💾 Enregistrer le projet'], ['saveas', 'Enregistrer le projet sous…'], ['show', 'Enregistrer et afficher cette version'], ['keepv', 'Enregistrer sans l’afficher'], ['copyv', 'Copie séparée'], ['export', '⤓ Exporter…'], ['montage', '🎬 Ouvrir dans le montage'], ['close', 'Fermer'],
            ['win:transcript', '📝 Transcription'], ['win:history', '🕘 Historique'], ['win:info', 'ℹ️ Infos du son'], ['win:rack', '🎛️ Rack d’effets'], ['tstamp', '⏱ Insérer l’heure'], ['slow', '🐢 Lire à 75 %']];
        dl.innerHTML = `<div class="h-as-bar ui-topbar"><span class="ui-topbar-icon" aria-hidden="true">🎚️</span><input class="ui-topbar-name h-as-name" data-as-name value="${esc(carry?.name || projName || media.title || media.filename || 'Son')}" maxlength="160" aria-label="Nom du projet son">
                <nav class="h-as-menus" data-as-menus data-tbg="as-menus" data-tbg-label="Menus du haut"></nav>
                <span class="ui-topbar-hist"><button type="button" class="icon-button small" data-as-cmd="undo" disabled title="Annuler" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-as-cmd="redo" disabled title="Rétablir" data-shortcut="⇧⌘Z">↷</button></span>
                <button type="button" class="button small secondary" data-as-cmd="quick" title="Revenir au ⚡ Son rapide : ce qu’il sait montrer revient en boutons, le reste reste appliqué">⚡ Son rapide</button>
                <span class="ui-topbar-spacer"></span><span class="ui-status" data-ui-status></span>${ext.tbButton ? ext.tbButton('audio-studio') : ''}
                <button type="button" class="button small secondary" data-as-cmd="export" title="Exporter : MP3, M4A, WAV, FLAC, Ogg, AIFF, texte et repères">⤓ Exporter ▾</button>
                <button type="button" class="button small" data-as-cmd="saveproj" data-shortcut="⌘S" title="Enregistrer le projet son (rack, zones, pistes), pour y revenir">💾 Enregistrer</button>${ext.fullButton ? ext.fullButton('audio-studio') : ''}<button type="button" class="icon-button" data-as-cmd="close" aria-label="Fermer" title="Fermer">×</button></div>
            <div class="h-as-modes"><span class="segmented" role="tablist" aria-label="Mode"><button type="button" class="is-active" data-as-cmd="wave" role="tab">〰️ Forme d’onde</button><button type="button" data-as-cmd="multi" role="tab">🎛️ Multipiste</button></span>
                <span class="h-as-tools" data-tbg="as-tools" data-tbg-label="Outils"><button type="button" class="icon-button small is-active" data-as-cmd="tool:sel" title="Sélection : glisser sur l’onde" aria-label="Sélection">⌶</button><button type="button" class="icon-button small" data-as-cmd="tool:brush" title="Pinceau de réparation (sur le spectre)" aria-label="Pinceau de réparation" data-shortcut="B">🖌</button><button type="button" class="icon-button small" data-as-cmd="tool:lasso" title="Lasso de réparation (sur le spectre)" aria-label="Lasso de réparation">➰</button><button type="button" class="icon-button small" data-as-cmd="tool:marker" title="Poser des marqueurs (clic sur l’onde)" aria-label="Marqueurs">🚩</button><button type="button" class="icon-button small" data-as-cmd="tool:razor" title="Couper un morceau en deux (multipiste) ; sur l’onde : supprimer la sélection" aria-label="Couper">✂️</button></span>
                <span class="spacer"></span><label class="ui-toggle"><input type="checkbox" data-as-specsw ${spectrumOn ? 'checked' : ''}><i></i>Spectre</label></div>
            <div class="h-as-body">
                <aside class="h-as-left">
                    <h4>Fichiers</h4><div class="h-as-files" data-as-files></div><button type="button" class="button small secondary" data-as-addfile>＋ Ajouter un son…</button>
                    <h4>Marqueurs et zones</h4><div class="h-as-regions" data-as-regions></div><button type="button" class="button small secondary" data-as-cmd="zone" data-shortcut="M">＋ Nouvelle zone</button>
                </aside>
                <main class="h-as-center">
                    <div class="h-as-wavebox" data-as-wavebox>
                        <div class="h-as-top"><span class="h-as-time"><b data-as-cur>0:00.0</b> / <span data-as-total></span></span><span class="muted" data-as-seltxt></span><span class="spacer"></span>
                            <span class="h-as-zoom" data-tbg="as-zoom" data-tbg-label="Zoom"><button type="button" class="button small secondary" data-as-cmd="zoomfit" title="Tout voir">⤢ Tout</button><button type="button" class="button small secondary" data-as-cmd="zoomsel" title="Zoom sur la sélection" data-shortcut="⌘E">🔍 Sélection</button><button type="button" class="button small secondary" data-as-cmd="zoomout" aria-label="Zoom arrière">−</button><button type="button" class="button small secondary" data-as-cmd="zoomin" aria-label="Zoom avant">＋</button></span></div>
                        <canvas class="h-as-overview" data-as-overview title="Tout le son : glisse le cadre pour te déplacer"></canvas>
                        <div class="h-as-zbar" data-as-zbar></div>
                        <div class="h-as-wave"><canvas data-as-canvas></canvas></div>
                        <div class="h-as-ticks" data-as-ticks></div>
                        <div class="h-as-spec" data-as-specbox>
                            <div class="h-as-spectools"><span class="muted">Peins sur une tache (toux, sonnerie, porte), puis « 🩹 Réparer ».</span><span class="spacer"></span><span data-as-brushsize></span><button type="button" class="button small secondary" data-as-cmd="paintplay" title="Écouter seulement le passage peint">👂 Écouter la zone</button><button type="button" class="button small secondary" data-as-cmd="clearpaint">× Effacer le dessin</button><button type="button" class="button small" data-as-cmd="repair">🩹 Réparer</button></div>
                            <div class="h-as-specwrap"><canvas data-as-spec></canvas><span class="h-as-flab" data-as-flab></span></div>
                        </div>
                        <div class="h-as-transport" data-tbg="as-transport" data-tbg-label="Lecture"><button type="button" class="button" data-as-cmd="play" data-shortcut="Espace">▶ Écouter</button><button type="button" class="button small secondary" data-as-cmd="home" title="Au début" aria-label="Au début">⏮</button><button type="button" class="button small secondary" data-as-cmd="loop" title="Lire la sélection en boucle" aria-label="Boucle">🔁</button><button type="button" class="button small secondary h-as-recbtn" data-as-cmd="rec" title="Enregistrer au micro (au repère orange ; en multipiste : sur la piste armée ●)" aria-label="Enregistrer au micro">●</button>
                            <span class="muted h-as-tip" data-tb-label="Aide">Glisse = sélectionner · <kbd>Espace</kbd> écouter · <kbd>⌘</kbd> et molette : zoom · <kbd>M</kbd> marqueur · <kbd>A</kbd> maintenu : l’avant</span></div>
                        <div class="h-as-vu" data-tbg="as-vu" data-tbg-label="VU-mètres"><div class="h-as-vurow" data-tb-label="VU-mètres"><span>G</span><div class="h-as-vubar"><i data-as-vu="0"></i><b data-as-vupk="0"></b></div><span>D</span><div class="h-as-vubar"><i data-as-vu="1"></i><b data-as-vupk="1"></b></div><small class="h-as-vuscale"><span>−60</span><span>−36</span><span>−18</span><span>−9</span><span>−3</span><span>0 dB</span></small></div></div>
                    </div>
                    <div class="h-as-multibox" data-as-multibox hidden></div>
                </main>
                <aside class="h-as-side">
                    ${sec('🎛️ Rack d’effets', 'rack', `<div class="h-as-rack" data-as-rack></div><div class="h-as-rackbtns"><button type="button" class="button small secondary" data-as-addfx>＋ Ajouter un effet ▾</button></div><div data-as-presets></div><label class="ui-toggle"><input type="checkbox" data-as-onsel><i></i>Seulement sur la sélection</label>`)}
                    <div data-as-fxsec></div>
                    ${sec('🔗 Relier ce passage', 'link', '<div data-as-link></div>')}
                    ${sec('🕘 Historique', 'hist', '<ol class="h-as-hist" data-as-hist></ol><p class="muted">Clique une étape pour y revenir ; les étapes grisées reviennent avec ↷.</p>', false)}
                    ${sec('ℹ️ Infos du son', 'info', '<div data-as-info></div>', false)}
                    ${sec('📝 Transcription', 'text', '<div data-as-text></div>', false)}
                </aside>
            </div>
            <div class="h-as-status" data-as-statusbar></div>
            <div hidden data-as-cmds>${CMDS.map(([k, l]) => `<button type="button" data-as-cmd="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;
        document.body.appendChild(dl);
        const $ = s => dl.querySelector(s), cv = $('[data-as-canvas]'), ov = $('[data-as-overview]'), spc = $('[data-as-spec]');
        ext.fullInit?.(dl, 'audio-studio', true); ext.editorKeysAttach?.(dl, 'audio-studio');
        const status = s0 => UI().savedStatus?.($('[data-ui-status]'), s0);
        // ── la barre du bas (K18) : où l'on est, l'aide de l'outil, le zoom ──
        let sbar = null;
        if (UI().editorStatus) { sbar = UI().editorStatus({help: '', zoom: {get: () => base.duration / view.dur, set: k => { const c = view.start + view.dur / 2; view.dur = base.duration / k; view.start = c - view.dur / 2; clampView(); drawAll(); }, fit: () => { view = {start: 0, dur: base.duration}; drawAll(); }, min: 1, max: Math.max(2, base.duration / 0.05)}}); $('[data-as-statusbar]').replaceWith(sbar); }
        const HELP = {sel: 'Glisse sur l’onde pour sélectionner ; clic = se placer ; ⇧ ← → agrandit la sélection.', brush: 'Peins sur la tache du spectre (toux, sonnerie), puis « 🩹 Réparer ». Taille : le curseur.', lasso: 'Entoure la tache sur le spectre, puis « 🩹 Réparer ».', marker: 'Clic sur l’onde : un marqueur 🚩 à cet endroit.', razor: 'Multipiste : clic sur un morceau pour le couper en deux. Sur l’onde : supprime la sélection.'};
        // ── E1 : les menus ──
        const fxMenu = () => Object.entries(E.FX).filter(([, d]) => !d.hidden).map(([k, d]) => ({icon: d.icon, label: d.label, run: () => addFx(k)}));
        const M = c => () => runCmd(c);
        const MENUS = {
            Fichier: () => [{icon: '⚡', label: 'Son rapide', run: M('quick')}, {icon: '📂', label: 'Projets…', run: M('projects')}, '-', {icon: '💾', label: 'Enregistrer le projet', shortcut: '⌘S', run: M('saveproj')}, {label: 'Enregistrer le projet sous…', shortcut: '⇧⌘S', run: M('saveas')}, ...(media.id ? [{label: 'Enregistrer et afficher cette version', run: M('show')}, {label: 'Enregistrer sans l’afficher', run: M('keepv')}, {icon: '⧉', label: 'Copie séparée', run: M('copyv')}, '-', {icon: '🕘', label: 'Versions…', run: M('versions')}] : [{label: 'Enregistrer dans les médias', run: M('show')}]), '-', {icon: '⤓', label: 'Exporter…', run: M('export')}, {icon: '🎬', label: 'Ouvrir dans le montage', run: M('montage')}, '-', {label: 'Fermer', run: M('close')}],
            'Édition': () => [{icon: '↶', label: 'Annuler', shortcut: '⌘Z', disabled: hpos <= 0, run: M('undo')}, {icon: '↷', label: 'Rétablir', shortcut: '⇧⌘Z', disabled: hpos >= hist.length - 1, run: M('redo')}, '-', {label: 'Couper', shortcut: '⌘X', disabled: !sel, run: M('cut')}, {icon: '📋', label: 'Copier', shortcut: '⌘C', disabled: !sel, run: M('copy')}, {icon: '📋', label: 'Coller', shortcut: '⌘V', disabled: !clipboard, run: M('paste')}, {label: 'Supprimer la sélection', shortcut: '⌫', disabled: !sel, run: M('del')}, {label: 'Garder seulement la sélection', disabled: !sel, run: M('keep')}, {label: 'Silence', disabled: !sel, run: M('silence')}, '-', {label: 'Tout sélectionner', shortcut: '⌘A', run: M('selall')}, {icon: '＋', label: 'Insérer un son…', run: M('insert')}, {label: 'Mono', run: M('mono')}, '-', {label: 'Appliquer le rack pour de bon', disabled: !st.rack.length, run: M('bake')}],
            Effets: () => [...fxMenu(), '-', {label: 'Appliquer le rack pour de bon', disabled: !st.rack.length, run: M('bake')}],
            Marqueurs: () => [{icon: '🚩', label: 'Marqueur ici', shortcut: 'M', run: M('marker')}, {icon: '＋', label: 'Nouvelle zone (la sélection)', disabled: !sel, run: M('zone')}, {icon: '🔗', label: 'Relier la zone à une personne…', disabled: !curRegion(), run: () => linkPick('person')}, {icon: '📅', label: 'Relier la zone à un événement…', disabled: !curRegion(), run: () => linkPick('event')}],
            Affichage: () => [{label: '〰️ Forme d’onde', run: M('wave')}, {label: '🎛️ Multipiste', run: M('multi')}, '-', {icon: '⤢', label: 'Tout voir', run: M('zoomfit')}, {icon: '🔍', label: 'Zoom sur la sélection', shortcut: '⌘E', disabled: !sel, run: M('zoomsel')}, {label: 'Zoom avant', run: M('zoomin')}, {label: 'Zoom arrière', run: M('zoomout')}, {label: 'Zoom vertical +', run: M('vzin')}, {label: 'Zoom vertical −', run: M('vzout')}, '-', {label: spectrumOn ? 'Cacher le spectre' : 'Montrer le spectre', run: M('spectrum')}],
            'Fenêtre': () => [{icon: '🎛️', label: 'Rack d’effets', run: M('win:rack')}, {icon: '📝', label: 'Transcription', run: M('win:transcript')}, {icon: '🕘', label: 'Historique', run: M('win:history')}, {icon: 'ℹ️', label: 'Infos du son', run: M('win:info')}, '-', {icon: '⚙️', label: 'Personnaliser…', run: () => $('[data-tb-config]')?.click()}, {icon: '⌨️', label: 'Raccourcis…', run: () => { S().maintenanceTab = 'raccourcis'; lsSet('genealogie-editor-shortcuts-tab', 'audio-studio'); toast('Réglages → Raccourcis clavier → onglet « 🎚️ Studio son » : clic sur une commande, puis tape la touche.'); }}],
        };
        const nav = $('[data-as-menus]');
        if (UI().editorMenus) UI().editorMenus(nav, MENUS); else { nav.innerHTML = Object.keys(MENUS).map(m => `<button type="button" class="ui-topbar-menu" data-ui-menu="${esc(m)}">${esc(m)}</button>`).join(''); nav.addEventListener('click', e => { const b = e.target.closest('[data-ui-menu]'); if (b) UI().menuAt?.(b, MENUS[b.dataset.uiMenu]()); }); }
        nav.querySelectorAll('[data-ui-menu]').forEach(b => { b.dataset.tb = 'menu-' + b.dataset.uiMenu; });
        ext.tbApply?.(dl, 'audio-studio');
        if (UI().saveMenu) UI().saveMenu($('[data-as-cmd="saveproj"]'), () => MENUS.Fichier().filter(x => x !== '-' && /Enregistrer|Copie/.test(x.label || '')));

        // ── vue, dessin ──
        const paintAll = () => { drawAll(); paintRack(); paintFxSec(); paintRegions(); paintLink(); paintHist(); paintInfo(); };
        const clampView = () => { view.dur = clamp(view.dur, Math.min(0.05, base.duration), base.duration); view.start = clamp(view.start, 0, Math.max(0, base.duration - view.dur)); };
        const invalidate = () => { rendered = null; renderKey = ''; rpeaks = null; specCache = null; scheduleRender(); };
        let rtimer = 0;
        const scheduleRender = () => { clearTimeout(rtimer); rtimer = setTimeout(() => renderNow().catch(e => toast(e.message || String(e), 'error')), 250); };
        async function renderNow() {
            const key = JSON.stringify(st.rack.filter(x => x.on !== false).map(x => [x.type, x.params, x.range || null]));
            if (rendered && key === renderKey && rendered.base === base) return rendered.out;
            if (!st.rack.some(x => x.on !== false)) { rendered = {base, out: base}; renderKey = key; rpeaks = null; drawAll(); return base; }
            if (rendering?.key === key && rendering.base === base) return rendering.p;
            sbar?.flash?.('Calcul des effets…', 2000);
            const p = E.renderRack(base, st.rack, {cache, source: base}).then(out => { if (rendering?.p === p) rendering = null; rendered = {base, out}; renderKey = key; rpeaks = null; drawAll(); paintInfo(); return out; });
            rendering = {key, base, p}; return p;
        }
        const shown = () => rendered && rendered.base === base && rendered.out.length === base.length ? rendered.out : base; // ce qu'on dessine : le résultat si la durée n'a pas changé
        function drawAll(ph = null) {
            if (mode !== 'wave') { multi?.draw?.(ph); return; }
            const b = shown(); if (b !== base && !rpeaks) rpeaks = E.peaks(b); if (!peaks) peaks = E.peaks(base);
            AU().drawWave(cv, {buf: b, peaks: b === base ? peaks : rpeaks, view, sel, cursor: playing ? null : cursor, playhead: ph, regions: st.regions, vzoom});
            // la loupe temporelle : tout le son, le cadre de la vue
            AU().drawWave(ov, {buf: base, peaks, view: {start: 0, dur: base.duration}, color: '#7aa7f5'});
            const g = ov.getContext('2d'), W = ov.width, H = ov.height, x0 = view.start / base.duration * W, x1 = (view.start + view.dur) / base.duration * W;
            g.strokeStyle = getComputedStyle(ov).getPropertyValue('--ui-blue') || '#055dff'; g.lineWidth = 2 * (window.devicePixelRatio || 1); g.strokeRect(x0 + 1, 1, Math.max(4, x1 - x0 - 2), H - 2);
            if (ph !== null) { g.fillStyle = '#d33'; g.fillRect(ph / base.duration * W, 0, 2, H); }
            // les zones nommées au-dessus de l'onde
            $('[data-as-zbar]').innerHTML = st.regions.map(r => { const a = (r.start - view.start) / view.dur * 100, z = ((r.kind === 'marker' ? r.start : r.end) - view.start) / view.dur * 100; if (z < 0 || a > 100) return ''; return `<button type="button" class="h-as-ztag${r.kind === 'marker' ? ' is-marker' : ''}${r.id === selRegion ? ' is-sel' : ''}" data-as-region="${esc(r.id)}" style="left:${Math.max(0, a)}%;${r.kind === 'marker' ? '' : `width:${Math.max(1, Math.min(100, z) - Math.max(0, a))}%;`}--z:${esc(r.color)}" title="${esc(r.name)} · ${fmt(r.start)}${r.kind === 'marker' ? '' : ' → ' + fmt(r.end)}">${r.kind === 'marker' ? '🚩 ' : ''}${esc(r.name)}</button>`; }).join('');
            const n = 5; $('[data-as-ticks]').innerHTML = [...Array(n).keys()].map(i => `<span>${fmt(view.start + view.dur * i / (n - 1), view.dur < 20)}</span>`).join('');
            $('[data-as-total]').textContent = fmt(base.duration); $('[data-as-cur]').textContent = fmt(ph ?? cursor);
            const seltxt = sel ? `sélection ${fmt(sel.a)} → ${fmt(sel.b)} (${String((sel.b - sel.a).toFixed(1)).replace('.', ',')} s)` : '';
            $('[data-as-seltxt]').textContent = seltxt; sbar?.setWhere?.(`${fmt(ph ?? cursor)} / ${fmt(base.duration)}${sel ? ' · ' + seltxt : ''}`); sbar?.sync?.();
            if (spectrumOn) drawSpectrum();
        }
        // ── le spectre (FFT du moteur, calculé pour la vue), le pinceau et le lasso ──
        let specCache = null, specBusy = false;
        const FMIN = 50, fmax = () => Math.min(16000, base.sampleRate / 2);
        const fy = (f, H) => H - Math.log(Math.max(FMIN, f) / FMIN) / Math.log(fmax() / FMIN) * H, yf = (y, H) => FMIN * Math.exp((1 - y / H) * Math.log(fmax() / FMIN));
        const COLMAP = (() => { const stops = [[0, [8, 8, 60]], [0.35, [40, 40, 170]], [0.6, [150, 70, 200]], [0.8, [240, 140, 230]], [1, [255, 255, 255]]], out = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++; const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], u = (t - t0) / (t1 - t0); for (let c = 0; c < 3; c++) out[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * u; } return out; })();
        async function drawSpectrum() {
            const dpr = window.devicePixelRatio || 1, W = Math.max(1, Math.round(spc.clientWidth * dpr)), H = Math.max(1, Math.round(spc.clientHeight * dpr));
            if (spc.width !== W) spc.width = W; if (spc.height !== H) spc.height = H;
            const b = shown(), key = `${view.start.toFixed(3)}|${view.dur.toFixed(3)}|${W}|${b === base ? 'b' : renderKey}|${b.length}`;
            if (!specCache || specCache.key !== key) {
                if (specBusy) return; specBusy = true;
                try { const N = 1024, hop = Math.max(64, Math.round(view.dur * b.sampleRate / (W / 2))); const sp = await E.spectrogramBg(b, {N, hop, t0: view.start, t1: view.start + view.dur}); /* en tâche de fond (Worker) */ specCache = {key, sp}; }
                finally { specBusy = false; }
                if (specCache?.key !== key) return drawSpectrum();
            }
            const {sp} = specCache, g = spc.getContext('2d'), img = g.createImageData(W, H), sr = sp.sr;
            const rowBin = new Float32Array(H); for (let y = 0; y < H; y++) rowBin[y] = Math.min(sp.bins - 1, yf(y, H) / sr * sp.N);
            for (let x = 0; x < W; x++) { const f = Math.min(sp.nf - 1, Math.floor(x / W * sp.nf)), row = f * sp.bins;
                for (let y = 0; y < H; y++) { const v = sp.data[row + Math.round(rowBin[y])], t = clamp((v + 100) / 85, 0, 1), c = Math.round(t * 255) * 3, i = (y * W + x) * 4; img.data[i] = COLMAP[c]; img.data[i + 1] = COLMAP[c + 1]; img.data[i + 2] = COLMAP[c + 2]; img.data[i + 3] = 255; } }
            g.putImageData(img, 0, 0);
            // dessin en cours (rose), et les réparations déjà faites (contour)
            const X = t => (t - view.start) / view.dur * W;
            g.fillStyle = 'rgba(255,120,230,.55)'; paintMasks.forEach(m => g.fillRect(X(m.t0), fy(m.f1, H), Math.max(2, X(m.t1) - X(m.t0)), Math.max(2, fy(m.f0, H) - fy(m.f1, H))));
            g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = dpr; (st.rack.find(x => x.type === 'repair')?.params.masks || []).forEach(m => g.strokeRect(X(m.t0), fy(m.f1, H), X(m.t1) - X(m.t0), fy(m.f0, H) - fy(m.f1, H)));
            if (lasso?.length > 1) { g.strokeStyle = '#fff'; g.setLineDash([4 * dpr, 3 * dpr]); g.beginPath(); lasso.forEach(([x, y], i) => i ? g.lineTo(x * dpr, y * dpr) : g.moveTo(x * dpr, y * dpr)); g.stroke(); g.setLineDash([]); }
            if (sel) { g.fillStyle = 'rgba(5,93,255,.18)'; g.fillRect(X(sel.a), 0, X(sel.b) - X(sel.a), H); }
            $('[data-as-flab]').innerHTML = [8000, 2000, 500, 100].filter(f => f < fmax()).map(f => `<span style="top:${fy(f, H) / dpr}px">${f >= 1000 ? f / 1000 + ' kHz' : f + ' Hz'}</span>`).join('');
        }
        const spAt = e => { const r = spc.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top, t: view.start + (e.clientX - r.left) / r.width * view.dur, f: yf(e.clientY - r.top, r.height), r}; };
        spc.addEventListener('pointerdown', e => {
            if (tool !== 'brush' && tool !== 'lasso') { cvDown(e, spc); return; }
            e.preventDefault(); spc.setPointerCapture(e.pointerId);
            const dab = p => { const rt = brush / p.r.width * view.dur, k = Math.exp(brush / p.r.height * Math.log(fmax() / FMIN)); paintMasks.push({t0: Math.max(0, p.t - rt), t1: Math.min(base.duration, p.t + rt), f0: p.f / k, f1: Math.min(fmax(), p.f * k)}); };
            if (tool === 'brush') dab(spAt(e)); else lasso = [[spAt(e).x, spAt(e).y]];
            const mv = ev => { const p = spAt(ev); if (tool === 'brush') dab(p); else lasso.push([p.x, p.y]); drawSpectrum(); };
            const up = ev => { spc.removeEventListener('pointermove', mv); spc.removeEventListener('pointerup', up); spc.removeEventListener('pointercancel', up); if (tool === 'lasso' && lasso?.length > 2) { paintMasks.push(...lassoMasks(lasso, spAt(ev).r)); } lasso = null; drawSpectrum(); };
            spc.addEventListener('pointermove', mv); spc.addEventListener('pointerup', up); spc.addEventListener('pointercancel', up);
        });
        /** le lasso → des bandes verticales (chaque colonne de 3 px : de la fréquence basse à la haute dans le tracé) */
        function lassoMasks(poly, r) {
            const xs = poly.map(p => p[0]), out = [], step = 3;
            for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
                const ys = []; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; if ((x1 <= x && x2 > x) || (x2 <= x && x1 > x)) ys.push(y1 + (x - x1) / (x2 - x1) * (y2 - y1)); }
                ys.sort((a, b) => a - b); for (let i = 0; i + 1 < ys.length; i += 2) out.push({t0: view.start + x / r.width * view.dur, t1: view.start + (x + step) / r.width * view.dur, f0: yf(ys[i + 1], r.height), f1: Math.min(fmax(), yf(ys[i], r.height))});
            }
            return out;
        }
        function repairNow() {
            if (!paintMasks.length) return toast('Peins d’abord sur la tache du spectre (🖌 ou ➰).', 'error');
            let fx = st.rack.find(x => x.type === 'repair'); if (!fx) { fx = E.newFx('repair'); st.rack.unshift(fx); }
            const masks = paintMasks.map(m => ({t0: +m.t0.toFixed(4), t1: +m.t1.toFixed(4), f0: Math.round(m.f0), f1: Math.round(m.f1)}));
            fx.params.masks = [...(fx.params.masks || []), ...masks]; const at = masks.reduce((s, m) => s + m.t0, 0) / masks.length; paintMasks = [];
            commit(`Pinceau : réparation à ${fmt(at, false)}`); invalidate(); paintRack(); drawSpectrum();
        }
        if (UI().rangeField) { const rf = UI().rangeField({label: 'Taille', min: 4, max: 60, step: 1, value: brush, unit: 'px', default: 16}); rf.input.addEventListener('input', () => { brush = Number(rf.input.value); }); $('[data-as-brushsize]').appendChild(rf); }

        // ── la souris sur l'onde : sélection, curseur, marqueurs ; molette ; clic droit (K14) ──
        const tAt = (e, el = cv) => { const r = el.getBoundingClientRect(); return clamp(view.start + (e.clientX - r.left) / r.width * view.dur, 0, base.duration); };
        function cvDown(e, el = cv) {
            if (e.button === 2) return;
            e.preventDefault(); window.getSelection()?.removeAllRanges();
            const t0 = tAt(e, el), x0 = e.clientX; let moved = false;
            if (tool === 'marker') { addRegion('marker', t0, t0); return; }
            el.setPointerCapture(e.pointerId);
            const mv = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) { const t1 = tAt(ev, el); sel = {a: Math.min(t0, t1), b: Math.max(t0, t1)}; drawAll(); } };
            const up = ev => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (!moved) { cursor = tAt(ev, el); if (!ev.shiftKey) sel = null; else sel = {a: Math.min(cursor, sel?.a ?? cursor), b: Math.max(cursor, sel?.b ?? cursor)}; } else cursor = sel.a; if (playing) startPlay(); drawAll(); paintLink(); };
            el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        }
        cv.addEventListener('pointerdown', e => cvDown(e));
        const onWheel = e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) { const t = tAt(e, e.currentTarget), f = e.deltaY > 0 ? 1.25 : 0.8; view.start = t - (t - view.start) * f; view.dur *= f; } else if (e.shiftKey && e.altKey) { vzoom = clamp(vzoom * (e.deltaY > 0 ? 0.8 : 1.25), 0.25, 32); } else view.start += (e.deltaX || e.deltaY) / 600 * view.dur; clampView(); drawAll(); };
        cv.addEventListener('wheel', onWheel, {passive: false}); spc.addEventListener('wheel', onWheel, {passive: false});
        ov.addEventListener('pointerdown', e => { e.preventDefault(); ov.setPointerCapture(e.pointerId); const go = ev => { const r = ov.getBoundingClientRect(); view.start = (ev.clientX - r.left) / r.width * base.duration - view.dur / 2; clampView(); drawAll(); }; go(e); const up = () => { ov.removeEventListener('pointermove', go); ov.removeEventListener('pointerup', up); }; ov.addEventListener('pointermove', go); ov.addEventListener('pointerup', up); });
        cv.addEventListener('contextmenu', e => { if (e.shiftKey || !UI().contextMenu) return; const t = tAt(e); const r = st.regions.find(x => x.kind !== 'marker' && t >= x.start && t <= x.end); if (r) { selRegion = r.id; paintRegions(); paintLink(); }
            UI().contextMenu(e, [...(r ? [{icon: '🔗', label: `Relier « ${r.name} » à une personne…`, run: () => linkPick('person')}, {icon: '📅', label: 'Relier à un événement…', run: () => linkPick('event')}, '-'] : []),
                {label: 'Couper', shortcut: '⌘X', disabled: !sel, run: M('cut')}, {icon: '📋', label: 'Copier', shortcut: '⌘C', disabled: !sel, run: M('copy')}, {icon: '📋', label: 'Coller', shortcut: '⌘V', disabled: !clipboard, run: M('paste')}, {label: 'Garder seulement la sélection', disabled: !sel, run: M('keep')}, {label: 'Silence', disabled: !sel, run: M('silence')}, {icon: '＋', label: 'Nouvelle zone', disabled: !sel, run: M('zone')}, {icon: '🚩', label: 'Marqueur ici', run: () => addRegion('marker', t, t)}, '-', {icon: '🗑', label: 'Supprimer la sélection', shortcut: '⌫', danger: true, disabled: !sel, run: M('del')}], {title: 'Son'}); });

        // ── lecture : le résultat du rack (A maintenu : l'avant, au même endroit), VU-mètres ──
        let srcs = [], gains = [], playing = false, t0 = 0, from = 0, raf = 0, slow = false, bypass = false, mixOut = null, analysers = null;
        const curTime = () => playing ? (from + (ctx.currentTime - t0) * (slow ? 0.75 : 1)) : cursor;
        function stopPlay() { srcs.forEach(s => { try { s.onended = null; s.stop(); } catch (_) {} }); srcs = []; playing = false; cancelAnimationFrame(raf); const b = $('[data-as-cmd="play"]'); if (b) b.textContent = '▶ Écouter'; paintVu(null); }
        async function startPlay(at = null) {
            const b = mode === 'multi' ? await multi.mix() : await renderNow(); if (!dl.open) return;
            srcs.forEach(s => { try { s.onended = null; s.stop(); } catch (_) {} }); srcs = []; if (ctx.state === 'suspended') ctx.resume();
            const same = b.length === base.length && mode === 'wave';
            const total = mode === 'multi' ? b.duration : base.duration;
            let a = at ?? (sel && mode === 'wave' ? sel.a : cursor); let z = sel && mode === 'wave' ? sel.b : total; if (z - a < 0.02 || a >= total - 0.02) { a = 0; z = total; }
            mixOut = ctx.createGain(); const split = ctx.createChannelSplitter(2); analysers = [ctx.createAnalyser(), ctx.createAnalyser()]; analysers.forEach((an, i) => { an.fftSize = 1024; split.connect(an, i); }); mixOut.connect(split); mixOut.connect(ctx.destination);
            gains = [ctx.createGain(), ctx.createGain()]; gains.forEach(g => g.connect(mixOut)); gains[0].gain.value = bypass && same ? 1 : 0; gains[1].gain.value = bypass && same ? 0 : 1;
            const list = same ? [base, b] : [null, b];
            list.forEach((x, i) => { if (!x) return; const s = ctx.createBufferSource(); s.buffer = x; s.playbackRate.value = slow ? 0.75 : 1; if (loop && sel && mode === 'wave') { s.loop = true; s.loopStart = sel.a; s.loopEnd = sel.b; s.start(0, a); } else s.start(0, Math.min(a, x.duration - 0.01), Math.max(0.01, Math.min(z, x.duration) - a)); s.connect(gains[i]); srcs.push(s); });
            srcs.at(-1).onended = () => { if (!playing) return; stopPlay(); drawAll(); };
            from = a; t0 = ctx.currentTime; playing = true; $('[data-as-cmd="play"]').textContent = '⏸ Pause';
            const tick = () => { let t = curTime(); if (loop && sel && mode === 'wave' && t > sel.b) { t = sel.a + (t - sel.a) % (sel.b - sel.a); } if (mode === 'wave' && !sel && t > view.start + view.dur) { view.start = t; clampView(); } drawAll(t); paintVu(); raf = requestAnimationFrame(tick); };
            cancelAnimationFrame(raf); tick();
        }
        const vuBuf = new Float32Array(1024), vuPk = [0, 0];
        function paintVu(off) {
            [0, 1].forEach(i => { const bar = $(`[data-as-vu="${i}"]`), pk = $(`[data-as-vupk="${i}"]`); if (!bar) return;
                if (off === null || !analysers) { bar.style.width = '0%'; pk.style.left = '0%'; vuPk[i] = 0; return; }
                analysers[i].getFloatTimeDomainData(vuBuf); let m = 0; for (const v of vuBuf) m = Math.max(m, Math.abs(v)); const db = E.linToDb(m), w = clamp((db + 60) / 60, 0, 1) * 100;
                vuPk[i] = Math.max(w, vuPk[i] - 0.6); bar.style.width = w + '%'; bar.classList.toggle('is-hot', db > -3); pk.style.left = vuPk[i] + '%'; });
        }
        const setBypass = v => { bypass = v; if (gains.length === 2 && srcs.length === 2) { const now = ctx.currentTime; gains[0].gain.setTargetAtTime(v ? 1 : 0, now, 0.01); gains[1].gain.setTargetAtTime(v ? 0 : 1, now, 0.01); } };

        // ── les coupes (destructives, dans l'historique) ; les zones suivent ──
        const sr = () => base.sampleRate;
        const shiftRegions = (a, b, delta) => { st.regions = st.regions.map(r => { const m = x => x <= a ? x : x >= b ? x + delta : (delta < 0 ? a : x); return {...r, start: m(r.start), end: m(r.end)}; }).filter(r => r.kind === 'marker' || r.end - r.start > 0.05); };
        function setBase(nb, label, {timing = true} = {}) { base = nb; peaks = null; if (timing) pristine = false; clampView(); cursor = Math.min(cursor, base.duration); invalidate(); commit(label); drawAll(); paintInfo(); paintRegions(); }
        const cutRange = (a, b) => { const i0 = Math.round(a * sr()), i1 = Math.round(b * sr()); return E.concatBufs([E.sliceBuf(base, 0, i0), E.sliceBuf(base, i1, base.length)].filter(x => x.length > 1), base.numberOfChannels, sr()); };
        function op(k) {
            stopPlay();
            const need = () => { if (!sel) { toast('Glisse d’abord sur l’onde pour choisir un passage.', 'error'); return false; } return true; };
            if (k === 'del' || k === 'cut') { if (!need()) return; if (k === 'cut') clipboard = E.sliceBuf(base, sel.a * sr(), sel.b * sr()); const {a, b} = sel; shiftRegions(a, b, -(b - a)); sel = null; cursor = a; setBase(cutRange(a, b), `${k === 'cut' ? 'Couper' : 'Supprimer'} ${fmt(b - a, false)} à ${fmt(a, false)}`); return; }
            if (k === 'copy') { if (!need()) return; clipboard = E.sliceBuf(base, sel.a * sr(), sel.b * sr()); toast('Passage copié : ⌘V le colle au repère orange.'); return; }
            if (k === 'paste') { if (!clipboard) return; const at = cursor, ins = clipboard; shiftRegions(at, at, ins.duration); setBase(E.concatBufs([E.sliceBuf(base, 0, at * sr()), ins, E.sliceBuf(base, at * sr(), base.length)].filter(x => x.length > 1), base.numberOfChannels, sr()), `Coller ${fmt(ins.duration, false)} à ${fmt(at, false)}`); sel = {a: at, b: at + ins.duration}; drawAll(); return; }
            if (k === 'keep') { if (!need()) return; const {a, b} = sel; shiftRegions(b, base.duration + 1, 0); st.regions = st.regions.filter(r => r.start >= a && r.start <= b).map(r => ({...r, start: r.start - a, end: Math.min(b, r.end) - a})); sel = null; cursor = 0; setBase(E.sliceBuf(base, a * sr(), b * sr()), `Garder ${fmt(a, false)} → ${fmt(b, false)}`); view = {start: 0, dur: base.duration}; drawAll(); return; }
            if (k === 'silence') { if (!need()) return; const nb = E.cloneBuf(base); E.chans(nb).forEach(d => d.fill(0, Math.round(sel.a * sr()), Math.round(sel.b * sr()))); setBase(nb, `Silence ${fmt(sel.a, false)} → ${fmt(sel.b, false)}`, {timing: false}); return; }
            if (k === 'selall') { sel = {a: 0, b: base.duration}; drawAll(); return; }
            if (k === 'mono') { if (base.numberOfChannels === 1) return toast('Le son est déjà en mono.'); E.resample(base, sr(), 1).then(nb => setBase(nb, 'Mono', {timing: false})); return; }
            if (k === 'bake') { if (!st.rack.length) return; renderNow().then(out => { const changes = out.length !== base.length; st.rack = []; setBase(out, 'Appliquer le rack pour de bon', {timing: changes}); paintRack(); paintFxSec(); }); return; }
        }
        async function insertSound() {
            const o = await ext._av.pickOther('audio'); if (!o) return;
            try { const ob = await E.resample(await E.load(o.src), sr(), base.numberOfChannels), at = cursor; shiftRegions(at, at, ob.duration); setBase(E.concatBufs([E.sliceBuf(base, 0, at * sr()), ob, E.sliceBuf(base, at * sr(), base.length)].filter(x => x.length > 1), base.numberOfChannels, sr()), `Insérer « ${o.title} »`); sel = {a: at, b: at + ob.duration}; addFile(o); drawAll(); }
            catch (e) { toast(e.message, 'error'); }
        }
        // ● Enregistrer au micro (forme d'onde : inséré au repère ; multipiste : sur la piste armée)
        let rec = null;
        async function record() {
            const btn = $('[data-as-cmd="rec"]');
            if (rec) { const r0 = rec; rec = null; btn.classList.remove('is-rec'); btn.textContent = '●'; try { const {file, buffer} = await r0.stop(); if (mode === 'multi') return multi.addRecording(file, buffer); const ob = await E.resample(buffer, sr(), base.numberOfChannels), at = cursor; shiftRegions(at, at, ob.duration); setBase(E.concatBufs([E.sliceBuf(base, 0, at * sr()), ob, E.sliceBuf(base, at * sr(), base.length)].filter(x => x.length > 1), base.numberOfChannels, sr()), `Enregistrement au micro (${fmt(ob.duration, false)})`); sel = {a: at, b: at + ob.duration}; drawAll(); } catch (e) { toast(e.message, 'error'); } return; }
            if (mode === 'multi' && !multi.armed()) return toast('Arme d’abord une piste avec ● (dans ses boutons M S ●).', 'error');
            try { rec = await E.recordMic({onLevel: v => { const w = clamp((E.linToDb(v) + 60) / 60, 0, 1) * 100; [0, 1].forEach(i => { const bar = $(`[data-as-vu="${i}"]`); if (bar) bar.style.width = w + '%'; }); }}); btn.classList.add('is-rec'); btn.textContent = '⏹'; toast('🎙 Enregistrement… clique ⏹ pour arrêter.'); if (mode === 'multi') startPlay(); }
            catch (e) { toast(e.message, 'error'); }
        }

        // ── le rack ──
        function addFx(type, params = {}) {
            const fx = E.newFx(type, params); if ($('[data-as-onsel]').checked && sel && !E.FX[type].lengthChange) fx.range = {a: sel.a, b: sel.b};
            if (type === 'denoise' && sel && !fx.range) fx.params.print = {a: sel.a, b: sel.b};
            const li = st.rack.findIndex(x => x.type === 'limit'); if (li >= 0 && type !== 'limit') st.rack.splice(li, 0, fx); else st.rack.push(fx); // le limiteur reste en dernier
            selFx = fx.id; commit(`${E.FX[type].label}`); invalidate(); paintRack(); paintFxSec();
            dl.querySelector('[data-ui-section="as-fx"]')?.setAttribute('open', '');
        }
        function paintRack() {
            const box = $('[data-as-rack]'), n = st.rack.length;
            const sum = box.closest('details')?.querySelector('summary'); if (sum) sum.innerHTML = `🎛️ Rack d’effets <small class="h-as-count">${esc(plural(n, 'effet'))}</small>`;
            box.innerHTML = n ? st.rack.map((x, i) => `<div class="h-as-fx${x.on === false ? ' is-off' : ''}${x.id === selFx ? ' is-sel' : ''}" data-as-fx="${esc(x.id)}" draggable="true"><span class="ui-grip" aria-hidden="true" title="Glisser pour ranger (Alt + ↑ ↓)">⠿</span><button type="button" class="h-as-fxname" data-as-fxopen>${E.FX[x.type].icon} ${esc(E.FX[x.type].label)}${x.type === 'dehum' ? ` ${x.params.freq === 'auto' ? '(auto)' : x.params.freq + ' Hz'}` : x.type === 'repair' ? ` (${x.params.masks?.length || 0})` : ''}${x.range ? ' <small>· sélection</small>' : ''}</button><button type="button" class="icon-button small" data-as-fxeye title="${x.on === false ? 'Rallumer' : 'Éteindre'}" aria-label="${x.on === false ? 'Rallumer' : 'Éteindre'} l’effet">${x.on === false ? '◌' : '👁'}</button><button type="button" class="icon-button small" data-as-fxdel title="Retirer" aria-label="Retirer l’effet">×</button></div>`).join('')
                : (A().empty ? A().empty('Aucun effet : « ＋ Ajouter un effet », ou le menu Effets.', {icon: '🎛️'}) : '<p class="empty-line"><span class="empty-line-ico">🎛️</span><span class="empty-line-text">Aucun effet</span></p>');
        }
        const fxById = id => st.rack.find(x => x.id === id);
        $('[data-as-rack]').addEventListener('click', e => {
            const row = e.target.closest('[data-as-fx]'); if (!row) return; const fx = fxById(row.dataset.asFx); if (!fx) return;
            if (e.target.closest('[data-as-fxeye]')) { fx.on = fx.on === false; commit(`${fx.on ? 'Rallumer' : 'Éteindre'} ${E.FX[fx.type].label}`); invalidate(); paintRack(); return; }
            if (e.target.closest('[data-as-fxdel]')) { const i = st.rack.indexOf(fx); st.rack.splice(i, 1); if (selFx === fx.id) selFx = null; commit(`Retirer ${E.FX[fx.type].label}`); invalidate(); paintRack(); paintFxSec(); const msg = `Effet « ${E.FX[fx.type].label} » retiré`; { const at = hpos; A().undoToast ? A().undoToast(msg, {undo: () => goHist(at - 1), redo: () => goHist(at)}) : toast(msg); } return; }
            selFx = fx.id; paintRack(); paintFxSec(); dl.querySelector('[data-ui-section="as-fx"]')?.setAttribute('open', '');
        });
        $('[data-as-rack]').addEventListener('contextmenu', e => { const row = e.target.closest('[data-as-fx]'); if (!row || !UI().contextMenu) return; const fx = fxById(row.dataset.asFx); UI().contextMenu(e, [{icon: '✎', label: 'Régler', run: () => { selFx = fx.id; paintRack(); paintFxSec(); }}, {icon: '👁', label: fx.on === false ? 'Rallumer' : 'Éteindre', run: () => row.querySelector('[data-as-fxeye]').click()}, {icon: '⧉', label: 'Dupliquer', run: () => { const c = {...JSON.parse(JSON.stringify(fx)), id: E.newFx(fx.type).id}; st.rack.splice(st.rack.indexOf(fx) + 1, 0, c); commit(`Dupliquer ${E.FX[fx.type].label}`); invalidate(); paintRack(); }}, '-', {icon: '🗑', label: 'Retirer', danger: true, run: () => row.querySelector('[data-as-fxdel]').click()}], {title: E.FX[fx.type].label}); });
        // ⠿ ranger en glissant (et Alt + ↑ ↓)
        let dragId = null;
        $('[data-as-rack]').addEventListener('dragstart', e => { dragId = e.target.closest('[data-as-fx]')?.dataset.asFx; e.dataTransfer.effectAllowed = 'move'; });
        $('[data-as-rack]').addEventListener('dragover', e => { if (dragId) e.preventDefault(); });
        $('[data-as-rack]').addEventListener('drop', e => { e.preventDefault(); const to = e.target.closest('[data-as-fx]')?.dataset.asFx; if (!dragId || !to || to === dragId) return; const a = st.rack.findIndex(x => x.id === dragId), fx = st.rack.splice(a, 1)[0], b = st.rack.findIndex(x => x.id === to); st.rack.splice(b + (a <= b ? 1 : 0), 0, fx); dragId = null; commit('Ranger le rack'); invalidate(); paintRack(); });
        $('[data-as-rack]').addEventListener('keydown', e => { if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; const row = e.target.closest('[data-as-fx]'); if (!row) return; e.preventDefault(); const i = st.rack.findIndex(x => x.id === row.dataset.asFx), j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= st.rack.length) return; [st.rack[i], st.rack[j]] = [st.rack[j], st.rack[i]]; commit('Ranger le rack'); invalidate(); paintRack(); $(`[data-as-fx="${CSS.escape(row.dataset.asFx)}"] [data-as-fxopen]`)?.focus(); });
        $('[data-as-addfx]').addEventListener('click', e => UI().menuAt?.(e.currentTarget, fxMenu(), {title: 'Ajouter un effet'}));
        // 💾 Réglages enregistrés (partagés avec le Son rapide)
        $('[data-as-presets]').appendChild(AU().presetsFrame({id: 'studio-son', now: () => ({kind: 'rack', rack: st.rack.filter(x => x.type !== 'repair')}), apply: async p => { const d = AU().presetData(p); const rack = d.rack || E.quickToRack({...d.quick, trim: null, hum: E.detectHum(base)}).filter(x => x.type !== 'trim'); st.rack = [...st.rack.filter(x => x.type === 'repair'), ...E.cleanRack(rack)]; commit(`Réglages « ${p.name} »`); invalidate(); paintRack(); paintFxSec(); }}));

        // ── le réglage d'un effet (E2, curseurs C3) ──
        function paintFxSec() {
            const box = $('[data-as-fxsec]'), fx = fxById(selFx);
            if (!fx) { box.innerHTML = ''; return; }
            const d = E.FX[fx.type];
            box.innerHTML = sec(`${d.icon} ${d.label}`, 'fx', `<div class="h-as-fxbody" data-as-fxbody></div>`);
            const body = box.querySelector('[data-as-fxbody]'), p = fx.params;
            let tmr = 0; const changed = (label = `Réglage : ${d.label}`) => { invalidate(); paintRack(); clearTimeout(tmr); tmr = setTimeout(() => commit(label), 500); drawFxGraph(); };
            const slider = q => { const rf = UI().rangeField ? UI().rangeField({label: q.label, min: q.min, max: q.max, step: q.step, value: p[q.k], unit: q.unit, default: q.def}) : Object.assign(document.createElement('label'), {innerHTML: `${esc(q.label)} <input type="range" min="${q.min}" max="${q.max}" step="${q.step}" value="${p[q.k]}">`}); const inp = rf.input || rf.querySelector('input'); inp.addEventListener('input', () => { p[q.k] = Number(inp.value); changed(); }); rf.dataset.asParam = q.k; return rf; };
            const help = d.help ? `<p class="muted">${esc(d.help)}</p>` : '';
            if (fx.type === 'eqg') {
                body.innerHTML = `<div class="h-as-eqg">${d.freqs.map((f, i) => `<label><input type="range" orient="vertical" min="-12" max="12" step="0.5" value="${p['g' + i]}" data-as-eqg="${i}" data-ui-done="1" aria-label="${f} Hz" title="${f} Hz : ${p['g' + i]} dB"><small>${f >= 1000 ? f / 1000 + 'k' : f}</small></label>`).join('')}</div><p class="muted">10 bandes · ±12 dB · ensembles : <button type="button" class="link-button" data-as-eqp="voix">Voix</button>, <button type="button" class="link-button" data-as-eqp="radio">Radio ancienne</button>, <button type="button" class="link-button" data-as-eqp="telephone">Téléphone</button>, <button type="button" class="link-button" data-as-eqp="flat">↺ à plat</button></p>`;
                body.addEventListener('input', e => { const i = e.target.dataset.asEqg; if (i === undefined) return; p['g' + i] = Number(e.target.value); changed(); });
                body.addEventListener('click', e => { const k = e.target.dataset.asEqp; if (!k) return; const g = k === 'flat' ? Array(10).fill(0) : d.presets[k]; g.forEach((v, i) => { p['g' + i] = v; }); body.querySelectorAll('[data-as-eqg]').forEach((r, i) => { r.value = g[i]; }); changed(`Égaliseur : ${k === 'flat' ? 'à plat' : k}`); });
            } else if (fx.type === 'eqp') {
                let bi = Math.min(1, p.bands.length - 1);
                body.innerHTML = `<canvas class="h-as-curve" data-as-curve></canvas><div class="h-as-bandtabs" data-as-bands></div><div data-as-bandsl></div><p class="muted">Glisse les points ○ sur la courbe ; molette sur un point : sa largeur.</p>`;
                const paintBands = () => { body.querySelector('[data-as-bands]').innerHTML = p.bands.map((b, i) => `<button type="button" class="${i === bi ? 'is-active' : ''}" data-as-band="${i}">${{lowshelf: 'Graves', highshelf: 'Aigus', peaking: 'Bande'}[b.type] || b.type} ${Math.round(b.f)} Hz</button>`).join('') + '<button type="button" data-as-band="add" title="Ajouter une bande">＋</button>';
                    const box2 = body.querySelector('[data-as-bandsl]'); box2.innerHTML = ''; const b = p.bands[bi]; if (!b) return;
                    [['f', 'Fréquence', 20, 20000, 1, 'Hz', 1000], ['g', 'Gain', -24, 24, 0.5, 'dB', 0], ['q', 'Largeur (Q)', 0.1, 10, 0.1, 'Q', 0.9]].forEach(([k, l, mn, mx, s0, u, df]) => { const rf = UI().rangeField({label: l, min: mn, max: mx, step: s0, value: b[k], unit: u, default: df}); rf.input.addEventListener('input', () => { b[k] = Number(rf.input.value); paintBandTabsLabel(); changed(); }); box2.appendChild(rf); }); };
                const paintBandTabsLabel = () => { const t = body.querySelector(`[data-as-band="${bi}"]`), b = p.bands[bi]; if (t) t.textContent = `${{lowshelf: 'Graves', highshelf: 'Aigus', peaking: 'Bande'}[b.type] || b.type} ${Math.round(b.f)} Hz`; };
                body.querySelector('[data-as-bands]').addEventListener('click', e => { const v = e.target.dataset.asBand; if (v === undefined) return; if (v === 'add') { if (p.bands.length >= 8) return; p.bands.push({type: 'peaking', f: 1000, g: 0, q: 1}); bi = p.bands.length - 1; changed('Égaliseur : bande ajoutée'); } else bi = Number(v); paintBands(); drawFxGraph(); });
                paintBands();
                const cvq = body.querySelector('[data-as-curve]'); const fX = (f, W) => Math.log(f / 20) / Math.log(1000) * W, Xf = (x, W) => 20 * Math.pow(1000, x / W), gY = (g, H) => H / 2 - g / 24 * (H / 2 - 8), Yg = (y, H) => (H / 2 - y) / (H / 2 - 8) * 24;
                cvq.addEventListener('pointerdown', e => { const r = cvq.getBoundingClientRect(), hit = p.bands.findIndex(b => Math.hypot(fX(b.f, r.width) - (e.clientX - r.left), gY(b.g, r.height) - (e.clientY - r.top)) < 10); if (hit < 0) return; bi = hit; paintBands(); cvq.setPointerCapture(e.pointerId);
                    const mv = ev => { const b = p.bands[bi]; b.f = Math.round(clamp(Xf(ev.clientX - r.left, r.width), 20, 20000)); if (b.type !== 'highpass' && b.type !== 'lowpass') b.g = Math.round(clamp(Yg(ev.clientY - r.top, r.height), -24, 24) * 2) / 2; changed(); body.querySelectorAll('[data-as-bandsl] input[type=range]').forEach((inp, k) => { inp.value = [b.f, b.g, b.q][k]; inp.dispatchEvent(new Event('input')); }); };
                    const up = () => { cvq.removeEventListener('pointermove', mv); cvq.removeEventListener('pointerup', up); }; cvq.addEventListener('pointermove', mv); cvq.addEventListener('pointerup', up); });
                cvq.addEventListener('wheel', e => { e.preventDefault(); const b = p.bands[bi]; if (!b) return; b.q = clamp(Math.round(b.q * (e.deltaY > 0 ? 0.9 : 1.1) * 10) / 10, 0.1, 10); changed(); }, {passive: false});
            } else if (fx.type === 'denoise') {
                body.innerHTML = `<button type="button" class="button small secondary h-as-print" data-as-print>🎯 Prendre l’empreinte du bruit (sélection)</button><p class="muted" data-as-printtxt></p><canvas class="h-as-curve" data-as-curve></canvas><p class="muted">Gris : l’empreinte. Bleu : ce qui reste.</p>`;
                const paintPrint = () => { const pr = p.print || E.quietest(base); body.querySelector('[data-as-printtxt]').textContent = `Empreinte : ${fmt(pr.a, false)} → ${fmt(pr.b, false)} (${String((pr.b - pr.a).toFixed(1)).replace('.', ',')} s de ${p.print ? 'bruit choisi' : 'bruit seul, trouvé tout seul'}).`; };
                body.querySelector('[data-as-print]').addEventListener('click', () => { if (!sel) return toast('Choisis d’abord un passage où l’on n’entend que le bruit (glisse sur l’onde).', 'error'); p.print = {a: sel.a, b: sel.b}; paintPrint(); changed('Empreinte du bruit'); });
                paintPrint();
            } else if (fx.type === 'reverb') {
                body.innerHTML = `<div class="segmented h-as-rooms">${[['piece', '🏠 Pièce'], ['eglise', '⛪ Église'], ['salle', '🎭 Salle'], ['cave', '🧱 Cave']].map(([k, l]) => `<button type="button" class="${p.room === k ? 'is-active' : ''}" data-as-room="${k}">${l}</button>`).join('')}</div>`;
                body.addEventListener('click', e => { const k = e.target.closest('[data-as-room]')?.dataset.asRoom; if (!k) return; p.room = k; p.dur = E.ROOMS[k].dur; body.querySelectorAll('[data-as-room]').forEach(b => b.classList.toggle('is-active', b.dataset.asRoom === k)); const dr = body.querySelector('[data-as-param="dur"] input[type=range]'); if (dr) { dr.value = p.dur; dr.dispatchEvent(new Event('input')); } changed(`Réverbération : ${k}`); });
            } else if (fx.type === 'dehum') {
                const found = E.detectHum(base);
                body.innerHTML = `<label class="h-as-sel">Courant <select data-as-hz><option value="auto">${found ? `${found} Hz (trouvé)` : 'Trouver tout seul'}</option><option value="50">50 Hz (Europe)</option><option value="60">60 Hz (Amérique du Nord)</option></select></label>`;
                const s0 = body.querySelector('[data-as-hz]'); s0.value = p.freq; s0.addEventListener('change', () => { p.freq = s0.value; changed(); });
            } else if (fx.type === 'fade') {
                const SH = {lin: ['Droite', 'M2 30 L48 4'], fast: ['Rapide', 'M2 30 Q4 4 48 4'], slow: ['Lente', 'M2 30 Q46 30 48 4'], s: ['En S', 'M2 30 C30 30 20 4 48 4']};
                const row = k => `<div class="h-as-shapes" role="group" aria-label="${k === 'shapeIn' ? 'Forme du fondu d’entrée' : 'Forme du fondu de sortie'}">${Object.entries(SH).map(([s0, [l, dd]]) => `<button type="button" class="${p[k] === s0 ? 'is-active' : ''}" data-as-shape="${k}:${s0}"><svg viewBox="0 0 50 34" aria-hidden="true"><path d="${k === 'shapeOut' ? dd.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (m, x, y) => `${50 - x} ${y}`) : dd}"/></svg>${l}</button>`).join('')}</div>`;
                body.innerHTML = `<b>Entrée</b>${row('shapeIn')}<b>Sortie</b>${row('shapeOut')}`;
                body.addEventListener('click', e => { const v = e.target.closest('[data-as-shape]')?.dataset.asShape; if (!v) return; const [k, s0] = v.split(':'); p[k] = s0; body.querySelectorAll(`[data-as-shape^="${k}:"]`).forEach(b => b.classList.toggle('is-active', b.dataset.asShape === v)); changed('Forme du fondu'); });
            } else if (fx.type === 'comp' || fx.type === 'limit') {
                body.innerHTML = '<canvas class="h-as-curve" data-as-curve></canvas>';
            } else if (fx.type === 'repair') {
                body.innerHTML = `<p>${esc(plural(p.masks?.length || 0, 'zone réparée', 'zones réparées'))} au pinceau.</p><button type="button" class="button small secondary" data-as-unmask>Retirer la dernière réparation</button>`;
                body.querySelector('[data-as-unmask]').addEventListener('click', () => { if (!p.masks?.length) return; p.masks.pop(); changed('Retirer une réparation'); paintFxSec(); });
            } else body.innerHTML = '';
            d.params.filter(q => !(fx.type === 'eqg')).forEach(q => body.appendChild(slider(q)));
            if (d.bools) Object.entries(d.bools).forEach(([k, l]) => { const lab = document.createElement('label'); lab.className = 'ui-toggle'; lab.innerHTML = `<input type="checkbox" ${p[k] ? 'checked' : ''}><i></i>${esc(l)}`; lab.querySelector('input').addEventListener('change', e => { p[k] = e.target.checked; changed(); }); body.appendChild(lab); });
            if (help) body.insertAdjacentHTML('beforeend', help);
            body.insertAdjacentHTML('beforeend', `<div class="h-as-fxfoot">${fx.range ? `<small class="muted">Seulement sur ${fmt(fx.range.a)} → ${fmt(fx.range.b)}</small> <button type="button" class="link-button" data-as-fxall>Tout le son</button>` : (sel && !d.lengthChange ? '<button type="button" class="link-button" data-as-fxsel>Seulement sur la sélection</button>' : '')}<span class="spacer"></span><button type="button" class="link-button" data-as-fxreset>↺ Remettre comme au départ</button></div>`);
            body.querySelector('[data-as-fxall]')?.addEventListener('click', () => { delete fx.range; changed('Effet sur tout le son'); paintFxSec(); });
            body.querySelector('[data-as-fxsel]')?.addEventListener('click', () => { fx.range = {a: sel.a, b: sel.b}; changed('Effet sur la sélection'); paintFxSec(); });
            body.querySelector('[data-as-fxreset]').addEventListener('click', () => { const keep = {masks: p.masks, print: p.print}; fx.params = {...E.fxDefaults(fx.type), ...(fx.type === 'repair' ? {masks: keep.masks} : {})}; changed(`${d.label} : remis comme au départ`); paintFxSec(); });
            drawFxGraph();
        }
        // les petits dessins : courbe de l'égaliseur, du compresseur, empreinte du bruit
        function drawFxGraph() {
            const fx = fxById(selFx), c0 = $('[data-as-fxbody] [data-as-curve]'); if (!fx || !c0) return;
            const dpr = window.devicePixelRatio || 1, W = c0.width = Math.round(c0.clientWidth * dpr), H = c0.height = Math.round(c0.clientHeight * dpr), g = c0.getContext('2d'), blue = getComputedStyle(c0).getPropertyValue('--ui-blue') || '#055dff';
            g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(128,128,128,.35)'; g.lineWidth = dpr; g.strokeRect(0, 0, W, H);
            if (fx.type === 'eqp') {
                const n = 200, fr = new Float32Array(n).map((_, i) => 20 * Math.pow(1000, i / (n - 1))), tot = new Float32Array(n).fill(0), mag = new Float32Array(n), ph = new Float32Array(n);
                fx.params.bands.forEach(b => { const f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = b.f; f.gain.value = b.g; f.Q.value = b.q; f.getFrequencyResponse(fr, mag, ph); for (let i = 0; i < n; i++) tot[i] += E.linToDb(mag[i]); });
                g.strokeStyle = 'rgba(128,128,128,.4)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
                g.strokeStyle = blue; g.lineWidth = 2.5 * dpr; g.beginPath(); for (let i = 0; i < n; i++) { const x = i / (n - 1) * W, y = H / 2 - clamp(tot[i], -24, 24) / 24 * (H / 2 - 8 * dpr); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
                fx.params.bands.forEach(b => { const x = Math.log(b.f / 20) / Math.log(1000) * W, y = H / 2 - b.g / 24 * (H / 2 - 8 * dpr); g.fillStyle = getComputedStyle(c0).getPropertyValue('--ui-bg') || '#fff'; g.beginPath(); g.arc(x, y, 6 * dpr, 0, 7); g.fill(); g.lineWidth = 2 * dpr; g.stroke(); });
            } else if (fx.type === 'comp' || fx.type === 'limit') {
                const thr = fx.type === 'comp' ? fx.params.thr : fx.params.ceil, ratio = fx.type === 'comp' ? fx.params.ratio : 1000, X = db => (db + 60) / 60 * W, Y = db => H - (db + 60) / 60 * H;
                g.setLineDash([4 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(X(-60), Y(-60)); g.lineTo(X(0), Y(0)); g.stroke(); g.setLineDash([]);
                g.strokeStyle = blue; g.lineWidth = 2.5 * dpr; g.beginPath(); g.moveTo(X(-60), Y(-60)); g.lineTo(X(thr), Y(thr)); g.lineTo(X(0), Y(thr + (0 - thr) / ratio)); g.stroke();
            } else if (fx.type === 'denoise') {
                const pr = fx.params.print || E.quietest(base), n = 64, N = 2048, x = E.mono(base), i0 = Math.floor(pr.a * base.sampleRate), win = E.hann(N), re = new Float64Array(N), im = new Float64Array(N);
                for (let i = 0; i < N; i++) { re[i] = (x[i0 + i] || 0) * win[i]; im[i] = 0; } E.fft(re, im);
                const bars = [...Array(n).keys()].map(k => { const a = Math.floor(Math.pow(N / 2, k / n)), b = Math.max(a + 1, Math.floor(Math.pow(N / 2, (k + 1) / n))); let s = 0; for (let j = a; j < b; j++) s += Math.hypot(re[j], im[j]); return E.linToDb(s / (b - a) / N * 4); });
                const red = (fx.params.reduction / 100) * fx.params.atten;
                bars.forEach((v, k) => { const h = clamp((v + 100) / 80, 0, 1) * H, x0 = k / n * W, w = W / n - dpr; g.fillStyle = 'rgba(128,128,128,.55)'; g.fillRect(x0, H - h, w, h); const h2 = clamp((v - red + 100) / 80, 0, 1) * H; g.fillStyle = blue; g.fillRect(x0, H - h2, w, h2); });
            }
        }

        // ── 🚩 marqueurs et zones ──
        function cleanRegions(list) { return (Array.isArray(list) ? list : []).filter(r => r && Number.isFinite(Number(r.start))).slice(0, 500).map((r, i) => ({id: String(r.id || nid('r')), kind: r.kind === 'marker' ? 'marker' : 'zone', name: String(r.name || (r.kind === 'marker' ? 'Marqueur' : 'Zone')).slice(0, 160), color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : COLORS[i % COLORS.length], start: Number(r.start), end: r.kind === 'marker' ? Number(r.start) : Math.max(Number(r.start), Number(r.end)), note: String(r.note || '').slice(0, 2000), links: Array.isArray(r.links) ? r.links.filter(l => l && ['person', 'event'].includes(l.type) && Number(l.id) > 0).map(l => ({type: l.type, id: Number(l.id), role: String(l.role || '').slice(0, 60), title: String(l.title || ''), meta: String(l.meta || '')})) : []})); }
        const curRegion = () => st.regions.find(r => r.id === selRegion) || null;
        async function addRegion(kind, a, b) {
            const n = st.regions.filter(r => r.kind === kind).length + 1;
            const name = kind === 'marker' ? `Marqueur ${n}` : `Zone ${n}`;
            const r = {id: nid('r'), kind, name, color: COLORS[st.regions.length % COLORS.length], start: a, end: kind === 'marker' ? a : b, note: '', links: []};
            st.regions.push(r); st.regions.sort((x, y) => x.start - y.start); selRegion = r.id; commit(`${kind === 'marker' ? 'Marqueur' : 'Zone'} « ${name} »`); paintRegions(); drawAll(); paintLink(); scheduleRegionSave();
            setTimeout(() => { const el = $(`[data-as-region="${CSS.escape(r.id)}"] [data-as-rname]`); if (el) { el.focus(); el.select?.(); } }, 30);
        }
        function paintRegions() {
            const box = $('[data-as-regions]');
            box.innerHTML = st.regions.length ? st.regions.map(r => `<div class="h-as-reg${r.id === selRegion ? ' is-sel' : ''}" data-as-region="${esc(r.id)}"><button type="button" class="h-as-rsw" data-as-rcolor style="--z:${esc(r.color)}" title="Couleur" aria-label="Couleur de « ${esc(r.name)} »"></button><input class="h-as-rname" data-as-rname value="${esc(r.name)}" maxlength="160" aria-label="Nom"><button type="button" class="h-as-rtime" data-as-rgo title="Aller à ce passage">${r.kind === 'marker' ? '🚩 ' : ''}${fmt(r.start, false)}</button>${r.links.length ? `<small class="h-as-rlinks" title="${esc(r.links.map(l => l.title).join(', '))}">🔗${r.links.length}</small>` : ''}<button type="button" class="icon-button small" data-as-rmore aria-label="Plus d’actions" title="Plus d’actions">⋯</button></div>`).join('')
                : (A().empty ? A().empty('Aucun marqueur ni zone : sélectionne un passage, puis « ＋ Nouvelle zone » (ou M).', {icon: '🚩'}) : '');
        }
        const regionBox = $('[data-as-regions]');
        regionBox.addEventListener('click', e => {
            const row = e.target.closest('[data-as-region]'); if (!row) return; const r = st.regions.find(x => x.id === row.dataset.asRegion); if (!r) return;
            selRegion = r.id;
            if (e.target.closest('[data-as-rgo]')) { cursor = r.start; sel = r.kind === 'marker' ? null : {a: r.start, b: r.end}; if (r.start < view.start || r.end > view.start + view.dur) { view.start = r.start - view.dur * 0.1; clampView(); } }
            if (e.target.closest('[data-as-rcolor]')) { if (UI().openColorBox) UI().openColorBox(e.target, {get: () => r.color, set: (v, final) => { if (!/^#[0-9a-f]{6}$/i.test(v || '')) return; r.color = v; drawAll(); paintRegions(); if (final) { commit(`Couleur de « ${r.name} »`); scheduleRegionSave(); } }}); }
            if (e.target.closest('[data-as-rmore]')) regionMenu(e.target, r);
            drawAll(); paintLink(); if (!e.target.closest('input')) paintRegions();
        });
        regionBox.addEventListener('change', e => { const inp = e.target.closest('[data-as-rname]'); if (!inp) return; const r = st.regions.find(x => x.id === inp.closest('[data-as-region]').dataset.asRegion); if (!r) return; r.name = inp.value.trim().slice(0, 160) || r.name; commit(`Renommer « ${r.name} »`); drawAll(); paintLink(); scheduleRegionSave(); });
        regionBox.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-as-rname]')) { e.preventDefault(); e.target.blur(); } });
        regionBox.addEventListener('contextmenu', e => { const row = e.target.closest('[data-as-region]'); if (!row || e.target.closest('input')) return; const r = st.regions.find(x => x.id === row.dataset.asRegion); if (r) regionMenu(e, r); }); // K14 : UI.contextMenu (le menu de l'app à la souris)
        $('[data-as-zbar]').addEventListener('click', e => { const b = e.target.closest('[data-as-region]'); if (!b) return; const r = st.regions.find(x => x.id === b.dataset.asRegion); if (!r) return; selRegion = r.id; cursor = r.start; sel = r.kind === 'marker' ? null : {a: r.start, b: r.end}; paintRegions(); drawAll(); paintLink(); });
        function regionMenu(anchor, r) {
            (anchor instanceof Event ? (items, o) => UI().contextMenu?.(anchor, items, o) : (items, o) => UI().menuAt?.(anchor, items, o))([{icon: '▶', label: 'Écouter ce passage', run: () => { sel = r.kind === 'marker' ? null : {a: r.start, b: r.end}; cursor = r.start; startPlay(); }},
                {icon: '🔗', label: 'Relier à une personne…', run: () => { selRegion = r.id; linkPick('person'); }}, {icon: '📅', label: 'Relier à un événement…', run: () => { selRegion = r.id; linkPick('event'); }},
                ...(r.kind === 'marker' ? [] : [{icon: '⤓', label: 'Exporter ce passage…', run: () => { sel = {a: r.start, b: r.end}; runCmd('export'); }}]),
                {icon: '✎', label: 'Renommer', run: () => { const el = $(`[data-as-region="${CSS.escape(r.id)}"] [data-as-rname]`); el?.focus(); el?.select(); }},
                '-', {icon: '🗑', label: 'Supprimer', danger: true, run: () => { st.regions = st.regions.filter(x => x !== r); if (selRegion === r.id) selRegion = null; commit(`Supprimer « ${r.name} »`); paintRegions(); drawAll(); paintLink(); scheduleRegionSave(); const msg = `« ${r.name} » supprimé`; { const at = hpos; A().undoToast ? A().undoToast(msg, {undo: () => goHist(at - 1), redo: () => goHist(at)}) : toast(msg); } }}], {title: r.name});
        }
        // enregistrement des zones : tout de suite dans la base si les temps valent pour le fichier du son (rien n'a été coupé)
        let regTimer = 0;
        function scheduleRegionSave() { if (!pristine || !media.id) return; clearTimeout(regTimer); regTimer = setTimeout(() => saveRegionsTo(media.id, srcFile).catch(e => toast(e.message, 'error')), 600); }
        const saveRegionsTo = (mediaId, filename) => post('save_audio_regions', {media_id: mediaId, filename, regions: st.regions.map(r => ({kind: r.kind, name: r.name, color: r.color, start: r.start, end: r.end, note: r.note, links: r.links.map(l => ({type: l.type, id: l.id, role: l.role}))}))});
        if (srcFile && !st.regions.length) { try { const r = await api('audio_regions', {media_id: media.id, filename: srcFile}); st.regions = cleanRegions(r.regions); } catch (_) {} }
        if (srcFile && !st.transcript.length) { try { const r = await api('audio_transcript', {media_id: media.id, filename: srcFile}); st.transcript = Array.isArray(r.lines) ? r.lines : []; } catch (_) {} }

        // ── 🔗 relier un passage (menu de choix unique) ──
        function paintLink() {
            const box = $('[data-as-link]'), r = curRegion(), P = window.LCNDA_PICKER;
            if (!r) { box.innerHTML = A().empty ? A().empty('Choisis une zone (à gauche ou au-dessus de l’onde), ou crée-en une : « ＋ Nouvelle zone ».', {icon: '🔗'}) : ''; return; }
            const people = r.links.filter(l => l.type === 'person'), events = r.links.filter(l => l.type === 'event');
            box.innerHTML = `<p class="h-as-linkhead"><b>« ${esc(r.name)} »</b> · ${fmt(r.start, false)}${r.kind === 'marker' ? '' : ' → ' + fmt(r.end, false)}</p>
                <span class="pk-lab">👤 Personnes (qui parle, de qui on parle)</span>${P ? P.pickerField({name: '', hiddenName: false, kind: 'person', roles: {main: false, roleList: ROLE_LIST}, value: {people: people.map(l => ({id: l.id, title: l.title, role: l.role, primary: true}))}}) : ''}
                <span class="pk-lab">📅 Événements</span>${P ? P.pickerField({name: '', hiddenName: false, kind: 'event', multiple: true, value: events.map(l => ({id: l.id, title: l.title, kind: 'event'}))}) : ''}
                ${pristine || !media.id ? '' : '<p class="muted">Le son a été coupé : les passages reliés seront enregistrés avec la nouvelle version (💾 Enregistrer ▾).</p>'}`;
        }
        $('[data-as-link]').addEventListener('picker-change', e => {
            const r = curRegion(); if (!r) return; const d = e.detail;
            if (d.kind === 'person') { const v = d.value || {}, list = (v.people || []).filter(x => x.id); const known = new Map(r.links.filter(l => l.type === 'person').map(l => [l.id, l])); r.links = [...list.map(x => ({type: 'person', id: Number(x.id), role: x.role || '', title: x.title || known.get(Number(x.id))?.title || d.items?.find(i => i.id === x.id)?.title || '', meta: ''})), ...r.links.filter(l => l.type !== 'person')]; }
            if (d.kind === 'event') { const ids = (Array.isArray(d.value) ? d.value : []).map(Number).filter(Boolean), items = d.items || []; const known = new Map(r.links.filter(l => l.type === 'event').map(l => [l.id, l])); r.links = [...r.links.filter(l => l.type !== 'event'), ...ids.map(id => ({type: 'event', id, role: '', title: items.find(i => Number(i.id) === id)?.title || known.get(id)?.title || 'Événement', meta: ''}))]; }
            commit(`Relier « ${r.name} »`); paintRegions(); scheduleRegionSave();
        });
        async function linkPick(kind) {
            const r = curRegion(); if (!r) return toast('Choisis d’abord une zone.', 'error');
            const it = await window.LCNDA_PICKER?.openPicker?.({kind, title: kind === 'person' ? `Relier « ${r.name} » à une personne` : `Relier « ${r.name} » à un événement`}); if (!it) return;
            if (!r.links.some(l => l.type === kind && l.id === Number(it.id))) r.links.push({type: kind, id: Number(it.id), role: '', title: it.title, meta: ''});
            commit(`Relier « ${r.name} » à ${it.title}`); paintRegions(); paintLink(); scheduleRegionSave();
            dl.querySelector('[data-ui-section="as-link"]')?.setAttribute('open', '');
        }

        // ── 🕘 historique, ℹ️ infos ──
        function paintHist() {
            const box = $('[data-as-hist]'); box.innerHTML = hist.map((h, i) => `<li class="${i === hpos ? 'is-cur' : i > hpos ? 'is-future' : ''}"><button type="button" data-as-hgo="${i}">${esc(h.label)}</button></li>`).join('');
            const sum = box.closest('details')?.querySelector('summary'); if (sum) sum.innerHTML = `🕘 Historique <small class="h-as-count">${esc(plural(hist.length, 'étape'))}</small>`;
            $('[data-as-cmd="undo"]').disabled = hpos <= 0; $('[data-as-cmd="redo"]').disabled = hpos >= hist.length - 1;
        }
        $('[data-as-hist]').addEventListener('click', e => { const b = e.target.closest('[data-as-hgo]'); if (b) goHist(Number(b.dataset.asHgo)); });
        let infoTok = 0;
        async function paintInfo() {
            const tok = ++infoTok, b = shown(), box = $('[data-as-info]');
            box.innerHTML = `<p>${fmt(base.duration)} · ${base.numberOfChannels > 1 ? 'stéréo' : 'mono'} · ${(base.sampleRate / 1000).toLocaleString('fr-FR')} kHz · crête ${E.linToDb(E.peakOf(b)).toFixed(1).replace('.', ',')} dB · sonie <span data-as-lufs>…</span></p>`;
            const L = await E.lufs(b); if (tok === infoTok) { const el = box.querySelector('[data-as-lufs]'); if (el) el.textContent = `${Math.round(L)} LUFS`; }
        }

        // ── 📝 transcription à la main ──
        let pauseTyping = ls('genealogie-audio-transcript-pause', '1') !== '0', typeTimer = 0, resumeAt = null, txTimer = 0;
        function paintText() {
            const box = $('[data-as-text]');
            box.innerHTML = `<div class="h-as-txtools"><button type="button" class="button small secondary" data-as-cmd="tstamp" data-shortcut="⌘T">⏱ Insérer l’heure</button><button type="button" class="button small secondary${slow ? ' is-active' : ''}" data-as-cmd="slow">🐢 Lire à 75 %</button><label class="ui-toggle"><input type="checkbox" data-as-tpause ${pauseTyping ? 'checked' : ''}><i></i>Pause quand j’écris</label></div>
                <ol class="h-as-lines" data-as-lines>${st.transcript.map((l, i) => `<li data-i="${i}"><button type="button" class="h-as-tt" data-as-tgo="${i}" title="Écouter à partir d’ici">${fmt(l.t)}</button><input class="h-as-who" data-as-who value="${esc(l.who || '')}" placeholder="Qui ?" maxlength="80" aria-label="Qui parle"><textarea class="h-as-say" data-as-say rows="1" maxlength="4000" aria-label="Ce qui est dit">${esc(l.text || '')}</textarea><button type="button" class="icon-button small" data-as-tdel aria-label="Retirer la ligne" title="Retirer la ligne">×</button></li>`).join('')}</ol>
                ${st.transcript.length ? '' : (A().empty ? A().empty('Écoute, puis « ⏱ Insérer l’heure » (⌘T) et tape ce qui est dit.', {icon: '📝'}) : '')}
                <p class="muted">Cliquer une heure fait écouter ce passage. Export en .txt, .srt, .vtt : ⤓ Exporter → 📝 Texte et repères. Le texte est cherchable dans la base.</p>
                <button type="button" class="button small secondary" disabled title="Bientôt : un moteur de reconnaissance qui tourne dans l’ordinateur (rien n’est envoyé sur Internet)">🤖 Transcrire tout seul (bientôt)</button>`;
            box.querySelectorAll('textarea').forEach(t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; });
        }
        const saveText = () => { clearTimeout(txTimer); txTimer = setTimeout(() => { if (pristine && media.id) post('save_audio_transcript', {media_id: media.id, filename: srcFile, lines: st.transcript}).catch(e => toast(e.message, 'error')); else { saved = false; status('dirty'); } }, 900); };
        const tbox = $('[data-as-text]');
        tbox.addEventListener('click', e => {
            const go = e.target.closest('[data-as-tgo]'); if (go) { const l = st.transcript[Number(go.dataset.asTgo)]; cursor = l.t; sel = null; startPlay(l.t); return; }
            const del = e.target.closest('[data-as-tdel]'); if (del) { st.transcript.splice(Number(del.closest('li').dataset.i), 1); paintText(); saveText(); }
        });
        tbox.addEventListener('input', e => {
            const li = e.target.closest('li[data-i]'); if (li) { const l = st.transcript[Number(li.dataset.i)]; if (e.target.matches('[data-as-who]')) l.who = e.target.value; if (e.target.matches('[data-as-say]')) { l.text = e.target.value; e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; } saveText();
                if (pauseTyping && e.target.matches('[data-as-say]')) { if (playing) { resumeAt = Math.max(0, curTime() - 1); stopPlay(); cursor = resumeAt; } clearTimeout(typeTimer); typeTimer = setTimeout(() => { if (resumeAt !== null && dl.open) { const t = resumeAt; resumeAt = null; startPlay(t); } }, 1500); } }
            if (e.target.matches('[data-as-tpause]')) { pauseTyping = e.target.checked; lsSet('genealogie-audio-transcript-pause', pauseTyping ? '1' : '0'); }
        });
        tbox.addEventListener('change', e => { if (e.target.matches('[data-as-tpause]')) { pauseTyping = e.target.checked; lsSet('genealogie-audio-transcript-pause', pauseTyping ? '1' : '0'); } });
        function insertTime() {
            const t = Math.round(curTime() * 10) / 10, last = [...st.transcript].reverse().find(l => l.t <= t);
            st.transcript.push({t, who: last?.who || '', text: ''}); st.transcript.sort((a, b) => a.t - b.t);
            dl.querySelector('[data-ui-section="as-text"]')?.setAttribute('open', ''); paintText(); saveText();
            const i = st.transcript.findIndex(l => l.t === t && !l.text); tbox.querySelector(`li[data-i="${i}"] [data-as-say]`)?.focus();
        }

        // ── Fichiers (les sons de la séance : pour le multipiste) ──
        const files = [{key: 'main', title: carry?.name || projName || media.title || media.filename || 'Son', media}];
        const fileBufs = {};
        function addFile(o) { const key = o.media?.id ? 'm' + o.media.id : 'f' + nid(''); if (!files.some(f => f.key === key)) files.push({key, title: o.title, src: o.src, media: o.media}); paintFiles(); return key; }
        function paintFiles() { $('[data-as-files]').innerHTML = files.map(f => `<div class="h-as-file${f.key === 'main' ? ' is-cur' : ''}" data-as-file="${esc(f.key)}" draggable="${f.key === 'main' ? 'false' : 'true'}" title="${f.key === 'main' ? 'Le son ouvert ici' : 'Glisse-le sur une piste du Multipiste'}"><span aria-hidden="true">${/\.(mp4|webm|mov|m4v)$/i.test(f.media?.filename || '') ? '🎬' : '🎧'}</span> ${esc(f.title)}</div>`).join(''); }
        $('[data-as-addfile]').addEventListener('click', async () => { const o = await ext._av.pickOther('audio'); if (!o) return; const key = addFile(o); if (mode === 'multi') multi.addClip(key); else toast(`« ${o.title} » est dans les Fichiers : passe en 🎛️ Multipiste pour le poser sur une piste, ou Édition → Insérer un son…`); });
        const loadFileBuf = async key => { if (key === 'main') return renderNow(); if (fileBufs[key]) return fileBufs[key]; const f = files.find(x => x.key === key); if (!f) return null; fileBufs[key] = await E.load(f.src || url(f.media?.filename)); return fileBufs[key]; };

        // ── 🎛️ Multipiste (heritage-audio-multi.js) ──
        let multi = null;
        const studioApi = {E, get base() { return base; }, files, fileBufs, loadFileBuf, addFile, renderNow, getMulti: () => st.multi, setMulti: m => { st.multi = m; }, commit, cursor: () => cursor, setCursor: t => { cursor = t; }, playing: () => playing, curTime, stopPlay, startPlay, tool: () => tool, media, status, sbar: () => sbar, dl, toast};
        function setMode(m) {
            if (m === mode) return; stopPlay(); mode = m;
            dl.querySelectorAll('[data-as-cmd="wave"],[data-as-cmd="multi"]').forEach(b => { if (b.closest('[data-as-cmds]')) return; b.classList.toggle('is-active', b.dataset.asCmd === m); b.setAttribute('aria-selected', b.dataset.asCmd === m ? 'true' : 'false'); });
            $('[data-as-wavebox]').hidden = m !== 'wave'; $('[data-as-multibox]').hidden = m !== 'multi';
            if (m === 'multi') { if (!ext.audioMulti) { toast('Le Multipiste n’est pas encore prêt.', 'error'); return setMode('wave'); } if (!multi) multi = ext.audioMulti.mount($('[data-as-multibox]'), studioApi); else multi.reload(); if (tool === 'brush' || tool === 'lasso') setTool('sel'); }
            $('[data-as-multibox]').closest('.h-as-center').querySelector('.h-as-transport') && null;
            // le transport et les VU-mètres servent aux deux modes : on les déplace
            const tr = dl.querySelector('.h-as-transport'), vu = dl.querySelector('.h-as-vu'), host = m === 'wave' ? $('[data-as-wavebox]') : $('[data-as-multibox]'); host.append(tr, vu);
            drawAll();
        }
        function setTool(t) { tool = t; dl.querySelectorAll('.h-as-tools [data-as-cmd^="tool:"]').forEach(b => b.classList.toggle('is-active', b.dataset.asCmd === 'tool:' + t)); sbar?.setHelp?.(HELP[t] || ''); cv.style.cursor = t === 'marker' ? 'copy' : ''; spc.style.cursor = t === 'brush' || t === 'lasso' ? 'crosshair' : ''; if ((t === 'brush' || t === 'lasso') && !spectrumOn) toggleSpectrum(true); }
        function toggleSpectrum(v = !spectrumOn) { spectrumOn = v; lsSet(SPEC_KEY, v ? '1' : '0'); $('[data-as-specbox]').hidden = !v; const sw = $('[data-as-specsw]'); if (sw) sw.checked = v; drawAll(); }
        $('[data-as-specsw]').addEventListener('change', e => toggleSpectrum(e.target.checked));

        // ── enregistrer ──
        const nameNow = () => ($('[data-as-name]').value || '').trim() || media.title || 'Son';
        const projData = () => ({mode: 'studio', rack: st.rack, regions: st.regions, multi: st.multi, transcript: st.transcript, history: hist.slice(Math.max(0, hpos - 30), hpos + 1).map(h => h.label)});
        async function saveProj(asNew = false) {
            stopPlay(); let name = nameNow();
            if (asNew) { const n = await A().askText({title: 'Enregistrer le projet son', message: 'Nom du projet (pour le retrouver dans 📂 Projets… ou Listes → Outils de modification → 🎧 Son) :', value: name, okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160) || name; }
            status('saving');
            try { const r = await AU().saveProject({media, proj: projId ? {id: projId, source: proj?.source} : null, name, buf: base, asNew, data: projData()}); projId = r.id; projName = r.name; $('[data-as-name]').value = projName; saved = true; status('saved'); }
            catch (err) { status('error'); toast(err.message, 'error'); }
        }
        const finalBuf = async () => mode === 'multi' && multi ? multi.mix() : renderNow();
        /** le son fini → les médias (version montrée ou non, copie, nouveau son) ; zones et transcription recopiées sur le nouveau fichier */
        async function saveTo(kind) {
            stopPlay(); status('saving');
            try {
                const out = await finalBuf(), f = AU().formatFor(media), lengthFx = st.rack.some(x => x.on !== false && E.FX[x.type]?.lengthChange) || mode === 'multi';
                const blob = await E.encode(f.fmt, out, {kbps: f.kbps || 192});
                const m = kind === 'new' || !media.id ? 'new' : kind === 'copyv' ? 'copy' : 'version';
                const res = await ext._av.uploadResult(media, blob, f.ext, {mode: m, show: kind === 'show', duration: out.duration, note: 'Studio son', title: m === 'copy' ? `${nameNow()} (studio)` : nameNow()});
                // le nouveau fichier : les zones et la transcription y sont recopiées (si la durée n'a pas changé à cause d'un effet)
                let target = null;
                if (m === 'copy' || m === 'new') { const vs = await AU().versionsOf({id: res.media_id}); target = {id: res.media_id, filename: (vs.find(x => x.shown) || vs[0])?.filename || ''}; }
                else if (kind === 'show') target = {id: media.id, filename: res.filename};
                else { const vs = await AU().versionsOf(media); const v = vs.filter(x => !x.is_original).sort((a, b) => b.id - a.id)[0]; if (v) target = {id: media.id, filename: v.filename}; }
                if (target && (st.regions.length || st.transcript.length)) {
                    if (lengthFx) toast('La durée a changé (vitesse, blancs ou multipiste) : les zones et la transcription restent dans le projet, pas sur le nouveau fichier.');
                    else { if (st.regions.length) await saveRegionsTo(target.id, target.filename); if (st.transcript.length) await post('save_audio_transcript', {media_id: target.id, filename: target.filename, lines: st.transcript}); }
                }
                saved = true; status('saved');
                toast(m === 'copy' ? 'Copie séparée ajoutée aux mêmes fiches.' : m === 'new' ? 'Son enregistré : il est dans Listes → Audios.' : kind === 'show' ? 'Nouvelle version affichée partout. L’original est gardé.' : 'Version enregistrée (l’ancienne reste affichée).');
                onDone?.(); const info = {...res, media_id: target?.id || res.media_id, filename: target?.filename || res.filename}; onSaved?.(info); return info;
            } catch (err) { status('error'); toast(err.message || String(err), 'error'); }
        }
        // ⚡ revenir au Son rapide (ou à l'éditeur d'avant) : le travail suit
        function toQuick() {
            stopPlay(); lsSet(AU().MODE_KEY, 'quick');
            if (mode === 'multi' && st.multi?.tracks?.some(t => t.clips?.length && !(t.clips.length === 1 && t.clips[0].key === 'main'))) {
                return A().confirmBox('Un projet à plusieurs pistes ne s’ouvre pas en Son rapide : c’est le mélange qui s’ouvre (les pistes restent dans ce projet si tu l’enregistres).', {title: 'Ouvrir le mélange en Son rapide ?', okLabel: 'Ouvrir le mélange'}).then(async ok => { if (!ok) return; const mix = await multi.mix(); const w = !saved; saved = true; dl.close(); ext.openSound(media, {onDone, mode: 'quick', carry: {buf: mix, rack: [], regions: [], name: nameNow() + ' (mélange)', dirty: true, from: 'studio'}}); void w; });
            }
            const wasDirty = !saved; saved = true; dl.close();
            ext.openSound(media, {onDone, mode: 'quick', proj: projId ? {id: projId, name: projName, source: proj?.source || media.filename || ''} : null, carry: {buf: base, rack: st.rack, regions: st.regions, name: nameNow(), dirty: wasDirty, from: 'studio'}});
        }
        async function toMontage() {
            stopPlay(); if (!ext.newMontage) return toast('Le montage n’est pas prêt.', 'error');
            if (!await A().confirmBox('Le son fini est rangé dans les médias (une copie), puis le montage vidéo s’ouvre pour y mettre des images.', {title: 'Ouvrir dans le montage ?', okLabel: 'Ouvrir dans le montage'})) return;
            const res = await saveTo(media.id ? 'copyv' : 'new'); if (!res) return;
            dl.close(); ext.newMontage(onDone, {audio: {mediaId: res.media_id, filename: res.filename, title: nameNow()}});
        }
        const close = async () => { if (!saved && !await A().confirmBox('Les modifications du son seront perdues.', {title: 'Fermer sans enregistrer ?', okLabel: 'Fermer sans enregistrer', danger: true})) return; saved = true; stopPlay(); dl.close(); };

        // ── les commandes (barre, menus, raccourcis à soi) ──
        const zoomBy = f => { const c = sel && f < 1 ? (sel.a + sel.b) / 2 : view.start + view.dur / 2; view.dur *= f; view.start = c - view.dur / 2; clampView(); drawAll(); };
        function runCmd(c) {
            if (c.startsWith('tool:')) return setTool(c.slice(5));
            const map = {
                play: () => { if (playing) { cursor = Math.min(curTime(), mode === 'wave' ? base.duration : 1e9); stopPlay(); drawAll(); } else startPlay(); },
                home: () => { cursor = 0; if (playing) startPlay(0); else drawAll(); }, loop: () => { loop = !loop; $('[data-as-cmd="loop"]').classList.toggle('is-active', loop); if (playing) startPlay(); }, rec: record,
                undo: () => goHist(hpos - 1), redo: () => goHist(hpos + 1),
                marker: () => addRegion('marker', playing ? curTime() : cursor, 0), zone: () => { if (!sel) { addRegion('marker', cursor, 0); return; } addRegion('zone', sel.a, sel.b); },
                cut: () => op('cut'), copy: () => op('copy'), paste: () => op('paste'), del: () => (tool === 'razor' && mode === 'multi') ? multi?.delSel() : op('del'), keep: () => op('keep'), silence: () => op('silence'), selall: () => op('selall'), insert: insertSound, mono: () => op('mono'), bake: () => op('bake'),
                zoomsel: () => { if (!sel) return; view.start = sel.a - (sel.b - sel.a) * 0.05; view.dur = (sel.b - sel.a) * 1.1; clampView(); drawAll(); }, zoomfit: () => { view = {start: 0, dur: base.duration}; drawAll(); }, zoomin: () => zoomBy(0.5), zoomout: () => zoomBy(2), vzin: () => { vzoom = clamp(vzoom * 1.5, 0.25, 32); drawAll(); }, vzout: () => { vzoom = clamp(vzoom / 1.5, 0.25, 32); drawAll(); },
                spectrum: () => toggleSpectrum(), wave: () => setMode('wave'), multi: () => setMode('multi'), repair: repairNow, paintplay: () => { if (!paintMasks.length) return toast('Peins d’abord sur la tache du spectre (🖌 ou ➰).', 'error'); sel = {a: Math.max(0, Math.min(...paintMasks.map(m0 => m0.t0)) - 0.3), b: Math.min(base.duration, Math.max(...paintMasks.map(m0 => m0.t1)) + 0.3)}; drawAll(); startPlay(sel.a); }, clearpaint: () => { paintMasks = []; drawSpectrum(); },
                quick: toQuick, projects: () => ext._av.audioProjectsDialog({current: projId, onOpen: async p => { if (!saved && !await A().confirmBox('Les modifications en cours seront perdues.', {title: 'Ouvrir un autre projet sans enregistrer ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; saved = true; stopPlay(); dl.close(); await ext.openAudioProject(p.id, onDone); }}),
                versions: () => { if (!media.id || !UI().openMediaVersions) return toast('Ce son n’est pas encore dans les médias : pas de versions.'); stopPlay(); UI().openMediaVersions(media, {kind: 'audio', tool: 'Studio son', onShown: () => onDone?.()}); }, // L3
                saveproj: () => saveProj(false), saveas: () => saveProj(true), show: () => saveTo(media.id ? 'show' : 'new'), keepv: () => saveTo('keepv'), copyv: () => saveTo('copyv'),
                export: () => { stopPlay(); ext.audioExport({title: nameNow(), media, getBuffer: finalBuf, getSelection: () => mode === 'wave' ? sel : null, regions: st.regions, lines: st.transcript, sourceDuration: base.duration, tracks: mode === 'multi' ? multi?.tracks() : null, getTrack: id => multi.mix(id), toMedia: () => MENUS_SAVE(), onDone}); },
                montage: toMontage, close,
                'win:transcript': () => openSec('as-text'), 'win:history': () => openSec('as-hist'), 'win:info': () => { openSec('as-info'); paintInfo(); }, 'win:rack': () => openSec('as-rack'),
                tstamp: insertTime, slow: () => { slow = !slow; dl.querySelectorAll('[data-as-cmd="slow"]').forEach(b => b.classList.toggle('is-active', slow)); if (playing) startPlay(curTime()); },
            };
            map[c]?.();
        }
        const MENUS_SAVE = () => UI().menuAt?.($('[data-as-cmd="saveproj"]'), MENUS.Fichier().filter(x => x !== '-' && /Enregistrer|Copie/.test(x.label || '')), {title: 'Garder le son'});
        const openSec = key => { const d = dl.querySelector(`[data-ui-section="${key}"]`); if (d) { d.open = true; d.scrollIntoView({block: 'nearest', behavior: 'smooth'}); } };
        dl.addEventListener('click', e => { const b = e.target.closest('[data-as-cmd]'); if (!b || b.disabled) return; runCmd(b.dataset.asCmd); });
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); close(); });
        const onKey = e => {
            if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return;
            const typing = e.target.closest?.('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable]'), mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = e.key.toLowerCase();
            if (mod && k === 't') { e.preventDefault(); e.stopImmediatePropagation(); insertTime(); return; }
            if (mod && k === 's') { e.preventDefault(); e.stopImmediatePropagation(); saveProj(e.shiftKey); return; }
            if (typing) return;
            if (mod && k === 'z') { e.preventDefault(); e.stopImmediatePropagation(); goHist(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if (mod && k === 'y') { e.preventDefault(); goHist(hpos + 1); return; }
            if (mod && ['x', 'c', 'v', 'a', 'e'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); runCmd({x: 'cut', c: 'copy', v: 'paste', a: 'selall', e: 'zoomsel'}[k]); return; }
            if (mod) return;
            if (e.key === ' ') { e.preventDefault(); runCmd('play'); return; }
            if (k === 'm') { e.preventDefault(); runCmd(sel && e.shiftKey ? 'zone' : 'marker'); return; }
            if (k === 'b') { setTool('brush'); return; } if (k === 'v') { setTool('sel'); return; }
            if (k === 'a' && !e.repeat) { if (mode === 'wave') { setBypass(true); sbar?.flash?.('👂 L’avant (sans les effets)', 1500); } return; }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (mode === 'multi') multi?.delSel(); else if (sel) runCmd('del'); return; }
            if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && mode === 'wave') { e.preventDefault(); const d = (e.key === 'ArrowLeft' ? -1 : 1) * view.dur / 50; if (e.shiftKey) { const s0 = sel || {a: cursor, b: cursor}; const edge = s0.b > cursor + 1e-6 || (s0.a === cursor && d > 0) ? 'b' : 'a'; s0[edge] = clamp(s0[edge] + d, 0, base.duration); sel = {a: Math.min(s0.a, s0.b), b: Math.max(s0.a, s0.b)}; if (sel.b - sel.a < 1e-3) sel = null; } else { cursor = clamp(cursor + d, 0, base.duration); sel = null; } drawAll(); }
        };
        const onKeyUp = e => { if (e.key.toLowerCase() === 'a' && bypass) setBypass(false); };
        window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true);
        dl.addEventListener('close', () => { stopPlay(); rec?.cancel(); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); clearTimeout(regTimer); clearTimeout(txTimer); dl.remove(); });
        // E4 : un son glissé (ou collé) sur l'onde : dans les médias, puis inséré au repère orange
        UI().bindFileDrop?.($('.h-as-wave'), async fl => {
            const f = fl[0]; if (!f) return;
            try { const fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'audio'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', S().csrf); const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                const ob = await E.resample(await E.decode(await f.arrayBuffer()), sr(), base.numberOfChannels), at = cursor; shiftRegions(at, at, ob.duration); setBase(E.concatBufs([E.sliceBuf(base, 0, at * sr()), ob, E.sliceBuf(base, at * sr(), base.length)].filter(x => x.length > 1), base.numberOfChannels, sr()), `Insérer « ${f.name} »`); sel = {a: at, b: at + ob.duration}; addFile({title: f.name, media: {id: j.result.media_id, filename: j.result.filename}, src: url(j.result.filename)}); drawAll(); toast(`« ${f.name} » est dans les médias et inséré au repère orange.`); }
            catch (err) { toast(`${f.name} : ${err.message}`, 'error'); }
        }, {accept: 'audio/*'});

        // ── départ ──
        new ResizeObserver(() => { specCache = null; drawAll(); if (mode === 'multi') multi?.draw(); drawFxGraph(); }).observe($('.h-as-center'));
        dl.showModal();
        toggleSpectrum(spectrumOn); setTool('sel'); paintFiles(); paintRegions(); paintRack(); paintFxSec(); paintLink(); paintText(); paintInfo();
        commit('Ouverture', {dirty: false});
        // ce qui arrive du Son rapide : les coupes deviennent des coupes de l'onde (dans l'historique)
        (carry?.edits || []).forEach(ed => { const segs = (ed.cuts || [{a: ed.a, b: ed.b}]).slice().sort((x, y) => y.a - x.a); let nb = base; segs.forEach(s0 => { const i0 = Math.round(s0.a * nb.sampleRate), i1 = Math.round(s0.b * nb.sampleRate); nb = E.concatBufs([E.sliceBuf(nb, 0, i0), E.sliceBuf(nb, i1, nb.length)].filter(x => x.length > 1), nb.numberOfChannels, nb.sampleRate); shiftRegions(s0.a, s0.b, -(s0.b - s0.a)); }); setBase(nb, ed.label); });
        if (carry?.rack?.length && carry.from) commit(carry.from === 'quick' ? 'Réglages du Son rapide' : 'Réglages repris', {dirty: false});
        saved = !carry?.dirty && !(carry?.edits || []).length; status(saved ? '' : 'dirty'); if (saved) $('[data-ui-status]').textContent = '';
        view = {start: 0, dur: base.duration}; invalidate(); drawAll();
        if (st.multi?.tracks?.length && data.mode === 'studio' && (st.multi.tracks.some(t => t.clips?.some(c => c.key !== 'main')))) setMode('multi');
        // pour les essais
        dl._as = {st, base: () => base, rendered: () => renderNow(), sel: v => { if (v !== undefined) { sel = v; drawAll(); } return sel; }, cursor: v => { if (v !== undefined) cursor = v; return cursor; }, addFx, runCmd, hist: () => hist.map(h => h.label), hpos: () => hpos, goHist, addRegion, setMode, multi: () => multi, finalBuf, paintMasks: m => { paintMasks = m; }, repairNow, pristine: () => pristine, saveProj, saveTo, linkPick, setBypass, files};
        return dl;
    }
    ext.openAudioStudio = openAudioStudio;

    /* ═════════════ 🎧 « On l'entend » : le bloc de la fiche (passages reliés à la personne) ═════════════ */
    ext.personBlocks = ext.personBlocks || {};
    ext.personBlocks.heard = (index, detail) => {
        const list = detail?.heritage?.heard || []; if (!list.length) return '';
        const groups = new Map(); list.forEach(r => { const k = `${r.media_id}|${r.filename}`; if (!groups.has(k)) groups.set(k, {title: r.media_title, media_id: r.media_id, items: []}); groups.get(k).items.push(r); });
        const body = `<div class="h-as-heard">${[...groups.values()].map(g => `<div class="h-as-heardgrp"><b>🎧 ${esc(g.title || 'Son')}</b><ul>${g.items.map(r => `<li><button type="button" class="h-as-heardplay" data-heard-play="${esc(r.filename)}" data-a="${r.start}" data-b="${r.kind === 'marker' ? r.start + 30 : r.end}" ${r.exists ? '' : 'disabled title="Fichier introuvable"'} aria-label="Écouter « ${esc(r.name)} »">▶</button><span class="h-as-heardsw" style="--z:${esc(r.color)}"></span><span><b>${esc(r.name)}</b> <small class="muted">${fmt(r.start, false)}${r.kind === 'marker' ? '' : ' → ' + fmt(r.end, false)}${r.role ? ' · ' + esc(r.role) : ''}</small></span><button type="button" class="link-button" data-heard-open="${r.media_id}" data-heard-file="${esc(r.filename)}" title="Ouvrir ce son dans le 🎚️ Studio son">↗ Ouvrir</button></li>`).join('')}</ul></div>`).join('')}<audio data-heard-audio hidden></audio></div>`;
        return A().card(index, '🎧 On l’entend', list.length, body, 'span-12', '');
    };
    // ▶ écouter juste ce passage ; ↗ ouvrir le son dans le Studio
    let heardStop = 0;
    document.addEventListener('click', async e => {
        const p = e.target.closest('[data-heard-play]');
        if (p) { const box = p.closest('.h-as-heard'), au = box?.querySelector('[data-heard-audio]'); if (!au) return; const a = Number(p.dataset.a), b = Number(p.dataset.b);
            if (!au.paused && au.dataset.cur === p.dataset.heardPlay + a) { au.pause(); p.textContent = '▶'; return; }
            box.querySelectorAll('[data-heard-play]').forEach(x => { x.textContent = '▶'; }); au.dataset.cur = p.dataset.heardPlay + a; au.src = url(p.dataset.heardPlay); au.currentTime = a; au.play().catch(() => {}); p.textContent = '⏸';
            clearInterval(heardStop); heardStop = setInterval(() => { if (au.currentTime >= b || au.paused) { au.pause(); p.textContent = '▶'; clearInterval(heardStop); } }, 120); return; }
        const o = e.target.closest('[data-heard-open]');
        if (o) { try { const id = Number(o.dataset.heardOpen); const r = await api('media_versions', {id}); const v = (r.versions || []).find(x => x.shown) || {}; openAudioStudio({id, filename: o.dataset.heardFile, title: o.closest('.h-as-heardgrp')?.querySelector('b')?.textContent.replace(/^🎧\s*/, '') || 'Son', media_type: 'audio'}, {onDone: () => ext.refreshView?.()}); void v; } catch (err) { toast(err.message, 'error'); } }
    });

    /* ═════════════ 🎙️ Enregistrer au micro (Outils de modification → 🎧 Son) ═════════════ */
    ext.recordNewSound = (onDone = null) => {
        const E = AE(); let mic = null, t0 = 0, tm = 0;
        const d = document.createElement('dialog'); d.className = 'modal small-modal h-as-recdlg';
        d.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎧 SON</span><h2>🎙️ Enregistrer au micro</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <p class="muted">Une lettre lue à voix haute, un souvenir raconté, le commentaire d’une photo… Le son entre dans les médias, puis s’ouvre dans le 🎚️ Studio son.</p>
            <div class="h-as-recbig"><button type="button" class="button h-as-recgo" data-go>● Commencer</button><b class="h-as-rectime" data-t>0:00</b></div>
            <div class="h-as-vubar h-as-recvu"><i data-vu></i></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button></div>`;
        document.body.appendChild(d); d.showModal();
        const end = () => { clearInterval(tm); mic?.cancel(); mic = null; d.close(); };
        d.addEventListener('close', () => { clearInterval(tm); mic?.cancel(); d.remove(); });
        d.addEventListener('click', async e => {
            if (e.target.closest('[data-x]')) return end();
            const go = e.target.closest('[data-go]'); if (!go) return;
            if (!mic) { try { mic = await E.recordMic({name: 'prise-micro', onLevel: v => { const el = d.querySelector('[data-vu]'); if (el) el.style.width = clamp((E.linToDb(v) + 60) / 60, 0, 1) * 100 + '%'; }}); } catch (err) { return toast(err.message, 'error'); }
                go.textContent = '⏹ Arrêter et ouvrir dans le Studio'; go.classList.add('is-rec'); t0 = Date.now(); tm = setInterval(() => { d.querySelector('[data-t]').textContent = fmt((Date.now() - t0) / 1000, false); }, 250); return; }
            go.disabled = true; go.textContent = 'Envoi…'; clearInterval(tm);
            try { const m0 = mic; mic = null; const {file} = await m0.stop(); const title = `Prise micro du ${new Date().toLocaleDateString('fr-FR')}`;
                const fd = new FormData(); fd.append('file', file, file.name); fd.append('kind', 'audio'); fd.append('title', title); fd.append('csrf', S().csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Envoi impossible.');
                d.close(); onDone?.(); openAudioStudio({id: j.result.media_id, filename: j.result.filename, title, media_type: 'audio'}, {onDone}); toast('Prise micro rangée dans les médias (Listes → Audios).'); }
            catch (err) { toast(err.message, 'error'); go.disabled = false; go.textContent = '● Commencer'; }
        });
    };
})();
