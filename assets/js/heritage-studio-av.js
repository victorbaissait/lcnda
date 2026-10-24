/**
 * ✂️ Atelier son et vidéo (visionneuse → « ✂️ Modifier », listes Audios / Vidéos → ✏️) : simple mais complet.
 *  - Son : forme d'onde, sélection à la souris, couper / garder / silence, fondus, volume, normaliser, réduire le souffle,
 *    voix plus nette, raccourcir les longs silences, mono, ajouter un autre son (assembler), annuler / rétablir ;
 *    enregistré en MP3, WAV, FLAC, Ogg Opus ou AIFF (qualité, mono, fréquence au choix), ou seulement téléchargé.
 *  - Vidéo : des morceaux (couper ici, supprimer, garder du début à la fin), d'autres vidéos ajoutées à la suite,
 *    le son (volume, voix plus nette, souffle, muet) et l'image (rotation, luminosité, contraste) ; enregistrée en MP4
 *    ou WebM, en temps réel (le navigateur rejoue le montage).
 *  - L'original est toujours gardé (serveur : lib/studio.php, media_versions) : nouvelle version montrée ou non, ou copie à part.
 * Chargé après app.js et heritage-studio.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const UIx = () => window.LCNDA_UI || {};
    /* la barre du haut commune (E1) des éditeurs son et montage : quelques règles à elle, en clair et en sombre */
    (() => { if (document.getElementById('h-avx-css2')) return; const st = document.createElement('style'); st.id = 'h-avx-css2'; st.textContent = `
.h-avx .modal-head.h-avx-bar{align-items:center;flex-wrap:wrap;gap:6px 12px}
.h-avx-titlebox{display:flex;align-items:center;gap:8px;min-width:0}
.h-avx-namebox{display:grid;min-width:0}.h-avx-namebox .eyebrow{line-height:1.1}
.h-avx-name{font-weight:800;font-size:17px;border:1.5px solid transparent;padding:2px 6px;background:transparent;color:inherit;width:300px;max-width:42vw;min-height:0;box-shadow:none}
.h-avx-name:hover,.h-avx-name:focus{border-color:currentColor;outline:0}
.h-avx-bar .h-avx-headbtns{margin-left:auto;flex-wrap:wrap}
.h-avx-bar .ui-topbar-hist{display:inline-flex;gap:4px}
.h-avx-help2{margin-top:-4px}
.h-avx-montage .h-avx-name{width:220px}
.h-avx-montage>.modal-head.h-avx-bar .h-avx-headbtns .button{width:auto;height:auto;min-height:30px;padding:4px 10px;font-size:12.5px}
.h-avx-wave.is-drag-over,.h-mt-top.is-drag-over{outline:3px dashed #2a7de1;outline-offset:-4px}
.h-mt-tl{-webkit-user-select:none;user-select:none}
@media (max-width:700px){.h-avx-name{width:160px}}
@media (max-width:1000px){.h-avx-montage>.modal-head.h-avx-bar>*,.h-avx-montage>.modal-head.h-avx-bar .h-avx-headbtns>*{flex-shrink:0}.h-avx-montage>.modal-head.h-avx-bar .h-avx-headbtns{display:contents}
.h-avx-montage>.modal-head.h-avx-bar [data-avx-close],.h-avx-montage>.modal-head.h-avx-bar [data-full-toggle]{position:sticky;right:0;z-index:5;background:var(--card-bg,#fff)}.h-avx-montage>.modal-head.h-avx-bar [data-full-toggle]{right:34px}}`; document.head.appendChild(st); })();
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const url = f => `media/${encodeURIComponent(f)}`;
    const fmt = (sec, ms = true) => { // K17 : l'affichage commun (« 3:20 », « 1:05:00 » ; avec les dixièmes dans le montage : « 0:03,5 »)
        if (!isFinite(sec) || sec < 0) sec = 0;
        if (window.LCNDA_UI?.clock) return window.LCNDA_UI.clock(sec, {tenths: ms});
        const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        const ss = ms ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
        return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + ss;
    };
    const kindOf = m => /^(audio|video)$/.test(m?.media_type || m?.kind || '') ? (m.media_type || m.kind) : (/\.(mp4|mov|webm|m4v)$/i.test(m?.filename || '') ? 'video' : 'audio');
    let AC = null;
    const audioCtx = () => (AC && AC.state !== 'closed') ? AC : (AC = new (window.AudioContext || window.webkitAudioContext)());

    /** Grande fenêtre de travail (fermée par ✕ ou Échap, avec une question s'il reste des changements). */
    /** bar (facultatif) : la barre du haut des éditeurs (E1) — {icon, undo (HTML des ↶ ↷), exportAttrs, saveAttrs, saveTitle} :
     *  icône · nom tapable (data-avx-name) · menus · ↶ ↷ · « ✓ Enregistré » · ⚙️ Personnaliser · ⤓ Exporter ▾ · 💾 Enregistrer · ⛶ · × */
    function bigDialog({eyebrow, title, body, onClose, id = '', bar = null}) {
        const dl = document.createElement('dialog');
        dl.className = 'modal h-modal h-modal-wide h-avx';
        dl.innerHTML = bar ? `<div class="modal-head h-avx-bar"><div class="h-avx-titlebox">${bar.icon ? `<span class="ui-topbar-icon" aria-hidden="true">${esc(bar.icon)}</span>` : ''}<span class="h-avx-namebox"><span class="eyebrow">${esc(eyebrow)}</span><input class="h-avx-name" data-avx-name value="${esc(title)}" maxlength="160" aria-label="Nom du projet" title="Le nom du projet (pour le retrouver dans 📂 Projets…)"></span>${bar.undo || ''}</div>
                <span class="h-avx-headbtns"><span class="ui-status" data-ui-status></span>${id && ext.tbButton ? ext.tbButton(id) : ''}${bar.exportAttrs ? `<button type="button" class="button small secondary" ${bar.exportAttrs} title="Exporter un fichier (et, si tu veux, une copie dans les médias)">⤓ Exporter ▾</button>` : ''}${bar.saveAttrs ? `<button type="button" class="button small" ${bar.saveAttrs} data-shortcut="⌘S" title="${esc(bar.saveTitle || 'Enregistrer')}">💾 Enregistrer</button>` : ''}${id && ext.fullButton ? ext.fullButton(id) : ''}<button type="button" class="icon-button" data-avx-close aria-label="Fermer" title="Fermer">×</button></span></div><div class="h-avx-body">${body}</div>`
            : `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><span class="h-avx-headbtns">${id && ext.fullButton ? ext.fullButton(id) : ''}<button type="button" class="icon-button" data-avx-close aria-label="Fermer">×</button></span></div><div class="h-avx-body">${body}</div>`;
        if (id) ext.fullInit?.(dl, id);
        document.body.appendChild(dl);
        if (id) ext.editorKeysAttach?.(dl, id === 'video' ? 'montage' : id); // ⌨️ raccourcis à soi
        const close = async () => { if (await onClose?.() === false) return; dl.close(); };
        dl.querySelector('[data-avx-close]').addEventListener('click', close);
        dl.dataset.ownClose = '1'; // Échap : l'outil demande lui-même s'il faut (une seule question « Fermer sans enregistrer ? »)
        dl.addEventListener('cancel', e => { if (e.target !== dl) return; e.preventDefault(); close(); }); // « Annuler » du choix d'un fichier envoie aussi « cancel » : on l'ignore
        dl.addEventListener('close', () => dl.remove());
        dl.showModal();
        return dl;
    }

    /** Pendant un enregistrement rejoué en temps réel, sa fenêtre reste ouverte : Échap, × et Annuler attendent la fin
     *  (fermée trop tôt, l'enregistrement continuait en cachette et le montage, sans son aperçu, ne répondait plus) */
    const holdOpen = d => {
        if (!d) return () => {};
        const stop = e => { e.preventDefault(); toast('Enregistrement en cours : attends la fin, la fenêtre se fermera toute seule.'); };
        const xs = [...d.querySelectorAll('[data-ui-x],[data-h-close]')].filter(b => !b.disabled);
        d.addEventListener('cancel', stop); xs.forEach(b => { b.disabled = true; });
        return () => { d.removeEventListener('cancel', stop); xs.forEach(b => { b.disabled = false; }); };
    };
    /** Une question à deux réponses (comme confirmBox) : rend 'a', 'b', ou null si on ferme (×, Échap) — fermer n'applique rien */
    const choose2 = (message, {title, a, b}) => new Promise(resolve => {
        const d = document.createElement('dialog'); d.className = 'modal small-modal confirm-box-dialog'; let ans = null;
        d.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">CHOISIR</span><h2>${esc(title)}</h2></div><button class="icon-button" type="button" data-c2-x aria-label="Fermer">×</button></div>${message ? `<p class="confirm-box-text">${esc(message)}</p>` : ''}<div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-c2="b">${esc(b)}</button><button class="button" type="submit" data-c2="a">${esc(a)}</button></div></form>`;
        d.addEventListener('click', e => { const x = e.target.closest('[data-c2],[data-c2-x]'); if (!x) return; e.preventDefault(); ans = x.dataset.c2 || null; d.close(); });
        d.addEventListener('close', () => { d.remove(); resolve(ans); });
        document.body.appendChild(d); d.showModal(); d.querySelector('[data-c2="a"]').focus();
    });

    /** Choisir un son, une vidéo ou (kind 'visual') une vidéo ou une photo, ou (kind 'any') un rush : la fenêtre unique des médias
     *  (un fichier de l'ordinateur y entre dans les Médias et se coche). Résout {src, title, media, kind} — une liste si multiple — ou null. */
    async function pickOther(kind, {multiple = false, eyebrow = ''} = {}) {
        const P = window.LCNDA_PICKER; if (!P?.openMediaPicker) { toast('La fenêtre des médias n’est pas encore prête. Réessaie dans un instant.', 'error'); return null; }
        const types = kind === 'any' ? ['video', 'image', 'audio'] : kind === 'visual' ? ['video', 'image'] : [kind];
        const title = kind === 'any' ? (multiple ? 'Ajouter des rushes' : 'Ajouter un rush') : kind === 'visual' ? 'Ajouter une vidéo ou une photo' : kind === 'video' ? 'Ajouter une vidéo' : 'Ajouter un son';
        const r = await P.openMediaPicker({types, multiple, eyebrow: eyebrow || (kind === 'audio' ? 'SON' : 'MONTAGE'), title, ...(multiple ? {} : {okLabel: 'Ajouter'})});
        if (!r) return null;
        const conv = it => ({src: url(it.filename), title: it.title || it.filename, kind: it.media_type, media: {...it, kind: it.media_type, duration_seconds: it.duration, exists: true}});
        return multiple ? (Array.isArray(r) ? r : [r]).map(conv) : conv(r);
    }

    /** Envoi du résultat : nouvelle version (montrée ou non) ou copie à part. L'original reste toujours. */
    async function uploadResult(media, blob, ext0, {mode, show, duration, note, title}) {
        const fd = new FormData();
        fd.append('file', blob, 'montage.' + ext0); fd.append('media_id', media.id || 0); fd.append('mode', mode);
        if (!media.id) fd.append('kind', kindOf(media)); // montage fait de zéro : un nouveau média
        fd.append('show', show ? '1' : '0');
        if (duration) fd.append('duration', String(duration));
        if (note) fd.append('note', note);
        if (title) fd.append('title', title);
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
        const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
        return j.result;
    }
    const saveOptionsHtml = (media, formats) => `<fieldset class="h-rc-modes"><legend>Format</legend>${formats.map((f, i) => `<label class="checkbox-line"><input type="radio" name="fmt" value="${f.key}" ${i ? '' : 'checked'}> <b>${esc(f.label)}</b> <small class="muted">${esc(f.help)}</small></label>`).join('')}</fieldset>
        ${!media.id ? `<input type="hidden" name="mode" value="new"><div class="form-grid"><label>Titre ${kindOf(media) === 'video' ? 'de la vidéo' : 'du son'}<input name="title" value="${esc(media.title || '')}" maxlength="200"></label><label>Note <small class="muted">(facultatif)</small><input name="note" maxlength="120"></label></div><p class="muted" data-avx-progress></p>` : `<fieldset class="h-rc-modes"><legend>Comment le garder ?</legend>
            <label class="checkbox-line"><input type="radio" name="mode" value="show" checked> <b>Nouvelle version, montrée partout</b> <small class="muted">(l’original reste gardé : on peut y revenir)</small></label>
            <label class="checkbox-line"><input type="radio" name="mode" value="version"> Nouvelle version, <b>sans la montrer</b> pour l’instant</label>
            <label class="checkbox-line"><input type="radio" name="mode" value="copy"> <b>Une copie à part</b> (${kindOf(media) === 'video' ? 'une autre vidéo' : 'un autre son'}, rattaché${kindOf(media) === 'video' ? 'e' : ''} aux mêmes fiches) <small class="muted">: l’original ne change pas du tout</small></label></fieldset>
        <div class="form-grid"><label>Note de version <small class="muted">(facultatif)</small><input name="note" maxlength="120" placeholder="sans les blancs, voix plus nette…"></label><label data-avx-copytitle hidden>Titre de la copie<input name="title" value="${esc((media.title || '') + ' (montage)')}"></label></div>
        <p class="muted" data-avx-progress></p>`}`;

    /** Versions d'un son / d'une vidéo : écouter, montrer, supprimer (jamais l'original). */
    async function versionsHtml(media) {
        let v = [];
        if (media.id) try { v = (await A().api('media_versions', {id: media.id})).versions || []; } catch (_) {}
        if (v.length < 2) return {html: '', versions: v};
        return {versions: v, html: `<details class="h-avx-versions"><summary>🗂️ Versions (${v.length}) — l’original est toujours gardé</summary><ul>${v.map(x => `<li class="${x.shown ? 'is-shown' : ''}"><button type="button" class="button small secondary" data-avx-vplay="${esc(x.filename)}">▶</button>
            <span>${x.is_original ? '🕰️ ' : ''}${esc(x.label)}${x.shown ? ' <b>· montrée</b>' : ''}</span>
            ${x.shown ? '' : `<button type="button" class="button small secondary" data-avx-vshow="${x.id}">Montrer celle-ci</button>`}${x.is_original ? '' : `<button type="button" class="icon-button danger" data-avx-vdel="${x.id}" title="Supprimer cette version">🗑</button>`}</li>`).join('')}</ul><audio data-avx-vaudio controls hidden></audio></details>`};
    }
    function bindVersions(root, media, kind, after) {
        const player = root.querySelector('[data-avx-vaudio]');
        root.querySelectorAll('[data-avx-vplay]').forEach(b => b.addEventListener('click', () => {
            if (kind === 'video') { const w = window.open(url(b.dataset.avxVplay), '_blank'); if (!w) toast('Ouvre la vidéo depuis la liste Vidéos.', 'error'); return; }
            player.hidden = false; player.src = url(b.dataset.avxVplay); player.play().catch(() => {});
        }));
        root.querySelectorAll('[data-avx-vshow]').forEach(b => b.addEventListener('click', async () => {
            try { await A().api('retouch_show_version', {}, {method: 'POST', body: {media_id: media.id, version_id: Number(b.dataset.avxVshow)}}); toast('Version montrée partout.'); after?.(); } catch (e) { toast(e.message, 'error'); }
        }));
        root.querySelectorAll('[data-avx-vdel]').forEach(b => b.addEventListener('click', async () => {
            if (!await A().confirmBox('L’original et les autres versions restent.', {title: 'Supprimer cette version ?', okLabel: 'Supprimer la version'})) return;
            try { const r = await A().api('retouch_delete_version', {}, {method: 'POST', body: {media_id: media.id, version_id: Number(b.dataset.avxVdel)}}); if (r.error) throw new Error(r.error); toast('Version supprimée.'); after?.(); } catch (e) { toast(e.message, 'error'); }
        }));
    }

    /* ═════════════════════════ SON ═════════════════════════ */

    /* ⚙️ Le moteur son commun (heritage-audio-engine.js, chargé avant) : tampons, filtres, analyses, encodeurs, micro */
    const AE = ext.audioEngine;
    const {mkBuf, sliceBuf, concatBufs, through, resample, frameRms, percentile, peakOf, scale, gate, encodeWav, encodeAiff, encodeFlac, encodeMp3, encodeOpus, resampleBuffer, opusSupported} = AE;

    /** carry (facultatif) : le travail qui arrive du 🎚️ Studio son {buf, rack, regions, name, dirty} — le rack reste appliqué (pastille) */
    async function openAudio(media, onDone, proj = null, carry = null) {
        const ctx = audioCtx();
        let projId = proj?.id || 0, projName = proj?.name || '';
        let buf;
        const loading = toast('Ouverture du son…');
        try { if (carry?.buf) buf = carry.buf; else { const res = await fetch(media.src || url(media.filename)); if (!res.ok) throw new Error('Fichier introuvable.'); buf = await ctx.decodeAudioData(await res.arrayBuffer()); } }
        catch (e) { toast('Impossible de lire ce son : ' + e.message, 'error'); return; }
        void loading;
        const history = [], future = [];
        // 🎚️ les réglages du Studio son qui restent appliqués (non destructifs, rejoués à l'écoute et à l'enregistrement)
        let rack = AE.cleanRack(carry?.rack || proj?.data?.rack || []), rendered = null;
        const rackCache = new Map(), carryRegions = carry?.regions || proj?.data?.regions || [];
        const finalBuf = async () => rack.length ? AE.renderRack(buf, rack, {cache: rackCache}) : buf;
        let sel = null, cursor = 0, view = {start: 0, dur: buf.duration}, peaks = null, src = null, playT0 = 0, playFrom = 0, playTo = 0, raf = 0, dirty = false;
        const ver = await versionsHtml(media);
        const OPS = [
            ['cut', '✂️ Supprimer la sélection', 'sel'], ['keep', '⬚ Garder seulement la sélection', 'sel'], ['silence', '🔇 Silence', 'sel'],
            ['fadein', '↗ Fondu d’entrée', 'any'], ['fadeout', '↘ Fondu de sortie', 'any'], ['gain', '🔊 Volume…', 'any'], ['normalize', '📏 Normaliser', 'any'], ['lufs', '📢 Volume standard (LUFS)…', 'any'],
            ['denoise', '🧹 Réduire le souffle', 'any'], ['clarity', '🗣️ Voix plus nette', 'any'], ['hum', '〰️ Enlever le bourdonnement', 'any'], ['silences', '⏩ Raccourcir les longs blancs', 'all'], ['mono', '🎧 Mono', 'all'],
            ['insert', '＋ Ajouter un son…', 'all'],
        ];
        const dl = bigDialog({eyebrow: 'MODIFIER LE SON', id: 'audio', title: projName || media.title || media.filename,
            bar: {icon: '🎧', undo: '<span class="ui-topbar-hist"><button type="button" class="icon-button small" data-avx-undo disabled data-shortcut="⌘Z" title="Annuler">↶</button><button type="button" class="icon-button small" data-avx-redo disabled data-shortcut="⇧⌘Z" title="Rétablir">↷</button></span><button type="button" class="button small secondary" data-au-studio title="Le 🎚️ Studio son : effets réglables à tout moment, spectre, zones, multipiste — ton travail suit">🎚️ Studio son</button>', exportAttrs: 'data-au-export', saveAttrs: 'data-au-saveproj', saveTitle: 'Enregistrer le projet son, pour y revenir plus tard (⌘S)'}, onClose: async () => { stop(); return !dirty || await A().confirmBox('Les modifications du son seront perdues.', {title: 'Fermer sans enregistrer les modifications ?', okLabel: 'Fermer sans enregistrer', danger: true}); },
            body: `<div class="h-avx-top"><span class="h-avx-time"><b data-avx-cur>0:00.0</b> / <span data-avx-total></span></span><span class="h-avx-sel muted" data-avx-seltxt></span>
                    <span class="h-avx-zoom" data-tbg="au-zoom" data-tbg-label="Zoom"><button type="button" class="button small secondary" data-avx-zoom="fit" title="Tout voir">⤢ Tout</button><button type="button" class="button small secondary" data-avx-zoom="sel" title="Zoomer sur la sélection">🔍 Sélection</button><button type="button" class="button small secondary" data-avx-zoom="out">−</button><button type="button" class="button small secondary" data-avx-zoom="in">+</button></span></div>
                <div class="h-avx-wave"><canvas data-avx-canvas></canvas></div>
                <input type="range" class="h-avx-scroll" data-avx-scroll min="0" max="1000" value="0" aria-label="Défiler" data-ui-done="other-scale">
                <div class="h-avx-transport" data-tbg="au-transport" data-tbg-label="Lecture"><button type="button" class="button" data-avx-play data-shortcut="Espace">▶ Écouter</button><button type="button" class="button small secondary" data-avx-home title="Au début">⏮</button>
                    <span class="muted h-avx-tip" data-tb-label="Aide (glisser, Espace, molette)">Glisse sur l’onde pour sélectionner · clic = se placer · Espace = écouter · molette = défiler, Ctrl + molette = zoom</span></div>
                <div class="h-as-rackpill" data-au-rackpill hidden></div>
                <div class="h-avx-ops" data-tbg="au-ops" data-tbg-label="Outils du son">${OPS.map(([k, label, need]) => `<button type="button" class="button small secondary" data-avx-op="${k}" data-need="${need}"${k === 'cut' ? ' data-shortcut="⌫"' : ''}>${label}</button>`).join('')}</div>
                <p class="muted h-avx-help" data-avx-help>Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.</p><p class="muted h-avx-help2"><span data-help="« Réduire le souffle » : choisis d’abord un passage où l’on n’entend que le bruit, il sert d’exemple. « Voix plus nette » rend la parole plus claire. « Normaliser » monte le volume au plus fort sans saturer." data-help-faq="modifier un son">Que fait chaque outil ?</span></p>
                ${ver.html}
                <div class="modal-actions"><button type="button" class="button small secondary" data-au-projects title="Rouvrir un son en cours de travail">📂 Projets…</button><span class="h-mt-projname" data-au-projname></span><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save title="Le son fini : nouvelle version (l’original est gardé), copie, nouveau son ou fichier téléchargé">💾 Garder dans les médias…</button></div>`});
        ext.tbApply?.(dl, 'audio');
        const $ = s => dl.querySelector(s), cv = $('[data-avx-canvas]'), g = cv.getContext('2d');
        // ⚡ Son rapide, trois choix (Réglages → … → 🎧 Son) : « Comme avant » (par défaut) garde la présentation d'origine — boutons des outils
        // avec leur nom, zoom ⤢ Tout · 🔍 Sélection · − · + en haut, « Garder dans les médias… » en bas ; « Comme avant, rangé » (« harmo ») :
        // le même éditeur avec la colonne d'outils de 36 px (K19), la barre du bas commune et son zoom (K18), « 💾 Enregistrer ▾ » ; « Nouveau » : heritage-audio-quick.js.
        let harmo = false; try { harmo = localStorage.getItem('genealogie-audio-quick-design') === 'harmo'; } catch (_) {}
        const auBar = harmo ? UIx()?.editorStatus?.({help: 'Glisse sur l’onde pour choisir un passage · clic : se placer · Espace : écouter · molette : défiler, ⌘ + molette : zoomer',
            zoom: {get: () => buf.duration / view.dur, set: k => { const c = view.start + view.dur / 2; view.dur = buf.duration / k; view.start = c - view.dur / 2; clampView(); draw(); }, fit: () => { view.start = 0; view.dur = buf.duration; clampView(); draw(); }, min: 1, max: Math.max(2, buf.duration / 0.05)}}) : null;
        if (harmo) {
            const rail = document.createElement('nav'); rail.className = 'h-au-rail'; rail.setAttribute('aria-label', 'Outils du son'); dl.querySelector('.h-avx-body').prepend(rail);
            UIx()?.railProxy?.(rail, dl.querySelectorAll('.h-avx-ops [data-avx-op]'));
            UIx()?.editorRail?.(rail, {breaks: ['[data-ed-proxy="fadein"]', '[data-ed-proxy="denoise"]', '[data-ed-proxy="silences"]']}); dl.querySelector('.h-avx-ops')?.classList.add('ed-old-hidden');
            dl.querySelectorAll('[data-avx-zoom="fit"], [data-avx-zoom="out"], [data-avx-zoom="in"], .h-avx-tip, .h-avx-body > .modal-actions').forEach(el => el.classList.add('ed-old-hidden'));
            if (auBar) { dl.querySelector('.h-avx-body').appendChild(auBar); const wh = document.createDocumentFragment(); wh.append($('.h-avx-time'), ' ', $('[data-avx-seltxt]'), ' ', $('[data-au-projname]')); auBar.setWhere(wh); }
            UIx()?.saveMenu?.($('[data-au-saveproj]'), () => [{icon: '💾', label: 'Enregistrer le projet son (pour continuer plus tard)', shortcut: '⌘S', run: () => $('[data-au-saveproj]')?.click()}, {icon: '🎧', label: 'Garder dans les médias (le son fini)…', run: () => $('[data-avx-save]')?.click()}, '-', {icon: '📂', label: 'Projets…', run: () => $('[data-au-projects]')?.click()}]);
        }
        // 🎚️ Studio son : le travail suit (le son tel qu'il est, les réglages du Studio, les zones) ; au retour, la pastille dit ce qui reste appliqué
        const paintRack = () => { const el = $('[data-au-rackpill]'); if (!el) return; el.hidden = !rack.length; el.innerHTML = rack.length ? `<span>⚠️ ${esc(A().plural(rack.length, 'réglage du Studio reste appliqué', 'réglages du Studio restent appliqués'))} (${esc(rack.map(x => (AE.FX[x.type]?.label || x.type).toLowerCase()).join(', '))}).</span> <button type="button" class="link-button" data-au-studio>↗ Les voir dans le Studio</button>` : ''; };
        paintRack();
        dl.addEventListener('click', e => {
            if (!e.target.closest('[data-au-studio]')) return; stop();
            if (!ext.openAudioStudio) return toast('Le Studio son n’est pas encore prêt. Réessaie dans un instant.', 'error');
            try { localStorage.setItem('genealogie-audio-mode', 'studio'); } catch (_) {}
            const wasDirty = dirty; dirty = false; dl.close();
            ext.openAudioStudio(media, {onDone, proj: projId ? {id: projId, name: projName, source: proj?.source || media.filename || ''} : null, carry: {buf, rack, regions: carryRegions, name: ($('[data-avx-name]')?.value || '').trim(), dirty: wasDirty, from: 'classic'}});
        });
        if (carry?.dirty) dirty = true;
        bindVersions(dl, media, 'audio', () => { onDone?.(); if (dirty) return toast('Tes modifications en cours restent ouvertes ici.'); dl.close(); }); // une version montrée ou supprimée : le travail en cours n'est pas perdu
        // 💾 Projet audio : le son en cours (FLAC, sans perte) gardé à part pour y revenir ; « Enregistrer… » reste pour le son fini
        const showProj = () => { const el = $('[data-au-projname]'); if (el) el.textContent = projId ? `🎧 ${projName}` : ''; UIx().savedStatus?.(dl, dirty ? 'dirty' : projId ? 'saved' : ''); };
        let projBusy = false;
        async function saveProject(asNew = false) {
            if (projBusy) return; stop();
            let name = ($('[data-avx-name]')?.value || '').trim().slice(0, 160) || projName;
            if (asNew || !name) { const n = await A().askText({title: 'Enregistrer le projet son', message: 'Nom du projet (pour le retrouver dans « 📂 Projets… » ou Listes → Outils de modification) :', value: name || media.title || 'Mon son', okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160); if (!name) return toast('Donne un nom au projet.', 'error'); }
            projBusy = true; const btn = $('[data-au-saveproj]'), l0 = btn.textContent; btn.disabled = true; UIx().savedStatus?.(dl, 'saving');
            try {
                const blob = await encodeFlac(buf, x => { btn.textContent = `Préparation… ${Math.round(x * 100)} %`; }); btn.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                const send = async id => { const fd = new FormData(); fd.append('file', blob, 'projet.flac'); fd.append('id', String(id)); fd.append('name', name); fd.append('media_id', String(media.id || 0)); fd.append('source', proj?.source || media.filename || ''); fd.append('duration', String(buf.duration)); fd.append('data', JSON.stringify({v: 1, mode: 'classic', rack, regions: carryRegions})); fd.append('csrf', S().csrf);
                    const r = await fetch('api.php?action=save_audio_project', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); return [r, await r.json().catch(() => ({error: 'Réponse illisible du serveur'}))]; };
                let [r, j] = await send(asNew ? 0 : projId);
                if (!asNew && projId && /introuvable/i.test(j.error || '')) { [r, j] = await send(0); if (r.ok && !j.error) toast('Ce projet avait été supprimé entre-temps : il est enregistré de nouveau.'); } // supprimé ailleurs (liste, autre fenêtre)
                if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
                projId = j.result.id; projName = j.result.name; dirty = false; const ni = $('[data-avx-name]'); if (ni) ni.value = projName; showProj();
            } catch (err) { UIx().savedStatus?.(dl, 'error'); toast(err.message, 'error'); }
            finally { projBusy = false; btn.disabled = false; btn.textContent = l0; }
        }
        $('[data-au-saveproj]').addEventListener('click', () => saveProject());
        // ⤓ Exporter : un fichier son (E3, la fenêtre commune), et si on veut une copie dans les médias
        $('[data-au-export]').addEventListener('click', async () => {
            stop(); if (!UIx().openExportDialog) return $('[data-avx-save]').click();
            const mb = bps => Math.max(1, Math.round(buf.duration * bps / 1048576)), pcm = buf.sampleRate * buf.numberOfChannels * 2, nm = ($('[data-avx-name]')?.value || media.title || 'son').trim();
            const enc = async (f, onStep) => { const b = await finalBuf(); return f === 'ogg' ? encodeOpus(b, onStep) : f === 'mp3' ? encodeMp3(b, 128, onStep) : f === 'flac' ? encodeFlac(b, onStep) : f === 'aiff' ? encodeAiff(b) : encodeWav(b); };
            const run = f => async o => { const go = document.querySelector('dialog.ui-export[open] [data-ui-go]'); const blob = await enc(f, x => { if (go) go.textContent = `Compression… ${Math.round(x * 100)} %`; });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                if (o.saveCopy && f !== 'aiff') { await uploadResult(media, blob, f, {mode: 'copy', duration: buf.duration, title: `${nm} (${f.toUpperCase()})`}); toast('Fichier téléchargé, et une copie est rangée dans les médias.'); onDone?.(); } };
            const formats = [{id: 'mp3', label: '🎵 MP3', hint: `lu partout · ~${mb(16000)} Mo`, ext: 'mp3', run: run('mp3')}, {id: 'wav', label: '🎚 WAV', hint: `sans perte · ~${mb(pcm)} Mo`, ext: 'wav', run: run('wav')}, {id: 'flac', label: '🗜 FLAC', hint: `sans perte, léger · ~${mb(pcm * .55)} Mo`, ext: 'flac', run: run('flac')}];
            if (await opusSupported()) formats.push({id: 'ogg', label: '🗣 Ogg Opus', hint: `le plus léger · ~${mb(buf.numberOfChannels > 1 ? 16000 : 9000)} Mo`, ext: 'ogg', run: run('ogg')});
            formats.push({id: 'aiff', label: '🍎 AIFF', hint: 'GarageBand, Logic', ext: 'aiff', run: run('aiff')}, {id: 'base', label: '💾 Dans les médias…', hint: 'nouvelle version, copie (réglages)', ext: '', run: async () => { setTimeout(() => $('[data-avx-save]').click(), 50); }});
            await UIx().openExportDialog({title: nm, defaultName: nm, quality: false, saveCopy: true, info: `${fmt(buf.duration, false)} · ${buf.numberOfChannels > 1 ? 'stéréo' : 'mono'} · ${(buf.sampleRate / 1000).toLocaleString('fr-FR')} kHz${media.id ? ' · la copie est rattachée aux mêmes fiches' : ''}`, formats});
        });
        $('[data-avx-name]')?.addEventListener('input', () => { dirty = true; showProj(); });
        $('[data-au-projects]').addEventListener('click', () => audioProjectsDialog({current: projId, onOpen: async p => { if (dirty && !await A().confirmBox('Les modifications du son seront perdues.', {title: 'Ouvrir un autre projet sans enregistrer ce son ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; dirty = false; dl.close(); await ext.openAudioProject(p.id, onDone); }}));
        dl.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); } });
        setTimeout(showProj, 0);
        $('[data-avx-cancel]').addEventListener('click', () => dl.querySelector('[data-avx-close]').click());
        const buildPeaks = () => { const step = 256, n = Math.ceil(buf.length / step), mn = new Float32Array(n), mx = new Float32Array(n), chs = [...Array(buf.numberOfChannels).keys()].map(c => buf.getChannelData(c));
            for (let k = 0; k < n; k++) { let lo = 1, hi = -1; const i1 = Math.min(buf.length, (k + 1) * step); for (let i = k * step; i < i1; i++) { let v = 0; for (const d of chs) v += d[i]; v /= chs.length; if (v < lo) lo = v; if (v > hi) hi = v; } mn[k] = lo; mx[k] = hi; }
            peaks = {step, mn, mx}; };
        const css = n => getComputedStyle(dl).getPropertyValue(n).trim();
        function draw(playhead = null) {
            auBar?.sync();
            const dpr = window.devicePixelRatio || 1, W = cv.clientWidth * dpr, H = cv.clientHeight * dpr; if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
            g.clearRect(0, 0, W, H);
            const sr = buf.sampleRate, s0 = view.start * sr, spp = view.dur * sr / W, mid = H / 2, blue = css('--blue') || '#0066cc';
            if (sel) { const x0 = (sel.a - view.start) / view.dur * W, x1 = (sel.b - view.start) / view.dur * W; g.fillStyle = 'rgba(0,102,204,.16)'; g.fillRect(x0, 0, x1 - x0, H); }
            g.fillStyle = blue;
            for (let x = 0; x < W; x++) {
                const i0 = Math.floor(s0 + x * spp), i1 = Math.max(i0 + 1, Math.floor(s0 + (x + 1) * spp)); let lo = 1, hi = -1;
                if (spp > peaks.step * 2) { for (let k = Math.floor(i0 / peaks.step); k < Math.min(peaks.mn.length, Math.ceil(i1 / peaks.step)); k++) { if (peaks.mn[k] < lo) lo = peaks.mn[k]; if (peaks.mx[k] > hi) hi = peaks.mx[k]; } }
                else { const d = buf.getChannelData(0); for (let i = i0; i < Math.min(buf.length, i1); i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; } }
                if (hi < lo) continue;
                g.fillRect(x, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
            }
            // graduations
            g.fillStyle = css('--muted') || '#777'; g.font = `${11 * dpr}px sans-serif`;
            const stepT = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200].find(t => t / view.dur * W > 90 * dpr) || 1800;
            for (let t = Math.ceil(view.start / stepT) * stepT; t < view.start + view.dur; t += stepT) { const x = (t - view.start) / view.dur * W; g.fillRect(x, H - 6 * dpr, 1, 6 * dpr); g.fillText(fmt(t, stepT < 1), x + 3, H - 8 * dpr); }
            const mark = (t, col) => { const x = (t - view.start) / view.dur * W; if (x < 0 || x > W) return; g.fillStyle = col; g.fillRect(x - dpr / 2, 0, Math.max(1, dpr * 1.5), H); };
            mark(cursor, '#e08a00');
            if (playhead !== null) mark(playhead, '#d33');
            $('[data-avx-total]').textContent = fmt(buf.duration);
            $('[data-avx-cur]').textContent = fmt(playhead ?? cursor);
            $('[data-avx-seltxt]').textContent = sel ? `sélection ${fmt(sel.a)} → ${fmt(sel.b)} (${fmt(sel.b - sel.a)})` : 'pas de sélection';
            const sc = $('[data-avx-scroll]'); sc.disabled = view.dur >= buf.duration; sc.value = buf.duration > view.dur ? Math.round(view.start / (buf.duration - view.dur) * 1000) : 0;
            dl.querySelectorAll('[data-need=sel]').forEach(b => { b.disabled = !sel; });
            $('[data-avx-undo]').disabled = !history.length; $('[data-avx-redo]').disabled = !future.length;
        }
        const clampView = () => { view.dur = Math.max(0.05, Math.min(buf.duration, view.dur)); view.start = Math.max(0, Math.min(buf.duration - view.dur, view.start)); };
        const setBuf = (nb, keepSel = false) => { history.push({buf, sel, cursor}); if (history.length > 15) history.shift(); future.length = 0; buf = nb; dirty = true; if (!keepSel) sel = null; cursor = Math.min(cursor, buf.duration); if (view.dur > buf.duration || view.start + view.dur > buf.duration) { view.start = 0; view.dur = buf.duration; } clampView(); buildPeaks(); draw(); showProj(); };
        buildPeaks(); requestAnimationFrame(() => draw());
        // souris
        const tAt = e => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(buf.duration, view.start + (e.clientX - r.left) / r.width * view.dur)); };
        cv.addEventListener('pointerdown', e => {
            // un texte resté sélectionné dans la fenêtre faisait partir un glisser-déposer du navigateur : la sélection s'arrêtait net
            e.preventDefault(); window.getSelection()?.removeAllRanges();
            cv.setPointerCapture(e.pointerId); const t0 = tAt(e), x0 = e.clientX; let moved = false;
            const move = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) { const t1 = tAt(ev); sel = {a: Math.min(t0, t1), b: Math.max(t0, t1)}; draw(); } };
            const up = ev => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); if (!moved) { cursor = tAt(ev); sel = null; } else cursor = sel.a; if (src) play(); draw(); };
            cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        });
        cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.altKey) { const t = tAt(e), f = e.deltaY > 0 ? 1.25 : 0.8; view.start = t - (t - view.start) * f; view.dur *= f; } else view.start += (e.deltaX || e.deltaY) / 600 * view.dur; clampView(); draw(); }, {passive: false});
        $('[data-avx-scroll]').addEventListener('input', e => { view.start = Number(e.target.value) / 1000 * (buf.duration - view.dur); clampView(); draw(); });
        dl.querySelectorAll('[data-avx-zoom]').forEach(b => b.addEventListener('click', () => { const z = b.dataset.avxZoom, c = view.start + view.dur / 2;
            if (z === 'fit') { view.start = 0; view.dur = buf.duration; } if (z === 'sel' && sel) { view.start = sel.a - (sel.b - sel.a) * 0.05; view.dur = (sel.b - sel.a) * 1.1; }
            if (z === 'in') { view.dur /= 2; view.start = c - view.dur / 2; } if (z === 'out') { view.dur *= 2; view.start = c - view.dur / 2; } clampView(); draw(); }));
        // lecture
        function stop() { if (src) { try { src.onended = null; src.stop(); } catch (_) {} src = null; } cancelAnimationFrame(raf); const b = dl.querySelector('[data-avx-play]'); if (b) b.textContent = '▶ Écouter'; }
        function play() {
            if (rack.length && (!rendered || rendered.base !== buf)) { const b0 = buf; finalBuf().then(out => { rendered = {base: b0, out}; if (b0 === buf) play(); }).catch(e => toast(e.message, 'error')); return; }
            stop(); if (ctx.state === 'suspended') ctx.resume();
            playFrom = sel ? sel.a : cursor; playTo = sel ? sel.b : buf.duration; if (playTo - playFrom < 0.02) { playFrom = 0; playTo = buf.duration; }
            src = ctx.createBufferSource(); src.buffer = rack.length ? rendered.out : buf; src.connect(ctx.destination); src.start(0, Math.min(playFrom, src.buffer.duration - 0.01), Math.max(0.01, Math.min(playTo, src.buffer.duration) - playFrom)); playT0 = ctx.currentTime;
            src.onended = () => { stop(); draw(); };
            $('[data-avx-play]').textContent = '⏸ Pause';
            const tick = () => { const t = playFrom + (ctx.currentTime - playT0); if (t > view.start + view.dur && !sel) { view.start = t; clampView(); } draw(t); raf = requestAnimationFrame(tick); };
            tick();
        }
        $('[data-avx-play]').addEventListener('click', () => { if (src) { cursor = Math.min(buf.duration, playFrom + (ctx.currentTime - playT0)); stop(); draw(); } else play(); });
        $('[data-avx-home]').addEventListener('click', () => { stop(); cursor = 0; sel = null; view.start = 0; clampView(); draw(); });
        dl.addEventListener('keydown', e => { if (e.target.closest('input, textarea, select')) return; if (e.key === ' ') { e.preventDefault(); $('[data-avx-play]').click(); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('[data-avx-redo]') : $('[data-avx-undo]')).click(); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); op('cut'); } });
        $('[data-avx-undo]').addEventListener('click', () => { const h = history.pop(); if (!h) return; stop(); future.push({buf, sel, cursor}); ({buf, sel, cursor} = h); dirty = true; view = {start: 0, dur: buf.duration}; buildPeaks(); draw(); showProj(); });
        $('[data-avx-redo]').addEventListener('click', () => { const h = future.pop(); if (!h) return; stop(); history.push({buf, sel, cursor}); ({buf, sel, cursor} = h); dirty = true; view = {start: 0, dur: buf.duration}; buildPeaks(); draw(); showProj(); });
        // opérations
        const range = () => { const sr = buf.sampleRate; return sel ? [Math.floor(sel.a * sr), Math.ceil(sel.b * sr)] : [0, buf.length]; };
        /** Applique fn (async, sur un morceau) à la sélection ou à tout, et recolle. */
        async function onRange(fn) { const [i0, i1] = range(); const part = await fn(sliceBuf(buf, i0, i1)); const nb = concatBufs([sliceBuf(buf, 0, i0), part, sliceBuf(buf, i1, buf.length)].filter(b => b.length > 1 || b === part), buf.numberOfChannels, buf.sampleRate); setBuf(nb, true); if (sel) sel = {a: sel.a, b: sel.a + part.duration}; draw(); }
        async function op(k) {
            stop();
            const help = $('[data-avx-help]');
            const busy = dl.querySelectorAll('[data-avx-op]'); busy.forEach(b => { b.disabled = true; }); help.textContent = 'Calcul…';
            try {
                const sr = buf.sampleRate, ch = buf.numberOfChannels, [i0, i1] = range();
                if (k === 'cut') { setBuf(concatBufs([sliceBuf(buf, 0, i0), sliceBuf(buf, i1, buf.length)].filter(b => b.length > 1), ch, sr)); cursor = i0 / sr; }
                if (k === 'keep') { setBuf(sliceBuf(buf, i0, i1)); cursor = 0; }
                if (k === 'silence') await onRange(async p => scale(p, 0));
                if (k === 'fadein' || k === 'fadeout') await onRange(async p => { const n = sel ? p.length : Math.min(p.length, Math.round(sr * 3)); for (let c = 0; c < ch; c++) { const d = p.getChannelData(c); for (let i = 0; i < n; i++) { const t = i / n; if (k === 'fadein') d[i] *= t * t; else d[p.length - n + i] *= (1 - t) * (1 - t); } } return p; });
                if (k === 'gain') { const ans = await A().askText({title: 'Volume', message: `Monter ou baisser le volume${sel ? ' de la sélection' : ''} de combien de décibels ?\n6 = deux fois plus fort · -6 = deux fois moins fort`, value: '6', okLabel: 'Appliquer', inputMode: 'decimal'}); if (ans == null) return; const db = Number(String(ans).replace(',', '.').trim()); if (!String(ans).trim() || !isFinite(db)) { toast('Indique un nombre, par exemple 6 ou -3.', 'error'); return; } await onRange(async p => scale(p, 10 ** (db / 20))); }
                if (k === 'normalize') await onRange(async p => { const pk = peakOf(p); return pk > 0 ? scale(p, 0.89 / pk) : p; });
                if (k === 'lufs' && ext.montageLoud) { // 📢 la sonie (UIT-R BS.1770) amenée à la cible, sans dépasser −1 dB de crête
                    const ans = await A().askText({title: '📢 Volume standard', message: 'Quelle sonie viser, en LUFS ?\n−14 = internet (YouTube, réseaux) · −16 = balado, voix · −23 = télévision', value: '-16', okLabel: 'Appliquer'}); const tg = Number(String(ans ?? '').replace(',', '.').replace('−', '-'));
                    if (ans != null && isFinite(tg) && tg < 0) await onRange(async p => { const ch2 = [...Array(p.numberOfChannels)].map((_, c) => p.getChannelData(c)), m = ext.montageLoud.lufs(ch2, p.sampleRate); if (!isFinite(m.lufs)) return p;
                        const k2 = Math.min(Math.pow(10, (tg - m.lufs) / 20), m.peak > 0 ? Math.pow(10, -1 / 20) / m.peak : 1); toast(`📢 ${m.lufs.toFixed(1).replace('.', ',')} LUFS → ${(m.lufs + 20 * Math.log10(k2)).toFixed(1).replace('.', ',')} LUFS${k2 < Math.pow(10, (tg - m.lufs) / 20) ? ' (plafonné pour ne pas saturer)' : ''}.`); return scale(p, k2); }); }
                if (k === 'denoise') {
                    const how = sel ? await choose2('Un passage sans voix sert d’exemple du souffle à enlever partout.', {title: 'Prendre la sélection comme exemple de souffle ?', a: 'Oui, c’est du bruit seul', b: 'Non, nettoyer la sélection'}) : 'b'; if (!how) return; // fermé : rien ne change
                    const useSel = how === 'a';
                    let floor;
                    if (useSel) { floor = percentile(frameRms(sliceBuf(buf, i0, i1), Math.round(sr * 0.01)), 0.9); sel = null; }
                    else floor = percentile(frameRms(buf, Math.round(sr * 0.01)), 0.1);
                    await onRange(async p => gate(await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; s.connect(hp); return hp; }), floor));
                }
                if (k === 'clarity') await onRange(async p => { const out = await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; const pres = oc.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9; pres.gain.value = 4; const comp = oc.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; s.connect(hp).connect(pres).connect(comp); return comp; }); const pk = peakOf(out); return pk > 0 ? scale(out, 0.89 / pk) : out; });
                if (k === 'hum') { const hz = await choose2('Le ronflement vient du courant électrique : 50 Hz en Europe, 60 Hz en Amérique du Nord.', {title: 'Quelle fréquence de courant ?', a: '50 Hz (Europe)', b: '60 Hz (Amérique du Nord)'}); if (!hz) return; const f = hz === 'a' ? 50 : 60; await onRange(async p => through(p, (oc, s) => { let last = s; for (let h = 1; h <= 4; h++) { const n = oc.createBiquadFilter(); n.type = 'notch'; n.frequency.value = f * h; n.Q.value = 30; last.connect(n); last = n; } return last; })); }
                if (k === 'silences') {
                    const ans = await A().askText({title: 'Raccourcir les blancs', message: 'Raccourcir les blancs plus longs que combien de secondes ?', value: '1,5', okLabel: 'Raccourcir', inputMode: 'decimal'}); if (ans == null) return; const minS = Number(String(ans).replace(',', '.').trim()); if (!isFinite(minS) || minS <= 0) { toast('Indique un nombre de secondes, par exemple 1,5.', 'error'); return; }
                    const hop = Math.round(sr * 0.02), rms = frameRms(buf, hop), thr = Math.max(1e-4, percentile(rms, 0.1) * 3), keep = Math.round(0.4 * sr);
                    const parts = []; let start = 0, quietFrom = -1;
                    for (let f = 0; f <= rms.length; f++) { const quiet = f < rms.length && rms[f] < thr; if (quiet && quietFrom < 0) quietFrom = f; if (!quiet && quietFrom >= 0) { const a = quietFrom * hop, b = Math.min(buf.length, f * hop); if ((b - a) / sr > minS) { parts.push(sliceBuf(buf, start, a + keep / 2)); start = b - keep / 2; } quietFrom = -1; } }
                    if (!parts.length) { toast(`Aucun blanc de plus de ${String(minS).replace('.', ',')} s.`); return; } // rien à enlever : pas d’étape ↶ inutile
                    parts.push(sliceBuf(buf, start, buf.length));
                    const before = buf.duration; setBuf(concatBufs(parts.filter(p => p.length > 1), ch, sr));
                    toast(`${fmt(before - buf.duration)} de blancs enlevés.`);
                }
                if (k === 'mono') { if (ch === 1) { toast('Le son est déjà en mono.'); return; } setBuf(await through(buf, null, {ch: 1})); }
                if (k === 'insert') {
                    const other = await pickOther('audio'); if (!other) return;
                    const ab = await (await fetch(other.src)).arrayBuffer(), ob = await resample(await ctx.decodeAudioData(ab), sr, ch);
                    const pos = await choose2('', {title: `Où mettre « ${other.title} » ?`, a: 'À la fin', b: `Au repère orange (${fmt(cursor)})`}); if (!pos) return;
                    const where = pos === 'a' ? buf.length : Math.round(cursor * sr);
                    setBuf(concatBufs([sliceBuf(buf, 0, where), ob, sliceBuf(buf, where, buf.length)].filter(b => b.length > 1), ch, sr));
                    sel = {a: where / sr, b: where / sr + ob.duration}; draw();
                    toast('Son ajouté (il est sélectionné).');
                }
            } catch (e) { toast(e.message || String(e), 'error'); }
            finally { busy.forEach(b => { b.disabled = false; }); help.textContent = 'Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.'; draw(); }
        }
        dl.querySelectorAll('[data-avx-op]').forEach(b => b.addEventListener('click', () => op(b.dataset.avxOp)));
        // E4 : un son glissé (ou collé) sur l'onde entre dans les Médias, puis s'ajoute à la fin (il est sélectionné)
        UIx().bindFileDrop?.($('.h-avx-wave'), async files => {
            const f = files[0]; stop();
            try {
                const fd = new FormData(); fd.append('file', f, f.name); fd.append('kind', 'audio'); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('csrf', S().csrf);
                const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'envoi impossible');
                const ob = await resample(await ctx.decodeAudioData(await f.arrayBuffer()), buf.sampleRate, buf.numberOfChannels), at = buf.length;
                setBuf(concatBufs([buf, ob], buf.numberOfChannels, buf.sampleRate)); sel = {a: at / buf.sampleRate, b: buf.duration}; draw();
                toast(`« ${f.name} » est dans les Médias et ajouté à la fin (il est sélectionné).`);
            } catch (err) { toast(`${f.name} : ${err.message}`, 'error'); }
        }, {accept: 'audio/*'});
        // enregistrer
        $('[data-avx-save]').addEventListener('click', async () => {
            stop();
            const mb = bytesPerSec => Math.max(1, Math.round(buf.duration * bytesPerSec / 1048576));
            const pcm = buf.sampleRate * buf.numberOfChannels * 2;
            const formats = [
                {key: 'mp3', label: 'MP3', help: `lu absolument partout (téléphones, voitures, Mac, Windows) · environ ${mb(16000)} Mo en 128 kbit/s`},
                {key: 'wav', label: 'WAV', help: `sans perte, lu partout (Mac, Windows, Audacity) · environ ${mb(pcm)} Mo`},
                {key: 'flac', label: 'FLAC', help: `sans perte et environ deux fois plus léger que le WAV · environ ${mb(pcm * 0.55)} Mo · lu par les navigateurs, VLC, Windows ; pas par QuickTime`},
            ];
            if (await opusSupported()) formats.push({key: 'ogg', label: 'Ogg Opus', help: `le plus léger pour la voix · environ ${mb(buf.numberOfChannels > 1 ? 16000 : 9000)} Mo · QuickTime ne le lit pas`});
            formats.push({key: 'aiff', label: 'AIFF', help: `sans perte, pour GarageBand, Logic, QuickTime · environ ${mb(pcm)} Mo · à télécharger seulement (l’app ne le lit pas)`});
            const quality = `<fieldset class="h-rc-modes"><legend>Réglages</legend><div class="form-grid">
                <label data-avx-kbps>Qualité MP3 <select name="kbps"><option value="96">96 kbit/s (voix, léger)</option><option value="128" selected>128 kbit/s (bon)</option><option value="192">192 kbit/s (très bon)</option><option value="256">256 kbit/s</option><option value="320">320 kbit/s (le meilleur)</option></select></label>
                <label>Canaux <select name="channels"><option value="keep">comme l’original (${buf.numberOfChannels > 1 ? 'stéréo' : 'mono'})</option>${buf.numberOfChannels > 1 ? '<option value="1">mono (moitié moins lourd)</option>' : ''}</select></label>
                <label>Fréquence <select name="rate"><option value="keep">comme l’original (${(buf.sampleRate / 1000).toLocaleString('fr-FR')} kHz)</option>${[48000, 44100, 32000, 22050, 16000].filter(r => r !== buf.sampleRate).map(r => `<option value="${r}">${(r / 1000).toLocaleString('fr-FR')} kHz${r <= 22050 ? ' (voix, plus léger)' : ''}</option>`).join('')}</select></label>
                <label>Nom du fichier téléchargé <input name="filename" value="${esc((media.title || 'son').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'son')}"></label></div></fieldset>`;
            const body = saveOptionsHtml(media, formats).replace('<fieldset class="h-rc-modes"><legend>Comment le garder ?</legend>', quality + '<fieldset class="h-rc-modes"><legend>Comment le garder ?</legend>')
                .replace('<label class="checkbox-line"><input type="radio" name="mode" value="copy">', '<label class="checkbox-line"><input type="radio" name="mode" value="download"> <b>Seulement télécharger le fichier</b> sur l’ordinateur <small class="muted">(rien ne change dans la base)</small></label><label class="checkbox-line"><input type="radio" name="mode" value="copy">');
            ext.openDialog({eyebrow: 'ENREGISTRER LE SON', title: media.title || 'Son', wide: true, submitLabel: 'Enregistrer', body,
                onOpen: d => {
                    const sync = () => {
                        const fmtV = d.querySelector('[name=fmt]:checked')?.value, modeV = d.querySelector('[name=mode]:checked')?.value;
                        d.querySelector('[data-avx-copytitle]').hidden = modeV !== 'copy';
                        d.querySelector('[data-avx-kbps]').hidden = fmtV !== 'mp3';
                        // AIFF : seulement à télécharger
                        d.querySelectorAll('[name=mode]').forEach(r => { if (r.value !== 'download') r.disabled = fmtV === 'aiff'; });
                        if (fmtV === 'aiff' && modeV !== 'download') d.querySelector('[name=mode][value=download]').checked = true;
                        d.querySelector('.h-dialog-actions button[type=submit], button[type=submit]')?.replaceChildren(document.createTextNode(d.querySelector('[name=mode]:checked')?.value === 'download' ? 'Télécharger' : 'Enregistrer'));
                    };
                    d.querySelectorAll('[name=mode], [name=fmt]').forEach(r => r.addEventListener('change', sync)); sync();
                },
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]');
                    prog.textContent = 'Préparation du fichier…';
                    let b = await finalBuf();
                    const rate = f.rate === 'keep' ? b.sampleRate : Number(f.rate), chans = f.channels === '1' ? 1 : b.numberOfChannels;
                    if (rate !== b.sampleRate || chans !== b.numberOfChannels) { prog.textContent = 'Conversion (fréquence, canaux)…'; b = await resampleBuffer(b, rate, chans); }
                    const step = x => { prog.textContent = `Compression… ${Math.round(x * 100)} %`; };
                    const blob = f.fmt === 'ogg' ? await encodeOpus(b, step) : f.fmt === 'mp3' ? await encodeMp3(b, Number(f.kbps) || 128, step) : f.fmt === 'flac' ? await encodeFlac(b, step) : f.fmt === 'aiff' ? encodeAiff(b) : encodeWav(b);
                    const extn = {ogg: 'ogg', mp3: 'mp3', flac: 'flac', aiff: 'aiff', wav: 'wav'}[f.fmt] || 'wav';
                    if (f.mode === 'download') {
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(f.filename || 'son').trim() || 'son'}.${extn}`; document.body.appendChild(a); a.click(); a.remove();
                        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                        toast(`Fichier ${extn.toUpperCase()} téléchargé (${(blob.size / 1048576).toFixed(1)} Mo). Rien n’a changé dans la base.`);
                        return; // la fenêtre de montage reste ouverte
                    }
                    prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                    await uploadResult(media, blob, extn, {mode: f.mode === 'copy' ? 'copy' : 'version', show: f.mode === 'show', duration: b.duration, note: f.note, title: f.title});
                    toast(f.mode === 'copy' ? 'Nouveau son enregistré, rattaché aux mêmes fiches.' : f.mode === 'show' ? 'Nouvelle version montrée partout. L’original est gardé.' : 'Version enregistrée (l’ancienne reste montrée).');
                    dirty = false; dl.close(); onDone?.();
                },
            });
        });
    }

    /* ═════════════════════════ VIDÉO ═════════════════════════ */

    /** Formats d'enregistrement possibles : MP4 en H.264 (lu partout) seulement si le navigateur sait le faire. */
    const recordTypes = () => {
        const ok = t => window.MediaRecorder && MediaRecorder.isTypeSupported(t);
        const h264 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,opus', 'video/mp4;codecs=avc1'].find(ok);
        const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(ok);
        return [h264 && [h264, 'mp4', 'MP4 (H.264)', 'lu partout : Mac (QuickTime, Photos), Windows, téléphones'], webm && [webm, 'webm', 'WebM', 'léger, lu par les navigateurs et VLC, mais pas par QuickTime']].filter(Boolean);
    };
    /** Durée vraie d'un son ou d'une vidéo : un WebM enregistré par le navigateur annonce « Infinity » tant qu'on n'est pas allé au bout */
    const realDuration = el => Number.isFinite(el.duration) && el.duration > 0 ? Promise.resolve(el.duration) : new Promise((res, rej) => {
        const done = () => { if (Number.isFinite(el.duration) && el.duration > 0) { clearTimeout(tm); el.removeEventListener('durationchange', done); el.currentTime = 0; res(el.duration); } };
        const tm = setTimeout(() => { el.removeEventListener('durationchange', done); rej(new Error('Durée illisible')); }, 8000);
        el.addEventListener('durationchange', done); el.currentTime = 1e9;
    });
    const IMG_DUR = 5, IMG_MAX = 3600; // une photo : 5 s au départ, autant qu'on veut ensuite
    const loadImageMeta = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res({dur: IMG_MAX, w: im.naturalWidth, h: im.naturalHeight}); im.onerror = () => rej(new Error('Photo illisible')); im.src = src; });
    const loadMeta = src => new Promise((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => realDuration(v).then(dur => res({dur, w: v.videoWidth, h: v.videoHeight}), () => rej(new Error('Vidéo illisible (durée inconnue)'))); v.onerror = () => rej(new Error('Vidéo illisible')); v.src = src; });

    /* ═════════════════════════ 🎬 MONTAGE VIDÉO ═════════════════════════
     * Pistes : Vidéo 1 (les morceaux à la suite, avec leurs transitions), Vidéo 2 (incrustations posées à un moment),
     * Textes (titres fixes ou animés), Son 1 et Son 2 (musiques, voix, son détaché d'une vidéo).
     * Le même moteur dessine l'aperçu et l'enregistrement : une image (canvas) et un mélange de sons (Web Audio).
     */
    const TRANS = [['none', 'Coupe franche'], ['cross', 'Fondu enchaîné'], ['black', 'Fondu au noir'], ['white', 'Fondu au blanc'], ['color', 'Fondu en couleur (au choix)'],
        ['slideL', 'Glissement vers la gauche (la suivante pousse)'], ['slideR', 'Glissement vers la droite'], ['slideU', 'Glissement vers le haut'], ['slideD', 'Glissement vers le bas'],
        ['wipeL', 'Volet de gauche à droite'], ['wipeR', 'Volet de droite à gauche'], ['iris', 'Volet en cercle (iris)'], ['zoom', 'Zoom avant à travers'], ['blur', 'Fondu flou']];
    // les transitions où les deux morceaux se chevauchent (comme le fondu enchaîné) ; noir, blanc et couleur passent par un fond
    const TR_OVER = new Set(['cross', 'slideL', 'slideR', 'slideU', 'slideD', 'wipeL', 'wipeR', 'iris', 'zoom', 'blur']);
    const TR_FADE = new Set(['black', 'white', 'color']);
    /* 🎞️ Effet « vieux film » : du hasard tiré du temps (même image à l'aperçu et à l'export) */
    const hsh = (a, b = 0) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const OLD0 = {on: true, amt: 0.6, sepia: true, weave: true};
    const oldClean = v => v && typeof v === 'object' && !Array.isArray(v) && v.on ? {on: true, amt: Math.max(0.05, Math.min(1, Number(v.amt ?? 0.6) || 0.6)), sepia: v.sepia !== false, weave: v.weave !== false} : null;
    let grainTiles = null; // 6 carrés de grain (gris autour du milieu), tirés une fois pour toutes avec la même graine
    const grainTile = i => {
        if (!grainTiles) { grainTiles = Array.from({length: 6}, (_, k) => { const c = document.createElement('canvas'); c.width = c.height = 192; const x = c.getContext('2d'), im = x.createImageData(192, 192);
            for (let p = 0; p < 192 * 192; p++) { const v = 128 + (hsh(p, k + 1) + hsh(p, k + 77) - 1) * 70; im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = Math.max(0, Math.min(255, v)); im.data[p * 4 + 3] = 255; } x.putImageData(im, 0, 0); return c; }); }
        return grainTiles[i % 6];
    };
    /* 📐 Stabilisation légère : c.stab = {t0, dt, x, y (chemin de l'image, en 1/10 000 de sa largeur / hauteur), z (zoom), sm (lissage, s), off}.
     * Le chemin est lissé, l'écart entre le chemin et sa version lissée est compensé (sans dépasser ce que le zoom cache). */
    const stabCache = new WeakMap();
    function stabCorr(st) {
        const key = `${st.sm}|${st.z}`, c0 = stabCache.get(st); if (c0 && c0.key === key) return c0;
        const n = Math.min(st.x?.length || 0, st.y?.length || 0), R = Math.max(1, Math.round((Number(st.sm) || 1) / (st.dt || 0.1))), z = Math.max(1, Math.min(1.3, Number(st.z) || 1.06)), lim = (z - 1) / (2 * z) * 10000;
        const sm = arr => { const out = new Float32Array(n), pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i]; for (let i = 0; i < n; i++) { const a = Math.max(0, i - R), b = Math.min(n - 1, i + R); out[i] = (pre[b + 1] - pre[a]) / (b - a + 1); } return out; };
        const sx = sm(st.x), sy = sm(st.y), cx = new Float32Array(n), cy = new Float32Array(n);
        for (let i = 0; i < n; i++) { cx[i] = Math.max(-lim, Math.min(lim, sx[i] - st.x[i])) / 10000; cy[i] = Math.max(-lim, Math.min(lim, sy[i] - st.y[i])) / 10000; }
        const r = {key, cx, cy, n, z}; stabCache.set(st, r); return r;
    }
    /** Décalage de la stabilisation à un moment de la source : {x, y (en part de l'image), z} ou null */
    function stabAt(c, local) {
        const st = c.stab; if (!st || st.off || !st.x?.length) return null;
        const r = stabCorr(st), u = Math.max(0, Math.min(r.n - 1, (local - st.t0) / (st.dt || 0.1))), i = Math.floor(u), f = u - i, j = Math.min(r.n - 1, i + 1);
        return {x: r.cx[i] + (r.cx[j] - r.cx[i]) * f, y: r.cy[i] + (r.cy[j] - r.cy[i]) * f, z: r.z};
    }
    const stabClean = v => { if (!v || typeof v !== 'object' || !Array.isArray(v.x) || !Array.isArray(v.y)) return null; const n = Math.min(v.x.length, v.y.length, 20000), num = a => a.slice(0, n).map(x => Math.round(Number(x) || 0));
        return {t0: Number(v.t0) || 0, dt: Math.max(0.02, Math.min(2, Number(v.dt) || 0.1)), x: num(v.x), y: num(v.y), z: Math.max(1, Math.min(1.3, Number(v.z) || 1.06)), sm: Math.max(0.2, Math.min(5, Number(v.sm) || 1)), ...(v.off ? {off: true} : {})}; };
    /* Mouvements d'un texte : une entrée, un mouvement pendant qu'il est à l'écran, une sortie ; durée de l'entrée et de la sortie réglables */
    const ANIMS = [['none', 'Fixe (pas de mouvement)'], ['fade', 'Apparaît en fondu'], ['slide', 'Glisse depuis la gauche'], ['slideR', 'Glisse depuis la droite'], ['drop', 'Descend depuis le haut'], ['rise', 'Monte depuis le bas'],
        ['zoom', 'Grandit'], ['shrink', 'Arrive de loin (rapetisse)'], ['pop', 'Surgit avec un rebond'], ['bounce', 'Tombe et rebondit'], ['spin', 'Arrive en tournant'], ['blur', 'Sort du flou'], ['wipe', 'Se dévoile de gauche à droite'],
        ['spacing', 'Lettres qui se resserrent'], ['flicker', 'S’allume en clignotant (néon)'], ['type', 'Machine à écrire'], ['words', 'Mot par mot']];
    const ANIMS_OUT = [['none', 'Aucune (disparaît d’un coup)'], ['fade', 'Disparaît en fondu'], ['slide', 'Part vers la gauche'], ['slideR', 'Part vers la droite'], ['drop', 'Monte et sort par le haut'], ['rise', 'Descend et sort par le bas'],
        ['zoom', 'Rapetisse'], ['shrink', 'Grossit en s’effaçant'], ['pop', 'Rebondit puis disparaît'], ['spin', 'Part en tournant'], ['blur', 'Devient flou'], ['wipe', 'S’efface de gauche à droite'], ['spacing', 'Lettres qui s’écartent'],
        ['flicker', 'S’éteint en clignotant'], ['type', 'S’efface lettre par lettre'], ['words', 'S’efface mot par mot']];
    const ANIMS_LOOP = [['', 'Rien'], ['pulse', 'Bat doucement'], ['float', 'Flotte'], ['sway', 'Se balance'], ['slowzoom', 'Grossit lentement'], ['ticker', 'Défile de droite à gauche (bandeau)'], ['scroll', 'Défile vers le haut (générique)']];
    const LOOKS = [['Aucun', {}], ['Couleurs vives', {sat: 1.35, contrast: 1.08}], ['Plus chaud', {warm: 0.35}], ['Plus froid', {warm: -0.35}], ['Ancien film', {sat: 0.55, warm: 0.45, contrast: 0.92}],
        ['Noir et blanc', {sat: 0}], ['Contrasté', {contrast: 1.3, bright: 0.97}], ['Doux', {contrast: 0.88, bright: 1.05, sat: 0.9}]];
    const LOOK0 = {bright: 1, contrast: 1, sat: 1, hue: 0, warm: 0, cw: null}; // cw : les roues de couleur (heritage-montage-plus.js)
    /* Transformer, recadrer, déformer (comme l'inspecteur de Final Cut) : valeurs fixes (c.tf) ou images clés (c.kf, temps de la source) */
    const TF0 = {px: 0, py: 0, rot: 0, scale: 100, sx: 100, sy: 100, ax: 0, ay: 0, opacity: 100, cl: 0, cr: 0, ct: 0, cb: 0, kx: 0, ky: 0};
    const TF_SECTION = {px: 'tfOn', py: 'tfOn', rot: 'tfOn', scale: 'tfOn', sx: 'tfOn', sy: 'tfOn', ax: 'tfOn', ay: 'tfOn', cl: 'cropOn', cr: 'cropOn', ct: 'cropOn', cb: 'cropOn', kx: 'distOn', ky: 'distOn'};
    const BLENDS = [['source-over', 'Normal'], ['multiply', 'Produit'], ['screen', 'Superposition claire (écran)'], ['overlay', 'Incrustation'], ['darken', 'Obscurcir'], ['lighten', 'Éclaircir'], ['difference', 'Différence'], ['luminosity', 'Luminosité']];
    const FITS = [['fit', 'Adapter (toute l’image, bandes noires)'], ['fill', 'Remplir (recadre pour remplir)'], ['none', 'Aucune (taille d’origine)']];
    /** Valeur d'un réglage à un moment (temps de la source) : entre deux images clés, de l'une à l'autre (douce ou régulière) */
    function tfAt(c, k, local) {
        if (TF_SECTION[k] && c[TF_SECTION[k]] === false) return TF0[k];
        const list = c.kf?.[k];
        if (list?.length) {
            if (local <= list[0].t) return list[0].v;
            if (local >= list.at(-1).t) return list.at(-1).v;
            for (let i = 1; i < list.length; i++) { const a = list[i - 1], b = list[i]; if (local <= b.t) { const u = (local - a.t) / Math.max(1e-6, b.t - a.t), e = c.ease === 'linear' ? u : u * u * (3 - 2 * u); return a.v + (b.v - a.v) * e; } }
        }
        const v = Number(c.tf?.[k]); return Number.isFinite(v) ? v : TF0[k];
    }
    const dimsOf = el => ({vw: el?.videoWidth || el?.naturalWidth || 0, vh: el?.videoHeight || el?.naturalHeight || 0});
    const FONTS_V = [['Georgia, serif', 'Georgia'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['"Times New Roman", serif', 'Times'], ['"Courier New", monospace', 'Courier'], ['"Brush Script MT", cursive', 'Manuscrite'], ['Impact, sans-serif', 'Impact']];
    let uid = 0; const nid = p => p + (++uid) + Date.now().toString(36).slice(-3);
    /* Réglages du montage (Réglages → Montage, retouche, mise en page et son) : disposition et enregistrement par défaut */
    const MT_KEY = 'genealogie-montage-prefs';
    const MT_SIZES = [[0, 'Comme la vidéo'], [2160, '4K (2160 p)'], [1080, 'Full HD (1080 p)'], [720, 'HD (720 p)'], [480, '480 p'], [360, '360 p (léger)']];
    const MT_QUALITY = [[2, 'Légère (petit fichier)'], [5, 'Normale'], [8, 'Haute'], [14, 'Très haute (gros fichier)']];
    const MT_FPS = [24, 25, 30, 50, 60];
    const MT_COLORS = [['colV1', '🎬 Vidéo principale (Vidéo 1)', '#cfe0ff'], ['colV2', '🖼️ Vidéos incrustées', '#e3d4ff'], ['colT', '🔤 Textes', '#ffe7a8'], ['colA', '🎵 Sons', '#c9f0d4']];
    const MT_SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4, 10];
    /** « 0,5 ; 1 ; 2× » → [0.5, 1, 2] : de 0,1 à 10, sans doublons, 12 au plus, dans l'ordre */
    const parseSpeeds = v => { const list = (Array.isArray(v) ? v : String(v ?? '').split(/[;\s/|]+/)).map(x => Number(String(x).replace(/,$/, '').replace(',', '.').replace(/[×x]/gi, ''))).filter(x => Number.isFinite(x) && x >= 0.1 && x <= 10).map(x => Math.round(x * 100) / 100); const u = [...new Set(list)]; return u.length ? u.sort((a, b) => a - b).slice(0, 12) : null; };
    const speedsText = l => l.map(x => String(x).replace('.', ',')).join(' ; ');
    const MT_DEF = {side: 'right', sideW: 440, stage: 50, lane: 40, help: true, snap: true, fmt: 'mp4', height: 0, quality: 5, fps: 30, abr: 128, lufs: 0, speeds: MT_SPEEDS, ...Object.fromEntries(MT_COLORS.map(c => [c[0], c[2]]))};
    // texte lisible (noir ou blanc) sur la couleur choisie
    const inkOn = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#111'; const n = parseInt(m[1], 16), l = 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return l > 150 ? '#111' : '#fff'; };
    function montagePrefs() {
        let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {}
        return montagePrefsFrom(v);
    }
    function montagePrefsFrom(v) {
        const pick = (x, list, d) => list.includes(x) ? x : d, num = (x, a, b, d) => Number.isFinite(Number(x)) ? Math.min(b, Math.max(a, Number(x))) : d;
        return {side: pick(v.side, ['right', 'left'], 'right'), sideW: num(v.sideW, 300, 820, 440), stage: num(v.stage, 25, 80, 50), lane: num(v.lane, 28, 70, 40), help: v.help !== false, snap: v.snap !== false, fmt: pick(v.fmt, ['mp4', 'webm'], 'mp4'),
            height: pick(Number(v.height), MT_SIZES.map(x => x[0]), 0), quality: pick(Number(v.quality), MT_QUALITY.map(x => x[0]), 5), fps: pick(Number(v.fps), MT_FPS, 30), abr: pick(Number(v.abr), [96, 128, 192, 256], 128), lufs: pick(Number(v.lufs), [0, -14, -16, -23], 0), speeds: parseSpeeds(v.speeds) || MT_SPEEDS,
            ...Object.fromEntries(MT_COLORS.map(([k, , d]) => [k, /^#[0-9a-f]{6}$/i.test(v[k] || '') ? v[k] : d]))};
    }
    ext.montagePrefs = montagePrefs; ext.montagePrefsDefaults = {MT_KEY, MT_SIZES, MT_QUALITY, MT_FPS, MT_DEF};

    // les pistes, de haut en bas : vidéos incrustées (au-dessus = devant), la vidéo principale, les textes, les sons
    const TRACK_KINDS = {v: ['🎬', 'Vidéo'], main: ['🎬', 'Vidéo 1'], t: ['🔤', 'Textes'], a: ['🎵', 'Son']};
    function montageModel(sources) {
        return {sources, folders: [], v1: [], v2: [], texts: [], audio: [], look: {...LOOK0}, fx: {volume: 1, clarity: false, noise: false, mute: false, rotate: 0},
            tracks: [{id: 'V2', kind: 'v', name: 'Vidéo 2'}, {id: 'V1', kind: 'main', name: 'Vidéo 1'}, {id: 'T1', kind: 't', name: 'Textes 1'}, {id: 'A1', kind: 'a', name: 'Son 1'}, {id: 'A2', kind: 'a', name: 'Son 2'}]};
    }
    /** Un projet enregistré, remis en état (ce qui manque reprend sa valeur de départ ; les rushes doivent être des médias de la base) */
    function projectModel(d) {
        const P = montageModel([]), arr = v => Array.isArray(v) ? v : [];
        P.sources = arr(d?.sources).filter(x => x && /^media\//.test(String(x.src || '')) && ['video', 'image', 'audio'].includes(x.kind)).map(x => ({src: String(x.src), title: String(x.title || '').slice(0, 200), kind: x.kind, dur: Number(x.dur) || (x.kind === 'image' ? IMG_MAX : 1), w: Number(x.w) || 0, h: Number(x.h) || 0, ...(x.mediaId ? {mediaId: Number(x.mediaId)} : {}), ...(typeof x.folder === 'string' && x.folder ? {folder: x.folder.slice(0, 16)} : {})}));
        // les dossiers des rushes (et leurs sous-dossiers) ; un parent inconnu ou une boucle ramène le dossier à la racine
        P.folders = arr(d?.folders).filter(f => f && typeof f.id === 'string' && f.id).slice(0, 300).map(f => ({id: f.id.slice(0, 16), name: String(f.name || 'Dossier').slice(0, 80), ...(typeof f.parent === 'string' && f.parent ? {parent: f.parent.slice(0, 16)} : {})}));
        const fIds = new Set(P.folders.map(f => f.id));
        P.folders.forEach(f => { if (f.parent && !fIds.has(f.parent)) delete f.parent; const seen = new Set([f.id]); for (let q = f.parent; q; q = P.folders.find(g => g.id === q)?.parent) { if (seen.has(q)) { delete f.parent; break; } seen.add(q); } });
        P.sources.forEach(x => { if (x.folder && !fIds.has(x.folder)) delete x.folder; });
        const okS = c => c && Number.isInteger(c.s) && c.s >= 0 && c.s < P.sources.length;
        P.v1 = arr(d?.v1).filter(okS); P.v2 = arr(d?.v2).filter(okS); P.audio = arr(d?.audio).filter(okS); P.texts = arr(d?.texts).filter(x => x && typeof x.text === 'string');
        // look, tf, kf, fx, afx d'un morceau : toujours des objets (un ancien enregistrement les rendait en [] : couleurs perdues)
        const objOf = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
        [...P.v1, ...P.v2, ...P.audio, ...P.texts].forEach(c => ['look', 'tf', 'kf', 'fx', 'afx'].forEach(k => { if (k in c) c[k] = objOf(c[k]); }));
        // vieux film, stabilisation (vidéos), temps de la musique (sons) : remis en état, ou enlevés s'ils sont illisibles
        [...P.v1, ...P.v2].forEach(c => { const o = oldClean(c.old); if (o) c.old = o; else delete c.old; const s = stabClean(c.stab); if (s) c.stab = s; else delete c.stab; });
        P.audio.forEach(a => { if (Array.isArray(a.beats)) { a.beats = a.beats.map(Number).filter(Number.isFinite).slice(0, 20000); if (Number(a.bpm) > 0) a.bpm = Math.round(Number(a.bpm) * 10) / 10; else delete a.bpm; } else { delete a.beats; delete a.bpm; } });
        if (arr(d?.tracks).length) P.tracks = arr(d.tracks).filter(t => t && typeof t.id === 'string' && ['v', 'main', 't', 'a'].includes(t.kind)).map(t => ({id: t.id.slice(0, 12), kind: t.kind, name: String(t.name || '').slice(0, 60), ...(t.hidden ? {hidden: true} : {}), ...(t.locked ? {locked: true} : {})}));
        if (!P.tracks.some(t => t.kind === 'main')) P.tracks.splice(1, 0, {id: 'V1', kind: 'main', name: 'Vidéo 1'});
        if (d?.look && typeof d.look === 'object' && !Array.isArray(d.look)) P.look = {...P.look, ...d.look};
        if (d?.fx && typeof d.fx === 'object' && !Array.isArray(d.fx)) P.fx = {...P.fx, ...d.fx};
        P.fadeStart = !!d?.fadeStart; P.fadeEnd = !!d?.fadeEnd;
        if (ASPECTS.some(a => a[0] === d?.aspect)) P.aspect = d.aspect;
        P.blurBars = !!d?.blurBars; P.kbAuto = !!d?.kbAuto;
        const old = oldClean(d?.old); if (old) P.old = old;
        if (d?.duck && typeof d.duck === 'object') P.duck = {on: d.duck.on !== false, amount: Math.max(0, Math.min(1, Number(d.duck.amount ?? 0.3))), video: !!d.duck.video};
        P.chapters = arr(d?.chapters).filter(c => c && Number.isFinite(Number(c.t))).map(c => ({id: String(c.id || nid('c')).slice(0, 20), t: Math.max(0, Number(c.t)), title: String(c.title || '').slice(0, 120)}));
        return P;
    }
    const KIND_OF_LIST = {v2: 'v', texts: 't', audio: 'a'};
    /** Formats d'image du film : comme la vidéo, écran large, téléphone (vertical), carré, portrait des réseaux */
    const ASPECTS = [['', 'Comme la 1re vidéo'], ['16:9', '🖥️ Écran 16:9'], ['9:16', '📱 Téléphone 9:16 (vertical)'], ['1:1', '⬛ Carré 1:1'], ['4:5', '🖼️ Portrait 4:5 (réseaux)'], ['4:3', '📺 Ancien écran 4:3']];
    const aspectDims = a => { const [w, h] = String(a).split(':').map(Number); if (!w || !h) return null; const k = 1080 / Math.min(w, h); return [Math.round(w * k) & ~1, Math.round(h * k) & ~1]; };
    /** Ken Burns : un zoom ou un glissement lent sur une photo, du début à la fin de son passage */
    const KB = [['', 'Aucun'], ['auto', '🎲 Automatique (varié)'], ['in', '🔍 Zoom avant'], ['out', '🔎 Zoom arrière'], ['left', '⬅️ Glisse vers la gauche'], ['right', '➡️ Glisse vers la droite'], ['up', '⬆️ Monte'], ['down', '⬇️ Descend']];
    function kbAt(c, P, local) {
        let m = c.kb ?? (P.kbAuto ? 'auto' : ''); if (!m) return null;
        if (m === 'auto') { const h = [...String(c.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); m = ['in', 'out', 'left', 'right', 'in', 'up'][h % 6]; }
        const u = Math.max(0, Math.min(1, (local - (c.from || 0)) / Math.max(0.1, (c.to || 1) - (c.from || 0)))), e = u * u * (3 - 2 * u) * 0.35 + u * 0.65, z = 0.14;
        if (m === 'in') return {s: 1 + z * e, x: 0, y: 0}; if (m === 'out') return {s: 1 + z * (1 - e), x: 0, y: 0};
        const d = (e - 0.5) * 0.09; return {s: 1 + z * 0.8, x: m === 'left' ? -d : m === 'right' ? d : 0, y: m === 'up' ? -d : m === 'down' ? d : 0};
    }
    /** La piste d'un élément (une ancienne piste « 1 / 2 » des sons devient A1 / A2) */
    const trackOf = (P, c, list) => { const k = KIND_OF_LIST[list]; if (typeof c.track === 'number') c.track = 'A' + c.track; if (c.track && P.tracks.some(t => t.id === c.track && t.kind === k)) return c.track; return P.tracks.find(t => t.kind === k)?.id || ''; };
    const trackIdx = (P, id) => P.tracks.findIndex(t => t.id === id);
    const trackHidden = (P, id) => !!P.tracks.find(t => t.id === id)?.hidden;
    /* ♿ Accessibilité « Sous-titres toujours affichés » : à la lecture (pas à l'export), la piste « Sous-titres » se voit même cachée */
    const subsAlwaysOn = () => document.documentElement.classList.contains('a11y-subs');
    const isSubText = (P, x) => !!x.sub || /^sous-titres/i.test(P.tracks.find(t => t.id === trackOf(P, x, 'texts'))?.name || '');
    /** Moments de chaque morceau de la piste 1 (un fondu enchaîné fait se chevaucher deux morceaux) */
    function layoutV1(P) {
        let t = 0; return P.v1.map((c, k) => { const len = Math.max(0.05, clen(c)), d = k && TR_OVER.has(c.tr?.type) ? Math.min(c.tr.d || 1, len / 2, clen(P.v1[k - 1]) / 2) : 0; const at = Math.max(0, t - d); t = at + len; return {c, at, end: at + len, cross: d}; });
    }
    /** Vitesse d'un morceau (0,1 × à 10 ×) et sa durée sur la frise : un morceau accéléré dure moins longtemps */
    const spd = c => Math.max(0.1, Math.min(10, Number(c?.speed) || 1)); // de 0,1 × (ralenti) à 10 × (accéléré)
    const clen = c => (c.to - c.from) / spd(c);
    const montageEnd = P => Math.max(0.1, layoutV1(P).at(-1)?.end || 0, ...P.v2.map(c => c.at + clen(c)), ...P.texts.map(x => x.at + x.dur), ...P.audio.map(a => a.at + clen(a)));
    const lookFilter = (a, b = LOOK0) => `brightness(${(a.bright ?? 1) * (b.bright ?? 1)}) contrast(${(a.contrast ?? 1) * (b.contrast ?? 1)}) saturate(${(a.sat ?? 1) * (b.sat ?? 1)}) hue-rotate(${(a.hue || 0) + (b.hue || 0)}deg)`;

    /**
     * Le moteur : des <video>/<audio> cachés (un par morceau), une image et un mélange. play()/pause()/seek(t) ;
     * out : 'preview' (haut-parleurs) ou 'record' (flux pour l'enregistrement).
     */
    /** La case d'une incrustation sur l'image : tout l'écran (c.full : adaptée ou remplie) ou sa case (largeur et position en %) */
    function v2Box(c, vw, vh, W, H) {
        if (c.full) { const k = c.fit === 'fill' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh), w = vw * k, h = vh * k; return {x: (W - w) / 2, y: (H - h) / 2, w, h}; }
        const w = (c.w || 35) / 100 * W; return {x: (c.x ?? 62) / 100 * W, y: (c.y ?? 6) / 100 * H, w, h: w * vh / vw};
    }
    function montageEngine(P, canvas, {out = 'preview', onTime} = {}) {
        const g = canvas.getContext('2d');
        const ctx = out === 'record' ? new AudioContext() : audioCtx();
        const master = ctx.createGain();
        const fx = P.fx;
        /** Les traitements du son (comme dans « Modifier le son ») : souffle, voix, graves, aigus, mono ; pour tout le film ou un morceau */
        const chain = (from, f) => AE.liveChain(ctx, from, f); // le moteur commun : les mêmes réglages que « Modifier le son »
        const tail = chain(master, fx);
        const outGain = ctx.createGain(); outGain.gain.value = fx.mute ? 0 : fx.volume; tail.connect(outGain);
        const dest = out === 'record' ? ctx.createMediaStreamDestination() : null; outGain.connect(dest || ctx.destination);
        const els = new Map(); // id du morceau → {el, gain}
        const elFor = (id, src, isAudio, isImage = false, afx = null) => {
            let e = els.get(id); if (e && e.src === src) return e;
            if (e) { if (!e.img) e.el.pause(); e.el.removeAttribute('src'); }
            if (isImage) { const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async'; im.src = src; e = {el: im, gain: null, src, img: true}; els.set(id, e); return e; }
            const el = document.createElement(isAudio ? 'audio' : 'video'); el.preload = 'auto'; el.playsInline = true; el.crossOrigin = 'anonymous'; el.src = src; el.muted = false;
            const node = ctx.createMediaElementSource(el), gain = ctx.createGain(); gain.gain.value = 0; chain(node, afx).connect(gain).connect(master);
            e = {el, gain, src}; els.set(id, e); return e;
        };
        let t = 0, playing = false, t0 = 0, p0 = 0, raf = 0, W = canvas.width, H = canvas.height;
        // ce qui joue au moment t
        function active(tt) {
            const L = layoutV1(P), list = [];
            const mainOff = P.tracks.some(t => t.kind === 'main' && t.hidden); // la piste principale cachée : ni vue ni entendue
            L.forEach((x, k) => { if (!mainOff && tt >= x.at && tt < x.end) list.push({kind: 'v1', x, k, local: x.c.from + (tt - x.at) * spd(x.c)}); });
            P.v2.forEach(c => { if (tt >= c.at && tt < c.at + clen(c) && !trackHidden(P, trackOf(P, c, 'v2'))) list.push({kind: 'v2', c, local: c.from + (tt - c.at) * spd(c)}); });
            P.audio.forEach(a => { if (tt >= a.at && tt < a.at + clen(a) && !trackHidden(P, trackOf(P, a, 'audio'))) list.push({kind: 'a', c: a, local: a.from + (tt - a.at) * spd(a)}); });
            return {L, list};
        }
        let duckLvl = 1;
        function sync(tt, hard = false) {
            const {list} = active(tt), keep = new Set();
            // la musique baisse toute seule pendant une voix (sons marqués « voix », et si on veut le son des vidéos)
            const D0 = P.duck || {on: true, amount: 0.3}, voice = D0.on !== false && list.some(it => (it.kind === 'a' && it.c.voice && (it.c.vol ?? 1) > 0) || (D0.video && it.kind === 'v1' && !it.x.c.mute && !P.sources[it.x.c.s]?.kind?.startsWith('image') && (it.x.c.vol ?? 1) > 0));
            const want = voice ? Math.max(0, Math.min(1, D0.amount ?? 0.3)) : 1; duckLvl = hard ? want : duckLvl + (want - duckLvl) * 0.12;
            for (const it of list) {
                const c = it.kind === 'v1' ? it.x.c : it.c, so = P.sources[c.s]; if (!so) continue;
                const e = elFor(c.id, so.src, it.kind === 'a', so.kind === 'image', c.afx); keep.add(c.id);
                if (e.img) continue; // une image : rien à caler ni à jouer
                const rate = spd(c); if (e.el.playbackRate !== rate) e.el.playbackRate = rate; if (e.el.preservesPitch !== (c.pitch !== false)) e.el.preservesPitch = c.pitch !== false;
                // hard : caler exactement (mais sans relancer une recherche si on y est déjà : c'est ce qui rendait ▶ lent)
                const drift = Math.abs(e.el.currentTime - it.local);
                if ((hard && drift > 0.04) || drift > 0.35) { try { e.el.currentTime = it.local; } catch (_) {} }
                // volume (fondus du son, morceau muet ou son détaché)
                let v = it.kind === 'a' ? (c.vol ?? 1) : (c.mute ? 0 : (c.vol ?? 1));
                if (it.kind === 'a') { const len = clen(c), x = tt - c.at; if (c.fadeIn && x < c.fadeIn) v *= x / c.fadeIn; if (c.fadeOut && len - x < c.fadeOut) v *= Math.max(0, (len - x) / c.fadeOut); }
                if (it.kind === 'v1' && it.x.cross && tt < it.x.at + it.x.cross) v *= (tt - it.x.at) / it.x.cross; // le son suit le fondu enchaîné
                if (it.kind === 'a' && !c.voice) v *= duckLvl;
                e.gain.gain.value = Math.max(0, v);
                if (playing && e.el.paused) e.el.play().catch(() => {}); if (!playing && !e.el.paused) e.el.pause();
            }
            els.forEach((e, id) => { if (!keep.has(id) && !e.img) { e.gain.gain.value = 0; if (!e.el.paused) e.el.pause(); } });
            return keep;
        }
        /** Une vidéo ou une image : dans tout l'écran (piste principale) ou dans sa case (incrustation), transformée, recadrée, déformée */
        /** Le vieux film d'un morceau : le sien, sinon celui de tout le film */
        const oldOf = c => oldClean(c?.old) || oldClean(P.old);
        let oldT = 0; // le moment dessiné (le vieux film en dépend)
        /** tx : l'état d'un morceau pendant une transition (décalage, zoom, découpe, flou) */
        function drawClip(el, c, local, alpha, main, tx = null) {
            const {vw, vh} = dimsOf(el); if (!vw || alpha <= 0) return;
            const v = k => tfAt(c, k, local), op = v('opacity') / 100; if (op <= 0) return;
            const of = oldOf(c), f = Math.floor(oldT * 24);
            // vieux film : sépia, scintillement (la lumière bouge d'une image à l'autre), un peu de tremblement de l'image
            const extra = `${of ? `${of.sepia ? ` sepia(${Math.min(1, 0.35 + of.amt * 0.65).toFixed(2)})` : ''} brightness(${(1 + (hsh(f, 5) - 0.5) * 0.16 * of.amt).toFixed(3)})` : ''}${tx?.blur > 0.3 ? ` blur(${tx.blur.toFixed(1)}px)` : ''}`;
            g.save();
            if (tx?.clip) { g.beginPath(); tx.clip(g); g.clip(); }
            if (tx?.dx || tx?.dy) g.translate(tx.dx || 0, tx.dy || 0);
            if (tx?.s && tx.s !== 1) { g.translate(W / 2, H / 2); g.scale(tx.s, tx.s); g.translate(-W / 2, -H / 2); }
            if (of?.weave) { const u = Math.max(W, H) / 1280, k2 = Math.floor(oldT * 6); g.translate((Math.sin(oldT * 2.1) * 0.6 + (hsh(f, 7) - 0.5) * 0.8) * u * 2.2 * of.amt, (Math.sin(oldT * 1.3 + 1) * 0.5 + (hsh(k2, 8) - 0.5) * 1.6) * u * 2.6 * of.amt); }
            g.globalAlpha = Math.max(0, Math.min(1, alpha * op)); g.filter = lookFilter(c.look || {}, P.look) + extra; g.globalCompositeOperation = BLENDS.some(b => b[0] === c.blend) ? c.blend : 'source-over';
            let w, h;
            if (main) {
                const turn = fx.rotate % 180 !== 0, bw = turn ? H : W, bh = turn ? W : H;
                const ref = P.sources[P.v1[0]?.s], k = c.fit === 'fill' ? Math.max(bw / vw, bh / vh) : c.fit === 'none' ? Math.min(bw / (ref?.w || vw), bh / (ref?.h || vh)) : Math.min(bw / vw, bh / vh);
                if (P.blurBars && (c.fit || 'fit') === 'fit' && Math.abs(vw / vh - bw / bh) > 0.02) { // bandes floues : la même image, agrandie et floutée, derrière
                    const kc = Math.max(bw / vw, bh / vh); g.save(); g.filter = `${lookFilter(c.look || {}, P.look)}${extra} blur(${Math.round(Math.max(W, H) / 60)}px) brightness(0.72)`;
                    g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180); g.drawImage(el, -vw * kc / 2 * 1.08, -vh * kc / 2 * 1.08, vw * kc * 1.08, vh * kc * 1.08); g.restore(); }
                w = vw * k; h = vh * k; g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180);
            } else {
                const b = v2Box(c, vw, vh, W, H); w = b.w; h = b.h; g.translate(b.x + w / 2, b.y + h / 2);
            }
            const ax = v('ax') / 100 * W, ay = v('ay') / 100 * H, sc = v('scale') / 100;
            g.translate(v('px') / 100 * W + ax, v('py') / 100 * H + ay); g.rotate(v('rot') * Math.PI / 180); g.scale(sc * v('sx') / 100, sc * v('sy') / 100);
            const kx = v('kx'), ky = v('ky'); if (kx || ky) g.transform(1, Math.tan(ky * Math.PI / 180), Math.tan(kx * Math.PI / 180), 1, 0, 0);
            g.translate(-ax, -ay);
            if (P.sources[c.s]?.kind === 'image') { const kb = kbAt(c, P, local); if (kb) { g.translate(kb.x * w, kb.y * h); g.scale(kb.s, kb.s); } }
            else { const st = stabAt(c, local); if (st) { g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip(); g.translate(st.x * w * st.z, st.y * h * st.z); g.scale(st.z, st.z); } } // stabilisée : un peu agrandie, les bords restent dans sa case
            const cl = Math.max(0, Math.min(95, v('cl'))) / 100, cr = Math.max(0, Math.min(95, v('cr'))) / 100, ct = Math.max(0, Math.min(95, v('ct'))) / 100, cb = Math.max(0, Math.min(95, v('cb'))) / 100;
            const fw = 1 - cl - cr, fh = 1 - ct - cb;
            if (fw > 0.01 && fh > 0.01) {
                const dx = -w / 2 + w * cl, dy = -h / 2 + h * ct;
                g.drawImage(el, vw * cl, vh * ct, vw * fw, vh * fh, dx, dy, w * fw, h * fh);
                if (!main && c.border !== false) { g.filter = 'none'; g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, W / 400) / Math.max(0.1, Math.abs(sc)); g.strokeRect(dx, dy, w * fw, h * fh); }
            }
            g.restore();
        }
        // la place d'un morceau pendant une transition (découpe, ou image décalée) : les voiles (chaleur, vieux film) y restent
        const region = tx => { if (tx?.clip) { g.beginPath(); tx.clip(g); g.clip(); } else if (tx?.dx || tx?.dy) { g.beginPath(); g.rect(tx.dx || 0, tx.dy || 0, W, H); g.clip(); } };
        function warmth(look, tx = null) {
            const w = (look?.warm || 0) + (P.look.warm || 0); if (!w) return;
            g.save(); region(tx); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = Math.min(0.8, Math.abs(w)) * (tx?.alpha ?? 1); g.fillStyle = w > 0 ? '#ff9a3c' : '#3c8bff'; g.fillRect(0, 0, W, H); g.restore();
        }
        /** Le voile du vieux film : vignette, grain qui bouge, rayures verticales, poussières (tiré du temps : même image à l'export) */
        function oldFilm(o, tt, tx = null) {
            const a = o.amt, f = Math.floor(tt * 24), u = Math.max(W, H) / 1280;
            g.save(); region(tx); g.globalAlpha = tx?.alpha ?? 1; const ga = g.globalAlpha;
            const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,10,0,${(0.7 * a).toFixed(2)})`);
            g.fillStyle = vg; g.fillRect(0, 0, W, H);
            const pat = g.createPattern(grainTile(f), 'repeat'); g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = ga * Math.min(1, 0.15 + a * 0.45);
            g.translate(-hsh(f, 1) * 192, -hsh(f, 2) * 192); g.scale(Math.max(1, u), Math.max(1, u)); g.fillStyle = pat; g.fillRect(0, 0, W / Math.max(1, u) + 400, H / Math.max(1, u) + 400); g.restore();
            for (let i = 0; i < 4; i++) { // rayures : chacune vit quelques images, puis une autre la remplace ailleurs
                const life = 5 + i * 4, b = Math.floor(f / life); if (hsh(i + 10, b) > 0.2 + 0.55 * a) continue;
                const x = hsh(i + 20, b) * W + Math.sin(f * 0.9 + i) * 2 * u, y0 = hsh(i + 60, b) * H * 0.4, y1 = H - hsh(i + 70, b) * H * 0.4, light = hsh(i + 40, b) > 0.45;
                g.strokeStyle = light ? `rgba(255,250,232,${(0.25 + 0.4 * hsh(f, i + 30)).toFixed(2)})` : `rgba(25,15,5,${(0.3 + 0.4 * hsh(f, i + 30)).toFixed(2)})`; g.lineWidth = (0.6 + hsh(i + 50, b) * 1.6) * u;
                g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (hsh(i + 80, b) - 0.5) * 6 * u, (y0 + y1) / 2, x + (hsh(i + 90, b) - 0.5) * 4 * u, y1); g.stroke();
            }
            const nd = Math.round(a * 7 * hsh(f, 99)); // poussières et petits cheveux, d'une image à l'autre
            for (let j = 0; j < nd; j++) {
                const x = hsh(f, 100 + j) * W, y = hsh(f, 200 + j) * H, r = (0.7 + hsh(f, 300 + j) * 2.6) * u, dark = hsh(f, 400 + j) > 0.3;
                g.fillStyle = g.strokeStyle = dark ? 'rgba(20,12,4,.75)' : 'rgba(255,252,240,.7)';
                if (hsh(f, 500 + j) > 0.8) { g.lineWidth = 0.8 * u; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 8 * u, y - 6 * u, x + 4 * u, y + 10 * u, x + 14 * u * hsh(f, 600 + j), y + 12 * u); g.stroke(); }
                else { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
            }
            g.restore();
        }
        /** L'état d'un morceau pendant une transition : p de 0 à 1, entrant (le suivant) ou sortant (celui d'avant) */
        function trFx(type, p, incoming) {
            const e = p * p * (3 - 2 * p), r = 1 - e;
            switch (type) {
                case 'cross': return incoming ? {alpha: p} : null;
                case 'slideL': return {dx: incoming ? r * W : -e * W};
                case 'slideR': return {dx: incoming ? -r * W : e * W};
                case 'slideU': return {dy: incoming ? r * H : -e * H};
                case 'slideD': return {dy: incoming ? -r * H : e * H};
                case 'wipeL': return incoming ? {clip: x => x.rect(0, 0, e * W, H)} : null;
                case 'wipeR': return incoming ? {clip: x => x.rect(W - e * W, 0, e * W, H)} : null;
                case 'iris': return incoming ? {clip: x => x.arc(W / 2, H / 2, Math.max(0.5, e * Math.hypot(W, H) / 2), 0, Math.PI * 2)} : null;
                case 'zoom': return incoming ? {alpha: Math.max(0, Math.min(1, (p - 0.25) / 0.5)), s: 1 + 0.6 * r, blur: Math.sin(Math.PI * p) * Math.max(W, H) / 220} : {s: 1 + 1.6 * e, blur: Math.sin(Math.PI * p) * Math.max(W, H) / 220};
                case 'blur': return incoming ? {alpha: p, blur: r * Math.max(W, H) / 70} : {blur: e * Math.max(W, H) / 70};
                default: return incoming ? {alpha: p} : null;
            }
        }
        const clamp01 = v => Math.max(0, Math.min(1, v));
        const easeOut = p => 1 - (1 - p) ** 3;
        const easeBack = p => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; };
        const easeBounce = p => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375; return n * (p -= 2.625 / d) * p + .984375; };
        /** Un mouvement d'entrée (ou de sortie, à l'envers) : p va de 0 (pas encore là) à 1 (en place) */
        function textFx(st, kind, p, out, size, local) {
            if (!kind || kind === 'none' || p >= 1) return;
            const e = easeOut(p), r = 1 - e;
            if (kind === 'fade') st.alpha *= e;
            else if (kind === 'slide') st.dx -= r * W * 0.6;
            else if (kind === 'slideR') st.dx += r * W * 0.6;
            else if (kind === 'drop') st.dy -= (out ? r : 1 - easeOut(p)) * H * 0.45;
            else if (kind === 'rise') st.dy += r * H * 0.4;
            else if (kind === 'zoom') { st.scale *= 0.6 + 0.4 * e; if (out) st.alpha *= e; }
            else if (kind === 'shrink') { st.scale *= 1 + r * 1.2; st.alpha *= e; }
            else if (kind === 'pop') { st.scale *= Math.max(0, easeBack(p)); st.alpha *= clamp01(p * 3); }
            else if (kind === 'bounce') { st.dy -= (1 - easeBounce(p)) * H * 0.45; }
            else if (kind === 'spin') { st.rot += r * Math.PI * (out ? 1 : -1); st.scale *= 0.4 + 0.6 * e; st.alpha *= e; }
            else if (kind === 'blur') { st.blur += r * size * 0.6; st.alpha *= clamp01(e * 1.3); }
            else if (kind === 'wipe') st.reveal = Math.min(st.reveal, e);
            else if (kind === 'spacing') { st.spacing += r * size * 0.9; st.alpha *= e; }
            else if (kind === 'flicker') { const k = Math.floor(local * 18), n = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1; st.alpha *= n < p ? 1 : 0.12; }
            else if (kind === 'type') st.chars = Math.min(st.chars, p);
            else if (kind === 'words') st.words = Math.min(st.words, p);
        }
        function drawText(x, tt) {
            const local = tt - x.at, d = x.dur, size = Math.round((x.size || 6) / 100 * Math.min(H, W)), lines = String(x.text || '').split('\n');
            const enter = x.anim === 'scroll' ? 'none' : (x.anim || 'none'), loop = x.loop || (x.anim === 'scroll' ? 'scroll' : ''), leave = x.animOut || 'none';
            // durée de l'entrée et de la sortie : réglée, sinon comme avant (un tiers du texte, 0,8 s au plus ; la machine à écrire, plus lente)
            const inD = Number(x.animDur) > 0 ? Math.min(d, Number(x.animDur)) : enter === 'type' || enter === 'words' ? Math.max(0.5, d * 0.6) : Math.min(0.8, d / 3);
            const outD = Number(x.animOutDur) > 0 ? Math.min(d, Number(x.animOutDur)) : Math.min(0.8, d / 3);
            const st = {alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, reveal: 1, spacing: 0, chars: 1, words: 1};
            if (x.fade !== false) { if (local < 0.4) st.alpha = local / 0.4; if (d - local < 0.4) st.alpha = Math.min(st.alpha, (d - local) / 0.4); }
            textFx(st, enter, clamp01(local / inD), false, size, local);
            textFx(st, leave, clamp01((d - local) / outD), true, size, d - local);
            g.save(); g.font = `${x.bold ? '700 ' : ''}${size}px ${x.font || 'Georgia, serif'}`; g.textAlign = x.align || 'center'; g.textBaseline = 'middle';
            const lh = size * 1.25, tw = Math.max(1, ...lines.map(l => g.measureText(l).width));
            if (loop === 'scroll') st.dy += H * 0.55 - (local / d) * (H * 1.1 + lines.length * size * 1.3);
            else if (loop === 'ticker') st.dx += (W / 2 + tw / 2) - (local / d) * (W + tw) - ((x.x ?? 50) / 100 * W - W / 2);
            else if (loop === 'pulse') st.scale *= 1 + 0.05 * Math.sin(local * Math.PI * 2 / 1.2);
            else if (loop === 'float') st.dy += Math.sin(local * Math.PI * 2 / 3) * H * 0.015;
            else if (loop === 'sway') st.rot += Math.sin(local * Math.PI * 2 / 2.5) * 0.05;
            else if (loop === 'slowzoom') st.scale *= 1 + 0.15 * clamp01(local / d);
            let shown = lines.join('\n');
            if (st.chars < 1) shown = shown.slice(0, Math.floor(shown.length * st.chars));
            if (st.words < 1) { const parts = shown.split(/(\s+)/), n = Math.ceil(parts.filter(w => /\S/.test(w)).length * st.words); let seen = 0; shown = parts.filter(w => { if (/\S/.test(w)) seen++; return seen <= n; }).join('').replace(/\s+$/, ''); }
            g.globalAlpha = clamp01(st.alpha);
            if (st.blur > 0.3) g.filter = `blur(${Math.round(st.blur)}px)`;
            if (st.spacing > 0.3 && 'letterSpacing' in g) g.letterSpacing = `${Math.round(st.spacing)}px`;
            const cx = (x.x ?? 50) / 100 * W + st.dx, cy = (x.y ?? 80) / 100 * H + st.dy;
            g.translate(cx, cy); if (st.rot) g.rotate(st.rot); g.scale(st.scale, st.scale);
            const sl = shown.split('\n'), top = -(lines.length - 1) * lh / 2;
            const bw = tw + size, x0 = x.align === 'left' ? -size / 2 : x.align === 'right' ? -bw + size / 2 : -bw / 2;
            if (st.reveal < 1) { g.beginPath(); g.rect(x0, top - lh, bw * st.reveal, lines.length * lh + lh * 2); g.clip(); }
            if (x.bg) { const w = Math.max(...sl.map(l => g.measureText(l).width)) + size, h = sl.length * lh + size * 0.4, bx = x.align === 'left' ? -size / 2 : x.align === 'right' ? -w + size / 2 : -w / 2; g.fillStyle = x.bg; g.globalAlpha *= 0.75; g.fillRect(bx, top - lh / 2 - size * 0.2, w, h); g.globalAlpha /= 0.75; }
            sl.forEach((l, i) => { if (x.shadow !== false) { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = size / 6; g.shadowOffsetY = size / 14; } g.fillStyle = x.color || '#ffffff'; g.fillText(l, 0, top + i * lh); });
            g.restore();
        }
        function paint(tt) {
            W = canvas.width; H = canvas.height; oldT = tt;
            g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore();
            const {L, list} = active(tt), filmOld = oldClean(P.old);
            const clipOld = (c, tx) => { const o = oldClean(c.old); if (o && !filmOld) oldFilm(o, tt, tx); }; // le vieux film d'un seul morceau, sur sa place
            // pistes vidéo dans l'ordre de la frise : celle du bas d'abord, celle du haut devant (la piste « Vidéo 1 » aussi : une incrustation placée sous elle passe derrière)
            const mainI = P.tracks.findIndex(tr => tr.kind === 'main');
            const drawV2 = it => {
                const e = els.get(it.c.id); if (!dimsOf(e?.el).vw) return; const c = it.c, local = tt - c.at, len = clen(c);
                let a = (c.opacity ?? 100) / 100; if (c.fade !== false) { if (local < 0.5) a *= local / 0.5; if (len - local < 0.5) a *= (len - local) / 0.5; }
                drawClip(e.el, c, it.local, Math.max(0, a), false);
                if (oldClean(c.old) && !filmOld) { const b = v2Box(c, dimsOf(e.el).vw, dimsOf(e.el).vh, W, H); oldFilm(oldClean(c.old), tt, {alpha: Math.max(0, Math.min(1, a)), clip: x => x.rect(b.x, b.y, b.w, b.h)}); }
            };
            const v2s = list.filter(i => i.kind === 'v2').sort((a, b) => trackIdx(P, trackOf(P, b.c, 'v2')) - trackIdx(P, trackOf(P, a.c, 'v2')));
            v2s.filter(it => trackIdx(P, trackOf(P, it.c, 'v2')) > mainI).forEach(drawV2);
            // piste 1, avec ses transitions : le morceau d'avant (sortant) dessous, le suivant (entrant) dessus
            list.filter(i => i.kind === 'v1').sort((a, b) => a.k - b.k).forEach(it => {
                const e = els.get(it.x.c.id); if (!e) return; const nx = L[it.k + 1];
                let tx = null;
                if (it.x.cross && tt < it.x.at + it.x.cross) tx = trFx(it.x.c.tr?.type, (tt - it.x.at) / it.x.cross, true);
                else if (nx?.cross && tt >= nx.at) tx = trFx(nx.c.tr?.type, (tt - nx.at) / nx.cross, false);
                drawClip(e.el, it.x.c, it.local, tx?.alpha ?? 1, true, tx); warmth(it.x.c.look, tx); ext.montageWheels?.paint(g, W, H, it.x.c.look, P.look, tx ? () => region(tx) : null, tx?.alpha ?? 1); clipOld(it.x.c, tx);
            });
            // fondus au noir, au blanc ou à une couleur : fin du morceau d'avant, puis début du suivant
            L.forEach((x, k) => {
                const tr = x.c.tr; if (!k || !tr || !TR_FADE.has(tr.type)) return; const h = Math.min(tr.d || 1, 4) / 2;
                const prevEnd = L[k - 1].end; let a = 0;
                if (tt >= prevEnd - h && tt < prevEnd) a = 1 - (prevEnd - tt) / h; else if (tt >= x.at && tt < x.at + h) a = 1 - (tt - x.at) / h;
                if (a > 0) { g.save(); g.globalAlpha = a; g.fillStyle = tr.type === 'white' ? '#fff' : tr.type === 'color' ? (/^#[0-9a-f]{6}$/i.test(tr.color || '') ? tr.color : '#7a4b22') : '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            });
            // fondu d'ouverture et de fin du film
            const T = montageEnd(P);
            if (P.fadeStart && tt < 1) { g.save(); g.globalAlpha = 1 - tt; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            if (P.fadeEnd && T - tt < 1) { g.save(); g.globalAlpha = 1 - (T - tt); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            v2s.filter(it => trackIdx(P, trackOf(P, it.c, 'v2')) <= mainI).forEach(drawV2);
            if (filmOld && (list.some(i => i.kind === 'v1' || i.kind === 'v2'))) oldFilm(filmOld, tt); // vieux film sur tout le film (les titres restent nets, par-dessus)
            P.texts.filter(x => tt >= x.at && tt < x.at + x.dur && (!trackHidden(P, trackOf(P, x, 'texts')) || (out === 'preview' && subsAlwaysOn() && isSubText(P, x)))).sort((a, b) => trackIdx(P, trackOf(P, b, 'texts')) - trackIdx(P, trackOf(P, a, 'texts'))).forEach(x => drawText(x, tt));
            if (out === 'preview' && api.decorate) { g.save(); api.decorate(g, W, H, tt); g.restore(); } // cadre de l'élément choisi (aperçu seulement)
        }
        const loop = () => {
            if (!playing) return;
            t = t0 + (performance.now() - p0) / 1000;
            const T = montageEnd(P);
            if (t >= T) { t = T; paint(t); api.pause(); onTime?.(t, true); return; }
            sync(t); paint(t); onTime?.(t); raf = requestAnimationFrame(loop);
        };
        // n'attendre que les morceaux qui jouent à cet instant (pas tous ceux du montage)
        const only = ids => ids ? [...els].filter(([id]) => ids.has(id)).map(([, e]) => e) : [...els.values()];
        // « loadeddata » ne vient qu'une fois : après un déplacement, on attend « canplay » ou « seeked » (sinon on attendait 4 s pour rien)
        const ready = ids => Promise.all(only(ids).map(e => e.img ? (e.el.complete ? 0 : new Promise(r => { e.el.addEventListener('load', r, {once: true}); e.el.addEventListener('error', r, {once: true}); setTimeout(r, 4000); }))
            : e.el.readyState >= 2 ? 0 : new Promise(r => { const ev = ['loadeddata', 'canplay', 'seeked', 'error'], f = () => { ev.forEach(k => e.el.removeEventListener(k, f)); r(); }; ev.forEach(k => e.el.addEventListener(k, f)); setTimeout(f, 3000); })));
        const seeked = ids => Promise.all(only(ids).map(e => e.el.seeking ? new Promise(r => { e.el.addEventListener('seeked', r, {once: true}); setTimeout(r, 2500); }) : 0));
        let startTok = 0;
        const api = {
            get t() { return t; }, get playing() { return playing; }, ctx, stream: dest?.stream,
            async seek(tt) { t = Math.max(0, Math.min(montageEnd(P), tt)); const was = playing; if (was) api.pause(); sync(t, true); await ready(); await seeked(); paint(t); onTime?.(t); if (was) api.play(); },
            get starting() { return !!startTok; },
            async play() {
                if (playing || startTok) return; const tok = startTok = Date.now();
                if (ctx.state === 'suspended') { if (out === 'record') await ctx.resume(); else ctx.resume().catch(() => {}); } // à l'aperçu, sans attendre : le son suit dès que le navigateur l'a rouvert
                if (t >= montageEnd(P) - 0.05) t = 0;
                const ids = sync(t, true); await ready(ids); await seeked(ids);
                if (startTok !== tok) return; startTok = 0; // ⏸ pendant le démarrage
                playing = true; t0 = t; p0 = performance.now(); sync(t); raf = requestAnimationFrame(loop);
            },
            pause() { startTok = 0; playing = false; cancelAnimationFrame(raf); els.forEach(e => { if (!e.img) e.el.pause(); }); },
            redraw() { paint(t); },
            /** 📢 le niveau de sortie (volume standard à l'export) : k fois le volume du film, avec un limiteur à −1 dB */
            setLevel(k) { outGain.gain.value = (fx.mute ? 0 : fx.volume) * k; if (k <= 1 || !dest) return; const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1; outGain.disconnect(); outGain.connect(lim).connect(dest); },
            decorate: null,
            videoSize(id) { const d = dimsOf(els.get(id)?.el); return d.vw ? d : null; },
            async refresh() { sync(t); await ready(); paint(t); },
            destroy() { api.pause(); els.forEach(e => { e.el.removeAttribute('src'); if (!e.img) { try { e.el.load(); } catch (_) {} } }); els.clear(); if (out === 'record') ctx.close(); else { try { master.disconnect(); outGain.disconnect(); } catch (_) {} } },
        };
        return api;
    }

    /** 📢 Le niveau qui amène le mélange à la sonie visée (LUFS ; 0 = ne rien changer), mesuré hors ligne avant l'enregistrement */
    async function levelFor(P, target, say) {
        if (!Number(target) || !ext.montageLoud) return 1;
        const m = await ext.montageLoud.gainFor(P, Number(target), {onStep: p => say?.(`📢 Mesure du volume… ${Math.round(p * 100)} %`)}); if (!isFinite(m.lufs)) return 1;
        toast(`📢 Volume mesuré : ${m.lufs.toFixed(1).replace('.', ',')} LUFS → ${m.after.toFixed(1).replace('.', ',')} LUFS${m.limited ? ' (crêtes tenues par le limiteur)' : ''}.`); return m.gain;
    }
    /** Enregistre le montage (en temps réel) : l'image du moteur et son mélange de sons. */
    async function recordMontage(P, mime, onStep, {height = 0, quality = 5, fps = 30, abr = 128, level = 1} = {}) {
        const first = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s] || {w: 1280, h: 720}, turn = P.fx.rotate % 180 !== 0, ad = aspectDims(P.aspect);
        const W0 = first.w || 1280, H0 = first.h || 720, Wn = ad ? ad[0] : turn ? H0 : W0, Hn = ad ? ad[1] : turn ? W0 : H0;
        // taille choisie (en lignes : 1080 p, 720 p… ; pour un format choisi, le petit côté) ou celle de la vidéo (2 000 px au plus)
        const sc = height ? height / (ad ? Math.min(Wn, Hn) : Hn) : Math.min(1, 2000 / Math.max(Wn, Hn));
        const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.round(Wn * sc) & ~1); cv.height = Math.max(2, Math.round(Hn * sc) & ~1);
        const T = montageEnd(P);
        let finished; const done = new Promise(r => { finished = r; });
        const eng = montageEngine(P, cv, {out: 'record', onTime: (t, end) => { onStep?.(t / T); if (end) finished(); }}); if (level !== 1) eng.setLevel(level);
        const stream = new MediaStream([...cv.captureStream(fps).getVideoTracks(), ...eng.stream.getAudioTracks()]);
        // qualité : en Mb/s pour une image Full HD, ajustée à la taille choisie
        const vbr = Math.round(quality * 1e6 * Math.max(0.2, cv.width * cv.height / (1920 * 1080)));
        const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: vbr, audioBitsPerSecond: abr * 1000});
        const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        await eng.seek(0);
        rec.start(1000); await eng.play();
        await done;
        const blob = await new Promise(r => { rec.onstop = () => r(new Blob(chunks, {type: mime.split(';')[0]})); rec.stop(); });
        eng.destroy();
        return blob;
    }

    /** Le son seul du montage (musiques, voix, son des vidéos, avec leurs réglages), rejoué en temps réel puis encodé en MP3 ou WAV */
    async function recordMontageAudio(P, onStep, level = 1) {
        const T = montageEnd(P), cv = document.createElement('canvas'); cv.width = 2; cv.height = 2;
        let finished; const done = new Promise(r => { finished = r; });
        const eng = montageEngine(P, cv, {out: 'record', onTime: (t, end) => { onStep?.(t / T); if (end) finished(); }}); if (level !== 1) eng.setLevel(level);
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => window.MediaRecorder?.isTypeSupported?.(m));
        if (!mime) { eng.destroy(); throw new Error('ce navigateur ne sait pas enregistrer le son'); }
        const rec = new MediaRecorder(new MediaStream(eng.stream.getAudioTracks()), {mimeType: mime, audioBitsPerSecond: 256000});
        const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        await eng.seek(0); rec.start(1000); await eng.play(); await done;
        const blob = await new Promise(r => { rec.onstop = () => r(new Blob(chunks, {type: mime.split(';')[0]})); rec.stop(); });
        eng.destroy();
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        try { return await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close(); }
    }

    /* 📐 Stabilisation : de quoi l'image a bougé d'une image à la suivante (déplacement d'ensemble, en pixels de l'image réduite) */
    function shiftOf(a, b, w, h, R = 16) {
        const m = R + 1; let best = Infinity, bx = 0, by = 0; const sad = new Float64Array((2 * R + 1) * (2 * R + 1));
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { // b(x) ≈ a(x − d) : on cherche d
            let s = 0; for (let y = m; y < h - m; y += 2) { const ro = y * w, rp = (y - dy) * w - dx; for (let x = m; x < w - m; x += 2) s += Math.abs(b[ro + x] - a[rp + x]); }
            sad[(dy + R) * (2 * R + 1) + dx + R] = s; if (s < best) { best = s; bx = dx; by = dy; }
        }
        // un peu plus fin qu'un pixel : le creux d'une parabole autour du meilleur décalage
        const at = (dx, dy) => sad[(dy + R) * (2 * R + 1) + dx + R], para = (l, c, r) => { const d = l - 2 * c + r; return d > 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * d))) : 0; };
        const fx = Math.abs(bx) < R ? para(at(bx - 1, by), best, at(bx + 1, by)) : 0, fy = Math.abs(by) < R ? para(at(bx, by - 1), best, at(bx, by + 1)) : 0;
        return [bx + fx, by + fy];
    }
    /** Analyse un morceau de vidéo (de from à to, temps de la source) : le chemin de l'image, échantillonné, pour c.stab */
    async function analyzeStab(src, from, to, {onStep, cancelled} = {}) {
        const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous'; v.src = src;
        try {
            await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('vidéo illisible')); setTimeout(() => rej(new Error('vidéo trop longue à charger')), 20000); });
            const AW = 160, AH = Math.max(24, Math.round(AW * (v.videoHeight || 9) / (v.videoWidth || 16))), cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
            const x = cv.getContext('2d', {willReadFrequently: true}), len = Math.max(0.1, to - from), dt = Math.max(0.1, Math.round(len / 1500 * 100) / 100), n = Math.floor(len / dt) + 1;
            // après « seeked », attendre que la nouvelle image soit vraiment prête (sinon on lit parfois l'ancienne)
            const seek = t => new Promise(r => { let ok = false; const fin = () => { if (!ok) { ok = true; clearTimeout(tm); r(); } }, tm = setTimeout(fin, 3000);
                if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fin()); else v.addEventListener('seeked', fin, {once: true});
                v.addEventListener('seeked', () => setTimeout(fin, 250), {once: true}); v.currentTime = t; });
            const gray = () => { x.drawImage(v, 0, 0, AW, AH); const d = x.getImageData(0, 0, AW, AH).data, out = new Float32Array(AW * AH); let s = 0; for (let i = 0; i < out.length; i++) { out[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; s += out[i]; } s /= out.length; for (let i = 0; i < out.length; i++) out[i] -= s; return out; }; // sans la luminosité moyenne (un scintillement ne compte pas)
            let prev = null, cx = 0, cy = 0; const px = [], py = [];
            for (let i = 0; i < n; i++) {
                if (cancelled?.()) return null;
                await seek(Math.min(to - 0.02, from + i * dt)); const cur = gray();
                if (prev) { const [dx, dy] = shiftOf(prev, cur, AW, AH); cx += dx; cy += dy; }
                px.push(Math.round(cx / AW * 10000)); py.push(Math.round(cy / AH * 10000)); prev = cur; onStep?.((i + 1) / n);
            }
            return {t0: from, dt, x: px, y: py, z: 1.06, sm: 1};
        } finally { v.removeAttribute('src'); try { v.load(); } catch (_) {} }
    }
    /* 🥁 Les temps d'une musique : flux spectral (les attaques), tempo par autocorrélation, puis les temps par programmation dynamique */
    const fftMag = (re, im) => AE.fft(re, im); // FFT en place (moteur commun)
    /** Les temps d'un son (samples mono, sr) : {beats (s), bpm} */
    async function beatsOf(x, sr, onStep) {
        const N = 512, hop = 128, nf = Math.max(0, Math.floor((x.length - N) / hop)), win = Float32Array.from({length: N}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        const re = new Float32Array(N), im = new Float32Array(N), last = new Float32Array(N / 2), on = new Float32Array(nf);
        for (let f = 0; f < nf; f++) {
            for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * win[i]; im[i] = 0; } fftMag(re, im);
            let s = 0; for (let k = 1; k < N / 2; k++) { const m = Math.log1p(100 * Math.hypot(re[k], im[k])), d = m - last[k]; if (d > 0) s += d; last[k] = m; }
            on[f] = f ? s : 0; if (f % 3000 === 2999) { onStep?.(f / nf * 0.8); await new Promise(r => setTimeout(r, 0)); }
        }
        const fr = sr / hop; // images de l'enveloppe par seconde
        // enveloppe des attaques : moins sa moyenne locale, sans le négatif, ramenée à un écart type de 1
        const W2 = Math.round(fr * 0.15), o = new Float32Array(nf); let pre = 0; const cs = new Float64Array(nf + 1); for (let i = 0; i < nf; i++) cs[i + 1] = cs[i] + on[i];
        for (let i = 0; i < nf; i++) { const a = Math.max(0, i - W2), b = Math.min(nf - 1, i + W2); o[i] = Math.max(0, on[i] - (cs[b + 1] - cs[a]) / (b - a + 1)); pre += o[i] * o[i]; }
        const sd = Math.sqrt(pre / Math.max(1, nf)) || 1; for (let i = 0; i < nf; i++) o[i] /= sd;
        // tempo : autocorrélation entre 50 et 220 battements par minute, avec une préférence douce autour de 120
        const lmin = Math.floor(fr * 60 / 220), lmax = Math.min(nf - 1, Math.ceil(fr * 60 / 50)), l0 = fr * 60 / 120, ac = new Float32Array(lmax + 2);
        let bl = 0, bv = -Infinity;
        for (let l = lmin; l <= lmax; l++) { let s = 0; for (let i = l; i < nf; i++) s += o[i] * o[i - l]; ac[l] = s / (nf - l); const v = ac[l] * Math.exp(-0.5 * (Math.log2(l / l0) / 1.0) ** 2); if (v > bv) { bv = v; bl = l; } }
        if (!bl || nf < 4 * bl) return {beats: [], bpm: 0};
        const pd = bl > lmin && bl < lmax ? (() => { const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1], d = a - 2 * b + c; return d < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0; })() : 0;
        const L = bl + pd, tight = 100, score = new Float32Array(nf), back = new Int32Array(nf).fill(-1);
        for (let i = 0; i < nf; i++) {
            let best = 0, bj = -1; for (let j = Math.max(0, i - Math.round(2 * L)); j <= i - Math.round(L / 2); j++) { const v = score[j] - tight * Math.log((i - j) / L) ** 2; if (bj < 0 || v > best) { best = v; bj = j; } }
            score[i] = o[i] + (bj >= 0 ? Math.max(0, best) : 0); back[i] = bj >= 0 && best > 0 ? bj : -1;
        }
        let i = Math.max(0, nf - Math.round(L)); for (let j = i; j < nf; j++) if (score[j] > score[i]) i = j; // le dernier temps : le meilleur de la dernière mesure
        const out = []; for (; i >= 0; i = back[i]) out.unshift(i);
        onStep?.(1);
        return {beats: out.map(f => (f * hop + N / 2) / sr), bpm: Math.round(60 * fr / L * 10) / 10};
    }
    /** Décode le son d'un fichier (de from à to) et repère ses temps (temps de la source) */
    async function detectBeats(src, from, to, onStep) {
        const r = await fetch(src); if (!r.ok) throw new Error('son introuvable');
        const ac = new OfflineAudioContext(1, 2, 11025), ab = await ac.decodeAudioData(await r.arrayBuffer()), sr = ab.sampleRate;
        const a = Math.max(0, Math.floor(from * sr)), b = Math.min(ab.length, Math.ceil(Math.min(to, from + 600) * sr)), x = new Float32Array(Math.max(0, b - a));
        for (let ch = 0; ch < ab.numberOfChannels; ch++) { const d = ab.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] += d[a + i] / ab.numberOfChannels; }
        const res = await beatsOf(x, sr, onStep);
        return {beats: res.beats.map(t => Math.round((t + from) * 1000) / 1000), bpm: res.bpm};
    }
    ext._montage = {TRANS, shiftOf, analyzeStab, beatsOf, detectBeats, stabAt, layoutV1, projectModel, recordMontage}; // pour les tests

    async function openVideo(media, onDone, start = null, proj = null) {
        const sources = [];
        if (!proj && (media.id || media.src)) {
            let meta; try { meta = await loadMeta(media.src || url(media.filename)); } catch (e) { toast(e.message, 'error'); return; }
            sources.push({src: media.src || url(media.filename), title: media.title || 'Vidéo', kind: 'video', ...meta});
        }
        const P = proj ? projectModel(proj.project) : montageModel(sources);
        let projId = proj?.id || 0, projName = proj?.name || '';
        if (!proj && sources.length) P.v1.push({id: nid('v'), s: 0, from: 0, to: sources[0].dur, tr: {type: 'none', d: 1}, look: {}, vol: 1});
        let sel = P.v1[0] ? {track: 'v1', id: P.v1[0].id} : null, dirty = false, pxs = 40; // pixels par seconde sur la frise
        const OFF = 150; // largeur des noms de pistes, à gauche de la frise
        // une piste libre de ce genre à ce moment-là, sinon une nouvelle
        // toujours les listes du moment (↶ ↷ et la suppression d'un rush remplacent P.v2, P.texts, P.audio)
        const LISTS = {get v() { return P.v2; }, get t() { return P.texts; }, get a() { return P.audio; }}, LISTNAME = {v: 'v2', t: 'texts', a: 'audio'};
        const lenOf = c => c.dur ?? clen(c);
        const isImg = c => P.sources[c?.s]?.kind === 'image';
        const srcLen = s => P.sources[s]?.kind === 'image' ? IMG_DUR : P.sources[s].dur;
        function addTrack(kind, at = null) {
            const n = Math.max(0, ...P.tracks.filter(t => t.kind === kind).map(t => Number(String(t.id).slice(1)) || 0)) + 1, base = {v: 'V', t: 'T', a: 'A'}[kind];
            let id = base + n; while (P.tracks.some(t => t.id === id)) id = base + (++uid);
            const tr = {id, kind, name: kind === 'v' ? `Vidéo ${n + 1}` : kind === 't' ? `Textes ${n}` : `Son ${n}`};
            // vidéo : au-dessus des autres (devant) ; texte et son : sous ceux de leur genre
            const same = P.tracks.map((t, i) => t.kind === kind ? i : -1).filter(i => i >= 0);
            const pos = at ?? (kind === 'v' ? 0 : same.length ? same.at(-1) + 1 : kind === 't' ? trackIdx(P, 'V1') + 1 : P.tracks.length);
            P.tracks.splice(pos, 0, tr); return tr.id;
        }
        const freeTrack = (kind, at, len) => P.tracks.filter(t => t.kind === kind && !t.hidden && !t.locked).find(t => !LISTS[kind].some(c => trackOf(P, c, LISTNAME[kind]) === t.id && c.at < at + len && at < c.at + lenOf(c)))?.id || addTrack(kind);
        const undetach = a => { if (!a?.detached) return; [...P.v1, ...P.v2].forEach(v => { if (v.detached === a.id) { v.mute = false; delete v.detached; } }); };
        const ver = await versionsHtml(media);
        const MP = montagePrefs();
        let snapOn = MP.snap; // 🧲 aimanter (retenu dans les réglages du montage)
        const dl = bigDialog({eyebrow: 'MONTAGE VIDÉO', id: 'video', title: projName || media.title || media.filename || 'Nouveau montage',
            bar: {icon: '🎬', undo: '<span class="ui-topbar-hist"><button type="button" class="icon-button small" data-mt-cmd="undo" data-mt-op="undo" title="Annuler (⌘Z)" data-shortcut="⌘Z" disabled>↶</button><button type="button" class="icon-button small" data-mt-cmd="redo" data-mt-op="redo" title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z" disabled>↷</button></span>', exportAttrs: 'data-mt-export', saveAttrs: 'data-mt-saveproj', saveTitle: 'Enregistrer le projet de montage, pour le rouvrir et continuer plus tard (⌘S)'}, onClose: async () => { eng?.pause(); return !dirty || await A().confirmBox('💾 Enregistrer le projet le garde pour plus tard.', {title: 'Fermer sans enregistrer le projet ?', okLabel: 'Fermer sans enregistrer', danger: true}); },
            body: `<div class="h-mt">
                <div class="h-mt-top">
                    <div class="h-mt-stage"><canvas data-mt-canvas width="1280" height="720"></canvas><p class="h-mt-empty" data-mt-empty hidden>Importe tes vidéos et photos dans l’onglet 🎞️ Rush, puis glisse-les sur la frise (ou « ＋ Vidéo / photo à la suite »).</p></div>
                    <div class="h-mt-split" data-mt-split title="Glisser pour élargir ou rétrécir le panneau (double-clic : largeur de départ)"></div>
                    <aside class="h-mt-side">
                        <div class="h-rt-tabs" data-tbg="mt-tabs" data-tbg-label="Onglets de droite"><button type="button" data-mt-tab="rush" title="Les vidéos, photos et sons du projet">🎞️ Rush</button><button type="button" class="is-active" data-mt-tab="item">🎯 Élément</button><button type="button" data-mt-tab="color">🎨 Couleurs</button><button type="button" data-mt-tab="sound">🔊 Son</button><button type="button" data-mt-tab="film">🎞️ Film</button></div>
                        <div data-mt-pane="rush" hidden></div>
                        <div data-mt-pane="item"></div>
                        <div data-mt-pane="color" hidden></div>
                        <div data-mt-pane="sound" hidden></div>
                        <div data-mt-pane="film" hidden></div>
                    </aside>
                </div>
                <div class="h-mt-transport" data-tbg="mt-transport" data-tbg-label="Lecture"><button type="button" class="button" data-mt-play data-shortcut="Espace">▶ Lire</button><button type="button" class="button small secondary" data-mt-home title="Au début">⏮</button><span class="h-avx-time" data-tb-label="Temps (où on en est / durée)"><b data-mt-cur>0:00.0</b> / <span data-mt-total></span></span>
                    <button type="button" class="button small secondary h-mt-snapbtn ed-old-hidden ${MP.snap ? 'is-on' : ''}" data-mt-snap aria-pressed="${MP.snap}" title="Aimanter : en glissant, un élément se colle à la tête de lecture, au début ou à la fin des autres, aux chapitres et aux temps de la musique (garder Alt / Option appuyé : sans aimant)">🧲 Aimanter</button>
                    <label class="h-mt-zoomr ed-old-hidden" data-tb-label="Zoom de la frise" title="Aussi ⌘ + et ⌘ −, ⌘ 0 pour revenir">Zoom de la frise <input type="range" min="4" max="200" value="40" data-mt-zoom></label></div>
                <div class="h-mt-ops" data-tbg="mt-ops" data-tbg-label="Outils du montage">
                    <button type="button" class="button small secondary" data-mt-op="split" title="Coupe le morceau choisi à la tête de lecture" data-shortcut="B">✂️ Couper ici</button>
                    <button type="button" class="button small secondary" data-mt-op="start" title="Le morceau choisi commence à la tête de lecture">⟦ Commence ici</button>
                    <button type="button" class="button small secondary" data-mt-op="end" title="Le morceau choisi finit à la tête de lecture">⟧ Finit ici</button>
                    <button type="button" class="button small secondary" data-mt-op="left" title="Avancer le morceau dans la piste 1">← Avancer</button>
                    <button type="button" class="button small secondary" data-mt-op="right" title="Reculer le morceau dans la piste 1">Reculer →</button>
                    <button type="button" class="button small secondary" data-mt-op="detach" title="Le son du morceau passe sur une piste son, à part">🔊 Détacher le son</button>
                    <button type="button" class="button small secondary" data-mt-op="del" title="Enlever l'élément choisi" data-shortcut="⌫">🗑 Enlever</button>
                    <button type="button" class="button small" data-mt-op="addv1" title="Une vidéo ou une photo, à la suite dans la piste Vidéo 1">＋ Vidéo / photo à la suite</button>
                    <button type="button" class="button small secondary" data-mt-op="addv2" title="Une vidéo ou une photo dans un coin de l'image, à la tête de lecture">＋ Incrustation</button>
                    <button type="button" class="button small secondary" data-mt-op="kfprev" title="Aller à l'image clé précédente de l'élément choisi">◀ ◆</button>
                    <button type="button" class="button small secondary" data-mt-op="kfnext" title="Aller à l'image clé suivante de l'élément choisi">◆ ▶</button>
                    <button type="button" class="button small secondary" data-mt-op="addtext">＋ Titre / texte</button>
                    <button type="button" class="button small secondary" data-mt-op="adda">＋ Son / musique</button>
                    <button type="button" class="button small secondary" data-mt-op="voice" title="Enregistre ta voix au micro pendant que le film défile (casque conseillé)">🎙 Voix off</button>
                    <button type="button" class="button small secondary" data-mt-op="sub" title="Un sous-titre de 3 s à la tête de lecture, sur la piste « Sous-titres »">💬 Sous-titre ici</button>
                    <button type="button" class="button small secondary" data-mt-op="chapter" title="Un chapitre commence à la tête de lecture">🔖 Chapitre ici</button>
                </div>
                <div class="h-mt-tl" data-mt-tl></div>
                <p class="muted h-avx-help ed-old-hidden">Clique sur la frise pour te placer, sur un élément pour le choisir ; glisse un élément pour le déplacer dans le temps, ou sur une autre piste du même genre (vidéos et photos vont sur toutes les pistes vidéo, texte ↔ texte, son ↔ son). Espace = lire / pause · ⌫ ou Suppr = enlever · B = couper ici · ◇ = image clé · 🧲 un élément glissé se colle aux autres (Alt / Option : sans aimant) · 🔒 une piste verrouillée ne bouge plus.</p>
                ${ver.html}
                <div class="modal-actions ed-old-hidden" aria-hidden="true"><button type="button" class="button secondary" data-mt-projects title="Rouvrir un montage enregistré">📂 Projets…</button><span class="h-mt-projname" data-mt-projname></span><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save title="Fabrique le fichier vidéo (MP4 ou WebM, plusieurs formats d’image) et le range dans les médias : nouvelle version, copie ou nouvelle vidéo">💾 Garder dans les médias…</button></div></div>`});
        dl.classList.add('h-avx-montage'); dl.classList.toggle('mt-left', MP.side === 'left'); dl.classList.toggle('mt-nohelp', !MP.help);
        dl.style.setProperty('--mt-stage', MP.stage + 'vh'); dl.style.setProperty('--mt-lane', MP.lane + 'px'); dl.style.setProperty('--mt-side', MP.sideW + 'px');
        [['colV1', 'v1'], ['colV2', 'v2'], ['colT', 't'], ['colA', 'a']].forEach(([k, v]) => { dl.style.setProperty(`--mt-c-${v}`, MP[k]); dl.style.setProperty(`--mt-i-${v}`, inkOn(MP[k])); });
        const $ = s => dl.querySelector(s), cv = $('[data-mt-canvas]');
        dl.__montage = {P, get eng() { return eng; }, get sel() { return sel; }}; // pour les tests (tests/test-montage-more.js)
        // panneau de droite (Élément, Couleurs, Son, Film, Rush) : sa largeur se règle en glissant la poignée, et reste pour la prochaine fois
        const saveSideW = w => { let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {} v.sideW = w; try { localStorage.setItem(MT_KEY, JSON.stringify(v)); } catch (_) {} };
        $('[data-mt-split]').addEventListener('pointerdown', e => {
            e.preventDefault(); const sp = e.currentTarget, x0 = e.clientX, w0 = $('.h-mt-side').getBoundingClientRect().width, left = dl.classList.contains('mt-left'); sp.setPointerCapture(e.pointerId); sp.classList.add('is-drag');
            const max = Math.min(820, $('.h-mt-top').getBoundingClientRect().width - 320); let w = w0;
            const mv = ev => { w = Math.round(Math.max(300, Math.min(max, w0 + (left ? ev.clientX - x0 : x0 - ev.clientX)))); dl.style.setProperty('--mt-side', w + 'px'); };
            const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up); sp.classList.remove('is-drag'); saveSideW(w); };
            sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
        });
        $('[data-mt-split]').addEventListener('dblclick', () => { dl.style.setProperty('--mt-side', MT_DEF.sideW + 'px'); saveSideW(MT_DEF.sideW); });
        if (media.id) bindVersions(dl, media, 'video', () => { onDone?.(); if (dirty) return toast('Tes modifications en cours restent ouvertes ici.'); dl.close(); }); // une version montrée ou supprimée : le travail en cours n'est pas perdu
        $('[data-avx-cancel]').addEventListener('click', () => dl.querySelector('[data-avx-close]').click());
        const sizeFor = () => { const ad = aspectDims(P.aspect); if (ad) { const k = Math.min(1, 1280 / Math.max(...ad)); return [Math.round(ad[0] * k), Math.round(ad[1] * k)]; } const so = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s]; const turn = P.fx.rotate % 180 !== 0; const w = so?.w || 1280, h = so?.h || 720, k = Math.min(1, 1280 / Math.max(w, h)); return [Math.round((turn ? h : w) * k), Math.round((turn ? w : h) * k)]; };
        const fitCanvas = () => { [cv.width, cv.height] = sizeFor(); }; // l'image prend le format de la première vidéo
        let eng = null;
        const rebuild = async () => { const t = eng?.t || 0; eng?.destroy(); fitCanvas(); eng = montageEngine(P, cv, {onTime}); eng.decorate = decorate; await eng.seek(t); };
        // 0 : redessiner · 1 : recaler les vidéos · 2 : refaire le moteur (son général, rotation) ; pane=false : on écrit dans le panneau
        // ↶ ↷ : chaque changement du montage (couper, déplacer, régler…) est une étape ; les rushes, eux, restent
        let hist = [], hpos = -1, histTimer = 0;
        const snapP = () => JSON.stringify({v1: P.v1, v2: P.v2, texts: P.texts, audio: P.audio, tracks: P.tracks, look: P.look, fx: P.fx, fadeStart: !!P.fadeStart, fadeEnd: !!P.fadeEnd, aspect: P.aspect || '', blurBars: !!P.blurBars, kbAuto: !!P.kbAuto, duck: P.duck || null, chapters: P.chapters || [], old: P.old || null});
        const record = () => { clearTimeout(histTimer); histTimer = 0; const v = snapP(); if (hist[hpos] === v) return; hist = hist.slice(0, hpos + 1); hist.push(v); if (hist.length > 300) hist.shift(); hpos = hist.length - 1; syncUndo(); };
        const schedHist = () => { clearTimeout(histTimer); histTimer = setTimeout(record, 350); };
        const syncUndo = () => { const u = dl.querySelector('[data-mt-op="undo"]'), r = dl.querySelector('[data-mt-op="redo"]'); if (u) u.disabled = hpos <= 0; if (r) r.disabled = hpos >= hist.length - 1; };
        const undoTo = async i => {
            if (histTimer) record();
            if (i < 0 || i >= hist.length) return toast(i < 0 ? 'Rien à annuler.' : 'Rien à rétablir.');
            hpos = i; Object.assign(P, JSON.parse(hist[i])); if (sel && !all().some(([tr, c]) => tr === sel.track && c.id === sel.id)) sel = null;
            dirty = true; const [w, h] = sizeFor(); if (w !== cv.width || h !== cv.height) await rebuild(); drawTl(); drawRush(true); eng?.seek(eng.t); syncUndo();
        };
        /** H7 : enlevé tout de suite, avec « ↶ Annuler » dans le message (au lieu d'une question avant) */
        const undoable = msg => { record(); const h = hpos, later = () => new Error('d’autres changements ont suivi : utilise ↶ en haut');
            if (!A().undoToast) return toast(msg + '.');
            A().undoToast(msg, {undo: async () => { if (hpos !== h) throw later(); await undoTo(h - 1); }, redo: async () => { if (hpos !== h - 1) throw later(); await undoTo(h); }}); };
        const touch = async (lvl = 1, pane = true) => { dirty = true; schedHist(); const [w, h] = sizeFor(); if (w !== cv.width || h !== cv.height) lvl = 2; if (lvl === 2) { await rebuild(); drawTl(pane); return; } drawTl(pane); if (lvl === 1) eng?.seek(eng.t); else eng?.refresh(); };
        const onTime = (t, end) => { $('[data-mt-cur]').textContent = fmt(t); const ph = $('[data-mt-ph]'); if (ph) ph.style.left = (t * pxs + OFF) + 'px'; if (end) $('[data-mt-play]').textContent = '▶ Lire'; if (!eng?.playing || end) syncInspector(); };
        const all = () => [...P.v1.map(c => ['v1', c]), ...P.v2.map(c => ['v2', c]), ...P.texts.map(c => ['texts', c]), ...P.audio.map(c => ['audio', c])];
        const selected = () => { const f = all().find(([tr, c]) => sel && tr === sel.track && c.id === sel.id); return f ? f[1] : null; };
        // frise : une ligne par piste
        function drawTl(pane = true) {
            const L = layoutV1(P), T = montageEnd(P), W = Math.max(600, T * pxs + 160);
            const kfMarks = c => { const ts = [...new Set(Object.values(c.kf || {}).flat().map(k => Math.round(k.t * 100) / 100))]; return ts.map(t => `<i class="h-mt-kfm" style="left:${(t - (c.from || 0)) / spd(c) * pxs}px" title="Image clé ${fmt(t - (c.from || 0))}"></i>`).join(''); };
            const block = (tr, c, at, len, label, cls = '') => `<button type="button" class="h-mt-clip ${cls} ${isImg(c) ? 'is-img' : ''} ${sel && sel.track === tr && sel.id === c.id ? 'is-sel' : ''}" style="left:${OFF + at * pxs}px;width:${Math.max(6, len * pxs)}px" data-mt-clip="${tr}:${c.id}" title="${esc(label)} · ${fmt(at)} → ${fmt(at + len)}">${isImg(c) ? '🖼️ ' : ''}${esc(label)}${kfMarks(c)}${tr === 'audio' ? beatMarks(c) : ''}</button>`;
            // 🥁 les temps repérés d'une musique : de petits traits sur le son
            const beatMarks = c => (c.beats || []).filter(b => b >= c.from && b <= c.to).slice(0, 4000).map(b => `<i class="h-mt-beat" style="left:${(b - c.from) / spd(c) * pxs}px"></i>`).join('');
            const lane = (key, name, inner) => `<div class="h-mt-lane" data-mt-lane="${key}"><span class="h-mt-lname">${name}</span>${inner}</div>`;
            const ruler = Array.from({length: Math.ceil(T) + 1}, (_, s) => s % Math.max(1, Math.round(60 / pxs * 2)) === 0 ? `<span style="left:${OFF + s * pxs}px">${fmt(s, false)}</span>` : '').join('');
            const clipsOf = tr => tr.kind === 'main' ? L.map(x => block('v1', x.c, x.at, x.end - x.at, (x.c.tr?.type && x.c.tr.type !== 'none' ? '◇ ' : '') + (P.sources[x.c.s]?.title || 'Vidéo') + (x.c.mute ? ' 🔇' : ''), 'is-v1')).join('')
                : tr.kind === 'v' ? P.v2.filter(c => trackOf(P, c, 'v2') === tr.id).map(c => block('v2', c, c.at, clen(c), P.sources[c.s]?.title || 'Incrustation', 'is-v2')).join('')
                : tr.kind === 't' ? P.texts.filter(x => trackOf(P, x, 'texts') === tr.id).map(x => block('texts', x, x.at, x.dur, x.text.split('\n')[0] || 'Texte', 'is-text')).join('')
                : P.audio.filter(a => trackOf(P, a, 'audio') === tr.id).map(a => block('audio', a, a.at, clen(a), (a.detached ? '🔊 ' : '🎵 ') + (P.sources[a.s]?.title || 'Son'), 'is-audio')).join('');
            const laneOf = tr => `<div class="h-mt-lane ${tr.hidden ? 'is-hidden' : ''} ${tr.locked ? 'is-locked' : ''}" data-mt-lane="${tr.id}" data-kind="${tr.kind}"><span class="h-mt-lname"><b title="Double-clic pour renommer" data-mt-tname="${tr.id}">${TRACK_KINDS[tr.kind][0]} ${esc(tr.name)}</b><span class="h-mt-tbtns">${`<button type="button" data-mt-tvis="${tr.id}" title="${tr.hidden ? 'Montrer cette piste' : 'Cacher cette piste (ni vue ni entendue)'}">${tr.hidden ? '🙈' : '👁'}</button>`}<button type="button" data-mt-tlock="${tr.id}" class="${tr.locked ? 'is-on' : ''}" title="${tr.locked ? 'Déverrouiller la piste' : 'Verrouiller la piste (ses éléments ne bougent plus, ne se coupent plus, ne s’enlèvent plus)'}">${tr.locked ? '🔒' : '🔓'}</button><button type="button" data-mt-tup="${tr.id}" title="Monter la piste">↑</button><button type="button" data-mt-tdown="${tr.id}" title="Descendre la piste">↓</button><button type="button" data-mt-tdel="${tr.id}" title="${tr.kind === 'main' ? 'Vider cette piste (elle reste, c’est la piste de base du film)' : 'Supprimer cette piste'}">🗑</button></span></span>${clipsOf(tr)}</div>`;
            const chaps = (P.chapters || []).map(c => `<button type="button" class="h-mt-chap" style="left:${OFF + c.t * pxs}px" data-mt-chapgo="${c.t}" title="🔖 ${esc(c.title)} (${fmt(c.t)})">🔖<span>${esc(c.title)}</span></button>`).join('');
            $('[data-mt-tl]').innerHTML = `<div class="h-mt-tlin" style="width:${W}px" data-dnd-off><div class="h-mt-ruler" data-mt-ruler>${ruler}${chaps}</div><div>
                ${P.tracks.map(laneOf).join('')}</div>
                <div class="h-mt-addtracks"><button type="button" class="button small secondary" data-mt-addtrack="v">＋ Piste vidéo</button><button type="button" class="button small secondary" data-mt-addtrack="t">＋ Piste texte</button><button type="button" class="button small secondary" data-mt-addtrack="a">＋ Piste son</button></div>
                <i class="h-mt-ph" data-mt-ph style="left:${OFF + (eng?.t || 0) * pxs}px"></i></div>`;
            ext.tbApply?.(dl, 'video'); // pistes rangées ou cachées à sa façon
            $('[data-mt-total]').textContent = fmt(T);
            $('[data-mt-empty]').hidden = P.v1.length > 0;
            if (pane) drawPane();
        }
        // panneau de droite : réglages de l'élément choisi
        const chk = (k, label, on) => `<label class="ui-toggle"><input type="checkbox" data-mt-k="${k}" ${on ? 'checked' : ''}><i></i>${label}</label>`;
        // les réglages du son : pour un morceau (afx) ou pour tout le film (fx)
        const soundFx = (pre, f) => `${chk(pre + '.clarity', '🗣️ Voix plus nette', f.clarity)}${chk(pre + '.noise', '🧹 Moins de souffle et de grondement', f.noise)}${rng(pre + '.bass', 'Graves', -12, 12, 1, f.bass || 0, ' dB')}${rng(pre + '.treble', 'Aigus', -12, 12, 1, f.treble || 0, ' dB')}${chk(pre + '.mono', '🎧 Mono (le même son des deux côtés)', f.mono)}`;
        const speedHtml = c => `${rng('speed', 'Vitesse', 0.1, 10, 0.05, spd(c), ' ×')}<label class="h-avx-row">Vitesse exacte <input data-unit="×" type="number" class="h-mt-num" min="0.1" max="10" step="0.05" value="${spd(c)}" data-mt-k="speedn"></label><div class="h-mt-quick">${montagePrefs().speeds.map(v => `<button type="button" data-mt-speed="${v}" class="${spd(c) === v ? 'is-on' : ''}">${String(v).replace('.', ',')} ×</button>`).join('')}<button type="button" data-mt-speededit title="Choisir les vitesses de ces boutons (aussi dans Réglages → Montage)">✎</button></div>${chk('pitch', 'garder la hauteur de la voix', c.pitch !== false)}`;
        const clipSound = c => `<details class="h-mt-isec h-mt-sfx" ${c.afx && Object.values(c.afx).some(Boolean) ? 'open' : ''}><summary><b>🔊 Son de ce morceau</b></summary>${soundFx('afx', c.afx || {})}<div class="h-mt-quick"><button type="button" data-mt-afxall title="Mettre ces réglages du son sur tous les morceaux et sons du projet">Appliquer à tous les sons du projet</button><button type="button" data-mt-afxreset>↺ Remettre comme au départ</button></div>${P.sources[c.s]?.kind === 'audio' && ext.openAudioStudio ? '<p><button type="button" class="button small secondary" data-mt-studio title="Nettoyer ce son dans le Studio son (rack d’effets, spectre…) : il revient propre ici">🎚️ Ouvrir dans le Studio son</button></p>' : ''}<p class="muted">Pour tout le film d’un coup : onglet 🔊 Son.</p></details>`;
        const kbHtml = c => `<label class="h-avx-row">Effet Ken Burns <select data-mt-k="kb">${KB.map(([k, l]) => `<option value="${k}" ${(c.kb ?? (P.kbAuto ? 'auto' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span data-help="Un lent mouvement de caméra sur la photo : elle s’approche, s’éloigne ou glisse doucement pendant qu’elle est à l’écran."></span></label>`;
        const imgDur = c => `<label class="h-avx-row">Durée à l’écran <input data-ui-duration="s" type="number" class="h-mt-num" min="0.1" max="3600" step="0.1" value="${Math.round(clen(c) * 10) / 10}" data-mt-k="imgdur"></label><div class="h-mt-quick">${[2, 3, 5, 8, 10, 15].map(v => `<button type="button" data-mt-imgdur="${v}">${v} s</button>`).join('')}</div>`;
        const rng = (k, label, min, max, step, v, unit = '') => `<label class="h-avx-row">${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-mt-k="${k}"><output data-u="${unit}">${unit === '%' ? Math.round(v * 100) + ' %' : v + unit}</output></label>`;
        const lookHtml = (L, scope) => `<div class="h-mt-looks">${LOOKS.map(([n], i) => `<button type="button" class="button small secondary" data-mt-look="${scope}:${i}">${esc(n)}</button>`).join('')}</div>
            ${rng(scope + '.bright', 'Luminosité', 0.4, 1.8, 0.02, L.bright ?? 1, '%')}${rng(scope + '.contrast', 'Contraste', 0.4, 1.8, 0.02, L.contrast ?? 1, '%')}${rng(scope + '.sat', 'Saturation', 0, 2, 0.02, L.sat ?? 1, '%')}${rng(scope + '.warm', 'Température (froid ↔ chaud)', -0.8, 0.8, 0.02, L.warm ?? 0)}${rng(scope + '.hue', 'Teinte', -60, 60, 1, L.hue ?? 0, '°')}${ext.montageWheels?.html(L.cw, scope) || ''}`;
        const trackSel = (list, c) => { const cur = trackOf(P, c, list); return `<label class="h-avx-row">Piste <select data-mt-k="track">${P.tracks.filter(t => t.kind === KIND_OF_LIST[list]).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`; };
        // 🎞️ vieux film : d'un morceau (old) ou de tout le film (pold)
        const oldHtml = (o, pre, label) => `<details class="h-mt-isec h-mt-old" ${o?.on ? 'open' : ''}><summary><b>🎞️ ${label}</b></summary>${chk(pre + '.on', 'Effet vieux film : grain, rayures, poussières, image qui scintille, coins assombris', o?.on)}
            ${rng(pre + '.amt', 'Intensité', 0.05, 1, 0.05, o?.amt ?? OLD0.amt, '%')}${chk(pre + '.sepia', 'sépia (couleurs passées, brunes)', o ? o.sepia !== false : true)}${chk(pre + '.weave', 'l’image tremble un peu, comme dans un vieux projecteur', o ? o.weave !== false : true)}${pre === 'old' && oldClean(P.old) ? '<p class="muted">Tout le film a déjà l’effet (onglet 🎨 Couleurs) : ces réglages-ci passent avant pour ce morceau.</p>' : ''}</details>`;
        // 📐 stabilisation légère d'une vidéo : analyse une fois (avec sa barre et Annuler), puis réglages
        let stabJob = null, beatJob = null, beatEvery = 1;
        const STAB_HELP = 'Corrige les petites secousses d’une vidéo filmée à la main. L’analyse regarde, sur une image réduite, de combien toute l’image bouge d’un instant à l’autre (vers le haut, le bas, les côtés), garde le mouvement voulu (un panoramique lent) et compense le reste, en agrandissant un peu l’image pour cacher les bords. Elle ne corrige ni les rotations, ni le flou de bougé, ni un sujet qui bouge seul devant un fond fixe.';
        const stabHtml = c => { if (isImg(c) || P.sources[c.s]?.kind !== 'video') return ''; const st = c.stab, job = stabJob?.id === c.id ? stabJob : null;
            return `<details class="h-mt-isec h-mt-stab" ${st || job ? 'open' : ''}><summary><b>📐 Stabiliser (léger)</b><span data-help="${esc(STAB_HELP)}"></span></summary>
                ${job ? `<div class="h-mt-prog"><progress max="1" value="${job.p}" data-mt-stabprog></progress><button type="button" class="button small secondary" data-mt-stabcancel>Annuler</button></div><p class="muted">Analyse de la vidéo… (elle est regardée image par image, cela peut prendre un moment)</p>`
                : st ? `${chk('stabon', 'stabilisation active', !st.off)}${rng('stab.z', 'Agrandir (cache les bords)', 1.02, 1.2, 0.01, st.z, '%')}${rng('stab.sm', 'Lissage du mouvement', 0.3, 4, 0.1, st.sm, ' s')}<div class="h-mt-quick"><button type="button" data-mt-stab>↻ Refaire l’analyse</button><button type="button" data-mt-stabdel>Enlever la stabilisation</button></div>`
                : `<button type="button" class="button small secondary" data-mt-stab>📐 Analyser et stabiliser</button><p class="muted">Pour une vidéo filmée à la main qui tremble un peu. L’image est légèrement agrandie.</p>`}</details>`; };
        // 🥁 les temps d'une musique : repérés une fois, ils se voient sur la frise et attirent les éléments qu'on glisse
        const beatsHtml = c => { const job = beatJob?.id === c.id, n = (c.beats || []).filter(b => b >= c.from && b <= c.to).length;
            return `<details class="h-mt-isec h-mt-beats" open><summary><b>🥁 Temps de la musique</b><span data-help="Repère les battements (les temps) de la musique : ils s’affichent en petits traits sur le son, dans la frise ; un élément qu’on glisse s’y colle (🧲 Aimanter). On peut aussi couper la vidéo de la piste 1 sur les temps, pour un montage en rythme."></span></summary>
                ${job ? '<p class="muted" data-mt-beatprog>Écoute de la musique…</p>' : c.beats ? `<p class="muted" data-mt-beatinfo>${n} temps repérés${c.bpm ? ` · environ ${String(c.bpm).replace('.', ',')} battements par minute` : ''}.</p>` : ''}
                <div class="h-mt-quick"><button type="button" data-mt-beats ${job ? 'disabled' : ''}>🥁 ${c.beats ? 'Repérer de nouveau' : 'Repérer les temps'}</button>${c.beats ? '<button type="button" data-mt-beatsdel>Effacer les temps</button>' : ''}</div>
                ${c.beats?.length ? `<div class="h-avx-row">✂️ Couper la vidéo (piste 1) <select data-mt-beatevery aria-label="Tous les combien de temps">${[1, 2, 4, 8].map(v => `<option value="${v}" ${beatEvery === v ? 'selected' : ''}>${v === 1 ? 'sur chaque temps' : `tous les ${v} temps`}</option>`).join('')}</select><button type="button" class="button small secondary" data-mt-beatcut title="Coupe les morceaux de la piste Vidéo 1 aux temps de cette musique (coupes franches)">Couper</button></div>` : ''}</details>`; };
        /* Inspecteur (façon Final Cut) : Composition, Transformer, Recadrer, Distorsion, Adaptation ; ◇ = image clé au moment de la tête de lecture */
        const localOf = c => { const t = eng?.t || 0; if (sel?.track === 'v1') { const x = layoutV1(P).find(y => y.c === c); if (!x) return c.from; return Math.max(c.from, Math.min(c.to, c.from + (t - x.at) * spd(c))); } return Math.max(c.from, Math.min(c.to, c.from + (t - (c.at || 0)) * spd(c))); };
        const KF_EPS = 1 / 30;
        const kfAt = (c, k, local) => (c.kf?.[k] || []).findIndex(x => Math.abs(x.t - local) < KF_EPS);
        const fmtTf = (k, v) => ['rot', 'kx', 'ky'].includes(k) ? `${Math.round(v * 10) / 10}°` : `${Math.round(v * 10) / 10} %`;
        const IROWS = {
            comp: [['opacity', 'Opacité', 0, 100, 1]],
            tf: [['px', 'Position X', -100, 100, 0.5], ['py', 'Position Y', -100, 100, 0.5], ['rot', 'Rotation', -360, 360, 1], ['scale', 'Échelle (tout)', 5, 400, 1], ['sx', 'Échelle X', 5, 400, 1], ['sy', 'Échelle Y', 5, 400, 1], ['ax', 'Ancrage X', -50, 50, 0.5], ['ay', 'Ancrage Y', -50, 50, 0.5]],
            crop: [['cl', 'Gauche', 0, 95, 0.5], ['cr', 'Droite', 0, 95, 0.5], ['ct', 'Haut', 0, 95, 0.5], ['cb', 'Bas', 0, 95, 0.5]],
            dist: [['kx', 'Inclinaison horizontale', -60, 60, 0.5], ['ky', 'Inclinaison verticale', -60, 60, 0.5]],
        };
        const irow = (c, local, [k, label, min, max, step]) => { const v = tfAt(c, k, local), has = (c.kf?.[k] || []).length, on = kfAt(c, k, local) >= 0;
            return `<div class="h-mt-irow"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-mt-tf="${k}"><output data-mt-tfo="${k}">${fmtTf(k, v)}</output><button type="button" class="h-mt-kf ${has ? 'has' : ''} ${on ? 'on' : ''}" data-mt-kf="${k}" title="${on ? 'Enlever cette image clé' : 'Ajouter une image clé ici (la valeur pourra changer au fil du temps)'}">${on ? '◆' : '◇'}</button></div>`; };
        const isec = (c, key, flag, title, icon, body, open = true) => `<details class="h-mt-isec" ${open ? 'open' : ''}><summary>${flag ? `<input type="checkbox" data-mt-k="${flag}" ${c[flag] !== false ? 'checked' : ''} title="Activer / couper">` : ''}<b>${title}</b><span class="h-mt-iico">${icon}</span><button type="button" class="h-mt-ireset" data-mt-ireset="${key}" title="Remettre comme au départ">↺</button></summary><div class="h-mt-ibody">${body}</div></details>`;
        function inspectorHtml(c, main) {
            const local = localOf(c), rows = key => IROWS[key].map(r => irow(c, local, r)).join('');
            return `<div class="h-mt-insp" data-mt-insp><div class="h-mt-ihead"><b>🎛️ Réglages de l’image</b><span class="muted">◇ image clé à ${fmt(local - c.from)}</span><label class="h-mt-ease">Entre deux images clés <select data-mt-k="ease"><option value="smooth" ${c.ease !== 'linear' ? 'selected' : ''}>en douceur</option><option value="linear" ${c.ease === 'linear' ? 'selected' : ''}>régulier</option></select><span data-help="Une image clé fixe un réglage (taille, place, rotation…) à un moment du film ; entre deux images clés, l’image passe de l’une à l’autre, en douceur ou à vitesse régulière."></span></label></div>
                ${isec(c, 'comp', '', 'Composition', '◐', rows('comp') + `<div class="h-mt-irow"><span>Mode de fusion</span><select data-mt-k="blend">${BLENDS.map(([k, l]) => `<option value="${k}" ${(c.blend || 'source-over') === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span data-help="Comment cette image se mélange avec celle de dessous : « Produit » assombrit, « Superposition claire » éclaircit, « Normal » la pose simplement dessus."></span></div>`)}
                ${isec(c, 'tf', 'tfOn', 'Transformer', '⬚', rows('tf'))}
                ${isec(c, 'crop', 'cropOn', 'Recadrer', '⌗', rows('crop'), false)}
                ${isec(c, 'dist', 'distOn', 'Distorsion', '▱', rows('dist'), false)}
                ${main ? isec(c, 'fit', '', 'Adaptation spatiale', '⤢', `<div class="h-mt-irow"><span>Type</span><select data-mt-k="fit">${FITS.map(([k, l]) => `<option value="${k}" ${(c.fit || 'fit') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`, false) : ''}</div>`;
        }
        /** Met les curseurs de l'inspecteur à la valeur du moment (images clés) sans tout redessiner */
        function syncInspector() {
            const box = dl.querySelector('[data-mt-insp]'), c = selected(); if (!box || !c) return;
            const local = localOf(c);
            box.querySelectorAll('[data-mt-tf]').forEach(el => { const k = el.dataset.mtTf, v = tfAt(c, k, local); if (document.activeElement !== el) el.value = v; const o = box.querySelector(`[data-mt-tfo="${k}"]`); if (o) o.textContent = fmtTf(k, v); const b = box.querySelector(`[data-mt-kf="${k}"]`); if (b) { const on = kfAt(c, k, local) >= 0; b.classList.toggle('on', on); b.classList.toggle('has', !!(c.kf?.[k] || []).length); b.textContent = on ? '◆' : '◇'; } });
            const hd = box.querySelector('.h-mt-ihead .muted'); if (hd) hd.textContent = `◇ image clé à ${fmt(local - c.from)}`;
        }
        /** Aller à l'image clé précédente / suivante de l'élément choisi */
        function jumpKf(dir) {
            const c = selected(); if (!c || !['v1', 'v2'].includes(sel.track)) return toast('Choisis une vidéo ou une photo sur la frise.', 'error');
            const local = localOf(c), ts = [...new Set(Object.values(c.kf || {}).flat().map(k => k.t))].sort((a, b) => a - b);
            const t = dir > 0 ? ts.find(x => x > local + KF_EPS) : ts.reverse().find(x => x < local - KF_EPS);
            if (t === undefined) return toast(dir > 0 ? 'Pas d’image clé après.' : 'Pas d’image clé avant.');
            const start = sel.track === 'v1' ? layoutV1(P).find(y => y.c === c)?.at || 0 : c.at; eng.seek(start + (t - c.from) / spd(c)).then(syncInspector);
        }
        function drawPane() {
            const c = selected(), item = $('[data-mt-pane="item"]');
            if (!c) item.innerHTML = '<p class="muted">Choisis un élément sur la frise (un morceau, une incrustation, un texte, un son).</p>';
            else if (sel.track === 'v1') item.innerHTML = `<h4>${isImg(c) ? '🖼️ Photo' : '🎬 Morceau'} de la piste 1</h4><p class="muted">${esc(P.sources[c.s]?.title || '')} · ${isImg(c) ? `${fmt(c.to - c.from)} à l’écran` : `${fmt(c.from)} → ${fmt(c.to)}`}</p>
                ${isImg(c) ? imgDur(c) + kbHtml(c) : speedHtml(c)}
                <label class="h-avx-row">Transition avant <select data-mt-k="tr.type">${TRANS.map(([k, l]) => `<option value="${k}" ${(c.tr?.type || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${c.tr?.type === 'color' ? `<label class="h-avx-row">Couleur du fondu <input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c.tr.color || '') ? c.tr.color : '#7a4b22')}" data-mt-k="tr.color"></label>` : ''}${rng('tr.d', 'Durée de la transition', 0.2, 4, 0.1, c.tr?.d ?? 1, ' s')}${P.v1[0] === c && c.tr?.type && c.tr.type !== 'none' ? '<p class="muted">C’est le premier morceau : sa transition ne joue pas (il n’y a rien avant lui).</p>' : ''}
                ${stabHtml(c)}
                ${isImg(c) ? '' : `${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}<label class="ui-toggle"><input type="checkbox" data-mt-k="mute" ${c.mute ? 'checked' : ''}><i></i>🔇 Sans son</label>${c.detached ? '<p class="muted">🔊 Son séparé : il est sur une piste son, à part.</p>' : '<button type="button" class="button small secondary" data-mt-sep title="Le son passe sur une piste son : on le déplace, le coupe ou le règle à part de l’image">🔊 Séparer le son de l’image</button>'}${clipSound(c)}`}
                ${inspectorHtml(c, true)}
                <h4>🎨 Couleurs de ce morceau</h4>${lookHtml(c.look || {}, 'look')}${oldHtml(c.old, 'old', 'Vieux film (ce morceau)')}`;
            else if (sel.track === 'v2') item.innerHTML = `<h4>🖼️ ${c.full ? 'Vidéo (tout l’écran)' : 'Incrustation'}${isImg(c) ? ' (photo)' : ''}</h4><p class="muted">${esc(P.sources[c.s]?.title || '')}</p>
                <div class="h-mt-quick"><button type="button" data-mt-full="1" class="${c.full ? 'is-on' : ''}" title="Prend tout l’écran (on peut ensuite la glisser ou tirer son coin sur l’image)">⛶ Tout l’écran</button><button type="button" data-mt-full="0" class="${c.full ? '' : 'is-on'}" title="Une petite vidéo dans un coin, réglable">▣ Dans un coin</button></div>
                ${c.full ? `<label class="h-avx-row">Cadrage <select data-mt-k="fit">${FITS.slice(0, 2).map(([k, l]) => `<option value="${k}" ${(c.fit || 'fit') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
                ${isImg(c) ? imgDur(c) + kbHtml(c) : speedHtml(c)}${c.full ? '' : rng('w', 'Largeur', 10, 300, 1, c.w ?? 35, ' %')}${c.full ? '' : rng('x', 'Position horizontale', -100, 100, 1, c.x ?? 62, ' %') + rng('y', 'Position verticale', -100, 100, 1, c.y ?? 6, ' %')}
                ${isImg(c) ? '' : rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 0, '%') + (c.detached ? '<p class="muted">🔊 Son séparé : il est sur une piste son, à part.</p>' : '<button type="button" class="button small secondary" data-mt-sep>🔊 Séparer le son de l’image</button>') + clipSound(c)}${trackSel('v2', c)}<label class="ui-toggle"><input type="checkbox" data-mt-k="border" ${c.border !== false ? 'checked' : ''}><i></i>cadre blanc</label><label class="ui-toggle"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}><i></i>apparaît et disparaît en fondu</label>
                ${stabHtml(c)}${oldHtml(c.old, 'old', 'Vieux film (cette vidéo)')}
                ${inspectorHtml(c, false)}`;
            else if (sel.track === 'texts') item.innerHTML = `<h4>🔤 Titre / texte</h4>${trackSel('texts', c)}<label class="h-mt-txt">Texte <textarea rows="3" data-mt-k="text">${esc(c.text)}</textarea></label>
                <details class="h-mt-isec" open><summary><b>✨ Mouvement</b></summary>
                <label class="h-avx-row">Entrée <select data-mt-k="anim">${ANIMS.map(([k, l]) => `<option value="${k}" ${(c.anim === 'scroll' ? 'none' : c.anim || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${rng('animDur', 'Durée de l’entrée (0 = auto)', 0, 10, 0.1, c.animDur || 0, ' s')}
                <label class="h-avx-row">Pendant <select data-mt-k="loop">${ANIMS_LOOP.map(([k, l]) => `<option value="${k}" ${(c.loop || (c.anim === 'scroll' ? 'scroll' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="h-avx-row">Sortie <select data-mt-k="animOut">${ANIMS_OUT.map(([k, l]) => `<option value="${k}" ${(c.animOut || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${rng('animOutDur', 'Durée de la sortie (0 = auto)', 0, 10, 0.1, c.animOutDur || 0, ' s')}
                <div class="h-mt-quick"><button type="button" data-mt-animprev title="Rejoue ce texte depuis son début">▶ Voir le mouvement</button></div></details>
                ${rng('dur', 'Durée', 0.5, 30, 0.1, c.dur, ' s')}${rng('size', 'Taille', 2, 20, 0.5, c.size ?? 6, ' %')}
                <div class="h-avx-row">Police <input type="hidden" data-mt-k="font" value="${esc(c.font || FONTS_V[0][0])}"><button type="button" class="button small secondary" data-mt-fontpick style="${esc(`font-family:${c.font || FONTS_V[0][0]}`)}" title="Choisir la police (recherche, récentes, polices de l’ordinateur)">${esc((FONTS_V.find(f => f[0] === c.font) || [0, String(c.font || 'Georgia').split(',')[0].replace(/"/g, '')])[1])} ▾</button></div>
                <label class="h-avx-row">Couleur <input type="color" value="${esc(c.color || '#ffffff')}" data-mt-k="color"> Fond <input type="color" value="${esc(c.bg || '#000000')}" data-mt-k="bg" ${c.bg ? '' : 'disabled'}><label class="ui-toggle"><input type="checkbox" data-mt-k="hasbg" ${c.bg ? 'checked' : ''}><i></i>bandeau</label></label>
                ${rng('x', 'Position horizontale', 0, 100, 1, c.x ?? 50, ' %')}${rng('y', 'Position verticale', 0, 100, 1, c.y ?? 80, ' %')}
                <label class="h-avx-row">Alignement <select data-mt-k="align">${[['center', 'centré'], ['left', 'à gauche'], ['right', 'à droite']].map(([k, l]) => `<option value="${k}" ${(c.align || 'center') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="ui-toggle"><input type="checkbox" data-mt-k="bold" ${c.bold ? 'checked' : ''}><i></i>gras</label><label class="ui-toggle"><input type="checkbox" data-mt-k="shadow" ${c.shadow !== false ? 'checked' : ''}><i></i>ombre</label><label class="ui-toggle"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}><i></i>entre et sort en fondu</label>`;
            else item.innerHTML = `<h4>${c.voice ? '🎙 Voix' : '🎵 Son'}</h4><p class="muted">${esc(P.sources[c.s]?.title || '')} · ${fmt(c.from)} → ${fmt(c.to)}</p>${chk('voice', '🎙 C’est une voix (la musique baisse toute seule pendant qu’elle parle)', c.voice)}${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}${rng('fadeIn', 'Fondu d’entrée', 0, 10, 0.1, c.fadeIn || 0, ' s')}${rng('fadeOut', 'Fondu de sortie', 0, 10, 0.1, c.fadeOut || 0, ' s')}
                ${beatsHtml(c)}${speedHtml(c)}${trackSel('audio', c)}${clipSound(c)}`;
            $('[data-mt-pane="color"]').innerHTML = `<h4>🎨 Couleurs de tout le film</h4><p class="muted">S’ajoutent aux couleurs de chaque morceau (onglet Élément).</p>${lookHtml(P.look, 'film')}${oldHtml(P.old, 'pold', 'Vieux film (tout le film)')}`;
            $('[data-mt-pane="sound"]').innerHTML = `<h4>🔊 Le son de tout le film</h4>${rng('fx.volume', 'Volume général', 0, 3, 0.05, P.fx.volume, '%')}${soundFx('fx', P.fx)}${chk('fx.mute', '🔇 Sans le son', P.fx.mute)}<p class="muted">S’ajoute aux réglages de chaque morceau (onglet 🎯 Élément → « 🔊 Son de ce morceau »).</p>`;
            $('[data-mt-pane="film"]').innerHTML = `<h4>🎞️ Le film</h4><div class="h-avx-row"><button type="button" class="button small secondary" data-mt-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-mt-rot="90">⟳ 90°</button><small class="muted">${P.fx.rotate ? `tourné de ${P.fx.rotate}°` : ''}</small></div>
                <label class="ui-toggle"><input type="checkbox" data-mt-k="fadeStart" ${P.fadeStart ? 'checked' : ''}><i></i>commence par un fondu depuis le noir</label><label class="ui-toggle"><input type="checkbox" data-mt-k="fadeEnd" ${P.fadeEnd ? 'checked' : ''}><i></i>finit par un fondu au noir</label>
                <h4>📐 Format de l’image</h4><label class="h-avx-row">Format <select data-mt-aspect>${ASPECTS.map(([k, l]) => `<option value="${k}" ${(P.aspect || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="ui-toggle"><input type="checkbox" data-mt-k="blurBars" ${P.blurBars ? 'checked' : ''}><i></i>bandes floues au lieu des bandes noires (la même image, floutée, derrière)</label>
                <h4>🖼️ Photos</h4><label class="ui-toggle"><input type="checkbox" data-mt-k="kbAuto" ${P.kbAuto ? 'checked' : ''}><i></i>effet Ken Burns sur toutes les photos (zoom et glissement lents, variés)</label>
                <h4>🎙 Musique et voix</h4><label class="ui-toggle"><input type="checkbox" data-mt-duck="on" ${P.duck?.on !== false ? 'checked' : ''}><i></i>la musique baisse toute seule pendant une voix</label>${rng('duck.amount', 'Musique pendant la voix', 0, 1, 0.05, P.duck?.amount ?? 0.3, '%')}<label class="ui-toggle"><input type="checkbox" data-mt-duck="video" ${P.duck?.video ? 'checked' : ''}><i></i>… et aussi pendant le son des vidéos de la piste 1</label>
                <h4>🔖 Chapitres</h4>${(P.chapters || []).length ? `<ol class="h-mt-chaps">${[...P.chapters].sort((a, b) => a.t - b.t).map(c => `<li><button type="button" class="link-button" data-mt-chapgo="${c.t}">${fmt(c.t, false)}</button> <input value="${esc(c.title)}" data-mt-chapname="${esc(c.id)}"> <button type="button" class="icon-button" data-mt-chapdel="${esc(c.id)}" title="Enlever">✕</button></li>`).join('')}</ol>
                    <div class="h-mt-quick"><button type="button" data-mt-chapcopy title="La liste « 00:00 Titre » à coller dans la description YouTube">📋 Copier pour YouTube</button><button type="button" data-mt-chapvtt>⬇ Fichier .vtt</button></div>` : '<p class="muted">« 🔖 Chapitre ici » pose un chapitre à la tête de lecture.</p>'}
                <p class="muted">Durée du film : <b>${fmt(montageEnd(P))}</b></p>`;
        }
        // réglages → modèle
        const setK = (obj, k, v) => { const ks = k.split('.'); let o = obj; ks.slice(0, -1).forEach(x => { o[x] = o[x] || {}; o = o[x]; }); o[ks.at(-1)] = v; };
        const audioFx = k => /^(fx\.(clarity|noise|mute|volume|bass|treble|mono)$|afx\.)/.test(k);
        // E5 : la police d'un titre, dans la fenêtre commune des polices
        dl.querySelector('.h-mt-side').addEventListener('click', async e => {
            const b = e.target.closest('[data-mt-fontpick]'); if (!b || !UIx().openFontPicker) return;
            const inp = b.parentElement.querySelector('[data-mt-k="font"]'), c = selected(), cur = String(inp.value || '').split(',')[0].replace(/"/g, '').trim();
            const f = await UIx().openFontPicker({value: cur, sample: String(c?.text || 'Mon film').slice(0, 40)}); if (!f) return;
            const known = FONTS_V.find(x => x[1] === f || x[0].split(',')[0].replace(/"/g, '') === f);
            inp.value = known ? known[0] : `"${String(f).replace(/["\\]/g, '')}", sans-serif`; b.style.fontFamily = inp.value; b.textContent = `${known ? known[1] : f} ▾`;
            inp.dispatchEvent(new Event('input', {bubbles: true}));
        });
        ext.montageWheels?.bind(dl); // 🎨 les roues de couleur de l'onglet Couleurs (heritage-montage-plus.js)
        dl.querySelector('.h-mt-side').addEventListener('input', e => {
            const tfEl = e.target.closest('[data-mt-tf]');
            if (tfEl) { // un réglage de l'inspecteur : la valeur fixe, ou l'image clé du moment s'il y en a
                const c = selected(); if (!c) return; const k = tfEl.dataset.mtTf, v = Number(tfEl.value), local = localOf(c);
                if ((c.kf?.[k] || []).length) { const i = kfAt(c, k, local); if (i >= 0) c.kf[k][i].v = v; else { c.kf[k].push({t: local, v}); c.kf[k].sort((a, b) => a.t - b.t); drawTl(false); } }
                else { c.tf = c.tf || {}; c.tf[k] = v; }
                const o = dl.querySelector(`[data-mt-tfo="${k}"]`); if (o) o.textContent = fmtTf(k, v);
                dirty = true; syncInspector(); eng?.redraw(); return;
            }
            const el = e.target.closest('[data-mt-k]'); if (!el) return;
            let k = el.dataset.mtK, v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
            const o = el.parentElement.querySelector('output'); if (o && el.type === 'range') o.textContent = o.dataset.u === '%' ? Math.round(v * 100) + ' %' : v + o.dataset.u;
            const film = k.startsWith('film.'), c = selected();
            if (film) setK(P.look, k.slice(5), v);
            else if (k.startsWith('pold.')) { P.old = P.old && typeof P.old === 'object' ? P.old : {}; setK(P.old, k.slice(5), v); if (k === 'pold.on') { touch(0); return; } }
            else if (k.startsWith('fx.') || ['fadeStart', 'fadeEnd', 'blurBars', 'kbAuto'].includes(k) || k.startsWith('duck.')) { if (k.startsWith('duck.')) P.duck = P.duck || {on: true, amount: 0.3}; setK(P, k, v); }
            else if (c) {
                if (k === 'hasbg') { c.bg = v ? (dl.querySelector('[data-mt-k="bg"]').value || '#000000') : ''; dl.querySelector('[data-mt-k="bg"]').disabled = !v; }
                else if (k === 'track') { c.track = v; touch(1); return; }
                else if (k === 'anim' || k === 'loop') { if (c.anim === 'scroll') { c.anim = 'none'; if (!c.loop) c.loop = 'scroll'; } c[k] = v; }
                else if (k === 'speedn') { const v2 = Number(String(v).replace(',', '.')); if (!(v2 > 0)) return; c.speed = Math.max(0.1, Math.min(10, v2)); syncSpeed(c, el); touch(1, false); return; }
                else if (k === 'imgdur') { const d = Number(String(v).replace(',', '.')); if (!(d > 0)) return; c.to = c.from + Math.max(0.1, Math.min(IMG_MAX, d)); }
                else if (k === 'tr.type' || k === 'tr.d') { c.tr = c.tr || {type: 'none', d: 1}; c.tr[k.slice(3)] = k === 'tr.d' ? Number(v) : v; if (k === 'tr.type') { touch(1); return; } if (TR_OVER.has(c.tr.type)) { touch(1, false); return; } }
                else if (k === 'stabon') { if (c.stab) { if (v) delete c.stab.off; else c.stab.off = true; } }
                else if (k.startsWith('stab.')) { if (!c.stab) return; setK(c, k, v); }
                else setK(c, k, v);
            }
            if (k === 'speed' && c) syncSpeed(c, el);
            touch(audioFx(k) ? 2 : (k === 'speed' || k === 'pitch') ? 1 : 0, false);
        });
        /** La vitesse se règle à trois endroits (curseur, case, boutons) : les deux autres suivent, la case reprend la valeur gardée quand on la quitte */
        const syncSpeed = (c, from) => { const box = dl.querySelector('[data-mt-pane="item"]'), v = spd(c), r = box.querySelector('[data-mt-k="speed"]'), n = box.querySelector('[data-mt-k="speedn"]');
            if (r && r !== from) { r.value = v; const o = r.parentElement.querySelector('output'); if (o) o.textContent = v + o.dataset.u; } if (n && n !== from) n.value = v;
            box.querySelectorAll('[data-mt-speed]').forEach(b => b.classList.toggle('is-on', Number(b.dataset.mtSpeed) === v)); };
        dl.querySelector('.h-mt-side').addEventListener('change', e => {
            if (e.target.matches('[data-mt-aspect]')) { P.aspect = e.target.value; touch(2); return; }
            if (e.target.matches('[data-mt-beatevery]')) { beatEvery = Number(e.target.value) || 1; return; }
            if (e.target.matches('[data-mt-k="speedn"]')) { const c = selected(); if (c) e.target.value = spd(c); return; }
            if (e.target.matches('[data-mt-duck]')) { P.duck = P.duck || {on: true, amount: 0.3}; P.duck[e.target.dataset.mtDuck] = e.target.checked; touch(1); return; }
            if (e.target.matches('[data-mt-chapname]')) { const c = (P.chapters || []).find(x => x.id === e.target.dataset.mtChapname); if (c) { c.title = e.target.value.trim().slice(0, 120) || c.title; e.target.value = c.title; touch(0, false); } } // vide : il garde son titre
        });
        dl.querySelector('.h-mt-side').addEventListener('click', e => {
            const cgo = e.target.closest('[data-mt-chapgo]'); if (cgo) { eng.seek(Number(cgo.dataset.mtChapgo)); return; }
            const cdel = e.target.closest('[data-mt-chapdel]'); if (cdel) { P.chapters = (P.chapters || []).filter(x => x.id !== cdel.dataset.mtChapdel); touch(0); return; }
            if (e.target.closest('[data-mt-chapcopy]')) { const txt = chaptersText(); navigator.clipboard?.writeText(txt).then(() => toast('Chapitres copiés : colle-les dans la description de la vidéo.'), () => prompt('Copie ce texte :', txt)); return; }
            if (e.target.closest('[data-mt-chapvtt]')) { const list = [...P.chapters].sort((a, b) => a.t - b.t), T = montageEnd(P), ts = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
                saveText(`${(projName || media.title || 'montage').replace(/[^\p{L}\p{N} _-]+/gu, '')}-chapitres.vtt`, 'WEBVTT\n\n' + list.map((c, i) => `${i + 1}\n${ts(c.t)} --> ${ts(list[i + 1]?.t ?? T)}\n${String(c.title).replace(/-->/g, '->').replace(/\s*\n\s*/g, ' ')}\n`).join('\n'), 'text/vtt'); return; }
            const tab = e.target.closest('[data-mt-tab]'); if (tab) { dl.querySelectorAll('[data-mt-tab]').forEach(b => b.classList.toggle('is-active', b === tab)); dl.querySelectorAll('[data-mt-pane]').forEach(p => { p.hidden = p.dataset.mtPane !== tab.dataset.mtTab; }); return; }
            const lk = e.target.closest('[data-mt-look]'); if (lk) { const [scope, i] = lk.dataset.mtLook.split(':'), target = scope === 'film' ? P.look : (selected() ? (selected().look = selected().look || {}) : null); if (!target) return; Object.assign(target, LOOK0, LOOKS[Number(i)][1]); touch(0); return; }
            if (e.target.closest('[data-mt-sep]')) { dl.querySelector('[data-mt-op="detach"]')?.click(); return; }
            if (e.target.closest('[data-mt-speededit]')) { (async () => { const cur = montagePrefs().speeds, n = await A().askText({title: 'Boutons de vitesse', message: 'Les vitesses des boutons rapides, de 0,1 à 10, séparées par des points-virgules :', value: speedsText(cur), okLabel: 'Enregistrer'}); if (n === null) return; const l = parseSpeeds(n); if (!l) return toast('Aucune vitesse valable (entre 0,1 et 10).', 'error'); let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {} v.speeds = l; try { localStorage.setItem(MT_KEY, JSON.stringify(v)); } catch (_) {} drawPane(); toast(`Boutons : ${speedsText(l)} ×`); })(); return; }
            const fu = e.target.closest('[data-mt-full]'); if (fu) { const c = selected(); if (c && sel?.track === 'v2') { if (fu.dataset.mtFull === '1') { c.full = true; c.border = false; } else { delete c.full; if (c.w > 100 || (c.w ?? 35) >= 90) { c.w = 35; c.x = 62; c.y = 6; } } touch(0); } return; }
            if (e.target.closest('[data-mt-stab]')) { const c = selected(); if (c) stabGo(c); return; }
            if (e.target.closest('[data-mt-stabcancel]')) { if (stabJob) stabJob.stop = true; return; }
            if (e.target.closest('[data-mt-stabdel]')) { const c = selected(); if (c) { delete c.stab; touch(0); } return; }
            if (e.target.closest('[data-mt-beats]')) { const c = selected(); if (c && sel?.track === 'audio') beatGo(c); return; }
            if (e.target.closest('[data-mt-beatsdel]')) { const c = selected(); if (c) { delete c.beats; delete c.bpm; touch(0); } return; }
            if (e.target.closest('[data-mt-beatcut]')) { const c = selected(); if (c && sel?.track === 'audio') beatCut(c); return; }
            const ap = e.target.closest('[data-mt-animprev]'); if (ap) { const c = selected(); if (c && sel?.track === 'texts') { eng.pause(); eng.seek(c.at).then(() => eng.play()); } return; }
            const sp = e.target.closest('[data-mt-speed]'); if (sp) { const c = selected(); if (c) { c.speed = Number(sp.dataset.mtSpeed); touch(1); } return; }
            const idur = e.target.closest('[data-mt-imgdur]'); if (idur) { const c = selected(); if (c) { c.to = c.from + Number(idur.dataset.mtImgdur); touch(1); } return; }
            if (e.target.closest('[data-mt-afxall]')) { const c = selected(); if (!c) return; const f = {...(c.afx || {})}; [...P.v1, ...P.v2, ...P.audio].forEach(x => { if (!isImg(x)) x.afx = {...f}; }); toast('Réglages du son mis sur tous les sons du projet.'); touch(2); return; }
            if (e.target.closest('[data-mt-afxreset]')) { const c = selected(); if (c) { delete c.afx; touch(2); } return; }
            const rot = e.target.closest('[data-mt-rot]'); if (rot) { P.fx.rotate = (P.fx.rotate + Number(rot.dataset.mtRot) + 360) % 360; touch(2); }
            const kb = e.target.closest('[data-mt-kf]');
            if (kb) { const c = selected(); if (!c) return; const k = kb.dataset.mtKf, local = localOf(c); c.kf = c.kf || {}; const list = c.kf[k] = c.kf[k] || [], i = kfAt(c, k, local);
                if (i >= 0) { list.splice(i, 1); if (!list.length) { c.tf = c.tf || {}; c.tf[k] = tfAt(c, k, local); delete c.kf[k]; } }
                else { list.push({t: local, v: tfAt(c, k, local)}); list.sort((a, b) => a.t - b.t); }
                dirty = true; drawTl(false); syncInspector(); eng?.redraw(); return; }
            const rs = e.target.closest('[data-mt-ireset]');
            if (rs) { e.preventDefault(); const c = selected(); if (!c) return; const key = rs.dataset.mtIreset;
                if (key === 'fit') delete c.fit; else if (key === 'comp') { delete c.blend; if (c.tf) delete c.tf.opacity; if (c.kf) delete c.kf.opacity; }
                else IROWS[key].forEach(([k]) => { if (c.tf) delete c.tf[k]; if (c.kf) delete c.kf[k]; });
                touch(0); return; }
        });
        /* 🔒 Pistes verrouillées : leurs éléments ne se déplacent, ne se coupent et ne s'enlèvent plus (sur la frise comme sur l'image) */
        const laneIdOf = (track, c) => track === 'v1' ? P.tracks.find(t => t.kind === 'main')?.id : trackOf(P, c, track);
        const isLocked = (track, c) => !!P.tracks.find(t => t.id === laneIdOf(track, c))?.locked;
        const lockToast = () => toast('🔒 Piste verrouillée : clique sur 🔒 à côté de son nom pour la déverrouiller.', 'error');
        /** 📐 Analyse et stabilise une vidéo (une seule analyse à la fois ; Annuler l'arrête) */
        async function stabGo(c) {
            if (stabJob) return toast('Une analyse est déjà en cours.', 'error');
            const so = P.sources[c.s]; if (!so || so.kind !== 'video') return;
            stabJob = {id: c.id, p: 0, stop: false}; drawPane();
            try {
                const r = await analyzeStab(so.src, c.from, c.to, {onStep: p => { if (!stabJob) return; stabJob.p = p; const el = dl.querySelector('[data-mt-stabprog]'); if (el) el.value = p; }, cancelled: () => !stabJob || stabJob.stop || !dl.open});
                if (r) { c = [...P.v1, ...P.v2].find(x => x.id === c.id) || c; const o = c.stab; c.stab = {...r, z: o?.z ?? r.z, sm: o?.sm ?? r.sm}; toast('📐 Vidéo stabilisée : règle l’agrandissement et le lissage si besoin.'); }
                else toast('Stabilisation annulée.');
            } catch (err) { toast(`Stabilisation impossible : ${err.message}`, 'error'); }
            finally { stabJob = null; if (dl.open) touch(0); }
        }
        /** 🥁 Repère les temps d'une musique (son de la piste) */
        async function beatGo(c) {
            if (beatJob) return; const so = P.sources[c.s]; if (!so) return;
            beatJob = {id: c.id}; drawPane();
            try {
                const r = await detectBeats(so.src, c.from, c.to, p => { const el = dl.querySelector('[data-mt-beatprog]'); if (el) el.textContent = `Écoute de la musique… ${Math.round(p * 100)} %`; });
                c = P.audio.find(x => x.id === c.id) || c; c.beats = r.beats; if (r.bpm) c.bpm = r.bpm; else delete c.bpm;
                toast(r.beats.length ? `🥁 ${r.beats.length} temps repérés${r.bpm ? ` (environ ${String(r.bpm).replace('.', ',')} par minute)` : ''}.` : 'Aucun temps net dans ce son (il n’a peut-être pas de rythme marqué).', r.beats.length ? '' : 'error');
            } catch (err) { toast(`Temps introuvables : ${err.message}`, 'error'); }
            finally { beatJob = null; if (dl.open) touch(0); }
        }
        /** ✂️ Coupe les morceaux de la piste 1 sur les temps de cette musique (un temps sur beatEvery), hors des transitions */
        function beatCut(c) {
            if (isLocked('v1')) return lockToast();
            const ts = (c.beats || []).filter(b => b > c.from && b < c.to).map(b => c.at + (b - c.from) / spd(c)).filter((_, i) => i % beatEvery === 0);
            let n = 0;
            for (const T of ts) {
                const L = layoutV1(P), k = L.findIndex(x => T > x.at + 0.12 && T < x.end - 0.12); if (k < 0) continue;
                const x = L[k], nx = L[k + 1]; if ((x.cross && T < x.at + x.cross) || (nx?.cross && T > nx.at - 0.05)) continue; // pas au milieu d'une transition
                const local = x.c.from + (T - x.at) * spd(x.c), b2 = {...JSON.parse(JSON.stringify(x.c)), id: nid('v'), from: local, tr: {type: 'none', d: 1}}; x.c.to = local; P.v1.splice(k + 1, 0, b2); n++;
            }
            if (!n) return toast('Aucune coupe possible : la musique doit passer en même temps qu’une vidéo de la piste 1.', 'error');
            toast(`✂️ ${A().plural(n, 'coupe')} sur les temps de la musique.`); touch(1);
        }
        // sur l'image : glisser une incrustation ou un texte pour le déplacer, tirer son coin pour changer sa taille
        const measure = document.createElement('canvas').getContext('2d');
        const boxOf = (track, c) => {
            const W = cv.width, H = cv.height, t = eng?.t || 0;
            if (track === 'v2') { if (t < c.at || t >= c.at + clen(c)) return null; const s = eng.videoSize(c.id) || {vw: 16, vh: 9}; return v2Box(c, s.vw, s.vh, W, H); }
            if (track === 'texts') { if (t < c.at || t >= c.at + c.dur) return null; const size = (c.size || 6) / 100 * Math.min(H, W), lines = String(c.text || ' ').split('\n'); measure.font = `${c.bold ? '700 ' : ''}${size}px ${c.font || 'Georgia, serif'}`;
                const w = Math.max(...lines.map(l => measure.measureText(l).width)) + size, h = lines.length * size * 1.25 + size * 0.3, cx = (c.x ?? 50) / 100 * W, cy = (c.y ?? 80) / 100 * H;
                return {x: c.align === 'left' ? cx - size / 2 : c.align === 'right' ? cx - w + size / 2 : cx - w / 2, y: cy - h / 2, w, h}; }
            return null;
        };
        const HANDLE = () => Math.max(10, cv.width / 60);
        const decorate = (g2) => {
            const c = selected(); if (!c || !['v2', 'texts'].includes(sel.track)) return; const b = boxOf(sel.track, c); if (!b) return;
            const hs = HANDLE(); g2.lineWidth = Math.max(2, cv.width / 500); g2.setLineDash([8, 6]); g2.strokeStyle = '#2f80ff'; g2.strokeRect(b.x, b.y, b.w, b.h);
            g2.setLineDash([]); g2.fillStyle = '#fff'; g2.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs); g2.strokeRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
        };
        cv.addEventListener('pointerdown', e => {
            if (!eng) return; const r = cv.getBoundingClientRect(), k = cv.width / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
            const inside = (b, pad = 0) => b && px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
            const cands = [...(sel && ['v2', 'texts'].includes(sel.track) && selected() ? [[sel.track, selected()]] : []), ...P.texts.slice().reverse().map(x => ['texts', x]), ...P.v2.slice().reverse().map(x => ['v2', x])];
            const hit = cands.find(([tr, c]) => inside(boxOf(tr, c), HANDLE() / 2)); if (!hit) return;
            e.preventDefault();
            if (isLocked(hit[0], hit[1])) { sel = {track: hit[0], id: hit[1].id}; drawTl(); eng.redraw(); return lockToast(); }
            cv.setPointerCapture(e.pointerId);
            const [track, c] = hit, b0 = boxOf(track, c), hs = HANDLE(), resize = px >= b0.x + b0.w - hs && py >= b0.y + b0.h - hs;
            sel = {track, id: c.id}; drawTl(); eng.redraw();
            let s0 = {x: c.x, y: c.y, w: c.w, size: c.size};
            const mv = ev => {
                const dx = ((ev.clientX - r.left) * k - px), dy = ((ev.clientY - r.top) * k - py);
                // une incrustation « tout l'écran » qu'on déplace ou qu'on retaille garde sa place de départ, puis se règle à la main
                if (track === 'v2' && c.full) { if (Math.hypot(dx, dy) < 3) return; c.w = Math.round(b0.w / cv.width * 1000) / 10; c.x = Math.round(b0.x / cv.width * 1000) / 10; c.y = Math.round(b0.y / cv.height * 1000) / 10; delete c.full; s0 = {x: c.x, y: c.y, w: c.w, size: c.size}; }
                if (resize) { if (track === 'v2') c.w = Math.max(8, Math.min(300, Math.round(((s0.w || 35) / 100 * cv.width + dx) / cv.width * 1000) / 10)); else c.size = Math.max(1.5, Math.min(30, Math.round(((s0.size || 6) * (1 + dy / Math.max(20, b0.h))) * 10) / 10)); }
                else { c.x = Math.max(-100, Math.min(110, Math.round(((s0.x ?? (track === 'v2' ? 62 : 50)) + dx / cv.width * 100) * 10) / 10)); c.y = Math.max(-100, Math.min(110, Math.round(((s0.y ?? (track === 'v2' ? 6 : 80)) + dy / cv.height * 100) * 10) / 10)); }
                dirty = true; eng.redraw();
            };
            const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); touch(0); };
            cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        });
        cv.addEventListener('pointermove', e => { if (e.buttons || !eng) return; const r = cv.getBoundingClientRect(), k = cv.width / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k, c = selected();
            const b = c && ['v2', 'texts'].includes(sel?.track) ? boxOf(sel.track, c) : null, hs = HANDLE();
            cv.style.cursor = b && px >= b.x + b.w - hs && px <= b.x + b.w + hs && py >= b.y + b.h - hs && py <= b.y + b.h + hs ? 'nwse-resize' : [...P.texts.map(x => ['texts', x]), ...P.v2.map(x => ['v2', x])].some(([tr, x]) => { const bb = boxOf(tr, x); return bb && px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + bb.h; }) ? 'move' : ''; });
        // frise : choisir, se placer, déplacer
        const tl = $('[data-mt-tl]');
        tl.addEventListener('pointerdown', e => {
            window.getSelection()?.removeAllRanges(); // un texte sélectionné ailleurs ne part pas en glisser-déposer
            const clip = e.target.closest('[data-mt-clip]'), x0 = e.clientX, inner = tl.querySelector('.h-mt-tlin'), r = inner.getBoundingClientRect();
            const cg = e.target.closest('[data-mt-chapgo]'); if (cg) { e.preventDefault(); eng.seek(Number(cg.dataset.mtChapgo)); return; }
            if (!clip) { if (e.target.closest('.h-mt-lname, .h-mt-addtracks')) return; eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const [track, id] = clip.dataset.mtClip.split(':'); sel = {track, id};
            const c = selected(); drawTl();
            if (!c) { eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const L0 = layoutV1(P), at0 = track === 'v1' ? (L0.find(x => x.c === c)?.at || 0) : c.at, el = tl.querySelector(`[data-mt-clip="${track}:${id}"]`); let moved = false, y0 = e.clientY;
            // pendant le glissement : l'élément suit la souris (aussi vers une autre piste), la piste visée s'éclaire (bleu : elle l'accepte, rouge : non),
            // et la frise défile toute seule quand on approche de son bord (une piste cachée plus bas ou plus haut reste atteignable)
            const sx0 = tl.scrollLeft, sy0 = tl.scrollTop, maxTop = Math.max(0, tl.scrollHeight - tl.clientHeight), okKinds = track === 'v1' || track === 'v2' ? ['main', 'v'] : [KIND_OF_LIST[track]];
            let last = e, raf = 0, hot = null, warned = false;
            const locked = isLocked(track, c); // 🔒 piste verrouillée : on peut choisir l'élément, pas le déplacer
            const laneAt = ev => document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-mt-lane]');
            // 🧲 aimant : la tête de lecture, le début et la fin des autres éléments (toutes pistes), les chapitres, les temps des musiques
            const len = track === 'v1' ? 0 : lenOf(c), targets = [];
            if (track !== 'v1') {
                targets.push(0, eng?.t || 0, ...(P.chapters || []).map(x => x.t));
                L0.forEach(x => { if (x.c !== c) targets.push(x.at, x.end); });
                [...P.v2, ...P.texts, ...P.audio].forEach(x => { if (x !== c) targets.push(x.at, x.at + lenOf(x)); });
                P.audio.forEach(a => { if (a !== c) (a.beats || []).forEach(b => { if (b >= a.from && b <= a.to) targets.push(a.at + (b - a.from) / spd(a)); }); });
            }
            const guide = document.createElement('i'); guide.className = 'h-mt-snapline'; guide.hidden = true; tl.querySelector('.h-mt-tlin')?.appendChild(guide); // la frise vient d'être redessinée
            const snapTo = (at, ev) => {
                guide.hidden = true; if (!snapOn || ev.altKey || !targets.length) return null;
                let best = null; for (const t of targets) for (const edge of [0, len]) { const d = t - (at + edge); if (Math.abs(d) * pxs <= 8 && (!best || Math.abs(d) < Math.abs(best.d))) best = {d, t}; }
                if (!best || at + best.d < 0) return null; guide.style.left = (OFF + best.t * pxs) + 'px'; guide.hidden = false; return at + best.d;
            };
            const place = ev => {
                const d = (ev.clientX - x0 + tl.scrollLeft - sx0) / pxs; if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 6) moved = true; if (!moved) return;
                if (locked) { if (!warned) { warned = true; lockToast(); } return; }
                const raw = Math.max(0, at0 + d), sn = track === 'v1' ? null : snapTo(raw, ev), at = sn ?? Math.max(0, Math.round(raw * 10) / 10); if (track !== 'v1') c.at = sn === null ? at : Math.round(at * 1000) / 1000;
                if (el) { el.style.left = (OFF + at * pxs) + 'px'; el.style.pointerEvents = 'none'; el.style.zIndex = '5'; el.style.transform = `translateY(${ev.clientY - y0 + tl.scrollTop - sy0}px)`; }
                const ln = laneAt(ev), ok = ln && okKinds.includes(ln.dataset.kind) && !P.tracks.find(t => t.id === ln.dataset.mtLane)?.locked; if (ln !== hot || ln) { hot?.classList.remove('is-drop', 'is-drop-no'); hot = ln; ln?.classList.add(ok ? 'is-drop' : 'is-drop-no'); }
            };
            const edge = () => {
                const b = tl.getBoundingClientRect(), m = 34, sp = v => Math.round(Math.min(1, v / m) * 14);
                const dy = last.clientY > b.bottom - m ? sp(last.clientY - (b.bottom - m)) : last.clientY < b.top + m ? -sp(b.top + m - last.clientY) : 0;
                const dx = last.clientX > b.right - m ? sp(last.clientX - (b.right - m)) : last.clientX < b.left + OFF + m && tl.scrollLeft > 0 ? -sp(b.left + OFF + m - last.clientX) : 0;
                if (moved && (dx || dy)) { const t0 = tl.scrollTop, l0 = tl.scrollLeft; tl.scrollTop = Math.max(0, Math.min(maxTop, t0 + dy)); tl.scrollLeft += dx; if (tl.scrollTop !== t0 || tl.scrollLeft !== l0) place(last); }
                raf = requestAnimationFrame(edge);
            };
            raf = requestAnimationFrame(edge);
            const mv = ev => { last = ev; place(ev); };
            const up = ev => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); cancelAnimationFrame(raf); hot?.classList.remove('is-drop', 'is-drop-no'); guide.remove();
                if (!moved) return eng.seek((ev.clientX - r.left - OFF) / pxs);
                if (locked) return drawTl(false);
                const drop = Math.max(0, at0 + (ev.clientX - x0 + tl.scrollLeft - sx0) / pxs);
                const ln = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-mt-lane]'), kind = ln?.dataset.kind;
                if (ln && P.tracks.find(t => t.id === ln.dataset.mtLane)?.locked && ln.dataset.mtLane !== laneIdOf(track, c)) { if (track !== 'v1') c.at = at0; lockToast(); return drawTl(false); } // pas sur une piste verrouillée
                if (track === 'v1') {
                    if (kind === 'v') { // la piste principale → une piste d'incrustation (vidéo ou photo)
                        P.v1.splice(P.v1.indexOf(c), 1); const k = {...c, id: nid('i'), at: Math.round(drop * 10) / 10, full: true, border: false, w: 35, x: 62, y: 6, opacity: 100, track: ln.dataset.mtLane}; delete k.tr;
                        if (P.v1[0]?.tr) P.v1[0].tr = {type: 'none', d: 1};
                        P.v2.push(k); sel = {track: 'v2', id: k.id}; return touch(1);
                    }
                    if (kind === 'main') { // ranger dans la piste principale : d'après le moment où on le lâche
                        const rest = P.v1.filter(x => x !== c), Lr = layoutV1({...P, v1: rest}); let j = Lr.findIndex(x => drop < (x.at + x.end) / 2); if (j < 0) j = rest.length;
                        rest.splice(j, 0, c); P.v1.splice(0, P.v1.length, ...rest); if (P.v1[0]?.tr) P.v1[0].tr = {...P.v1[0].tr, type: 'none'}; return touch(1);
                    }
                    if (kind) toast('Une vidéo ou une photo ne va que sur une piste vidéo.', 'error');
                    return drawTl(false);
                }
                if (track === 'v2' && kind === 'main') { // une incrustation → à la suite dans la piste principale, à l'endroit lâché
                    P.v2.splice(P.v2.indexOf(c), 1); const k = {id: nid('v'), s: c.s, from: c.from, to: c.to, look: c.look || {}, vol: c.vol ?? 1, mute: c.mute, tf: c.tf, kf: c.kf, blend: c.blend, tfOn: c.tfOn, cropOn: c.cropOn, distOn: c.distOn, ease: c.ease, tr: {type: 'none', d: 1}};
                    const L = layoutV1(P); let j = L.findIndex(x => drop < (x.at + x.end) / 2); if (j < 0) j = P.v1.length; P.v1.splice(j, 0, k); sel = {track: 'v1', id: k.id}; return touch(1);
                }
                if (ln && kind === KIND_OF_LIST[track] && ln.dataset.mtLane !== trackOf(P, c, track)) c.track = ln.dataset.mtLane; // posé sur une autre piste du même genre
                else if (ln && kind && kind !== KIND_OF_LIST[track]) { c.at = at0; toast('Pas sur cette piste : il faut une piste du même genre.', 'error'); } // refusé : il reprend sa place
                touch(1); };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
        });
        $('[data-mt-zoom]').addEventListener('input', e => { pxs = Number(e.target.value); drawTl(); mtBar?.sync(); });
        // K18 : la barre du bas commune — le projet à gauche, l'aide au milieu, 🧲 et le zoom de la frise à droite (100 % = 40 points par seconde)
        const mtBar = window.LCNDA_UI?.editorStatus?.({help: 'Clic sur la frise : se placer · clic sur un élément : le choisir · glisser : le déplacer · Espace : lire · B : couper ici · ⌫ : enlever',
            magnetTitle: 'Aimanter : un élément glissé se colle à la tête de lecture, aux autres éléments, aux chapitres et aux temps de la musique (Alt / Option : sans aimant)',
            magnet: {get: () => snapOn, set: () => $('[data-mt-snap]').click()},
            zoom: {get: () => pxs / 40, set: k => { const z = $('[data-mt-zoom]'); z.value = String(Math.round(Math.max(4, Math.min(200, k * 40)))); z.dispatchEvent(new Event('input', {bubbles: true})); },
                fit: () => { const w = (tl.clientWidth || 800) - OFF - 40, z = $('[data-mt-zoom]'); z.value = String(Math.round(Math.max(4, Math.min(200, w / Math.max(1, montageEnd(P)))))); z.dispatchEvent(new Event('input', {bubbles: true})); }, min: .1, max: 5}});
        { // K19 : les outils du montage dans une colonne de 36 px à gauche (le texte en bulle) ; la rangée d'origine est cachée
            const rail = document.createElement('nav'); rail.className = 'h-mt-rail'; rail.setAttribute('aria-label', 'Outils du montage'); $('.h-mt').prepend(rail);
            window.LCNDA_UI?.railProxy?.(rail, $('.h-mt-ops').querySelectorAll('[data-mt-op]'), {icons: {split: '✂️', start: '⟦', end: '⟧', left: '←', right: '→', detach: '🔊', del: '🗑', addv1: '🎞️', addv2: '🖼️', kfprev: '◀◆', kfnext: '◆▶', addtext: '🔤', adda: '🎵', voice: '🎙', sub: '💬', chapter: '🔖'}});
            window.LCNDA_UI?.editorRail?.(rail, {breaks: ['[data-ed-proxy="addv1"]', '[data-ed-proxy="kfprev"]', '[data-ed-proxy="addtext"]']}); $('.h-mt-ops').classList.add('ed-old-hidden');
        }
        if (mtBar) { $('.h-mt').appendChild(mtBar); const pn = $('[data-mt-projname]'); if (pn) mtBar.setWhere(pn); }
        // K19 : les actions de fin seulement en haut, dans « 💾 Enregistrer ▾ » (les boutons d'en bas restent cachés, pour leurs écouteurs)
        window.LCNDA_UI?.saveMenu?.($('[data-mt-saveproj]'), () => [{icon: '💾', label: 'Enregistrer le projet (pour continuer plus tard)', shortcut: '⌘S', run: () => $('[data-mt-saveproj]')?.click()}, {icon: '🎞️', label: 'Garder dans les médias (fabriquer la vidéo)…', run: () => $('[data-avx-save]')?.click()}, '-', {icon: '📂', label: 'Projets…', run: () => $('[data-mt-projects]')?.click()}]);
        // pistes : ajouter, cacher, monter, descendre, supprimer, renommer
        tl.addEventListener('click', async e => {
            const b = e.target.closest('[data-mt-addtrack],[data-mt-tvis],[data-mt-tlock],[data-mt-tup],[data-mt-tdown],[data-mt-tdel]'); if (!b) return;
            e.stopPropagation(); const d = b.dataset;
            if (d.mtAddtrack) { const id = addTrack(d.mtAddtrack); toast(`Piste « ${P.tracks.find(t => t.id === id).name} » ajoutée.`); return touch(0); }
            const id = d.mtTvis || d.mtTlock || d.mtTup || d.mtTdown || d.mtTdel, i = trackIdx(P, id), tr = P.tracks[i]; if (!tr) return;
            if (d.mtTvis) { tr.hidden = !tr.hidden; return touch(1); }
            if (d.mtTlock) { if (tr.locked) delete tr.locked; else tr.locked = true; toast(tr.locked ? `🔒 Piste « ${tr.name} » verrouillée : ses éléments ne bougent plus.` : `🔓 Piste « ${tr.name} » déverrouillée.`); return touch(0); }
            if (d.mtTdel && tr.locked) return lockToast();
            if (d.mtTup || d.mtTdown) { const j = i + (d.mtTup ? -1 : 1); if (j < 0 || j >= P.tracks.length) return; [P.tracks[i], P.tracks[j]] = [P.tracks[j], P.tracks[i]]; return touch(0); }
            if (d.mtTdel && tr.kind === 'main') { // la piste de base du film reste : on la vide
                if (!P.v1.length) return toast('Cette piste est déjà vide.');
                const gone = new Set(P.v1.map(c => c.id)); P.v1.forEach(c => { if (c.detached) { const a = P.audio.find(x => x.id === c.detached); if (a) delete a.detached; } }); P.v1.splice(0);
                if (sel && gone.has(sel.id)) sel = null; const r = touch(1); undoable(`Piste « ${tr.name} » vidée`); return r;
            }
            if (d.mtTdel) {
                const list = LISTS[tr.kind], mine = list.filter(c => trackOf(P, c, LISTNAME[tr.kind]) === id);
                mine.forEach(c => { if (tr.kind === 'a') undetach(c); list.splice(list.indexOf(c), 1); });
                P.tracks.splice(i, 1); if (sel && mine.some(c => c.id === sel.id)) sel = null; const r = touch(1); undoable(`Piste « ${tr.name} » supprimée${mine.length ? ` (avec ${A().plural(mine.length, 'élément')})` : ''}`); return r;
            }
        });
        tl.addEventListener('dblclick', async e => { const n = e.target.closest('[data-mt-tname]'); if (!n) return; const tr = P.tracks.find(t => t.id === n.dataset.mtTname); const name = ((await window.LCNDA_APP.askText({message: 'Nom de la piste :', value: tr.name})) || '').trim().slice(0, 40); if (name) { tr.name = name; touch(0); } });
        // lecture
        // le bouton change tout de suite ; la lecture démarre dès que les morceaux du moment sont prêts
        const play = () => { const b = $('[data-mt-play]'); if (eng.playing || eng.starting) { eng.pause(); b.textContent = '▶ Lire'; } else { b.textContent = '⏸ Pause'; eng.play().catch(() => { b.textContent = '▶ Lire'; }); } };
        $('[data-mt-play]').addEventListener('click', play);
        $('[data-mt-home]').addEventListener('click', () => eng.seek(0));
        $('[data-mt-snap]').addEventListener('click', e => { snapOn = !snapOn; const b = e.currentTarget; b.classList.toggle('is-on', snapOn); b.setAttribute('aria-pressed', String(snapOn));
            let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {} v.snap = snapOn; try { localStorage.setItem(MT_KEY, JSON.stringify(v)); } catch (_) {}
            toast(snapOn ? '🧲 Aimant : un élément glissé se colle aux autres (Alt / Option pour s’en passer).' : 'Aimant arrêté.'); });
        // au niveau de la page : après un clic sur la frise (redessinée), le focus peut ne plus être dans la fenêtre
        const keyAc = new AbortController(); dl.addEventListener('close', () => keyAc.abort());
        document.addEventListener('keydown', e => {
            if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return; // une autre fenêtre par-dessus
            if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undoTo(e.shiftKey ? hpos + 1 : hpos - 1); return; }
            if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); undoTo(hpos + 1); return; }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === ' ') { e.preventDefault(); play(); return; }
            // ⌫ (Retour arrière) ou Suppr : enlever l'élément choisi ; B : couper à la tête de lecture
            if ((e.key === 'Backspace' || e.key === 'Delete') && selected()) { e.preventDefault(); dl.querySelector('[data-mt-op="del"]')?.click(); return; }
            if (e.key === 'b' || e.key === 'B') { e.preventDefault(); dl.querySelector('[data-mt-op="split"]')?.click(); }
        }, {signal: keyAc.signal});
        // outils
        // un rush (vidéo, photo, son) entre dans le projet : il apparaît dans l'onglet 🎞️ Rush ; le fichier d'un rush importé
        // de l'ordinateur est gardé à part (pas dans le JSON) pour être envoyé dans les Médias quand on enregistre le projet
        const pushSource = async (o, kind) => {
            try {
                const m = kind === 'image' ? await loadImageMeta(o.src) : kind === 'video' ? await loadMeta(o.src) : await new Promise((res, rej) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => realDuration(a).then(dur => res({dur}), () => rej(new Error('Son illisible (durée inconnue)'))); a.onerror = () => rej(new Error('Son illisible')); a.src = o.src; });
                const src = {src: o.src, title: o.title, kind, ...m, ...(o.media?.id ? {mediaId: o.media.id} : {}), ...(rushDir ? {folder: rushDir} : {})}; // rangé dans le dossier ouvert
                if (o.file) Object.defineProperty(src, '_file', {value: o.file, enumerable: false});
                P.sources.push(src); dirty = true; drawRush(); return P.sources.length - 1;
            } catch (e) { toast(`${o.title || 'Fichier'} : ${e.message}`, 'error'); return null; }
        };
        const addSource = async kind => { const o = await pickOther(kind, {eyebrow: 'MONTAGE'}); if (!o) return null; if (kind === 'visual') kind = o.kind === 'image' ? 'image' : 'video'; return pushSource(o, kind); };
        // poser un rush sur la frise : à la suite (Vidéo 1), en incrustation ou en son, au moment voulu
        const placeRush = (s, how, at = null) => {
            const so = P.sources[s]; if (!so) return; const t = at ?? eng?.t ?? 0;
            if (so.kind === 'audio' || how === 'a' || how === 'asound' || /^A\d/.test(how || '')) { if (so.kind === 'image') return toast('Une photo n’a pas de son.', 'error'); const k = {id: nid('a'), s, from: 0, to: so.dur, at: t, vol: 1, fadeIn: 0, fadeOut: 1}; k.track = how?.startsWith?.('A') ? how : freeTrack('a', t, k.to); P.audio.push(k); sel = {track: 'audio', id: k.id}; }
            else if (how === 'v1') { if (isLocked('v1')) return lockToast(); const k = {id: nid('v'), s, from: 0, to: srcLen(s), tr: {type: P.v1.length ? 'cross' : 'none', d: 1}, look: {}, vol: 1};
                // posé à un endroit précis de la frise : il se range entre les morceaux, sinon à la fin
                const L = layoutV1(P), idx = at === null ? -1 : L.findIndex(x => (x.at + x.end) / 2 > at); if (idx < 0) P.v1.push(k); else { P.v1.splice(idx, 0, k); if (idx === 0) { k.tr = {type: 'none', d: 1}; if (P.v1[1]) P.v1[1].tr = {type: 'cross', d: 1}; } } sel = {track: 'v1', id: k.id}; }
            else { const k = {id: nid('i'), s, from: 0, to: srcLen(s), at: t, full: true, border: false, w: 35, x: 62, y: 6, opacity: 100, vol: so.kind === 'video' ? 1 : 0}; /* une vidéo garde son son */ k.track = how?.startsWith?.('V') && how !== 'V1' ? how : freeTrack('v', t, k.to); P.v2.push(k); sel = {track: 'v2', id: k.id}; }
            touch(1); drawRush();
        };
        const usesOf = s => [...P.v1, ...P.v2, ...P.audio].filter(c => c.s === s).length;
        let rushKey = '', rushDir = '', rushSort = 'added';
        try { rushSort = ['added', 'name', 'kind'].includes(localStorage.getItem('lcnda-mt-rush-sort')) ? localStorage.getItem('lcnda-mt-rush-sort') : 'added'; } catch (_) {}
        // 📁 les dossiers des rushes, comme dans un logiciel de montage : dossiers, sous-dossiers, glisser pour ranger
        const folderOf = id => P.folders.find(f => f.id === id);
        const subOf = id => P.folders.filter(f => (f.parent || '') === (id || ''));
        const inside = (id, anc) => { for (let q = id; q; q = folderOf(q)?.parent) if (q === anc) return true; return false; }; // id est dans anc (ou anc lui-même)
        const pathOf = id => { const out = []; for (let q = id; q && out.length < 50; q = folderOf(q)?.parent) out.unshift(folderOf(q)); return out.filter(Boolean); };
        const countIn = id => P.sources.filter(x => x.folder && inside(x.folder, id)).length;
        const folderLabel = id => id ? pathOf(id).map(f => f.name).join(' › ') : 'Tous les rushes (racine)';
        function drawRush(force = false) {
            const pane = $('[data-mt-pane="rush"]'); if (!pane) return;
            if (rushDir && !folderOf(rushDir)) rushDir = '';
            const key = P.sources.map((x, i) => x.src + ':' + usesOf(i) + ':' + (x.folder || '') + ':' + x.title).join('|') + '#' + JSON.stringify(P.folders) + rushDir + rushSort; if (!force && key === rushKey) return; rushKey = key;
            const thumb = (x, i) => x.kind === 'image' ? `<img src="${esc(x.src)}" alt="" loading="lazy">` : x.kind === 'video' ? `<video src="${esc(x.src)}#t=0.5" muted preload="metadata" playsinline></video><i class="h-mt-rdur">${fmt(x.dur, false)}</i>` : `<span class="h-mt-raudio">🎵</span><i class="h-mt-rdur">${fmt(x.dur, false)}</i>`;
            const here = P.sources.map((x, i) => [x, i]).filter(([x]) => (x.folder || '') === rushDir);
            const ord = {video: 0, image: 1, audio: 2}, coll = new Intl.Collator('fr', {numeric: true, sensitivity: 'base'});
            if (rushSort === 'name') here.sort((a, b) => coll.compare(a[0].title || '', b[0].title || ''));
            if (rushSort === 'kind') here.sort((a, b) => ord[a[0].kind] - ord[b[0].kind] || coll.compare(a[0].title || '', b[0].title || ''));
            const dirs = subOf(rushDir).sort((a, b) => coll.compare(a.name, b.name));
            const crumbs = [`<button type="button" data-mt-rdir="" class="${rushDir ? '' : 'is-cur'}" title="Revenir à la racine (on peut y déposer un rush ou un dossier)">🎞️ Tous</button>`, ...pathOf(rushDir).map(f => `<button type="button" data-mt-rdir="${esc(f.id)}" class="${f.id === rushDir ? 'is-cur' : ''}">${esc(f.name)}</button>`)].join('<span>›</span>');
            pane.innerHTML = `<div class="h-mt-rhead"><h4>🎞️ Rushes</h4><span class="muted">${P.sources.length || 'aucun'}</span></div>
                <div class="h-mt-rbar"><label class="button small" title="Vidéos, photos ou sons de l’ordinateur (plusieurs à la fois), rangés dans le dossier ouvert">⤒ Importer<input type="file" multiple accept="video/*,image/*,audio/*" data-mt-rimport hidden></label><button type="button" class="button small secondary" data-mt-rbase>🗂 De la base</button><button type="button" class="button small secondary" data-mt-rnewdir title="Nouveau dossier dans le dossier ouvert">📁＋ Dossier</button>
                    <select data-mt-rsort aria-label="Trier les rushes" title="Trier les rushes"><option value="added" ${rushSort === 'added' ? 'selected' : ''}>Ordre d’arrivée</option><option value="name" ${rushSort === 'name' ? 'selected' : ''}>Nom</option><option value="kind" ${rushSort === 'kind' ? 'selected' : ''}>Genre (vidéo, photo, son)</option></select></div>
                ${P.folders.length || rushDir ? `<nav class="h-mt-rcrumbs" aria-label="Dossier ouvert">${crumbs}</nav>` : ''}
                ${here.length || dirs.length ? `<div class="h-mt-rgrid">${dirs.map(f => { const n = countIn(f.id), sub = subOf(f.id).length; return `<figure class="h-mt-rush h-mt-rfolder" draggable="true" data-mt-rfolder="${esc(f.id)}" title="Clic pour ouvrir ; glisse un rush ou un dossier dessus pour l’y ranger">
                    <div class="h-mt-rthumb is-folder"><span>📁</span>${n ? `<b class="h-mt-ruse" title="Rushes dedans (sous-dossiers compris)">${n}</b>` : ''}</div>
                    <figcaption>${esc(f.name)}</figcaption><small class="h-mt-rfmeta">${n} rush${n > 1 ? 'es' : ''}${sub ? ` · ${sub} dossier${sub > 1 ? 's' : ''}` : ''}</small>
                    <div class="h-mt-racts"><button type="button" data-mt-rfopen title="Ouvrir ce dossier">Ouvrir</button><button type="button" data-mt-rfmove title="Mettre ce dossier dans un autre">📁</button><button type="button" data-mt-rfren title="Renommer ce dossier">✎</button><button type="button" data-mt-rfdel title="Supprimer ce dossier (ce qu’il contient remonte d’un cran)">🗑</button></div></figure>`; }).join('')}${here.map(([x, i]) => { const n = usesOf(i); return `<figure class="h-mt-rush" draggable="true" data-mt-rush="${i}" title="Glisse-le sur une piste de la frise">
                    <div class="h-mt-rthumb is-${x.kind}">${thumb(x, i)}${n ? `<b class="h-mt-ruse" title="Sur la frise">${n}×</b>` : ''}</div>
                    <figcaption>${esc(x.title || 'Sans titre')}</figcaption>
                    <div class="h-mt-racts">${x.kind === 'audio' ? `<button type="button" data-mt-rplace="a" title="Sur une piste son, à la tête de lecture">＋ Son</button>` : `<button type="button" data-mt-rplace="v1" title="À la suite dans Vidéo 1">＋ À la suite</button><button type="button" data-mt-rplace="v2" title="En incrustation, à la tête de lecture">＋ Incruster</button>${x.kind === 'video' ? '<button type="button" data-mt-rplace="asound" title="Seulement le son de cette vidéo, sur une piste son">＋ Son seul</button>' : ''}`}<button type="button" data-mt-rmove title="Ranger ce rush dans un dossier">📁</button><button type="button" data-mt-rren title="Renommer ce rush">✎</button><button type="button" data-mt-rdel title="${n ? `Supprimer ce rush du projet (et ses ${n} passage${n > 1 ? 's' : ''} sur la frise)` : 'Supprimer ce rush du projet'}">🗑</button></div></figure>`; }).join('')}</div>`
                : P.sources.length ? `<p class="muted h-mt-rempty">Ce dossier est vide : glisse un rush sur son nom en haut, ou importe ici.</p>` : `<p class="muted h-mt-rempty">Importe tes vidéos, photos et sons : ils attendent ici, prêts à être glissés sur la frise.</p>`}`;
        }
        /** Choisir un dossier (pour y ranger un rush ou un dossier) : la liste de tous, en arbre */
        const pickFolder = (title, skip = null) => new Promise(res => {
            const rows = [], walk = (id, depth) => subOf(id).sort((a, b) => a.name.localeCompare(b.name, 'fr')).forEach(f => { if (skip && inside(f.id, skip)) return; rows.push([f.id, depth, f.name]); walk(f.id, depth + 1); });
            walk('', 1);
            const d = document.createElement('dialog'); d.className = 'h-mt-rpick';
            d.innerHTML = `<form method="dialog"><h4>${esc(title)}</h4><div class="h-mt-rpicklist"><button value="" type="submit">🎞️ Tous les rushes (racine)</button>${rows.map(([id, dep, n]) => `<button value="${esc(id)}" type="submit" style="padding-left:${dep * 14}px">📁 ${esc(n)}</button>`).join('')}<button value="__new" type="submit">＋ Nouveau dossier…</button></div><menu><button value="__cancel" type="submit" class="button small secondary">Annuler</button></menu></form>`;
            dl.appendChild(d); d.addEventListener('close', () => { const v = d.returnValue; d.remove(); res(v === '__cancel' || v === undefined ? null : v); }, {once: true});
            d.addEventListener('cancel', () => { d.returnValue = '__cancel'; });
            d.showModal();
        });
        const newFolder = async parent => {
            const n = ((await A().askText({title: 'Nouveau dossier', message: `Nom du dossier${parent ? ` (dans « ${folderLabel(parent)} »)` : ''} :`, value: '', okLabel: 'Créer'})) || '').trim().slice(0, 80);
            if (!n) return null;
            if (P.folders.length >= 300) { toast('300 dossiers au plus.', 'error'); return null; }
            let id; do id = 'F' + (++uid) + Math.random().toString(36).slice(2, 6); while (folderOf(id));
            P.folders.push({id, name: n, ...(parent ? {parent} : {})}); dirty = true; return id;
        };
        const moveRush = (i, dir) => { const x = P.sources[i]; if (!x) return; if (dir) x.folder = dir; else delete x.folder; dirty = true; drawRush(true); toast(`« ${x.title || 'Rush'} » rangé dans ${dir ? `« ${folderLabel(dir)} »` : 'la racine'}.`); };
        const moveFolder = (id, dir) => { const f = folderOf(id); if (!f) return; if (dir && inside(dir, id)) return toast('Un dossier ne peut pas aller dans lui-même ni dans un de ses sous-dossiers.', 'error'); if (dir) f.parent = dir; else delete f.parent; dirty = true; drawRush(true); };
        $('[data-mt-pane="rush"]').addEventListener('change', e => { const so = e.target.closest('[data-mt-rsort]'); if (!so) return; rushSort = so.value; try { localStorage.setItem('lcnda-mt-rush-sort', rushSort); } catch (_) {} drawRush(true); });
        // ranger en glissant : un rush ou un dossier, déposé sur un dossier ou sur le fil (« Tous », un dossier parent)
        $('[data-mt-pane="rush"]').addEventListener('dragover', e => { const t = e.target.closest('[data-mt-rfolder],[data-mt-rdir]'); if (!t || !(e.dataTransfer.types.includes('text/x-lcnda-rush') || e.dataTransfer.types.includes('text/x-lcnda-rfolder'))) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('is-drop'); });
        $('[data-mt-pane="rush"]').addEventListener('dragleave', e => e.target.closest?.('[data-mt-rfolder],[data-mt-rdir]')?.classList.remove('is-drop'));
        $('[data-mt-pane="rush"]').addEventListener('drop', e => {
            const t = e.target.closest('[data-mt-rfolder],[data-mt-rdir]'); if (!t) return; e.preventDefault(); t.classList.remove('is-drop');
            const dir = t.dataset.mtRfolder ?? t.dataset.mtRdir, r = e.dataTransfer.getData('text/x-lcnda-rush'), f = e.dataTransfer.getData('text/x-lcnda-rfolder');
            if (r !== '') moveRush(Number(r), dir); else if (f && f !== dir) moveFolder(f, dir);
        });
        // E4 : des vidéos, photos ou sons glissés (ou collés) sur le montage deviennent des rushes ; ils entrent dans les Médias à l'enregistrement du projet
        UIx().bindFileDrop?.(dl.querySelector('.h-mt-top'), async files => { let n = 0; for (const f of files) { const k = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : /^audio\//.test(f.type) ? 'audio' : ''; if (k && await pushSource({src: URL.createObjectURL(f), title: f.name.replace(/\.[^.]+$/, ''), file: f}, k) !== null) n++; } if (n) { $('[data-mt-tab="rush"]')?.click(); toast(`${n} rush${n > 1 ? 'es' : ''} ajouté${n > 1 ? 's' : ''} : glisse-les sur la frise. Ils entrent dans les Médias quand tu enregistres le projet.`); } }, {accept: 'video/*,image/*,audio/*'});
        $('[data-mt-pane="rush"]').addEventListener('change', async e => {
            const inp = e.target.closest('[data-mt-rimport]'); if (!inp) return;
            const files = [...inp.files]; inp.value = ''; let n = 0;
            for (const f of files) { const k = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : /^audio\//.test(f.type) ? 'audio' : ''; if (!k) { toast(`${f.name} : ni vidéo, ni photo, ni son.`, 'error'); continue; } if (await pushSource({src: URL.createObjectURL(f), title: f.name.replace(/\.[^.]+$/, ''), file: f}, k) !== null) n++; }
            if (n) toast(`${n} rush${n > 1 ? 'es' : ''} ajouté${n > 1 ? 's' : ''} : glisse-les sur la frise.`);
        });
        $('[data-mt-pane="rush"]').addEventListener('click', async e => {
            if (e.target.closest('[data-mt-rbase]')) { const list = await pickOther('any', {multiple: true, eyebrow: 'MONTAGE'}); for (const o of list || []) await pushSource(o, o.kind); return; } // plusieurs rushes d'un coup
            if (e.target.closest('[data-mt-rnewdir]')) { if (await newFolder(rushDir)) drawRush(true); return; }
            const crumb = e.target.closest('[data-mt-rdir]'); if (crumb) { rushDir = crumb.dataset.mtRdir; return drawRush(true); }
            const fo = e.target.closest('[data-mt-rfolder]');
            if (fo) {
                const id = fo.dataset.mtRfolder, f = folderOf(id); if (!f) return;
                if (e.target.closest('[data-mt-rfren]')) { const n = ((await A().askText({title: 'Renommer le dossier', message: 'Nouveau nom :', value: f.name, okLabel: 'Renommer'})) || '').trim().slice(0, 80); if (n) { f.name = n; dirty = true; drawRush(true); } return; }
                if (e.target.closest('[data-mt-rfmove]')) { let v = await pickFolder(`Mettre « ${f.name} » dans…`, id); if (v === '__new') v = await newFolder(''); if (v !== null) moveFolder(id, v); return; }
                if (e.target.closest('[data-mt-rfdel]')) { // ce qu'il contient remonte d'un cran : rien ne quitte le projet
                    const n = P.sources.filter(x => x.folder === id).length + subOf(id).length;
                    if (n && !await A().confirmBox(`Ce qu’il contient (${A().plural(n, 'élément')}) remonte dans ${f.parent ? `« ${folderOf(f.parent)?.name} »` : 'la racine'}.`, {title: `Supprimer le dossier « ${f.name} » ?`, okLabel: 'Supprimer le dossier'})) return;
                    P.sources.forEach(x => { if (x.folder === id) { if (f.parent) x.folder = f.parent; else delete x.folder; } });
                    subOf(id).forEach(g => { if (f.parent) g.parent = f.parent; else delete g.parent; });
                    P.folders.splice(P.folders.indexOf(f), 1); dirty = true; drawRush(true); return;
                }
                rushDir = id; return drawRush(true); // un clic sur le dossier l'ouvre
            }
            const fig = e.target.closest('[data-mt-rush]'); if (!fig) return; const i = Number(fig.dataset.mtRush);
            const pl = e.target.closest('[data-mt-rplace]'); if (pl) return placeRush(i, pl.dataset.mtRplace);
            if (e.target.closest('[data-mt-rmove]')) { let v = await pickFolder(`Ranger « ${P.sources[i].title || 'ce rush'} » dans…`); if (v === '__new') v = await newFolder(rushDir); if (v !== null) moveRush(i, v); return; }
            if (e.target.closest('[data-mt-rren]')) { const so = P.sources[i], n = await A().askText({title: 'Renommer le rush', message: 'Nouveau nom :', value: so.title || '', okLabel: 'Renommer'}); if (n === null || !n.trim()) return; so.title = n.trim().slice(0, 200); dirty = true; drawRush(true); drawTl(); return; }
            if (e.target.closest('[data-mt-rdel]')) {
                const so = P.sources[i], n = usesOf(i);
                if (!await A().confirmBox(`${n ? `Il est utilisé ${n} fois sur la frise : ces passages seront retirés aussi. ` : ''}Le fichier reste dans les Médias s’il y est.`, {title: `Supprimer « ${so.title || 'ce rush'} » du projet ?`, okLabel: 'Supprimer le rush'})) return;
                // les passages de ce rush quittent la frise, les numéros des rushes suivants reculent d'un cran, aussi dans les étapes ↶ ↷
                const drop = o => { ['v1', 'v2', 'audio'].forEach(k => { o[k] = (o[k] || []).filter(c => c.s !== i); o[k].forEach(c => { if (c.s > i) c.s--; }); }); return o; };
                drop(P); hist = hist.map(h => JSON.stringify(drop(JSON.parse(h))));
                if (sel && !all().some(([tr, c]) => tr === sel.track && c.id === sel.id)) sel = null;
                P.sources.splice(i, 1); dirty = true; drawRush(true);
                if (n) { await touch(2); record(); syncInspector?.(); }
                toast(n ? `Rush supprimé, avec ses ${n} passage${n > 1 ? 's' : ''} sur la frise.` : 'Rush supprimé.');
            }
        });
        // glisser un rush sur une piste de la frise
        $('[data-mt-pane="rush"]').addEventListener('dragstart', e => { const fo = e.target.closest?.('[data-mt-rfolder]'); if (fo) { e.dataTransfer.setData('text/x-lcnda-rfolder', fo.dataset.mtRfolder); e.dataTransfer.effectAllowed = 'move'; return; } const fig = e.target.closest?.('[data-mt-rush]'); if (!fig) return; e.dataTransfer.setData('text/x-lcnda-rush', fig.dataset.mtRush); e.dataTransfer.effectAllowed = 'copyMove'; });
        const tlEl = $('[data-mt-tl]');
        // la piste visée : celle qui est à la hauteur de la souris (même au-dessus d'un morceau, de la tête de lecture ou du nom de la piste)
        const laneAt = (y, target) => [...tlEl.querySelectorAll('[data-mt-lane]')].find(l => { const r = l.getBoundingClientRect(); return y >= r.top && y < r.bottom; }) || target?.closest?.('[data-mt-lane]');
        tlEl.addEventListener('dragover', e => { if (![...e.dataTransfer.types].includes('text/x-lcnda-rush')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; tlEl.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); laneAt(e.clientY, e.target)?.classList.add('is-drop'); });
        tlEl.addEventListener('dragleave', e => { if (!tlEl.contains(e.relatedTarget)) tlEl.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
        tlEl.addEventListener('drop', e => {
            const v = e.dataTransfer.getData('text/x-lcnda-rush'); if (v === '') return; e.preventDefault(); tlEl.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop'));
            const lane = laneAt(e.clientY, e.target), s = Number(v), so = P.sources[s]; if (!so) return;
            if (lane && P.tracks.find(t => t.id === lane.dataset.mtLane)?.locked) return lockToast();
            const r = tlEl.querySelector('.h-mt-tlin').getBoundingClientRect(), at = Math.max(0, (e.clientX - r.left - OFF) / pxs);
            const kind = lane?.dataset.kind || (so.kind === 'audio' ? 'a' : 'main');
            if (so.kind === 'audio' && kind !== 'a') return toast('Un son se pose sur une piste son.', 'error');
            if (so.kind === 'image' && kind === 'a') return toast('Une photo se pose sur une piste vidéo.', 'error');
            if (so.kind === 'video' && kind === 'a') return placeRush(s, lane.dataset.mtLane, at); // une vidéo sur une piste son : seulement son son
            if (kind === 't') return toast('Une piste texte reçoit des titres (« ＋ Titre / texte »).', 'error');
            placeRush(s, kind === 'main' ? 'v1' : kind === 'a' ? lane.dataset.mtLane : lane?.dataset.mtLane || 'v2', at);
        });
        /* ── 🔖 Chapitres, 💬 sous-titres, 🎙 voix off, 🪄 modèles ── */
        const saveText = (name, text, type) => { if (ext.downloadText) return ext.downloadText(name, text, type); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click(); };
        const chaptersText = () => { const list = [...(P.chapters || [])].sort((a, b) => a.t - b.t); if (list[0] && list[0].t > 0.5) list.unshift({t: 0, title: 'Début'}); const ts = x => { const s2 = Math.floor(x), h = Math.floor(s2 / 3600), m = Math.floor(s2 / 60) % 60; return `${h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')}:${String(s2 % 60).padStart(2, '0')}`; }; return list.map(c => `${ts(c.t)} ${c.title}`).join('\n'); };
        const subTrack = () => P.tracks.find(t => t.kind === 't' && /^sous-titres/i.test(t.name))?.id || (() => { const id = addTrack('t'); P.tracks.find(t => t.id === id).name = 'Sous-titres'; return id; })();
        const subItem = (at, dur, text) => ({id: nid('t'), at, dur, text, size: 4.6, color: '#ffffff', bg: '#000000', font: 'Helvetica, Arial, sans-serif', x: 50, y: 89, anim: 'none', align: 'center', fade: false, shadow: false, sub: true, track: subTrack()});
        const srtTime = x => { const ms = Math.max(0, Math.round(x * 1000)); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
        function importSubs(text) {
            const parseT = v => { const m = String(v).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/); return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000) : null; };
            const cues = String(text).replace(/\r/g, '').replace(/^﻿?WEBVTT[^\n]*\n/, '').split(/\n{2,}/).map(b => { const lines = b.split('\n').filter(Boolean), i = lines.findIndex(l => l.includes('-->')); if (i < 0) return null; const [a, z] = lines[i].split('-->'); const t0 = parseT(a), t1 = parseT(z); if (t0 === null || t1 === null) return null; return {t0, t1, text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim()}; }).filter(c => c && c.text);
            if (!cues.length) return toast('Aucun sous-titre reconnu (fichier .srt ou .vtt).', 'error');
            cues.forEach(c => P.texts.push(subItem(c.t0, Math.max(0.3, c.t1 - c.t0), c.text))); touch(0); toast(`${A().plural(cues.length, 'sous-titre importé', 'sous-titres importés')} sur la piste « Sous-titres ».`);
        }
        function exportSubs() {
            const subs = P.texts.filter(x => x.sub || /^sous-titres/i.test(P.tracks.find(t => t.id === trackOf(P, x, 'texts'))?.name || '')), list = (subs.length ? subs : P.texts).slice().sort((a, b) => a.at - b.at);
            if (!list.length) return toast('Aucun texte à exporter.', 'error');
            saveText(`${(projName || media.title || 'montage').replace(/[^\p{L}\p{N} _-]+/gu, '')}.srt`, list.map((x, i) => `${i + 1}\n${srtTime(x.at)} --> ${srtTime(x.at + x.dur)}\n${String(x.text).replace(/-->/g, '->').replace(/\n\s*\n/g, '\n')}\n`).join('\n'), 'application/x-subrip');
        }
        let voiceRec = null;
        async function voiceOver(btn) {
            if (voiceRec) { voiceRec.finish(); return; }
            let mic; try { mic = await AE.recordMic({name: 'voix-off'}); } catch (e) { return toast(e.message, 'error'); } // le micro du moteur commun
            const at = eng.t;
            const reset = () => { voiceRec = null; btn.textContent = '🎙 Voix off'; btn.classList.remove('is-rec'); eng.pause(); $('[data-mt-play]').textContent = '▶ Lire'; };
            voiceRec = {stream: mic.stream, onstop: true, stop: () => mic.cancel(), finish: async () => {
                if (!voiceRec) return; reset();
                let file; try { ({file} = await mic.stop()); } catch (e) { return toast(e.message, 'error'); }
                const sIdx = await pushSource({src: URL.createObjectURL(file), title: `🎙 Voix off ${fmt(at, false)}`, file}, 'audio'); if (sIdx === null) return;
                let tr = P.tracks.find(x => x.kind === 'a' && /^voix/i.test(x.name))?.id; if (!tr) { tr = addTrack('a'); P.tracks.find(x => x.id === tr).name = 'Voix off'; }
                const k = {id: nid('a'), s: sIdx, from: 0, to: P.sources[sIdx].dur, at, vol: 1, fadeIn: 0, fadeOut: 0.2, voice: true, track: tr}; P.audio.push(k); sel = {track: 'audio', id: k.id};
                await touch(1); toast('Voix off posée sur la piste « Voix off » (la musique baisse pendant qu’elle parle). 💾 Enregistrer le projet l’envoie dans les Médias.');
            }};
            btn.textContent = '⏹ Arrêter la voix off'; btn.classList.add('is-rec');
            toast('🎙 Enregistrement… parle pendant que le film défile (un casque évite que le son du film soit enregistré). ⏹ pour arrêter.');
            if (!eng.playing) { $('[data-mt-play]').textContent = '⏸ Pause'; eng.play().catch(() => {}); }
        }
        /** 🪄 Modèles : « La vie de… » (les photos d'une personne, ses dates) ou « Une famille » (la personne, ses parents, conjoints, enfants) */
        function templateDialog(kind) {
            let chosen = 0;
            ext.openDialog({eyebrow: 'MODÈLE DE MONTAGE', title: kind === 'life' ? '🪄 « La vie de… »' : '🪄 « Une famille »', wide: true, submitLabel: 'Créer le montage',
                body: `<p class="muted">${kind === 'life' ? 'Les photos de la personne, dans l’ordre des dates, avec un titre, sa naissance, ses grandes dates et un mot de la fin.' : 'Le portrait de la personne, puis de ses parents, conjoints et enfants, chacun avec son nom et ses dates.'} Tout reste modifiable ensuite.</p>
                    <div><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'av_tpl', kind: 'person'})}</div>
                    <div class="form-grid"><label>Durée par photo <select name="dur">${[3, 4, 5, 6, 8].map(v => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${v} s</option>`).join('')}</select></label>
                    <label>Transition <select name="tr">${TRANS.map(([k, l]) => `<option value="${k}" ${k === 'cross' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label class="checkbox-line"><input type="checkbox" name="kb" checked> Ken Burns sur les photos</label><label class="checkbox-line"><input type="checkbox" name="music"> Ajouter une musique (choisie ensuite)</label>
                    <label class="checkbox-line"><input type="checkbox" name="chap" checked> Un chapitre par grande étape</label></div>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: async form => { chosen = Number(form.elements.av_tpl?.value) || 0;
                    if (!chosen) return window.LCNDA_UI.fail(form.elements.av_tpl, 'Choisis une personne.');
                    const f = Object.fromEntries(new FormData(form)), dur = Number(f.dur) || 5, trType = f.tr || 'cross', btn = form.querySelector('[type=submit]'); btn.textContent = 'Préparation…';
                    const nm = x => [x?.first_name, x?.last_name].filter(Boolean).join(' ') || x?.name || '';
                    const isPic = m => (m.media_type || 'image') === 'image' && /\.(jpe?g|png|webp|gif)$/i.test(m.filename || '');
                    const yr = v => { const m = String(v || '').match(/(1[5-9]\d\d|20\d\d)/); return m ? Number(m[1]) : null; };
                    const evText = e => [e?.date_text || e?.year, e?.place_name || e?.place].filter(Boolean).join(', ');
                    const r = await A().api('person', {id: chosen}), p = r.person || {}, ev = r.events || [], find = re => ev.find(e => re.test(String(e.type || e.type_label || '')));
                    const birth = find(/naiss|birth|bapt/i), death = find(/décè|deces|death|inhum/i), years = [yr(birth?.date_text || birth?.year), yr(death?.date_text || death?.year)];
                    const slides = []; // {mediaRow, caption, chapter}
                    if (kind === 'life') {
                        const pics = (r.media || []).filter(isPic).sort((a, b) => (yr(a.date_text || a.date || a.title) ?? 9999) - (yr(b.date_text || b.date || b.title) ?? 9999));
                        pics.forEach((m, i) => slides.push({m, caption: [m.title && !/\.(jpe?g|png)$/i.test(m.title) ? m.title : '', m.date_text || ''].filter(Boolean).join(' — '), chapter: i === 0 ? 'Les photos' : ''}));
                    } else {
                        const portrait = rr => (rr.media || []).find(isPic);
                        const me = portrait(r); if (me) slides.push({m: me, caption: `${nm(p)}${years[0] && years[1] ? ` (${years[0]}–${years[1]})` : years[0] ? ` (° ${years[0]})` : years[1] ? ` († ${years[1]})` : ''}`, chapter: nm(p)});
                        const rel = [...(r.parents || []).map(x => [x, 'Parent']), ...(r.partners || []).map(x => [x, 'Conjoint']), ...(r.children || []).map(x => [x, 'Enfant'])].slice(0, 16);
                        for (const [x, role] of rel) { const id = Number(x.id || x.person_id); if (!id) continue; try { const rr = await A().api('person', {id}), pic = portrait(rr); if (pic) slides.push({m: pic, caption: `${role} : ${nm(rr.person)}`, chapter: role === 'Parent' && !slides.some(s0 => s0.chapter === 'Les parents') ? 'Les parents' : role === 'Conjoint' && !slides.some(s0 => s0.chapter === 'En couple') ? 'En couple' : role === 'Enfant' && !slides.some(s0 => s0.chapter === 'Les enfants') ? 'Les enfants' : ''}); } catch (_) {} }
                    }
                    if (!slides.length) { btn.textContent = 'Créer le montage'; toast(kind === 'life' ? 'Cette personne n’a pas de photo dans sa fiche.' : 'Aucun portrait trouvé dans ces fiches.', 'error'); return false; }
                    if ((P.v1.length || P.texts.length) && !await A().confirmBox('Le montage n’est pas vide.', {title: 'Ajouter ce modèle à la suite ?', okLabel: 'Ajouter à la suite'})) return false;
                    btn.textContent = 'Les photos arrivent…';
                    const start = montageEnd(P) > 0.2 && P.v1.length ? layoutV1(P).at(-1).end : 0;
                    let t = start;
                    for (const [i, sl] of slides.entries()) {
                        const sIdx = await pushSource({src: url(sl.m.filename), title: sl.m.title || sl.m.filename, media: sl.m}, 'image'); if (sIdx === null) continue;
                        const k = {id: nid('v'), s: sIdx, from: 0, to: dur, tr: {type: P.v1.length ? trType : 'none', d: 1}, look: {}, vol: 1, fit: 'fill', ...(f.kb ? {kb: 'auto'} : {})};
                        const L0 = layoutV1(P); P.v1.push(k); const at = layoutV1(P).at(-1).at; t = at + dur;
                        if (sl.caption) { const x = {id: nid('t'), at: at + 0.4, dur: Math.max(1.5, dur - 1), text: sl.caption, size: 4.8, color: '#ffffff', bg: '#000000', font: 'Georgia, serif', x: 50, y: 86, anim: 'fade', align: 'center'}; x.track = freeTrack('t', x.at, x.dur); P.texts.push(x); }
                        if (f.chap && sl.chapter) { P.chapters = P.chapters || []; P.chapters.push({id: nid('c'), t: at, title: sl.chapter}); }
                        void L0;
                    }
                    // titre au début, dates, et mot de la fin
                    const title = {id: nid('t'), at: start + 0.2, dur: Math.min(dur * 1.4, 7), text: kind === 'life' ? `La vie de ${nm(p)}${years[0] && years[1] ? `\n${years[0]} – ${years[1]}` : years[0] ? `\n° ${years[0]}` : years[1] ? `\n† ${years[1]}` : ''}` : `La famille de ${nm(p)}`, size: 8, color: '#ffffff', bg: '', font: 'Georgia, serif', x: 50, y: 45, anim: 'zoom', align: 'center', bold: true};
                    title.track = freeTrack('t', title.at, title.dur); P.texts.push(title);
                    if (kind === 'life' && birth) { const x = {id: nid('t'), at: start + Math.min(dur * 1.4, 7) + 0.3, dur: dur, text: `Naissance : ${evText(birth)}`, size: 4.6, color: '#ffffff', bg: '#000000', font: 'Georgia, serif', x: 50, y: 12, anim: 'fade', align: 'center'}; x.track = freeTrack('t', x.at, x.dur); P.texts.push(x); }
                    const endT = layoutV1(P).at(-1).end, fin = {id: nid('t'), at: Math.max(start, endT - dur), dur, text: kind === 'life' && death ? `Décès : ${evText(death)}` : 'Fin', size: kind === 'life' && death ? 5 : 7, color: '#ffffff', bg: kind === 'life' && death ? '#000000' : '', font: 'Georgia, serif', x: 50, y: kind === 'life' && death ? 12 : 50, anim: 'fade', align: 'center'};
                    fin.track = freeTrack('t', fin.at, fin.dur); P.texts.push(fin);
                    P.fadeStart = true; P.fadeEnd = true;
                    if (f.music) { const s0 = await addSource('audio'); if (s0 !== null) { const T = montageEnd(P), k = {id: nid('a'), s: s0, from: 0, to: Math.min(P.sources[s0].dur, T - start), at: start, vol: 0.6, fadeIn: 1, fadeOut: 3}; k.track = freeTrack('a', start, k.to); P.audio.push(k); } }
                    sel = null; await touch(2); record(); toast(`Montage fabriqué : ${A().plural(slides.length, 'photo')}. Retouche ce que tu veux, puis ⤓ Exporter.`);
                }});
        }
        dl.querySelector('.h-mt-ops').addEventListener('click', async e => {
            const b = e.target.closest('[data-mt-op]'); if (!b) return; const op = b.dataset.mtOp, c = selected(), t = eng.t;
            if (op === 'undo') return undoTo(hpos - 1);
            if (op === 'voice') return voiceOver(b);
            if (op === 'sub') { const k = subItem(t, 3, 'Sous-titre'); P.texts.push(k); sel = {track: 'texts', id: k.id}; touch(0); dl.querySelector('[data-mt-tab="item"]').click(); dl.querySelector('[data-mt-k="text"]')?.select(); return; }
            if (op === 'chapter') { const n = await A().askText({title: 'Nouveau chapitre', message: `Titre du chapitre qui commence à ${fmt(t, false)} :`, value: `Chapitre ${(P.chapters || []).length + 1}`, okLabel: 'Ajouter'}); if (!n?.trim()) return; P.chapters = P.chapters || []; P.chapters.push({id: nid('c'), t, title: n.trim().slice(0, 120)}); dl.querySelector('[data-mt-tab="film"]').click(); return touch(0); }
            if (op === 'redo') return undoTo(hpos + 1);
            if (op === 'addv1') { const s = await addSource('visual'); if (s === null) return; const k = {id: nid('v'), s, from: 0, to: srcLen(s), tr: {type: P.v1.length ? 'cross' : 'none', d: 1}, look: {}, vol: 1}; P.v1.push(k); sel = {track: 'v1', id: k.id}; return touch(1); }
            if (op === 'addv2') { const s = await addSource('visual'); if (s === null) return; const k = {id: nid('i'), s, from: 0, to: srcLen(s), at: t, w: 35, x: 62, y: 6, opacity: 100, vol: 0}; k.track = freeTrack('v', t, k.to); P.v2.push(k); sel = {track: 'v2', id: k.id}; return touch(1); }
            if (op === 'adda') { const s = await addSource('audio'); if (s === null) return; const k = {id: nid('a'), s, from: 0, to: P.sources[s].dur, at: t, vol: 1, fadeIn: 0, fadeOut: 1}; k.track = freeTrack('a', t, k.to); P.audio.push(k); sel = {track: 'audio', id: k.id}; return touch(1); }
            if (op === 'addtext') { const k = {id: nid('t'), at: t, dur: 4, text: 'Mon titre', size: 7, color: '#ffffff', bg: '', font: 'Georgia, serif', x: 50, y: P.texts.length ? 82 : 50, anim: 'fade', align: 'center'}; k.track = freeTrack('t', t, 4); P.texts.push(k); sel = {track: 'texts', id: k.id}; touch(0); dl.querySelector('[data-mt-tab="item"]').click(); dl.querySelector('[data-mt-k="text"]')?.select(); return; }
            if (!c) return toast('Choisis d’abord un élément sur la frise.', 'error');
            if (['del', 'left', 'right', 'detach', 'split', 'start', 'end'].includes(op) && isLocked(sel.track, c)) return lockToast();
            const list = sel.track === 'v1' ? P.v1 : sel.track === 'v2' ? P.v2 : sel.track === 'texts' ? P.texts : P.audio, i = list.indexOf(c);
            const startOf = () => sel.track === 'v1' ? layoutV1(P)[i].at : c.at;
            if (op === 'del') { if (sel.track === 'audio') undetach(c); list.splice(i, 1); sel = null; const nm = list === P.texts ? (String(c.text).split('\n')[0] || 'Texte') : (P.sources[c.s]?.title || 'Élément'), r = touch(1); undoable(`${list === P.audio ? 'Son ' : ''}« ${nm.slice(0, 60)} » enlevé de la frise`); return r; }
            if (op === 'kfprev' || op === 'kfnext') return jumpKf(op === 'kfnext' ? 1 : -1);
            if (op === 'left' || op === 'right') { if (sel.track !== 'v1') return toast('Pour les incrustations, textes et sons : fais-les glisser sur la frise.', 'error'); const j = i + (op === 'left' ? -1 : 1); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; return touch(1); }
            if (op === 'detach') { if (sel.track !== 'v1' && sel.track !== 'v2') return toast('Choisis un morceau de vidéo.', 'error'); if (c.detached) return toast('Le son de ce morceau est déjà détaché.', 'error'); const at = startOf();
                const k = {id: nid('a'), s: c.s, from: c.from, to: c.to, at, vol: c.vol ?? 1, fadeIn: 0, fadeOut: 0, track: freeTrack('a', at, clen(c)), detached: true, ...(c.speed && c.speed !== 1 ? {speed: c.speed} : {})}; P.audio.push(k); c.mute = true; c.detached = k.id; sel = {track: 'audio', id: k.id}; toast(`Son détaché : il est sur la piste « ${P.tracks.find(x => x.id === k.track)?.name} », tu peux le déplacer, le baisser ou l’enlever.`); return touch(1); }
            if (sel.track === 'texts') { if (op === 'start') { const e2 = c.at + c.dur; c.at = Math.min(t, e2 - 0.3); c.dur = e2 - c.at; } if (op === 'end') c.dur = Math.max(0.3, t - c.at); if (op === 'split') return toast('Un texte ne se coupe pas : change sa durée.', 'error'); return touch(0); }
            const s0 = startOf(), local = c.from + (t - s0) * spd(c);
            if (local <= c.from + 0.1 || local >= c.to - 0.1) return toast('Place la tête de lecture à l’intérieur de l’élément choisi.', 'error');
            if (op === 'split') { const b2 = {...JSON.parse(JSON.stringify(c)), id: nid(sel.track[0]), from: local, tr: {type: 'none', d: 1}}; if (sel.track !== 'v1') b2.at = t; if (sel.track === 'audio') { c.fadeOut = 0; b2.fadeIn = 0; } /* pas de trou dans le son à la coupe */ c.to = local; list.splice(i + 1, 0, b2); }
            if (op === 'start') { if (sel.track !== 'v1') c.at = t; c.from = local; }
            if (op === 'end') c.to = local;
            touch(1);
        });
        // 💾 Enregistrer le projet : le montage est gardé (Listes → Vidéos → 🎬 Montage, ou 📂 Projets…) ; les rushes importés
        // de l'ordinateur sont d'abord envoyés dans les Médias (un projet ne garde que des médias de la base)
        const showProjName = () => { const el = $('[data-mt-projname]'); if (el) el.textContent = projId ? `🎬 ${projName}` : ''; UIx().savedStatus?.(dl, dirty ? 'dirty' : projId ? 'saved' : ''); };
        let savingProj = false;
        async function saveProject(asNew = false) {
            if (savingProj) return; eng?.pause();
            let name = ($('[data-avx-name]')?.value || '').trim().slice(0, 160);
            if (name === 'Nouveau montage' && !projId) name = '';
            if (asNew || !name) { const n = await A().askText({title: 'Enregistrer le projet', message: 'Nom du projet de montage :', value: name || projName || (media.id ? media.title : '') || 'Mon montage', okLabel: 'Enregistrer'}); if (n === null) return; name = n.trim().slice(0, 160); if (!name) return toast('Donne un nom au projet.', 'error'); }
            savingProj = true; const btn = $('[data-mt-saveproj]'), l0 = btn.textContent; btn.disabled = true; UIx().savedStatus?.(dl, 'saving');
            try {
                const local = P.sources.filter(x => !/^media\//.test(x.src));
                for (const [k, x] of local.entries()) {
                    if (!x._file) throw new Error(`Le rush « ${x.title} » n’a plus son fichier : retire-le et importe-le de nouveau.`);
                    btn.textContent = `Envoi des rushes ${k + 1}/${local.length}…`;
                    const fd = new FormData(); fd.append('file', x._file, x._file.name || 'rush'); fd.append('kind', x.kind); fd.append('title', x.title || 'Rush'); fd.append('csrf', S().csrf);
                    const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
                    if (!r.ok || j.error) throw new Error(`${x.title} : ${j.error || 'envoi impossible'}`);
                    x.src = url(j.result.filename); x.mediaId = j.result.media_id; // le moteur garde son fichier en cours ; la prochaine fois, celui de la base
                }
                btn.textContent = 'Enregistrement…';
                const send = id => A().api('save_montage_project', {}, {method: 'POST', body: {id, name, project: {...JSON.parse(JSON.stringify(P)), duration: montageEnd(P)}}});
                let res; try { res = await send(asNew ? 0 : projId); }
                catch (err) { if (asNew || !projId || !/introuvable/i.test(err.message || '')) throw err; res = await send(0); toast('Ce projet avait été supprimé entre-temps : il est enregistré de nouveau.'); } // supprimé ailleurs (liste, autre fenêtre)
                projId = res.result.id; projName = res.result.name; dirty = false; const ni = $('[data-avx-name]'); if (ni) ni.value = projName; showProjName();
                if (local.length) toast(`${local.length > 1 ? `Les ${local.length} fichiers importés sont` : 'Le fichier importé est'} maintenant dans les Médias.`);
            } catch (err) { UIx().savedStatus?.(dl, 'error'); toast(err.message, 'error'); }
            finally { savingProj = false; btn.disabled = false; btn.textContent = l0; drawRush(true); }
        }
        $('[data-mt-saveproj]').addEventListener('click', () => saveProject());
        $('[data-avx-name]')?.addEventListener('input', () => { dirty = true; showProjName(); });
        // ⤓ Exporter (E3, la fenêtre commune) : un fichier MP4 / WebM avec les réglages de départ (Réglages), une copie dans les médias si on veut ;
        // « 💾 Dans les médias… » garde la fenêtre complète (plusieurs formats d'image, nouvelle version…)
        $('[data-mt-export]').addEventListener('click', async () => {
            eng?.pause();
            if (!UIx().openExportDialog) return $('[data-avx-save]').click();
            const types = recordTypes(); const nm = ($('[data-avx-name]')?.value || projName || media.title || 'Montage').trim(), T = montageEnd(P), MP2 = montagePrefs();
            const vid = (t) => async o => {
                if (!P.v1.length && !P.v2.length) throw new Error('le montage est vide : ajoute une vidéo');
                const go = document.querySelector('dialog.ui-export[open] [data-ui-go]'), release = holdOpen(go?.closest('dialog')); eng.destroy(); eng = null;
                try { const level = await levelFor(P, MP2.lufs, x => { if (go) go.textContent = x; });
                    const blob = await recordMontage(P, t[0], x => { if (go) go.textContent = `Enregistrement… ${Math.round(x * 100)} %`; }, {height: Number(MP2.height) || 0, quality: Number(MP2.quality) || 5, fps: Number(MP2.fps) || 30, abr: Number(MP2.abr) || 128, level});
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                    if (o.saveCopy) { await uploadResult(media, blob, t[1], {mode: 'copy', duration: T, title: nm}); toast('Vidéo téléchargée, et une copie est rangée dans les médias.'); onDone?.(); } }
                finally { release(); await rebuild(); drawTl(); }
            };
            const formats = types.map(t => ({id: t[1], label: t[1] === 'mp4' ? '🎬 MP4' : '🎞 WebM', hint: t[1] === 'mp4' ? 'lu partout' : 'léger (navigateurs, VLC)', ext: t[1], run: vid(t)}));
            const aud = f => async o => {
                if (!P.v1.length && !P.v2.length && !P.audio.length) throw new Error('le montage est vide');
                const go = document.querySelector('dialog.ui-export[open] [data-ui-go]'), release = holdOpen(go?.closest('dialog')); eng.destroy(); eng = null;
                try { const level = await levelFor(P, MP2.lufs, x => { if (go) go.textContent = x; });
                    const buf = await recordMontageAudio(P, x => { if (go) go.textContent = `Enregistrement du son… ${Math.round(x * 100)} %`; }, level);
                    const blob = f === 'mp3' ? await encodeMp3(buf, 192, x => { if (go) go.textContent = `Compression… ${Math.round(x * 100)} %`; }) : encodeWav(buf);
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                    if (o.saveCopy) { await uploadResult({kind: 'audio'}, blob, f, {mode: 'new', duration: T, title: `${nm} (son)`}); toast('Son téléchargé, et une copie est rangée dans les médias (un nouveau son).'); onDone?.(); } }
                finally { release(); await rebuild(); drawTl(); }
            };
            formats.push({id: 'mp3', label: '🎵 Son seul (MP3)', hint: 'musiques, voix et son des vidéos', ext: 'mp3', run: aud('mp3')}, {id: 'wav', label: '🎚 Son seul (WAV)', hint: 'sans perte', ext: 'wav', run: aud('wav')});
            formats.push({id: 'srt', label: '💬 Sous-titres', hint: 'fichier .srt', ext: '', run: async () => exportSubs()}, {id: 'base', label: '💾 Dans les médias…', hint: 'plusieurs formats, nouvelle version', ext: '', run: async () => { setTimeout(() => $('[data-avx-save]').click(), 50); }});
            await UIx().openExportDialog({title: nm, defaultName: nm, quality: false, saveCopy: true, value: MP2.fmt, info: `${fmt(T, false)} · rejoué en temps réel pour être enregistré (laisse la fenêtre ouverte) · taille, qualité, images par seconde${MP2.lufs ? ` et volume (📢 ${String(MP2.lufs).replace('-', '−')} LUFS)` : ' et volume standard'} : Réglages → Montage`, formats});
        });
        $('[data-mt-projects]').addEventListener('click', () => projectsDialog({current: projId, onOpen: async pr => { if (dirty && !await A().confirmBox('Les modifications du montage seront perdues.', {title: 'Ouvrir un autre projet sans enregistrer celui-ci ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; dirty = false; dl.close(); await openProject(pr.id, onDone); }}));
        document.addEventListener('keydown', e => { if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); } }, {signal: keyAc.signal});
        // ── Un menu en haut, à côté du titre (comme la Retouche) : tout ce que fait le montage ──
        const MT_MENUS = [
            ['Fichier', [['proj', '💾 Enregistrer le projet', '⌘S'], ['projas', 'Enregistrer le projet sous un autre nom…', '⇧⌘S'], ['projects', '📂 Projets…'], ['-'], ['export', '⤓ Exporter la vidéo (MP4 / WebM, plusieurs formats)…'], ['subexport', '⤓ Exporter les sous-titres (.srt)'], ['chapcopy', '🔖 Copier les chapitres (pour YouTube)'], ['-'], ['close', 'Fermer']]],
            ['Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['-'], ['op:split', '✂️ Couper ici', 'B'], ['op:start', '⟦ Commence ici'], ['op:end', '⟧ Finit ici'], ['op:left', '← Avancer le morceau'], ['op:right', 'Reculer le morceau →'], ['-'], ['op:detach', '🔊 Séparer le son de l’image'], ['op:del', '🗑 Enlever l’élément choisi', '⌫']]],
            ['Ajouter', [['import', '⤒ Importer des rushes (vidéos, photos, sons)…'], ['base', '🗂 Un rush de la base…'], ['-'], ['op:addv1', '＋ Vidéo / photo à la suite'], ['op:addv2', '＋ Incrustation'], ['op:addtext', '＋ Titre / texte'], ['op:adda', '＋ Son / musique'], ['-'], ['op:voice', '🎙 Enregistrer une voix off'], ['op:sub', '💬 Sous-titre ici'], ['subimport', '⤒ Importer des sous-titres (.srt, .vtt)…'], ['op:chapter', '🔖 Chapitre ici'], ['-'], ['tpl:life', '🪄 Modèle « La vie de… »'], ['tpl:family', '🪄 Modèle « Une famille »']]],
            ['Pistes', [['track:v', '＋ Piste vidéo'], ['track:t', '＋ Piste texte'], ['track:a', '＋ Piste son']]],
            ['Lecture', [['play', '▶ Lire / pause', 'Espace'], ['home', '⏮ Au début'], ['-'], ['op:kfprev', '◀ ◆ Image clé précédente'], ['op:kfnext', '◆ ▶ Image clé suivante'], ['-'], ['snap', '🧲 Aimanter (marche / arrêt)']]],
            ['Affichage', [['tab:rush', '🎞️ Rushes'], ['tab:item', '🎯 Élément choisi'], ['tab:color', '🎨 Couleurs du film'], ['tab:sound', '🔊 Son du film'], ['tab:film', '🎞️ Le film (rotation, fondus)'], ['scope', '🎯 Vectorscope et histogramme'], ['-'], ['zoom:in', 'Zoom avant sur la frise', '⌘+'], ['zoom:out', 'Zoom arrière sur la frise', '⌘−'], ['zoom:0', 'Zoom de départ', '⌘0'], ['-'], ['full', '⛶ Plein écran']]],
        ];
        const head = dl.querySelector('.modal-head');
        head?.querySelector(':scope > div')?.insertAdjacentHTML('afterend', `<nav class="h-rt-menubar h-mt-menubar">${MT_MENUS.map(([l, items]) => `<details class="h-rt-menu"><summary>${l}</summary><div class="h-rt-menulist">${items.map(([k, t, sc]) => k === '-' ? '<hr>' : `<button type="button" data-mt-cmd="${k}"><span>${esc(t)}</span>${sc ? `<kbd>${sc}</kbd>` : ''}</button>`).join('')}</div></details>`).join('')}</nav>`);
        const closeMenus = () => dl.querySelectorAll('.h-mt-menubar details[open]').forEach(d => d.removeAttribute('open'));
        dl.querySelectorAll('.h-mt-menubar details').forEach(d => {
            d.addEventListener('toggle', () => { if (d.open) dl.querySelectorAll('.h-mt-menubar details').forEach(o => { if (o !== d) o.removeAttribute('open'); }); });
            d.querySelector('summary').addEventListener('mouseenter', () => { if ([...dl.querySelectorAll('.h-mt-menubar details')].some(o => o.open && o !== d)) d.setAttribute('open', ''); });
        });
        dl.addEventListener('click', e => {
            const b = e.target.closest('[data-mt-cmd]'); if (!b) { if (!e.target.closest('.h-mt-menubar')) closeMenus(); return; }
            closeMenus(); const k = b.dataset.mtCmd, [a, v] = k.split(':'), q = sel0 => dl.querySelector(sel0)?.click();
            if (k === 'proj') return saveProject(); if (k === 'projas') return saveProject(true);
            if (k === 'projects') return q('[data-mt-projects]'); if (k === 'export') return q('[data-mt-export]'); if (k === 'close') return q('[data-avx-close]');
            if (k === 'undo') return undoTo(hpos - 1); if (k === 'redo') return undoTo(hpos + 1);
            if (a === 'op') return q(`[data-mt-op="${v}"]`);
            if (k === 'import') return q('[data-mt-rimport]'); if (k === 'base') { q('[data-mt-tab="rush"]'); return q('[data-mt-rbase]'); }
            if (a === 'track') return q(`[data-mt-addtrack="${v}"]`);
            if (k === 'play') return q('[data-mt-play]'); if (k === 'home') return q('[data-mt-home]'); if (k === 'snap') return q('[data-mt-snap]');
            if (a === 'tab') return q(`[data-mt-tab="${v}"]`);
            if (a === 'zoom') return ext.editorZoom?.(v === 'in' ? 1 : v === 'out' ? -1 : 0);
            if (k === 'full') return q('[data-full-toggle]');
            if (k === 'scope') return ext.montageScope?.(dl, cv);
            if (k === 'subexport') return exportSubs();
            if (k === 'chapcopy') { if (!(P.chapters || []).length) return toast('Aucun chapitre : « 🔖 Chapitre ici ».', 'error'); const txt = chaptersText(); navigator.clipboard?.writeText(txt).then(() => toast('Chapitres copiés.'), () => prompt('Copie ce texte :', txt)); return; }
            if (k === 'subimport') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.srt,.vtt,text/vtt,application/x-subrip'; inp.onchange = async () => { const fl = inp.files?.[0]; if (fl) importSubs(await fl.text()); }; inp.click(); return; }
            if (a === 'tpl') return templateDialog(v);
        });
        dl.addEventListener('keydown', e => { if (e.key === 'Escape' && dl.querySelector('.h-mt-menubar details[open]')) { e.preventDefault(); e.stopPropagation(); closeMenus(); } }, true);
        const markDirty = () => showProjName(); dl.addEventListener('input', markDirty); dl.addEventListener('click', () => setTimeout(markDirty, 0));
        // ⤓ Exporter la vidéo : un fichier MP4 / WebM (le projet, lui, reste ouvert)
        $('[data-avx-save]').addEventListener('click', () => {
            eng.pause();
            if (!P.v1.length && !P.v2.length) return toast('Le montage est vide : ajoute une vidéo.', 'error');
            const MP2 = montagePrefs(), types = recordTypes().sort((a, b) => (b[1] === MP2.fmt) - (a[1] === MP2.fmt)); if (!types.length) return toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error');
            const T = montageEnd(P), [sw, sh] = sizeFor();
            const sel2 = (name, list, v) => `<select name="${name}">${list.map(([k, l]) => `<option value="${k}" ${Number(k) === Number(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
            const exportHtml = `<fieldset class="h-rc-modes"><legend>Image et son</legend><div class="form-grid">
                <label>Taille ${sel2('height', MT_SIZES.map(([k, l]) => [k, k ? l : `${l} (${(P.sources[P.v1[0]?.s]?.w || sw)} × ${(P.sources[P.v1[0]?.s]?.h || sh)})`]), MP2.height)}</label>
                <label>Qualité ${sel2('quality', MT_QUALITY, MP2.quality)}</label><label>Images par seconde ${sel2('fps', MT_FPS.map(f => [f, f + ' images/s']), MP2.fps)}</label>
                <label>Son ${sel2('abr', [[96, '96 kb/s'], [128, '128 kb/s'], [192, '192 kb/s'], [256, '256 kb/s']], MP2.abr)}</label>${ext.montageLoud ? `<label>📢 Volume standard ${sel2('lufs', ext.montageLoud.TARGETS, MP2.lufs)}</label>` : ''}</div>
                <div class="h-mt-fmts"><span>Formats (un fichier par format coché, l’un après l’autre) :</span>${ASPECTS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="fmt_${k || 'src'}" ${(P.aspect || '') === k ? 'checked' : ''}> ${l}</label>`).join('')}<label class="checkbox-line"><input type="checkbox" name="blurbars" ${P.blurBars ? 'checked' : ''}> bandes floues plutôt que noires</label></div>
                <p class="muted">Réglages de départ : Réglages → Montage, retouche, mise en page et son.</p></fieldset>`;
            ext.openDialog({eyebrow: 'EXPORTER LA VIDÉO', title: projName || media.title || 'Montage', wide: true, submitLabel: '⤓ Exporter',
                body: `<p class="h-cfg-explain">Le montage est rejoué pour être enregistré : cela prend <b>${fmt(T, false)}</b> (sa durée). Laisse la fenêtre ouverte.</p>` + saveOptionsHtml(media, types.map(([t, e2, label, help]) => ({key: t, label, help}))).replace('<fieldset class="h-rc-modes"><legend>Comment', exportHtml + '<fieldset class="h-rc-modes"><legend>Comment').replace('<input type="hidden" name="mode" value="new">', exportHtml + '<input type="hidden" name="mode" value="new">'),
                onOpen: d => d.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { const ct = d.querySelector('[data-avx-copytitle]'); if (ct) ct.hidden = d.querySelector('[name=mode]:checked')?.value !== 'copy'; })),
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]'), type = types.find(x => x[0] === f.fmt) || types[0];
                    const fmts = ASPECTS.map(a => a[0]).filter(k => f['fmt_' + (k || 'src')]); if (!fmts.length) fmts.push(P.aspect || '');
                    const aspect0 = P.aspect, blur0 = P.blurBars; P.blurBars = !!f.blurbars;
                    eng.destroy(); eng = null; const release = holdOpen(form.closest('dialog'));
                    try {
                        const level = await levelFor(P, f.lufs, x => { prog.textContent = x; }); // 📢 mesurer d'abord la sonie du mélange, puis enregistrer au bon niveau
                        for (const [n, fa] of fmts.entries()) {
                            P.aspect = fa; const lab = ASPECTS.find(a => a[0] === fa)?.[1].replace(/^[^\p{L}\p{N}]+\s/u, '') || '';
                            const blob = await recordMontage(P, type[0], p => { prog.textContent = `${fmts.length > 1 ? `Format ${n + 1}/${fmts.length} (${lab}) — ` : ''}Enregistrement… ${Math.round(p * 100)} %`; }, {height: Number(f.height) || 0, quality: Number(f.quality) || 5, fps: Number(f.fps) || 30, abr: Number(f.abr) || 128, level});
                            prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                            const first = n === 0, mode = first ? (f.mode === 'new' ? 'new' : f.mode === 'copy' ? 'copy' : 'version') : (media.id ? 'copy' : 'new');
                            await uploadResult(media, blob, type[1], {mode, show: first && f.mode === 'show', duration: T, note: f.note, title: first ? f.title : `${f.title || projName || media.title || 'Montage'} (${lab})`});
                        }
                    } catch (err) { P.aspect = aspect0; P.blurBars = blur0; await rebuild(); throw err; } finally { release(); }
                    P.aspect = aspect0; if (fmts.length === 1) P.aspect = fmts[0];
                    await rebuild(); drawTl();
                    toast(f.mode === 'new' ? 'Montage enregistré : il est dans Listes → Vidéos.' : f.mode === 'copy' ? 'Nouvelle vidéo enregistrée, rattachée aux mêmes fiches.' : f.mode === 'show' ? 'Nouvelle version montrée partout. L’original est gardé.' : 'Version enregistrée (l’ancienne reste montrée).');
                    onDone?.(); // le montage reste ouvert : on peut continuer, ou 💾 enregistrer le projet
                },
            });
        });
        dl.addEventListener('close', () => { eng?.destroy(); if (voiceRec) { voiceRec.onstop = null; try { voiceRec.stop(); } catch (_) {} voiceRec.stream?.getTracks().forEach(tk => tk.stop()); voiceRec = null; } }); // le micro s'éteint avec le montage
        if (ext.tbApply) ext.tbApply(dl, 'video');
        await rebuild();
        drawTl(); drawRush(true); showProjName(); record(); // première étape de ↶
        // 🎚️ aller-retour montage ⇄ Studio son : le son d'un morceau s'ouvre dans le Studio, et revient propre ici (maquette « Studio son » § 10)
        dl.addEventListener('click', e => {
            if (!e.target.closest('[data-mt-studio]') || !sel || sel.track !== 'audio') return;
            const c = P.audio.find(x => x.id === sel.id), so = c && P.sources[c.s]; if (!so) return;
            const file = decodeURIComponent(String(so.src).replace(/^media\//, ''));
            ext.openAudioStudio({id: so.mediaId || 0, filename: file, title: so.title, media_type: 'audio', src: so.src}, {onSaved: async r => {
                if (!r?.filename) return; so.src = url(r.filename); if (r.media_id) so.mediaId = r.media_id; dirty = true; await rebuild(); drawTl(); drawRush(); toast(`« ${so.title} » est revenu du Studio son, nettoyé.`); }});
        });
        // le Studio son ouvre un nouveau montage avec son son déjà posé (Fichier → 🎬 Ouvrir dans le montage)
        if (ext._montageSeed && !proj) { const sd = ext._montageSeed; ext._montageSeed = null; const si = await pushSource({src: url(sd.filename), title: sd.title, media: {id: sd.mediaId}}, 'audio'); if (si !== null) placeRush(si, 'a', 0); drawTl(); }
        dl.addEventListener('change', schedHist); dl.addEventListener('pointerup', schedHist); // images clés, glisser sur la frise…
        if (start === 'add' || (proj && !P.v1.length)) $('[data-mt-tab="rush"]')?.click(); // un nouveau montage commence par ses rushes
    }

    /** Point d'entrée : un média {id, filename, title, media_type}. */
    /* ═════════ Réglages → Montage, retouche, mise en page et son : disposition, enregistrement, boutons, plein écran ═════════ */
    ext.maintenance = ext.maintenance || {};
    const EDITORS = [['video', '🎬 Montage vidéo'], ['retouch', '🎚️ Retouche des photos'], ['audio', '🎧 Modifier le son'], ['audio-quick', '⚡ Son rapide'], ['audio-studio', '🎚️ Studio son'], ['layout', '📐 Mise en page (livres de famille)'], ['vector', '✒️ Dessin vectoriel'], ['house', '🏠 Maison (plan et 3D)'], ['decortree', '🌳 Arbre décoratif'], ['keynote', '🎤 Présentation (Keynote)'], ['textdoc', '📝 Traitement de texte (à la Word)'], ['sheet', '🧾 Tableur (à la Excel)']];
    const FULL_EDITORS = [...EDITORS.filter(e => !['house', 'decortree'].includes(e[0])), ['museum', '🏛️ Musée de famille (Aménager)']], FULL_DEFAULT = {layout: true, museum: true, keynote: true}; // l'atelier de mise en page s'ouvre en plein écran si on n'a rien choisi
    /* Ensembles nommés (💾, comme les Réglages des animaux) : une disposition du montage, ou les boutons d'un éditeur */
    const LAYOUT_SETS = 'genealogie-montage-layout-sets', TB_SETS = 'genealogie-toolbar-sets';
    const LAYOUT_FIELDS = ['side', 'stage', 'lane', 'help', ...MT_COLORS.map(c => c[0])];
    const cleanLayout = v => { const all = montagePrefsFrom(v || {}); return Object.fromEntries(LAYOUT_FIELDS.map(k => [k, all[k]])); };
    const KEY_RX = /^[^<>"`\\\u0000-\u001f]{1,100}$/; // une clé de bouton (ex. « rt-mode=heal », « menu-Édition ») : tout sauf le balisage
    const cleanToolbar = v => { const out = {order: {}, hidden: {}}; ['order', 'hidden'].forEach(f => Object.entries(v?.[f] || {}).slice(0, 40).forEach(([g, list]) => { if (KEY_RX.test(g) && Array.isArray(list)) out[f][g] = list.filter(k => typeof k === 'string' && KEY_RX.test(k)).slice(0, 120); })); return out; };
    const cleanName = n => String(n ?? '').replace(/[<>"`]/g, '').trim().slice(0, 80);
    const cleanSets = (list, clean) => (Array.isArray(list) ? list : []).filter(x => x && cleanName(x.name)).slice(0, 60).map(x => ({name: cleanName(x.name), date: String(x.date || '').slice(0, 20), v: clean(x.v)}));
    const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
    const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast('Plus de place pour enregistrer ce réglage : supprime un ensemble.', 'error'); return false; } };
    const layoutSets = () => cleanSets(readJson(LAYOUT_SETS, []), cleanLayout);
    const toolbarSets = which => cleanSets(readJson(TB_SETS, {})[which], cleanToolbar);
    const saveToolbarSets = (which, list) => { const all = readJson(TB_SETS, {}); all[which] = list; return writeJson(TB_SETS, all); };
    const downloadJson = (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    const askFile = () => new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.addEventListener('change', () => ok(i.files?.[0] || null), {once: true}); i.click(); });
    /* un réglage dans un fichier : {lcnda: 'reglage', outil, nom, version: 1, donnees} → lcnda-reglage-<outil>-<nom>.json */
    const slugOf = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'reglage';
    const OUTIL_LABEL = o => o === 'montage-disposition' ? 'la disposition du montage' : /^boutons-/.test(o) ? `les boutons de « ${(EDITORS.find(e => e[0] === o.slice(8)) || [0, o.slice(8)])[1]} »` : `l’outil « ${o} »`;
    ext.maintenance.montage_prefs = async token => {
        const st = S(), ws = A().$('#workspace');
        const lsJson = readJson;
        let which = st.montagePrefsEditor || 'video';
        ext.maintenance.montage_prefs.ac?.abort(); const ac = ext.maintenance.montage_prefs.ac = new AbortController();
        const BLK_KEY = 'genealogie-montage-page-order';
        let mountSets = () => {};
        const blkMove = '<span class="h-mtp-blkmove"><button type="button" class="h-bt" data-blk-up title="Monter ce bloc">↑</button><button type="button" class="h-bt" data-blk-down title="Descendre ce bloc">↓</button><button type="button" class="h-bt" data-blk-side title="Passer dans l’autre colonne">⇄</button></span>';
        const draw = () => {
            if (token !== st.workspaceToken) return;
            const p = montagePrefs(), full = lsJson('genealogie-editor-full', {}), defs = (ext.tbDefs?.() || {})[which], cfg = lsJson('genealogie-toolbars', {})[which] || {};
            const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
            const groups = (defs?.groups || []).map(g => { const order = cfg.order?.[g.key] || [], hidden = cfg.hidden?.[g.key] || []; const items = [...order.map(k => g.items.find(i => i[0] === k)).filter(Boolean), ...g.items.filter(i => !order.includes(i[0]))];
                return `<section><h4>${esc(g.label)}</h4><ol class="h-pet-layout" data-g="${esc(g.key)}">${items.map(([k, l]) => `<li class="h-pet-lrow" data-k="${esc(k)}"><input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} title="Montrer"><span>${esc(l)}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('')}</ol></section>`; }).join('');
            const edName = (EDITORS.find(e => e[0] === which) || EDITORS[0])[1];
            ws.innerHTML = `<section class="page h-mtp"><header class="page-header"><div><span class="eyebrow">RÉGLAGES</span><h2>Montage, retouche, mise en page et son</h2><p>La disposition du montage vidéo, l’enregistrement des vidéos par défaut, les boutons et options de chaque éditeur (montrés, cachés, rangés), tes raccourcis clavier dans chaque outil et le plein écran.</p></div>
                </header>
                <div class="h-mtp-cols">
                <div class="h-mtp-stack">
                <section class="maintenance-panel" data-mtp-blk="layout"><h3>🎬 Disposition du montage${blkMove}</h3>
                    <div data-presets-slot="layout"></div>
                    <div class="form-grid h-mtp-grid">
                    <label>Panneau des réglages<select data-mtp="side">${opt([['right', 'À droite de l’image'], ['left', 'À gauche de l’image']], p.side)}</select></label>
                    <label>Aide sous la frise<select data-mtp="help">${opt([['1', 'Montrée'], ['0', 'Cachée']], p.help ? '1' : '0')}</select></label>
                    <label>Hauteur de l’image<span class="h-mtp-range"><input type="range" min="25" max="80" value="${p.stage}" data-mtp="stage"><output>${p.stage} %</output></span></label>
                    <label>Hauteur des pistes<span class="h-mtp-range"><input type="range" min="28" max="70" value="${p.lane}" data-mtp="lane"><output>${p.lane} px</output></span></label>
                    </div>
                    <h4>🎨 Couleur des blocs sur la frise</h4><div class="h-mtp-colors">${MT_COLORS.map(([k, l]) => `<label class="h-mtp-color"><input type="color" data-mtp="${k}" value="${esc(p[k])}"> <span class="h-mtp-swatch" data-mtp-sw="${k}" style="background:${esc(p[k])};color:${inkOn(p[k])}">${esc(l)}</span></label>`).join('')}</div>
                    <button type="button" class="button small secondary" data-mtp-colreset>Couleurs de départ</button>
                </section>
                <section class="maintenance-panel" data-mtp-blk="export"><h3>⤓ Enregistrement des vidéos (par défaut)${blkMove}</h3>
                    <div class="form-grid h-mtp-grid">
                    <label>Format<select data-mtp="fmt">${opt([['mp4', 'MP4 (H.264) — lu partout'], ['webm', 'WebM — léger']], p.fmt)}</select></label>
                    <label>Taille<select data-mtp="height">${opt(MT_SIZES, p.height)}</select></label>
                    <label>Qualité<select data-mtp="quality">${opt(MT_QUALITY, p.quality)}</select></label>
                    <label>Images par seconde<select data-mtp="fps">${opt(MT_FPS.map(f => [f, f + ' images/s']), p.fps)}</select></label>
                    <label>Son<select data-mtp="abr">${opt([[96, '96 kb/s'], [128, '128 kb/s'], [192, '192 kb/s'], [256, '256 kb/s']], p.abr)}</select></label>
                    ${ext.montageLoud ? `<label>📢 Volume standard<select data-mtp="lufs">${opt(ext.montageLoud.TARGETS, p.lufs)}</select></label>` : ''}
                    </div>
                    <label class="h-mtp-speeds">⏩ Boutons rapides de vitesse (de 0,1 à 10, séparés par « ; ») <input data-mtp="speeds" value="${esc(speedsText(p.speeds))}" placeholder="0,1 ; 0,25 ; 0,5 ; 1 ; 1,5 ; 2 ; 4 ; 10"></label>
                    <p class="muted">On peut toujours les changer au moment d’enregistrer. MP4 seulement si l’ordinateur sait le faire, sinon WebM.</p>
                </section>
                <section class="maintenance-panel" data-mtp-blk="retouch"><h3>🎚️ Retouche des photos${blkMove}</h3>
                    <div class="form-grid h-mtp-grid"><label>Colonne d’outils (➤ ⬚ ◯ 🪄 ⌗ 🖌 T…)<select data-mtp-rttools>${opt([['left', 'À gauche (comme dans tous les éditeurs)'], ['side', 'À côté de l’image (entre l’image et le panneau)'], ['right', 'Tout à droite (après le panneau)']], lsJson('genealogie-retouch-layout', {}).tools || 'left')}</select></label>
                    <label>Panneau (Réglages, Calques…)<select data-mtp-rtside>${opt([['right', 'À droite'], ['left', 'À gauche']], lsJson('genealogie-retouch-layout', {}).side || 'right')}</select></label></div>
                    <p class="muted">Aussi : la largeur du panneau se règle en tirant son bord dans la Retouche.</p>
                </section>
                ${ext.vectorMapPalette ? `<section class="maintenance-panel" data-mtp-blk="vectormap"><h3>🗺️ Dessin vectoriel — mode Plan : les éléments${blkMove}</h3><p class="muted">Les groupes (voies, eau, zones, symboles…) et leurs éléments : dans quel ordre, lesquels on voit, et les tiens (une allure de départ, un nom, une couleur, une largeur, ou un symbole que tu as dessiné).</p><div data-vmp-box>${ext.vectorMapPalette.html()}</div></section>` : ''}
                ${ext.decorTreePrefs ? `<section class="maintenance-panel" data-mtp-blk="decortree"><h3>🌳 Arbre décoratif${blkMove}</h3><p class="muted">Ce que la fenêtre propose au départ, tes formats et tes styles. Les formes et les boutons se rangent dans « Boutons et options » (éditeur 🌳 Arbre décoratif), avec ses raccourcis.</p><div data-dtp-box>${ext.decorTreePrefs.html()}</div></section>` : ''}
                ${ext.transcribePrefs ? `<section class="maintenance-panel" data-mtp-blk="transcribe"><h3>📜 Transcription d’actes : barre d’outils${blkMove}</h3><p class="muted">La barre au-dessus de l’image de l’acte : tout dans la barre (A), ou une barre courte et le panneau « 🎚️ Mieux voir » (B) ; les boutons et réglages montrés, cachés et rangés. Aussi avec « ⚙️ » dans l’outil.</p><div data-txp-box>${ext.transcribePrefs.html()}</div></section>` : ''}
                ${ext.keynotePrefs ? `<section class="maintenance-panel" data-mtp-blk="keynote"><h3>🎤 Présentation (Keynote)${blkMove}</h3><p class="muted">Ce qu’une nouvelle présentation prend au départ : thème, format (16:9, 4:3, sur mesure…), transition, disposition des nouvelles diapositives, aimant, pointeur laser.</p><div data-knp-box>${ext.keynotePrefs.html()}</div></section>` : ''}
                <section class="maintenance-panel" data-mtp-blk="audio"><h3>🎧 Son${blkMove}</h3>
                    <div class="form-grid h-mtp-grid"><label>⚡ Son rapide : le design<select data-mtp-audiodesign>${opt([['classic', 'Comme avant (🎧 Modifier le son)'], ['harmo', 'Comme avant, rangé (outils à gauche, barre en bas)'], ['new', 'Nouveau ⚡ Son rapide']], ['new', 'harmo'].includes(localStorage.getItem('genealogie-audio-quick-design')) ? localStorage.getItem('genealogie-audio-quick-design') : 'classic')}</select></label>
                    <label>✂️ Modifier un son ouvre<select data-mtp-audiomode>${opt([['quick', '⚡ Le Son rapide'], ['studio', '🎚️ Le Studio son']], localStorage.getItem('genealogie-audio-mode') === 'studio' ? 'studio' : 'quick')}</select></label></div>
                    <p class="muted">« Comme avant » : l’éditeur d’origine, chaque outil avec son nom. « Comme avant, rangé » : le même, avec les outils en colonne à gauche (leur nom en bulle) et la barre du bas commune aux autres éditeurs. « Nouveau ⚡ Son rapide » : de gros boutons (souffle, clics, bourdonnement, voix, volume égal, début et fin, blancs), 👂 Avant / ✨ Après. Le 🎚️ Studio son (effets réglables, spectre, zones, multipiste) est toujours là, par le bouton « 🎚️ Studio son » ; le dernier choix entre les deux est retenu tout seul.</p>
                </section>
                <section class="maintenance-panel" data-mtp-blk="full"><h3>⛶ Plein écran à l’ouverture${blkMove}</h3>
                    <div class="form-grid h-mtp-grid">${FULL_EDITORS.map(([k, l]) => `<label>${esc(l)}<select data-mtp-full="${k}">${opt([['0', 'Fenêtre'], ['1', 'Plein écran']], (full[k] ?? FULL_DEFAULT[k]) ? '1' : '0')}</select></label>`).join('')}</div>
                </section>
                </div>
                <section class="maintenance-panel" data-mtp-blk="tools"><h3>🧰 Boutons et options${blkMove}</h3>
                    <div class="form-grid h-mtp-grid"><label>Éditeur<select data-mtp-which>${opt(EDITORS, which)}</select></label></div>
                    <div data-presets-slot="toolbar"></div>
                    <p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). C’est aussi dans chaque éditeur : « ⚙️ Personnaliser ». Les ensembles ci-dessus sont ceux de « ${esc(edName)} ».</p>
                    ${groups ? `<div class="h-tbcfg-body" data-mtp-groups>${groups}</div><button type="button" class="button small secondary" data-mtp-reset>↺ Remettre comme au départ</button>` : `<p class="muted">Ouvre une fois ${which === 'video' ? 'le montage vidéo (Listes → Vidéos → « 🎬 Montage »)' : which === 'retouch' ? 'la retouche d’une photo (visionneuse → « Retoucher »)' : which === 'layout' ? 'l’atelier de mise en page (Listes → 📐 Livres de famille, ou Export propre → Livre de famille)' : which === 'vector' ? 'le dessin vectoriel (Listes → Outils de modification → ✒️ Dessin vectoriel)' : which === 'house' ? 'le plan d’une maison (Listes → 🏠 Maisons de famille)' : which === 'decortree' ? 'l’arbre décoratif (Listes → Outils de modification → 🌳 Arbre décoratif → ＋)' : which === 'keynote' ? 'une présentation (Listes → Outils de modification → 🎞️ Présentation et diaporama → ＋ Nouveau → Présentation)' : which === 'textdoc' ? 'le traitement de texte (Listes → Outils de modification → 📝 Traitement de texte)' : which === 'sheet' ? 'le tableur (Listes → Outils de modification → 🧾 Tableur)' : 'la modification d’un son (Listes → Audios → ✏️)'} : ses boutons apparaîtront ici.</p>`}
                <div class="h-ek-panel h-mtp-keys"><h4>⌨️ Raccourcis de « ${esc(edName)} »</h4><div data-ek-box></div><p class="muted"><button type="button" class="button small secondary" data-mtp-allkeys>⌨️ Tous les raccourcis de l’app (Réglages → Raccourcis clavier)</button></p></div>
                </section></div></section>`;
            // les raccourcis suivent l'éditeur choisi (même liste que Réglages → Raccourcis clavier)
            try { localStorage.setItem('genealogie-editor-shortcuts-tab', which === 'video' ? 'montage' : which); } catch (_) {}
            ext.editorKeysPanel?.(ws.querySelector('[data-ek-box]'));
            { const box = ws.querySelector('[data-dtp-box]'); if (box) ext.decorTreePrefs.bind(box, () => { box.innerHTML = ext.decorTreePrefs.html(); }); } // 🌳 arbre décoratif
            { const box = ws.querySelector('[data-knp-box]'); if (box) ext.keynotePrefs.bind(box, () => { box.innerHTML = ext.keynotePrefs.html(); }); } // 🎤 présentation
            { const box = ws.querySelector('[data-txp-box]'); if (box) ext.transcribePrefs.bind(box, () => { box.innerHTML = ext.transcribePrefs.html(); }); } // 📜 transcription d'actes
            { const box = ws.querySelector('[data-vmp-box]'); if (box) ext.vectorMapPalette.bind(box, () => { box.innerHTML = ext.vectorMapPalette.html(); }); } // 🗺️ éléments du mode Plan
            ws.querySelectorAll('[data-ek-tab]').forEach(b => { b.hidden = true; }); // l'éditeur se choisit plus haut
            // les grands blocs : deux colonnes, chacune dans son ordre (↑ ↓, ⇄ pour changer de colonne), gardé pour la prochaine fois
            { const cols = ws.querySelector('.h-mtp-cols'), left = ws.querySelector('.h-mtp-stack'), right = document.createElement('div'); right.className = 'h-mtp-stack'; right.dataset.col = 'right'; left.dataset.col = 'left'; cols.appendChild(right);
              const saved = lsJson(BLK_KEY, null), def = {left: ['layout', 'export', 'retouch', 'full'], right: ['tools']}, lay = saved && Array.isArray(saved.left) && Array.isArray(saved.right) ? saved : def;
              const all = [...ws.querySelectorAll('[data-mtp-blk]')], put = (col, keys) => keys.forEach(k => { const el = all.find(x => x.dataset.mtpBlk === k); if (el) col.appendChild(el); });
              put(left, lay.left); put(right, lay.right); all.filter(el => !lay.left.includes(el.dataset.mtpBlk) && !lay.right.includes(el.dataset.mtpBlk)).forEach(el => (['tools', 'transcribe'].includes(el.dataset.mtpBlk) ? right : left).appendChild(el)); }
            mountSets();
        };
        draw();
        // ce qui est à l'écran (pas encore enregistré) : disposition, boutons de l'éditeur choisi
        const layoutNow = () => { const v = {}; ws.querySelectorAll('[data-mtp]').forEach(el => { v[el.dataset.mtp] = el.dataset.mtp === 'help' ? el.value === '1' : el.value; }); return cleanLayout(v); };
        const toolbarNow = () => { const box = ws.querySelector('[data-mtp-groups]'); if (!box) return cleanToolbar(lsJson('genealogie-toolbars', {})[which] || {}); const cfg = {order: {}, hidden: {}}; box.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; cfg.order[ol.dataset.g] = lis.map(l => l.dataset.k); cfg.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); }); return cfg; };
        const applyLayout = v => { const cur = readJson(MT_KEY, {}); writeJson(MT_KEY, {...cur, ...cleanLayout(v)}); };
        const applyToolbar = v => { const all = lsJson('genealogie-toolbars', {}); all[which] = cleanToolbar(v); writeJson('genealogie-toolbars', all); };
        const setOps = {
            layout: {list: layoutSets, save: list => writeJson(LAYOUT_SETS, list), now: layoutNow, apply: applyLayout, clean: cleanLayout, type: 'lcnda-montage-disposition', outil: () => 'montage-disposition'},
            toolbar: {list: () => toolbarSets(which), save: list => saveToolbarSets(which, list), now: toolbarNow, apply: applyToolbar, clean: cleanToolbar, type: 'lcnda-boutons-editeur', outil: () => `boutons-${which}`},
        };
        ws.addEventListener('input', e => { const el = e.target.closest('[data-mtp]'); if (el?.type === 'color') { const sw = ws.querySelector(`[data-mtp-sw="${el.dataset.mtp}"]`); if (sw) { sw.style.background = el.value; sw.style.color = inkOn(el.value); } return; } if (el?.type === 'range') el.nextElementSibling.textContent = el.value + (el.dataset.mtp === 'stage' ? ' %' : ' px'); }, {signal: ac.signal});
        ws.addEventListener('change', async e => {
            if (e.target.matches('[data-mtp-which]')) { which = st.montagePrefsEditor = e.target.value; draw(); return; }
        }, {signal: ac.signal});
        const importSet = async op => {
            const file = await askFile(); if (!file) return;
            if (file.size > 2e6) return toast('Fichier trop gros pour des réglages.', 'error');
            let data; try { data = JSON.parse(await file.text()); } catch (_) { return toast('Ce fichier n’est pas un fichier de réglages LCNDA.', 'error'); }
            if (data?.lcnda === 'reglage') {
                let outil = String(data.outil || '');
                if (outil !== op.outil()) {
                    if (op === setOps.toolbar && /^boutons-/.test(outil) && EDITORS.some(x => x[0] === outil.slice(8))) { which = st.montagePrefsEditor = outil.slice(8); }
                    else return toast(`Ce fichier est un réglage pour ${OUTIL_LABEL(outil)}, pas pour ${OUTIL_LABEL(op.outil())} : importe-le à sa place.`, 'error');
                }
                if (!data.donnees || typeof data.donnees !== 'object') return toast('Ce réglage est vide ou abîmé.', 'error');
                const list = op.list(); let name = cleanName(data.nom) || 'Réglage importé';
                while (list.some(y => y.name === name)) { const n = await A().askText({title: 'Ce nom est déjà pris', message: `Un réglage s’appelle déjà « ${name} ». Quel nom pour celui-ci ?`, value: window.LCNDA_UI.freeName(name, list.map(y => y.name)), okLabel: 'Importer'}); if (n === null) return; name = cleanName(n); if (!name) return; }
                list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: op.clean(data.donnees)});
                if (op.save(list.slice(-60))) { draw(); toast(`Réglage « ${name} » importé : « Appliquer » pour l’utiliser.`); }
                return;
            }
            if (data?.type !== op.type) return toast(op === setOps.layout ? 'Ce fichier n’est pas une disposition du montage.' : 'Ce fichier n’est pas un réglage de boutons.', 'error');
            if (op === setOps.toolbar && data.editor && data.editor !== which) { which = st.montagePrefsEditor = EDITORS.some(x => x[0] === data.editor) ? data.editor : which; }
            const list = op.list(), add = cleanSets(data.sets, op.clean); let n = 0;
            add.forEach(x => { let name = x.name; while (list.some(y => y.name === name)) name = `${name} (2)`.slice(0, 80); list.push({...x, name}); n++; });
            if (data.current && typeof data.current === 'object') { let name = cleanName(data.name) || 'Importé'; while (list.some(y => y.name === name)) name = `${name} (2)`.slice(0, 80); list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: op.clean(data.current)}); n++; }
            if (op.save(list.slice(-60))) { draw(); toast(`${A().plural(n, 'ensemble importé', 'ensembles importés')} : choisis-en un puis « Appliquer ».`); }
        };
        // 💾 Réglages enregistrés (le cadre commun) : la disposition du montage, les boutons de l'éditeur choisi
        mountSets = () => Object.entries(setOps).forEach(([key, op]) => {
            const slot = ws.querySelector(`[data-presets-slot="${key}"]`); if (!slot) return;
            const UI = window.LCNDA_UI, today = () => new Date().toLocaleDateString('fr-FR'), put = (list, at, it) => { if (at >= 0) list[at] = it; else list.push(it); return op.save(list.slice(-60)); };
            const fr = UI.presetsFrame({id: `montage-${key}`, what: key === 'layout' ? 'cette disposition' : 'ces boutons', list: op.list, quietApply: true,
                apply: async i => { const x = op.list()[i]; if (!x || !await A().confirmBox('', {title: `Remplacer les réglages actuels par l’ensemble « ${x.name} » ?`, okLabel: 'Remplacer'})) return false; op.apply(x.v); draw(); toast(`Ensemble « ${x.name} » appliqué.`); return false; },
                save: name => { const list = op.list(); name = cleanName(name); return put(list, list.findIndex(x => x.name === name), {name, date: today(), v: op.now()}); },
                replace: i => { const list = op.list(); return put(list, i, {...list[i], date: today(), v: op.now()}); },
                rename: (i, name) => { const list = op.list(); return put(list, i, {...list[i], name: cleanName(name) || list[i].name}); },
                duplicate: i => { const list = op.list(), name = UI.freeName(list[i].name, list.map(x => x.name)); list.splice(i + 1, 0, {...JSON.parse(JSON.stringify(list[i])), name, date: today()}); if (!op.save(list.slice(-60))) return false; toast(`Copie « ${name} » créée.`); },
                exportOne: i => { const x = op.list()[i]; if (x) { downloadJson(`lcnda-reglage-${op.outil()}-${slugOf(x.name)}.json`, {lcnda: 'reglage', outil: op.outil(), nom: x.name, version: 1, donnees: x.v}); toast('Fichier prêt : il s’importe dans Réglages → Montage, retouche, mise en page et son (« ⤒ Importer »).'); } return false; },
                remove: i => { const list = op.list(), x = list[i]; A().undoLocalChange(`Ensemble « ${x.name} » supprimé`, [key === 'layout' ? LAYOUT_SETS : TB_SETS], () => { list.splice(i, 1); op.save(list); }, () => { if (fr.isConnected) fr.refresh(); }); },
                importOne: async () => { await importSet(op); return false; }});
            slot.replaceWith(fr);
        });
        mountSets();
        ws.addEventListener('click', async e => {
            const mv = e.target.closest('[data-blk-up],[data-blk-down],[data-blk-side]');
            if (mv) { const blk = mv.closest('[data-mtp-blk]'), lay = {left: [...ws.querySelectorAll('[data-col="left"] > [data-mtp-blk]')].map(b => b.dataset.mtpBlk), right: [...ws.querySelectorAll('[data-col="right"] > [data-mtp-blk]')].map(b => b.dataset.mtpBlk)};
                const side = lay.left.includes(blk.dataset.mtpBlk) ? 'left' : 'right', list = lay[side], i = list.indexOf(blk.dataset.mtpBlk);
                if (mv.matches('[data-blk-side]')) { list.splice(i, 1); lay[side === 'left' ? 'right' : 'left'].push(blk.dataset.mtpBlk); }
                else { const j = i + (mv.matches('[data-blk-up]') ? -1 : 1); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; }
                writeJson(BLK_KEY, lay); draw(); return; }
            if (e.target.closest('[data-mtp-allkeys]')) { st.maintenanceTab = 'raccourcis'; A().setModule('maintenance'); return; }
            const li = e.target.closest('li');
            if (e.target.closest('[data-up]') && li?.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
            if (e.target.closest('[data-down]') && li?.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
            if (e.target.closest('[data-mtp-colreset]')) { MT_COLORS.forEach(([k, , d]) => { const el = ws.querySelector(`[data-mtp="${k}"]`); if (el) { el.value = d; el.dispatchEvent(new Event('input', {bubbles: true})); } });  return; }
            if (e.target.closest('[data-mtp-reset]')) { const all = lsJson('genealogie-toolbars', {}); delete all[which]; writeJson('genealogie-toolbars', all); toast('Boutons remis comme au départ.'); draw(); }
        }, {signal: ac.signal});
        // K2 : plus de bouton « Enregistrer » : ce qui est à l'écran est gardé tout de suite (UI.autoSave) ; « ↶ Annuler » dans le message
        const saveNow = () => {
            if (token !== st.workspaceToken || !ws.querySelector('.h-mtp')) return;
            const v = {}; ws.querySelectorAll('[data-mtp]').forEach(el => { v[el.dataset.mtp] = el.dataset.mtp === 'help' ? el.value === '1' : el.value; });
            if (JSON.stringify(v) !== JSON.stringify(readJson(MT_KEY, {}))) writeJson(MT_KEY, v);
            const full = lsJson('genealogie-editor-full', {}), full0 = JSON.stringify(full); ws.querySelectorAll('[data-mtp-full]').forEach(el => { full[el.dataset.mtpFull] = el.value === '1'; }); if (JSON.stringify(full) !== full0) writeJson('genealogie-editor-full', full);
            // 🎧 Son : le design du ⚡ Son rapide (« Comme avant » = rien d'écrit) et ce que « ✂️ Modifier » ouvre
            { const dz = ws.querySelector('[data-mtp-audiodesign]')?.value; const cur = localStorage.getItem('genealogie-audio-quick-design'); if (dz && dz !== (['new', 'harmo'].includes(cur) ? cur : 'classic')) { try { if (dz === 'new' || dz === 'harmo') localStorage.setItem('genealogie-audio-quick-design', dz); else localStorage.removeItem('genealogie-audio-quick-design'); } catch (_) {} }
              const am = ws.querySelector('[data-mtp-audiomode]')?.value; if (am && am !== (localStorage.getItem('genealogie-audio-mode') === 'studio' ? 'studio' : 'quick')) { try { localStorage.setItem('genealogie-audio-mode', am); } catch (_) {} } }
            const rt = {tools: ws.querySelector('[data-mtp-rttools]')?.value || 'left', side: ws.querySelector('[data-mtp-rtside]')?.value || 'right'}; if (JSON.stringify(rt) !== JSON.stringify(readJson('genealogie-retouch-layout', {}))) writeJson('genealogie-retouch-layout', rt);
            if (ws.querySelector('[data-mtp-groups]')) { const tb = cleanToolbar(toolbarNow()), cur = cleanToolbar(lsJson('genealogie-toolbars', {})[which] || {}); if (JSON.stringify(tb) !== JSON.stringify(cur)) applyToolbar(tb); }
        };
        window.LCNDA_UI?.autoSave?.(ws, {save: saveNow, redraw: () => draw()});
    };
    // Listes → Vidéos / Audios → « 🎬 Montage » : un montage fait de zéro, enregistré comme un nouveau média
    /** 📂 Les projets de montage enregistrés : ouvrir, renommer, supprimer (ou en commencer un nouveau) */
    async function projectsDialog({current = 0, onOpen, onNew = null} = {}) {
        let list = []; try { list = (await A().api('montage_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        const when = d => window.LCNDA_UI?.when?.(d, {label: 'Modifié'}) || ''; // K4 : HTML <time>
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-mt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎬 MONTAGE</span><h2>Projets de montage</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${onNew ? '<div class="h-mt-pnew"><button type="button" class="button" data-new>＋ Nouveau montage</button></div>' : ''}
            ${list.length ? `<div class="h-mt-plist">${list.map(p => `<div class="h-mt-prow${p.id === current ? ' is-cur' : ''}"><button type="button" class="h-mt-popen" data-open="${p.id}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-mt-pico">🎬</span>'}<span><b>${esc(p.name)}</b><small>${p.clips} morceau${p.clips > 1 ? 'x' : ''} · ${p.sources} rush${p.sources > 1 ? 'es' : ''}${p.duration ? ' · ' + fmt(p.duration, false) : ''} · ${when(p.updated_at)}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (les vidéos et photos restent dans les Médias)">🗑</button></div>`).join('')}</div>`
                : A().emptyState({icon: '🎬', text: 'Aucun projet de montage pour l’instant', hint: 'Dans le montage, « 💾 Enregistrer le projet ».'})}<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`; };
        draw(); document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.x !== undefined) return dlg.close();
            if (b.dataset.new !== undefined) { dlg.close(); return onNew?.(); }
            try {
                if (b.dataset.open) { const p = list.find(x => x.id === Number(b.dataset.open)); if (await onOpen?.(p) === false) return; dlg.close(); return; }
                if (b.dataset.ren) { const p = list.find(x => x.id === Number(b.dataset.ren)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'}); if (!n?.trim()) return; const full = await A().api('montage_project', {id: p.id}); await A().api('save_montage_project', {}, {method: 'POST', body: {id: p.id, name: n.trim(), project: full.project}}); p.name = n.trim().slice(0, 160); return draw(); }
                if (b.dataset.del) { const p = list.find(x => x.id === Number(b.dataset.del)); if (!await A().confirmBox('Les vidéos, photos et sons restent dans les Médias.', {title: `Supprimer le projet « ${p.name} » ?`, okLabel: 'Supprimer le projet'})) return; await A().api('delete_montage_project', {}, {method: 'POST', body: {id: p.id}}); list = list.filter(x => x !== p); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
    }
    async function openProject(id, onDone) {
        let pr; try { pr = await A().api('montage_project', {id}); } catch (e) { return toast(e.message, 'error'); }
        return openVideo({id: 0, title: pr.name, media_type: 'video'}, onDone, null, pr);
    }
    /** 📂 Les projets audio enregistrés */
    async function audioProjectsDialog({current = 0, onOpen, onNew = null} = {}) {
        let list = []; try { list = (await A().api('audio_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        const when = d => window.LCNDA_UI?.when?.(d, {label: 'Modifié'}) || ''; // K4 : HTML <time>
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-mt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎧 SON</span><h2>Projets son</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${onNew ? '<div class="h-mt-pnew"><button type="button" class="button" data-new>＋ Nouveau projet son</button></div>' : ''}
            ${list.length ? `<div class="h-mt-plist">${list.map(p => `<div class="h-mt-prow${p.id === current ? ' is-cur' : ''}"><button type="button" class="h-mt-popen" data-open="${p.id}" ${p.exists ? '' : 'disabled'}><span class="h-mt-pico">🎧</span><span><b>${esc(p.name)}</b><small>${p.summary ? esc(p.summary) + ' · ' : ''}${esc(p.media_title || 'son de départ importé')} · ${fmt(p.duration, false)} · ${when(p.updated_at)}${p.exists ? '' : ' · fichier de travail introuvable'}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (le son de départ reste dans les Médias)">🗑</button></div>`).join('')}</div>`
                : A().emptyState({icon: '🎵', text: 'Aucun projet son pour l’instant', hint: 'Dans « Modifier le son », « 💾 Enregistrer le projet ».'})}<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Fermer</button></div>`; };
        draw(); document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.x !== undefined) return dlg.close();
            if (b.dataset.new !== undefined) { dlg.close(); return onNew?.(); }
            try {
                if (b.dataset.open) { const p = list.find(x => x.id === Number(b.dataset.open)); if (await onOpen?.(p) === false) return; dlg.close(); return; }
                if (b.dataset.ren) { const p = list.find(x => x.id === Number(b.dataset.ren)), n = await A().askText({title: 'Renommer le projet', message: 'Nouveau nom :', value: p.name, okLabel: 'Renommer'}); if (!n?.trim()) return; const r = await A().api('rename_audio_project', {}, {method: 'POST', body: {id: p.id, name: n}}); p.name = r.result.name; return draw(); }
                if (b.dataset.del) { const p = list.find(x => x.id === Number(b.dataset.del)); if (!await A().confirmBox('Le son de départ reste dans les Médias.', {title: `Supprimer le projet « ${p.name} » ?`, okLabel: 'Supprimer le projet'})) return; await A().api('delete_audio_project', {}, {method: 'POST', body: {id: p.id}}); list = list.filter(x => x !== p); return draw(); }
            } catch (err) { toast(err.message, 'error'); }
        });
    }
    ext.openAudioProject = async (id, onDone) => {
        let pr; try { pr = await A().api('audio_project', {id}); } catch (e) { return toast(e.message, 'error'); }
        const m = {id: pr.media_id, filename: pr.source, title: pr.media_title || pr.name, media_type: 'audio', src: url(pr.work_file)};
        if (ext.openSound) return ext.openSound(m, {onDone, proj: pr}); // le dernier mode (⚡ rapide ou 🎚️ Studio), ou celui du projet
        return openAudio(m, onDone, pr);
    };
    // un nouveau projet son : un son de la base ou de l'ordinateur, ouvert dans « Modifier le son »
    ext.newAudioProject = async onDone => { const o = await pickOther('audio'); if (!o) return; const m = o.media ? {...o.media, media_type: 'audio'} : {id: 0, title: o.title || 'Son', media_type: 'audio', src: o.src}; return ext.openAudioStudio ? ext.openAudioStudio(m, {onDone}) : openAudio(m, onDone); }; // « ＋ Nouveau projet son » ouvre le Studio
    ext.openAudioProjects = onDone => audioProjectsDialog({onOpen: p => ext.openAudioProject(p.id, onDone), onNew: () => ext.newAudioProject(onDone)});
    ext.openMontageProject = (id, onDone) => openProject(id, onDone);
    ext.newMontage = (onDone, seed = null) => { if (seed?.audio?.filename) ext._montageSeed = seed.audio; return openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add'); };
    ext.openMontageProjects = onDone => projectsDialog({onOpen: p => openProject(p.id, onDone), onNew: () => openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add')});
    ext.openMontage = async (kind, onDone) => {
        if (kind === 'video') { let has = false; try { has = ((await A().api('montage_projects')).projects || []).length > 0; } catch (_) {} if (has) return ext.openMontageProjects(onDone); return openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add'); }
        const o = await pickOther('audio'); if (!o) return;
        return openAudio({id: 0, title: (o.title || 'Son') + ' (montage)', media_type: 'audio', src: o.src}, onDone);
    };
    ext.openAvEditor = (media, {onDone} = {}) => kindOf(media) === 'video' ? openVideo(media, onDone) : ext.openSound ? ext.openSound(media, {onDone}) : openAudio(media, onDone);
    ext._av = {openAudio, audioProjectsDialog, uploadResult, pickOther, kindOf, versionsHtml, bindVersions, bigDialog, choose2}; // pour ⚡ Son rapide et 🎚️ Studio son (heritage-audio-quick.js, heritage-audio-studio.js)
    // Visionneuse : « ✂️ Modifier »
    document.addEventListener('click', e => {
        if (!e.target.closest('#edit-av-media')) return;
        const st = S(), item = st.lightboxMedia?.[st.lightboxIndex];
        if (!item) return;
        A().$('#lightbox')?.close();
        ext.openAvEditor(item, {onDone: () => ext.refreshView?.()});
    });
})();
