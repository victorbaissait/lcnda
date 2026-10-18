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
@media (max-width:700px){.h-avx-name{width:160px}}`; document.head.appendChild(st); })();
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const url = f => `media/${encodeURIComponent(f)}`;
    const fmt = (sec, ms = true) => {
        if (!isFinite(sec) || sec < 0) sec = 0;
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

    const mkBuf = (len, ch, sr) => new AudioBuffer({length: Math.max(1, Math.round(len)), numberOfChannels: ch, sampleRate: sr});
    function sliceBuf(b, i0, i1) { const out = mkBuf(i1 - i0, b.numberOfChannels, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(i0, i1), c); return out; }
    function concatBufs(list, ch, sr) {
        const len = list.reduce((s, b) => s + b.length, 0), out = mkBuf(len, ch, sr);
        for (let c = 0; c < ch; c++) { let off = 0; const d = out.getChannelData(c); for (const b of list) { d.set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), off); off += b.length; } }
        return out;
    }
    /** Passe un tampon par une chaîne de filtres (rendu hors ligne, rapide). */
    async function through(b, build, {sr = b.sampleRate, ch = b.numberOfChannels} = {}) {
        const len = Math.ceil(b.duration * sr);
        const oc = new OfflineAudioContext(ch, Math.max(1, len), sr);
        const src = oc.createBufferSource(); src.buffer = b;
        const last = build ? build(oc, src) : src;
        last.connect(oc.destination); src.start();
        return oc.startRendering();
    }
    const resample = (b, sr, ch) => b.sampleRate === sr && b.numberOfChannels === ch ? Promise.resolve(b) : through(b, null, {sr, ch});
    /** Niveau (RMS) par tranche de « hop » échantillons, toutes voies mêlées. */
    function frameRms(b, hop) {
        const n = Math.ceil(b.length / hop), out = new Float32Array(n), chs = [...Array(b.numberOfChannels).keys()].map(c => b.getChannelData(c));
        for (let f = 0; f < n; f++) { let s = 0, k = 0; const i1 = Math.min(b.length, (f + 1) * hop); for (let i = f * hop; i < i1; i++) for (const d of chs) { s += d[i] * d[i]; k++; } out[f] = Math.sqrt(s / Math.max(1, k)); }
        return out;
    }
    const percentile = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0; };
    function peakOf(b) { let m = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } } return m; }
    function scale(b, g) { for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } return b; }
    /** Réduction du souffle : expandeur doux sous le niveau du bruit (mesuré sur la sélection donnée, sinon sur les passages les plus calmes). */
    function gate(b, floorRms, strength = 0.85) {
        const hop = Math.round(b.sampleRate * 0.01), rms = frameRms(b, hop), thr = Math.max(1e-5, floorRms * 2.8), minG = 1 - strength;
        const target = rms.map(r => r >= thr ? 1 : Math.max(minG, (r / thr) ** 2));
        const g = new Float32Array(target.length); let cur = 1;
        for (let f = 0; f < g.length; f++) { const t = target[f]; cur += (t - cur) * (t > cur ? 0.6 : 0.12); g[f] = cur; } // attaque rapide, relâche lente
        for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const f = i / hop, f0 = Math.floor(f), f1 = Math.min(g.length - 1, f0 + 1); d[i] *= g[f0] + (g[f1] - g[f0]) * (f - f0); } }
        return b;
    }

    /** WAV 16 bits (lu partout). */
    function encodeWav(b) {
        const ch = b.numberOfChannels, len = b.length, out = new DataView(new ArrayBuffer(44 + len * ch * 2));
        const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
        out.setUint32(24, b.sampleRate, true); out.setUint32(28, b.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
        const chs = [...Array(ch).keys()].map(c => b.getChannelData(c)); let o = 44;
        for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chs[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
        return new Blob([out.buffer], {type: 'audio/wav'});
    }
    /** AIFF 16 bits (Mac : GarageBand, Logic, QuickTime) : comme le WAV, mais octets dans l'autre sens. */
    function encodeAiff(b) {
        const ch = b.numberOfChannels, len = b.length, size = len * ch * 2, out = new DataView(new ArrayBuffer(54 + size));
        const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'FORM'); out.setUint32(4, 46 + size); w(8, 'AIFF'); w(12, 'COMM'); out.setUint32(16, 18); out.setUint16(20, ch); out.setUint32(22, len); out.setUint16(26, 16);
        // fréquence en nombre flottant de 80 bits (IEEE 754 étendu)
        let rate = b.sampleRate, e = 16383 + 31; while (rate < 0x80000000) { rate *= 2; e--; }
        out.setUint16(28, e); out.setUint32(30, rate >>> 0); out.setUint32(34, 0);
        w(38, 'SSND'); out.setUint32(42, 8 + size); out.setUint32(46, 0); out.setUint32(50, 0);
        const chs = [...Array(ch).keys()].map(c => b.getChannelData(c)); let o = 54;
        for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chs[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff); o += 2; }
        return new Blob([out.buffer], {type: 'audio/aiff'});
    }
    /** FLAC 16 bits (sans perte, environ moitié moins lourd que le WAV) : prédiction fixe et codes de Rice, tout dans le navigateur. */
    async function encodeFlac(b, onStep) {
        const ch = b.numberOfChannels, len = b.length, rate = b.sampleRate, BS = 4096;
        let buf = new Uint8Array(1 << 20), pos = 0, acc = 0, nbits = 0;
        const grow = () => { if (pos + 64 > buf.length) { const n = new Uint8Array(buf.length * 2); n.set(buf); buf = n; } };
        const put = (v, n) => { // n ≤ 24 bits
            acc = (acc * (1 << n)) + (v & ((1 << n) - 1)); nbits += n;
            while (nbits >= 8) { nbits -= 8; grow(); buf[pos++] = Math.floor(acc / (1 << nbits)) & 255; acc = acc % (1 << nbits); }
        };
        const putN = (v, n) => { if (n > 24) { put(Math.floor(v / (1 << 24)), n - 24); put(v % (1 << 24), 24); } else put(v, n); };
        const align = () => { if (nbits) put(0, 8 - nbits); };
        const crc8 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; } return c; };
        const crc16 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= buf[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; } return c; };
        // en-tête : « fLaC » + STREAMINFO
        [0x66, 0x4c, 0x61, 0x43].forEach(x => put(x, 8));
        put(0x80, 8); put(0, 8); put(0, 8); put(34, 8); // dernier bloc de métadonnées, STREAMINFO, 34 octets
        put(BS, 16); put(BS, 16); put(0, 24); put(0, 24); put(rate, 20); put(ch - 1, 3); put(15, 5); putN(len, 36);
        for (let i = 0; i < 16; i++) put(0, 8); // empreinte MD5 inconnue (permis)
        const chs = [...Array(ch).keys()].map(c => b.getChannelData(c));
        const toInt = x => { const v = Math.max(-1, Math.min(1, x)); return Math.round(v < 0 ? v * 0x8000 : v * 0x7fff); };
        const res = new Int32Array(BS), smp = new Int32Array(BS);
        for (let start = 0, frame = 0; start < len; start += BS, frame++) {
            const n = Math.min(BS, len - start), f0 = pos;
            put(0x3ffe, 14); put(0, 1); put(0, 1); put(7, 4); put(0, 4); put(ch - 1, 4); put(4, 3); put(0, 1);
            // numéro de trame en « UTF-8 »
            if (frame < 0x80) put(frame, 8);
            else if (frame < 0x800) { put(0xc0 | (frame >> 6), 8); put(0x80 | (frame & 63), 8); }
            else if (frame < 0x10000) { put(0xe0 | (frame >> 12), 8); put(0x80 | ((frame >> 6) & 63), 8); put(0x80 | (frame & 63), 8); }
            else { put(0xf0 | (frame >> 18), 8); put(0x80 | ((frame >> 12) & 63), 8); put(0x80 | ((frame >> 6) & 63), 8); put(0x80 | (frame & 63), 8); }
            put(n - 1, 16);
            put(crc8(f0, pos), 8);
            for (let c = 0; c < ch; c++) {
                const d = chs[c];
                for (let i = 0; i < n; i++) smp[i] = toInt(d[start + i]);
                // meilleur prédicteur fixe (ordre 0 à 4) : la plus petite somme des écarts
                let best = 0, bestSum = Infinity;
                for (let o = 0; o <= Math.min(4, n - 1); o++) {
                    let sum = 0;
                    for (let i = o; i < n; i++) {
                        const x = smp[i], r = o === 0 ? x : o === 1 ? x - smp[i - 1] : o === 2 ? x - 2 * smp[i - 1] + smp[i - 2] : o === 3 ? x - 3 * smp[i - 1] + 3 * smp[i - 2] - smp[i - 3] : x - 4 * smp[i - 1] + 6 * smp[i - 2] - 4 * smp[i - 3] + smp[i - 4];
                        sum += r < 0 ? -r : r;
                    }
                    if (sum < bestSum) { bestSum = sum; best = o; }
                }
                const o = best;
                for (let i = o; i < n; i++) { const x = smp[i]; res[i] = o === 0 ? x : o === 1 ? x - smp[i - 1] : o === 2 ? x - 2 * smp[i - 1] + smp[i - 2] : o === 3 ? x - 3 * smp[i - 1] + 3 * smp[i - 2] - smp[i - 3] : x - 4 * smp[i - 1] + 6 * smp[i - 2] - 4 * smp[i - 3] + smp[i - 4]; }
                const mean = bestSum / Math.max(1, n - o);
                let k = mean > 1 ? Math.min(14, Math.max(0, Math.floor(Math.log2(mean * Math.LN2)))) : 0;
                put(0, 1); put(8 | o, 6); put(0, 1); // sous-trame FIXED d'ordre o
                for (let i = 0; i < o; i++) put(smp[i] & 0xffff, 16);
                put(0, 2); put(0, 4); put(k, 4); // Rice, une seule partition
                for (let i = o; i < n; i++) {
                    const r = res[i], u = r >= 0 ? r * 2 : -r * 2 - 1;
                    let q = Math.floor(u / (1 << k));
                    while (q >= 24) { put(0, 24); q -= 24; }
                    put(1, q + 1);
                    if (k) put(u & ((1 << k) - 1), k);
                }
            }
            align();
            const c16 = crc16(f0, pos); put(c16 >> 8, 8); put(c16 & 255, 8);
            if (frame % 40 === 0) { onStep?.(start / len); await new Promise(r => setTimeout(r, 0)); }
        }
        return new Blob([buf.slice(0, pos)], {type: 'audio/flac'});
    }
    /** MP3 (lu absolument partout) : encodeur LAME (assets/vendor/lamejs), chargé seulement à ce moment-là. */
    const loadLame = () => window.lamejs ? Promise.resolve() : new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'assets/vendor/lamejs/lame.min.js'; sc.onload = () => ok(); sc.onerror = () => ko(new Error('Encodeur MP3 introuvable.')); document.head.appendChild(sc); });
    async function encodeMp3(b, kbps, onStep) {
        await loadLame();
        if (b.sampleRate > 48000) b = await resampleBuffer(b, 44100, b.numberOfChannels);
        const ch = Math.min(2, b.numberOfChannels), enc = new window.lamejs.Mp3Encoder(ch, b.sampleRate, kbps), parts = [];
        const toI16 = d => { const o = new Int16Array(d.length); for (let i = 0; i < d.length; i++) { const v = Math.max(-1, Math.min(1, d[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
        const L = toI16(b.getChannelData(0)), R = ch > 1 ? toI16(b.getChannelData(1)) : null, step = 1152 * 20;
        for (let i = 0; i < L.length; i += step) {
            const out = ch > 1 ? enc.encodeBuffer(L.subarray(i, i + step), R.subarray(i, i + step)) : enc.encodeBuffer(L.subarray(i, i + step));
            if (out.length) parts.push(new Uint8Array(out));
            if ((i / step) % 20 === 0) { onStep?.(i / L.length); await new Promise(r => setTimeout(r, 0)); }
        }
        const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
        return new Blob(parts, {type: 'audio/mpeg'});
    }
    /** Changer la fréquence ou passer en mono (le navigateur fait le calcul). */
    async function resampleBuffer(b, rate, channels) {
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new Off(channels, Math.max(1, Math.ceil(b.duration * rate)), rate);
        const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start();
        return ctx.startRendering();
    }
    ext.audioEncoders = {wav: b => encodeWav(b), aiff: b => encodeAiff(b), flac: (b, f) => encodeFlac(b, f), mp3: (b, k, f) => encodeMp3(b, k, f), resample: (b, r, c) => resampleBuffer(b, r, c)}; // pour les essais
    /** Ogg Opus (léger) : encodeur du navigateur (WebCodecs) + petite mise en pages Ogg. */
    const opusSupported = async () => { try { return !!window.AudioEncoder && (await AudioEncoder.isConfigSupported({codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 64000})).supported; } catch (_) { return false; } };
    const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
    function oggPage(packets, granule, serial, seq, flags) {
        const lace = []; packets.forEach(p => { let n = p.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n); });
        const size = 27 + lace.length + packets.reduce((s, p) => s + p.length, 0), page = new Uint8Array(size), dv = new DataView(page.buffer);
        page.set([0x4f, 0x67, 0x67, 0x53], 0); page[4] = 0; page[5] = flags;
        dv.setUint32(6, granule % 0x100000000, true); dv.setUint32(10, Math.floor(granule / 0x100000000), true);
        dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); dv.setUint32(22, 0, true); page[26] = lace.length; page.set(lace, 27);
        let o = 27 + lace.length; packets.forEach(p => { page.set(p, o); o += p.length; });
        let crc = 0; for (let i = 0; i < size; i++) crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
        dv.setUint32(22, crc, true);
        return page;
    }
    async function encodeOpus(b0, onStep) {
        const ch = Math.min(2, b0.numberOfChannels), b = await resample(b0, 48000, ch);
        const packets = []; let head = null, err = null;
        const enc = new AudioEncoder({output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); packets.push({d, dur: Math.round((chunk.duration || 20000) * 48 / 1000)}); if (meta?.decoderConfig?.description && !head) { const h = new Uint8Array(meta.decoderConfig.description); if (String.fromCharCode(...h.slice(0, 8)) === 'OpusHead') head = h; } }, error: e => { err = e; }});
        enc.configure({codec: 'opus', sampleRate: 48000, numberOfChannels: ch, bitrate: ch > 1 ? 128000 : 72000});
        const F = 960, chans = [...Array(ch).keys()].map(c => b.getChannelData(c));
        for (let i = 0, k = 0; i < b.length; i += F, k++) {
            const n = Math.min(F, b.length - i), data = new Float32Array(n * ch);
            for (let c = 0; c < ch; c++) data.set(chans[c].subarray(i, i + n), c * n);
            enc.encode(new AudioData({format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(i / 48000 * 1e6), data}));
            if (k % 500 === 0) { onStep?.(i / b.length); await new Promise(r => setTimeout(r)); }
        }
        await enc.flush(); enc.close();
        if (err) throw err;
        const preskip = head ? (head[10] | head[11] << 8) : 312;
        if (!head) { head = new Uint8Array(19); head.set([...'OpusHead'].map(c => c.charCodeAt(0))); head[8] = 1; head[9] = ch; head[10] = preskip & 255; head[11] = preskip >> 8; new DataView(head.buffer).setUint32(12, 48000, true); }
        const vendor = 'LCNDA', tags = new Uint8Array(8 + 4 + vendor.length + 4); tags.set([...'OpusTags'].map(c => c.charCodeAt(0))); new DataView(tags.buffer).setUint32(8, vendor.length, true); tags.set([...vendor].map(c => c.charCodeAt(0)), 12);
        const serial = (Math.random() * 0xffffffff) >>> 0, pages = [oggPage([head], 0, serial, 0, 2), oggPage([tags], 0, serial, 1, 0)];
        let seq = 2, gran = preskip, group = [], bytes = 0;
        const total = preskip + b.length;
        packets.forEach((p, i) => {
            group.push(p.d); bytes += p.d.length; gran += p.dur;
            const last = i === packets.length - 1;
            if (last || group.length >= 50 || bytes > 4000) { pages.push(oggPage(group, last ? total : Math.min(gran, total), serial, seq++, last ? 4 : 0)); group = []; bytes = 0; }
        });
        return new Blob(pages, {type: 'audio/ogg'});
    }

    async function openAudio(media, onDone, proj = null) {
        const ctx = audioCtx();
        let projId = proj?.id || 0, projName = proj?.name || '';
        let buf;
        const loading = toast('Ouverture du son…');
        try { const res = await fetch(media.src || url(media.filename)); if (!res.ok) throw new Error('Fichier introuvable.'); buf = await ctx.decodeAudioData(await res.arrayBuffer()); }
        catch (e) { toast('Impossible de lire ce son : ' + e.message, 'error'); return; }
        void loading;
        const history = [], future = [];
        let sel = null, cursor = 0, view = {start: 0, dur: buf.duration}, peaks = null, src = null, playT0 = 0, playFrom = 0, playTo = 0, raf = 0, dirty = false;
        const ver = await versionsHtml(media);
        const OPS = [
            ['cut', '✂️ Supprimer la sélection', 'sel'], ['keep', '⬚ Garder seulement la sélection', 'sel'], ['silence', '🔇 Silence', 'sel'],
            ['fadein', '↗ Fondu d’entrée', 'any'], ['fadeout', '↘ Fondu de sortie', 'any'], ['gain', '🔊 Volume…', 'any'], ['normalize', '📏 Normaliser', 'any'],
            ['denoise', '🧹 Réduire le souffle', 'any'], ['clarity', '🗣️ Voix plus nette', 'any'], ['hum', '〰️ Enlever le bourdonnement', 'any'], ['silences', '⏩ Raccourcir les longs blancs', 'all'], ['mono', '🎧 Mono', 'all'],
            ['insert', '➕ Ajouter un son…', 'all'],
        ];
        const dl = bigDialog({eyebrow: 'MODIFIER LE SON', id: 'audio', title: projName || media.title || media.filename,
            bar: {icon: '🎧', undo: '<span class="ui-topbar-hist"><button type="button" class="icon-button small" data-avx-undo disabled data-shortcut="⌘Z" title="Annuler">↶</button><button type="button" class="icon-button small" data-avx-redo disabled data-shortcut="⇧⌘Z" title="Rétablir">↷</button></span>', exportAttrs: 'data-au-export', saveAttrs: 'data-au-saveproj', saveTitle: 'Enregistrer le projet son, pour y revenir plus tard (⌘S)'}, onClose: async () => { stop(); return !dirty || await A().confirmBox('Les modifications du son seront perdues.', {title: 'Fermer sans enregistrer les modifications ?', okLabel: 'Fermer sans enregistrer', danger: true}); },
            body: `<div class="h-avx-top"><span class="h-avx-time"><b data-avx-cur>0:00.0</b> / <span data-avx-total></span></span><span class="h-avx-sel muted" data-avx-seltxt></span>
                    <span class="h-avx-zoom" data-tbg="au-zoom" data-tbg-label="Zoom"><button type="button" class="button small secondary" data-avx-zoom="fit" title="Tout voir">⤢ Tout</button><button type="button" class="button small secondary" data-avx-zoom="sel" title="Zoomer sur la sélection">🔍 Sélection</button><button type="button" class="button small secondary" data-avx-zoom="out">−</button><button type="button" class="button small secondary" data-avx-zoom="in">+</button></span></div>
                <div class="h-avx-wave"><canvas data-avx-canvas></canvas></div>
                <input type="range" class="h-avx-scroll" data-avx-scroll min="0" max="1000" value="0" aria-label="Défiler" data-ui-done="other-scale">
                <div class="h-avx-transport" data-tbg="au-transport" data-tbg-label="Lecture"><button type="button" class="button" data-avx-play data-shortcut="Espace">▶ Écouter</button><button type="button" class="button small secondary" data-avx-home title="Au début">⏮</button>
                    <span class="muted h-avx-tip" data-tb-label="Aide (glisser, Espace, molette)">Glisse sur l’onde pour sélectionner · clic = se placer · Espace = écouter · molette = défiler, Ctrl + molette = zoom</span></div>
                <div class="h-avx-ops" data-tbg="au-ops" data-tbg-label="Outils du son">${OPS.map(([k, label, need]) => `<button type="button" class="button small secondary" data-avx-op="${k}" data-need="${need}"${k === 'cut' ? ' data-shortcut="⌫"' : ''}>${label}</button>`).join('')}</div>
                <p class="muted h-avx-help" data-avx-help>Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.</p><p class="muted h-avx-help2"><span data-help="« Réduire le souffle » : choisis d’abord un passage où l’on n’entend que le bruit, il sert d’exemple. « Voix plus nette » rend la parole plus claire. « Normaliser » monte le volume au plus fort sans saturer." data-help-faq="modifier un son">Que fait chaque outil ?</span></p>
                ${ver.html}
                <div class="modal-actions"><button type="button" class="button small secondary" data-au-projects title="Rouvrir un son en cours de travail">📂 Projets…</button><span class="h-mt-projname" data-au-projname></span><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save title="Le son fini : nouvelle version (l’original est gardé), copie, nouveau son ou fichier téléchargé">📥 Garder dans les médias…</button></div>`});
        ext.tbApply?.(dl, 'audio');
        const $ = s => dl.querySelector(s), cv = $('[data-avx-canvas]'), g = cv.getContext('2d');
        bindVersions(dl, media, 'audio', () => { dirty = false; dl.close(); onDone?.(); });
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
                const fd = new FormData(); fd.append('file', blob, 'projet.flac'); fd.append('id', String(asNew ? 0 : projId)); fd.append('name', name); fd.append('media_id', String(media.id || 0)); fd.append('source', proj?.source || media.filename || ''); fd.append('duration', String(buf.duration)); fd.append('csrf', S().csrf);
                const r = await fetch('api.php?action=save_audio_project', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}}); const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
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
            const enc = async (f, onStep) => f === 'ogg' ? encodeOpus(buf, onStep) : f === 'mp3' ? encodeMp3(buf, 128, onStep) : f === 'flac' ? encodeFlac(buf, onStep) : f === 'aiff' ? encodeAiff(buf) : encodeWav(buf);
            const run = f => async o => { const go = document.querySelector('dialog.ui-export[open] [data-ui-go]'); const blob = await enc(f, x => { if (go) go.textContent = `Compression… ${Math.round(x * 100)} %`; });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                if (o.saveCopy && f !== 'aiff') { await uploadResult(media, blob, f, {mode: 'copy', duration: buf.duration, title: `${nm} (${f.toUpperCase()})`}); toast('Fichier téléchargé, et une copie est rangée dans les médias.'); onDone?.(); } };
            const formats = [{id: 'mp3', label: '🎵 MP3', hint: `lu partout · ~${mb(16000)} Mo`, ext: 'mp3', run: run('mp3')}, {id: 'wav', label: '🎚 WAV', hint: `sans perte · ~${mb(pcm)} Mo`, ext: 'wav', run: run('wav')}, {id: 'flac', label: '🗜 FLAC', hint: `sans perte, léger · ~${mb(pcm * .55)} Mo`, ext: 'flac', run: run('flac')}];
            if (await opusSupported()) formats.push({id: 'ogg', label: '🗣 Ogg Opus', hint: `le plus léger · ~${mb(buf.numberOfChannels > 1 ? 16000 : 9000)} Mo`, ext: 'ogg', run: run('ogg')});
            formats.push({id: 'aiff', label: '🍎 AIFF', hint: 'GarageBand, Logic', ext: 'aiff', run: run('aiff')}, {id: 'base', label: '📥 Dans les médias…', hint: 'nouvelle version, copie (réglages)', ext: '', run: async () => { setTimeout(() => $('[data-avx-save]').click(), 50); }});
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
            cv.setPointerCapture(e.pointerId); const t0 = tAt(e), x0 = e.clientX; let moved = false;
            const move = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) { const t1 = tAt(ev); sel = {a: Math.min(t0, t1), b: Math.max(t0, t1)}; draw(); } };
            const up = ev => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); if (!moved) { cursor = tAt(ev); sel = null; } else cursor = sel.a; if (src) play(); draw(); };
            cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
        });
        cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.altKey) { const t = tAt(e), f = e.deltaY > 0 ? 1.25 : 0.8; view.start = t - (t - view.start) * f; view.dur *= f; } else view.start += (e.deltaX || e.deltaY) / 600 * view.dur; clampView(); draw(); }, {passive: false});
        $('[data-avx-scroll]').addEventListener('input', e => { view.start = Number(e.target.value) / 1000 * (buf.duration - view.dur); clampView(); draw(); });
        dl.querySelectorAll('[data-avx-zoom]').forEach(b => b.addEventListener('click', () => { const z = b.dataset.avxZoom, c = view.start + view.dur / 2;
            if (z === 'fit') { view.start = 0; view.dur = buf.duration; } if (z === 'sel' && sel) { view.start = sel.a - (sel.b - sel.a) * 0.05; view.dur = (sel.b - sel.a) * 1.1; }
            if (z === 'in') { view.dur /= 2; view.start = c - view.dur / 2; } if (z === 'out') { view.dur *= 2; view.start = c - view.dur / 2; } clampView(); draw(); }));
        // lecture
        function stop() { if (src) { try { src.onended = null; src.stop(); } catch (_) {} src = null; } cancelAnimationFrame(raf); const b = dl.querySelector('[data-avx-play]'); if (b) b.textContent = '▶ Écouter'; }
        function play() {
            stop(); if (ctx.state === 'suspended') ctx.resume();
            playFrom = sel ? sel.a : cursor; playTo = sel ? sel.b : buf.duration; if (playTo - playFrom < 0.02) { playFrom = 0; playTo = buf.duration; }
            src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start(0, playFrom, playTo - playFrom); playT0 = ctx.currentTime;
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
                if (k === 'denoise') {
                    const useSel = sel && await A().confirmBox('Un passage sans voix sert d’exemple du souffle à enlever partout.', {title: 'Prendre la sélection comme exemple de souffle ?', okLabel: 'Oui, c’est du bruit seul', cancelLabel: 'Non, nettoyer la sélection', danger: false});
                    let floor;
                    if (useSel) { floor = percentile(frameRms(sliceBuf(buf, i0, i1), Math.round(sr * 0.01)), 0.9); sel = null; }
                    else floor = percentile(frameRms(buf, Math.round(sr * 0.01)), 0.1);
                    await onRange(async p => gate(await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; s.connect(hp); return hp; }), floor));
                }
                if (k === 'clarity') await onRange(async p => { const out = await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; const pres = oc.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9; pres.gain.value = 4; const comp = oc.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; s.connect(hp).connect(pres).connect(comp); return comp; }); const pk = peakOf(out); return pk > 0 ? scale(out, 0.89 / pk) : out; });
                if (k === 'hum') { const f = await A().confirmBox('Le ronflement vient du courant électrique : 50 Hz en Europe, 60 Hz en Amérique du Nord.', {title: 'Quelle fréquence de courant ?', okLabel: '50 Hz (Europe)', cancelLabel: '60 Hz (Amérique du Nord)', danger: false}) ? 50 : 60; await onRange(async p => through(p, (oc, s) => { let last = s; for (let h = 1; h <= 4; h++) { const n = oc.createBiquadFilter(); n.type = 'notch'; n.frequency.value = f * h; n.Q.value = 30; last.connect(n); last = n; } return last; })); }
                if (k === 'silences') {
                    const ans = await A().askText({title: 'Raccourcir les blancs', message: 'Raccourcir les blancs plus longs que combien de secondes ?', value: '1,5', okLabel: 'Raccourcir', inputMode: 'decimal'}); if (ans == null) return; const minS = Number(String(ans).replace(',', '.').trim()); if (!isFinite(minS) || minS <= 0) { toast('Indique un nombre de secondes, par exemple 1,5.', 'error'); return; }
                    const hop = Math.round(sr * 0.02), rms = frameRms(buf, hop), thr = Math.max(1e-4, percentile(rms, 0.1) * 3), keep = Math.round(0.4 * sr);
                    const parts = []; let start = 0, quietFrom = -1;
                    for (let f = 0; f <= rms.length; f++) { const quiet = f < rms.length && rms[f] < thr; if (quiet && quietFrom < 0) quietFrom = f; if (!quiet && quietFrom >= 0) { const a = quietFrom * hop, b = Math.min(buf.length, f * hop); if ((b - a) / sr > minS) { parts.push(sliceBuf(buf, start, a + keep / 2)); start = b - keep / 2; } quietFrom = -1; } }
                    parts.push(sliceBuf(buf, start, buf.length));
                    const before = buf.duration; setBuf(concatBufs(parts.filter(p => p.length > 1), ch, sr));
                    toast(`${fmt(before - buf.duration)} de blancs enlevés.`);
                }
                if (k === 'mono') { if (ch === 1) { toast('Le son est déjà en mono.'); return; } setBuf(await through(buf, null, {ch: 1})); }
                if (k === 'insert') {
                    const other = await pickOther('audio'); if (!other) return;
                    const ab = await (await fetch(other.src)).arrayBuffer(), ob = await resample(await ctx.decodeAudioData(ab), sr, ch);
                    const where = await A().confirmBox('', {title: `Où mettre « ${other.title} » ?`, okLabel: 'À la fin', cancelLabel: `Au repère orange (${fmt(cursor)})`, danger: false}) ? buf.length : Math.round(cursor * sr);
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
                    let b = buf;
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
    const TRANS = [['none', 'Coupe franche'], ['cross', 'Fondu enchaîné'], ['black', 'Fondu au noir'], ['white', 'Fondu au blanc']];
    const ANIMS = [['none', 'Fixe'], ['fade', 'Apparaît en fondu'], ['slide', 'Glisse depuis la gauche'], ['rise', 'Monte depuis le bas'], ['zoom', 'Grandit'], ['scroll', 'Défile (générique)'], ['type', 'Machine à écrire']];
    const LOOKS = [['Aucun', {}], ['Couleurs vives', {sat: 1.35, contrast: 1.08}], ['Plus chaud', {warm: 0.35}], ['Plus froid', {warm: -0.35}], ['Ancien film', {sat: 0.55, warm: 0.45, contrast: 0.92}],
        ['Noir et blanc', {sat: 0}], ['Contrasté', {contrast: 1.3, bright: 0.97}], ['Doux', {contrast: 0.88, bright: 1.05, sat: 0.9}]];
    const LOOK0 = {bright: 1, contrast: 1, sat: 1, hue: 0, warm: 0};
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
    /* Réglages du montage (Maintenance → Montage, retouche, mise en page et son) : disposition et enregistrement par défaut */
    const MT_KEY = 'genealogie-montage-prefs';
    const MT_SIZES = [[0, 'Comme la vidéo'], [2160, '4K (2160 p)'], [1080, 'Full HD (1080 p)'], [720, 'HD (720 p)'], [480, '480 p'], [360, '360 p (léger)']];
    const MT_QUALITY = [[2, 'Légère (petit fichier)'], [5, 'Normale'], [8, 'Haute'], [14, 'Très haute (gros fichier)']];
    const MT_FPS = [24, 25, 30, 50, 60];
    const MT_COLORS = [['colV1', '🎬 Vidéo principale (Vidéo 1)', '#cfe0ff'], ['colV2', '🖼️ Vidéos incrustées', '#e3d4ff'], ['colT', '🔤 Textes', '#ffe7a8'], ['colA', '🎵 Sons', '#c9f0d4']];
    const MT_SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4, 10];
    /** « 0,5 ; 1 ; 2× » → [0.5, 1, 2] : de 0,1 à 10, sans doublons, 12 au plus, dans l'ordre */
    const parseSpeeds = v => { const list = (Array.isArray(v) ? v : String(v ?? '').split(/[;\s/|]+/)).map(x => Number(String(x).replace(/,$/, '').replace(',', '.').replace(/[×x]/gi, ''))).filter(x => Number.isFinite(x) && x >= 0.1 && x <= 10).map(x => Math.round(x * 100) / 100); const u = [...new Set(list)]; return u.length ? u.sort((a, b) => a - b).slice(0, 12) : null; };
    const speedsText = l => l.map(x => String(x).replace('.', ',')).join(' ; ');
    const MT_DEF = {side: 'right', stage: 50, lane: 40, help: true, fmt: 'mp4', height: 0, quality: 5, fps: 30, abr: 128, speeds: MT_SPEEDS, ...Object.fromEntries(MT_COLORS.map(c => [c[0], c[2]]))};
    // texte lisible (noir ou blanc) sur la couleur choisie
    const inkOn = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#111'; const n = parseInt(m[1], 16), l = 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return l > 150 ? '#111' : '#fff'; };
    function montagePrefs() {
        let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {}
        return montagePrefsFrom(v);
    }
    function montagePrefsFrom(v) {
        const pick = (x, list, d) => list.includes(x) ? x : d, num = (x, a, b, d) => Number.isFinite(Number(x)) ? Math.min(b, Math.max(a, Number(x))) : d;
        return {side: pick(v.side, ['right', 'left'], 'right'), stage: num(v.stage, 25, 80, 50), lane: num(v.lane, 28, 70, 40), help: v.help !== false, fmt: pick(v.fmt, ['mp4', 'webm'], 'mp4'),
            height: pick(Number(v.height), MT_SIZES.map(x => x[0]), 0), quality: pick(Number(v.quality), MT_QUALITY.map(x => x[0]), 5), fps: pick(Number(v.fps), MT_FPS, 30), abr: pick(Number(v.abr), [96, 128, 192, 256], 128), speeds: parseSpeeds(v.speeds) || MT_SPEEDS,
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
        if (arr(d?.tracks).length) P.tracks = arr(d.tracks).filter(t => t && typeof t.id === 'string' && ['v', 'main', 't', 'a'].includes(t.kind)).map(t => ({id: t.id.slice(0, 12), kind: t.kind, name: String(t.name || '').slice(0, 60), ...(t.hidden ? {hidden: true} : {})}));
        if (!P.tracks.some(t => t.kind === 'main')) P.tracks.splice(1, 0, {id: 'V1', kind: 'main', name: 'Vidéo 1'});
        if (d?.look && typeof d.look === 'object' && !Array.isArray(d.look)) P.look = {...P.look, ...d.look};
        if (d?.fx && typeof d.fx === 'object' && !Array.isArray(d.fx)) P.fx = {...P.fx, ...d.fx};
        P.fadeStart = !!d?.fadeStart; P.fadeEnd = !!d?.fadeEnd;
        if (ASPECTS.some(a => a[0] === d?.aspect)) P.aspect = d.aspect;
        P.blurBars = !!d?.blurBars; P.kbAuto = !!d?.kbAuto;
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
        let t = 0; return P.v1.map((c, k) => { const len = Math.max(0.05, clen(c)), d = k && c.tr?.type === 'cross' ? Math.min(c.tr.d || 1, len / 2, clen(P.v1[k - 1]) / 2) : 0; const at = Math.max(0, t - d); t = at + len; return {c, at, end: at + len, cross: d}; });
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
    function montageEngine(P, canvas, {out = 'preview', onTime} = {}) {
        const g = canvas.getContext('2d');
        const ctx = out === 'record' ? new AudioContext() : audioCtx();
        const master = ctx.createGain();
        const fx = P.fx;
        /** Les traitements du son (comme dans « Modifier le son ») : souffle, voix, graves, aigus, mono ; pour tout le film ou un morceau */
        const chain = (from, f) => {
            let tail = from; if (!f) return tail;
            const biq = (type, freq, gain = 0, q = 0.9) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; b.gain.value = gain; b.Q.value = q; return b; };
            if (f.noise) { const hp = biq('highpass', 100), lp = biq('lowpass', 9000); tail.connect(hp).connect(lp); tail = lp; }
            if (f.clarity) { const pr = biq('peaking', 3000, 4), cp = ctx.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 3; tail.connect(pr).connect(cp); tail = cp; }
            if (f.bass) { const b = biq('lowshelf', 200, Math.max(-15, Math.min(15, Number(f.bass)))); tail.connect(b); tail = b; }
            if (f.treble) { const b = biq('highshelf', 4000, Math.max(-15, Math.min(15, Number(f.treble)))); tail.connect(b); tail = b; }
            if (f.mono) { const m = ctx.createGain(); m.channelCount = 1; m.channelCountMode = 'explicit'; m.channelInterpretation = 'speakers'; tail.connect(m); tail = m; }
            return tail;
        };
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
        function drawClip(el, c, local, alpha, main) {
            const {vw, vh} = dimsOf(el); if (!vw || alpha <= 0) return;
            const v = k => tfAt(c, k, local), op = v('opacity') / 100; if (op <= 0) return;
            g.save(); g.globalAlpha = Math.max(0, Math.min(1, alpha * op)); g.filter = lookFilter(c.look || {}, P.look); g.globalCompositeOperation = BLENDS.some(b => b[0] === c.blend) ? c.blend : 'source-over';
            let w, h;
            if (main) {
                const turn = fx.rotate % 180 !== 0, bw = turn ? H : W, bh = turn ? W : H;
                const ref = P.sources[P.v1[0]?.s], k = c.fit === 'fill' ? Math.max(bw / vw, bh / vh) : c.fit === 'none' ? Math.min(bw / (ref?.w || vw), bh / (ref?.h || vh)) : Math.min(bw / vw, bh / vh);
                if (P.blurBars && (c.fit || 'fit') === 'fit' && Math.abs(vw / vh - bw / bh) > 0.02) { // bandes floues : la même image, agrandie et floutée, derrière
                    const kc = Math.max(bw / vw, bh / vh); g.save(); g.filter = `${lookFilter(c.look || {}, P.look)} blur(${Math.round(Math.max(W, H) / 60)}px) brightness(0.72)`;
                    g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180); g.drawImage(el, -vw * kc / 2 * 1.08, -vh * kc / 2 * 1.08, vw * kc * 1.08, vh * kc * 1.08); g.restore(); }
                w = vw * k; h = vh * k; g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180);
            } else {
                w = (c.w || 35) / 100 * W; h = w * vh / vw; g.translate((c.x ?? 62) / 100 * W + w / 2, (c.y ?? 6) / 100 * H + h / 2);
            }
            const ax = v('ax') / 100 * W, ay = v('ay') / 100 * H, sc = v('scale') / 100;
            g.translate(v('px') / 100 * W + ax, v('py') / 100 * H + ay); g.rotate(v('rot') * Math.PI / 180); g.scale(sc * v('sx') / 100, sc * v('sy') / 100);
            const kx = v('kx'), ky = v('ky'); if (kx || ky) g.transform(1, Math.tan(ky * Math.PI / 180), Math.tan(kx * Math.PI / 180), 1, 0, 0);
            g.translate(-ax, -ay);
            if (P.sources[c.s]?.kind === 'image') { const kb = kbAt(c, P, local); if (kb) { g.translate(kb.x * w, kb.y * h); g.scale(kb.s, kb.s); } }
            const cl = Math.max(0, Math.min(95, v('cl'))) / 100, cr = Math.max(0, Math.min(95, v('cr'))) / 100, ct = Math.max(0, Math.min(95, v('ct'))) / 100, cb = Math.max(0, Math.min(95, v('cb'))) / 100;
            const fw = 1 - cl - cr, fh = 1 - ct - cb;
            if (fw > 0.01 && fh > 0.01) {
                const dx = -w / 2 + w * cl, dy = -h / 2 + h * ct;
                g.drawImage(el, vw * cl, vh * ct, vw * fw, vh * fh, dx, dy, w * fw, h * fh);
                if (!main && c.border !== false) { g.filter = 'none'; g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, W / 400) / Math.max(0.1, Math.abs(sc)); g.strokeRect(dx, dy, w * fw, h * fh); }
            }
            g.restore();
        }
        function warmth(look) {
            const w = (look?.warm || 0) + (P.look.warm || 0); if (!w) return;
            g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = Math.min(0.8, Math.abs(w)); g.fillStyle = w > 0 ? '#ff9a3c' : '#3c8bff'; g.fillRect(0, 0, W, H); g.restore();
        }
        function drawText(x, tt) {
            const local = tt - x.at, d = x.dur, size = Math.round((x.size || 6) / 100 * Math.min(H, W)), lines = String(x.text || '').split('\n');
            let alpha = 1, dx = 0, dy = 0, scale = 1, shown = lines.join('\n'); const inT = Math.min(0.8, d / 3);
            if (x.fade !== false) { if (local < 0.4) alpha = local / 0.4; if (d - local < 0.4) alpha = Math.min(alpha, (d - local) / 0.4); }
            if (x.anim === 'fade') { alpha = Math.min(alpha, local < inT ? local / inT : 1); }
            if (x.anim === 'slide' && local < inT) dx = -((1 - local / inT) ** 2) * W * 0.6;
            if (x.anim === 'rise' && local < inT) dy = (1 - local / inT) ** 2 * H * 0.4;
            if (x.anim === 'zoom') scale = 0.6 + 0.4 * Math.min(1, local / inT);
            if (x.anim === 'scroll') dy = H * 0.55 - (local / d) * (H * 1.1 + lines.length * size * 1.3);
            if (x.anim === 'type') { const n = Math.floor(shown.length * Math.min(1, local / Math.max(0.5, d * 0.6))); shown = shown.slice(0, n); }
            g.save(); g.globalAlpha = Math.max(0, Math.min(1, alpha)); g.font = `${x.bold ? '700 ' : ''}${size}px ${x.font || 'Georgia, serif'}`; g.textAlign = x.align || 'center'; g.textBaseline = 'middle';
            const cx = (x.x ?? 50) / 100 * W + dx, cy = (x.y ?? 80) / 100 * H + dy;
            g.translate(cx, cy); g.scale(scale, scale);
            const sl = shown.split('\n'), lh = size * 1.25, top = -(sl.length - 1) * lh / 2;
            if (x.bg) { const w = Math.max(...sl.map(l => g.measureText(l).width)) + size, h = sl.length * lh + size * 0.4, x0 = x.align === 'left' ? -size / 2 : x.align === 'right' ? -w + size / 2 : -w / 2; g.fillStyle = x.bg; g.globalAlpha *= 0.75; g.fillRect(x0, top - lh / 2 - size * 0.2, w, h); g.globalAlpha /= 0.75; }
            sl.forEach((l, i) => { if (x.shadow !== false) { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = size / 6; g.shadowOffsetY = size / 14; } g.fillStyle = x.color || '#ffffff'; g.fillText(l, 0, top + i * lh); });
            g.restore();
        }
        function paint(tt) {
            W = canvas.width; H = canvas.height;
            g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore();
            const {L, list} = active(tt);
            // piste 1, avec ses transitions
            list.filter(i => i.kind === 'v1').sort((a, b) => a.k - b.k).forEach(it => {
                const e = els.get(it.x.c.id); if (!e) return;
                let a = 1; if (it.x.cross && tt < it.x.at + it.x.cross) a = (tt - it.x.at) / it.x.cross;
                drawClip(e.el, it.x.c, it.local, a, true); warmth(it.x.c.look);
            });
            // fondus au noir ou au blanc : fin du morceau d'avant, puis début du suivant
            L.forEach((x, k) => {
                const tr = x.c.tr; if (!k || !tr || !['black', 'white'].includes(tr.type)) return; const h = Math.min(tr.d || 1, 4) / 2;
                const prevEnd = L[k - 1].end; let a = 0;
                if (tt >= prevEnd - h && tt < prevEnd) a = 1 - (prevEnd - tt) / h; else if (tt >= x.at && tt < x.at + h) a = 1 - (tt - x.at) / h;
                if (a > 0) { g.save(); g.globalAlpha = a; g.fillStyle = tr.type === 'white' ? '#fff' : '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            });
            // fondu d'ouverture et de fin du film
            const T = montageEnd(P);
            if (P.fadeStart && tt < 1) { g.save(); g.globalAlpha = 1 - tt; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            if (P.fadeEnd && T - tt < 1) { g.save(); g.globalAlpha = 1 - (T - tt); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); }
            // pistes d'incrustation : celle du bas d'abord, celle du haut devant
            list.filter(i => i.kind === 'v2').sort((a, b) => trackIdx(P, trackOf(P, b.c, 'v2')) - trackIdx(P, trackOf(P, a.c, 'v2'))).forEach(it => {
                const e = els.get(it.c.id); if (!dimsOf(e?.el).vw) return; const c = it.c, local = tt - c.at, len = clen(c);
                let a = (c.opacity ?? 100) / 100; if (c.fade !== false) { if (local < 0.5) a *= local / 0.5; if (len - local < 0.5) a *= (len - local) / 0.5; }
                drawClip(e.el, c, it.local, Math.max(0, a), false);
            });
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
            decorate: null,
            videoSize(id) { const d = dimsOf(els.get(id)?.el); return d.vw ? d : null; },
            async refresh() { sync(t); await ready(); paint(t); },
            destroy() { api.pause(); els.forEach(e => { e.el.removeAttribute('src'); if (!e.img) { try { e.el.load(); } catch (_) {} } }); els.clear(); if (out === 'record') ctx.close(); else { try { master.disconnect(); outGain.disconnect(); } catch (_) {} } },
        };
        return api;
    }

    /** Enregistre le montage (en temps réel) : l'image du moteur et son mélange de sons. */
    async function recordMontage(P, mime, onStep, {height = 0, quality = 5, fps = 30, abr = 128} = {}) {
        const first = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s] || {w: 1280, h: 720}, turn = P.fx.rotate % 180 !== 0, ad = aspectDims(P.aspect);
        const W0 = first.w || 1280, H0 = first.h || 720, Wn = ad ? ad[0] : turn ? H0 : W0, Hn = ad ? ad[1] : turn ? W0 : H0;
        // taille choisie (en lignes : 1080 p, 720 p… ; pour un format choisi, le petit côté) ou celle de la vidéo (2 000 px au plus)
        const sc = height ? height / (ad ? Math.min(Wn, Hn) : Hn) : Math.min(1, 2000 / Math.max(Wn, Hn));
        const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.round(Wn * sc) & ~1); cv.height = Math.max(2, Math.round(Hn * sc) & ~1);
        const T = montageEnd(P);
        let finished; const done = new Promise(r => { finished = r; });
        const eng = montageEngine(P, cv, {out: 'record', onTime: (t, end) => { onStep?.(t / T); if (end) finished(); }});
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
        const LISTS = {v: P.v2, t: P.texts, a: P.audio}, LISTNAME = {v: 'v2', t: 'texts', a: 'audio'};
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
        const freeTrack = (kind, at, len) => P.tracks.filter(t => t.kind === kind && !t.hidden).find(t => !LISTS[kind].some(c => trackOf(P, c, LISTNAME[kind]) === t.id && c.at < at + len && at < c.at + lenOf(c)))?.id || addTrack(kind);
        const undetach = a => { if (!a?.detached) return; [...P.v1, ...P.v2].forEach(v => { if (v.detached === a.id) { v.mute = false; delete v.detached; } }); };
        const ver = await versionsHtml(media);
        const MP = montagePrefs();
        const dl = bigDialog({eyebrow: 'MONTAGE VIDÉO', id: 'video', title: projName || media.title || media.filename || 'Nouveau montage',
            bar: {icon: '🎬', undo: '<span class="ui-topbar-hist"><button type="button" class="icon-button small" data-mt-cmd="undo" data-mt-op="undo" title="Annuler (⌘Z)" data-shortcut="⌘Z" disabled>↶</button><button type="button" class="icon-button small" data-mt-cmd="redo" data-mt-op="redo" title="Rétablir (⇧⌘Z)" data-shortcut="⇧⌘Z" disabled>↷</button></span>', exportAttrs: 'data-mt-export', saveAttrs: 'data-mt-saveproj', saveTitle: 'Enregistrer le projet de montage, pour le rouvrir et continuer plus tard (⌘S)'}, onClose: async () => { eng?.pause(); return !dirty || await A().confirmBox('💾 Enregistrer le projet le garde pour plus tard.', {title: 'Fermer sans enregistrer le projet ?', okLabel: 'Fermer sans enregistrer', danger: true}); },
            body: `<div class="h-mt">
                <div class="h-mt-top">
                    <div class="h-mt-stage"><canvas data-mt-canvas width="1280" height="720"></canvas><p class="h-mt-empty" data-mt-empty hidden>Importe tes vidéos et photos dans l’onglet 🎞️ Rush, puis glisse-les sur la frise (ou « ➕ Vidéo / photo à la suite »).</p></div>
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
                    <label class="h-mt-zoomr" data-tb-label="Zoom de la frise" title="Aussi ⌘ + / ⌘ − (Ctrl + / Ctrl − sur PC et Linux), ⌘ 0 pour revenir">Zoom de la frise <input type="range" min="4" max="200" value="40" data-mt-zoom></label></div>
                <div class="h-mt-ops" data-tbg="mt-ops" data-tbg-label="Outils du montage">
                    <button type="button" class="button small secondary" data-mt-op="split" title="Coupe le morceau choisi à la tête de lecture" data-shortcut="B">✂️ Couper ici</button>
                    <button type="button" class="button small secondary" data-mt-op="start" title="Le morceau choisi commence à la tête de lecture">⟦ Commence ici</button>
                    <button type="button" class="button small secondary" data-mt-op="end" title="Le morceau choisi finit à la tête de lecture">⟧ Finit ici</button>
                    <button type="button" class="button small secondary" data-mt-op="left" title="Avancer le morceau dans la piste 1">← Avancer</button>
                    <button type="button" class="button small secondary" data-mt-op="right" title="Reculer le morceau dans la piste 1">Reculer →</button>
                    <button type="button" class="button small secondary" data-mt-op="detach" title="Le son du morceau passe sur une piste son, à part">🔊 Détacher le son</button>
                    <button type="button" class="button small secondary" data-mt-op="del" title="Enlever l'élément choisi" data-shortcut="⌫">🗑 Enlever</button>
                    <button type="button" class="button small" data-mt-op="addv1" title="Une vidéo ou une photo, à la suite dans la piste Vidéo 1">➕ Vidéo / photo à la suite</button>
                    <button type="button" class="button small secondary" data-mt-op="addv2" title="Une vidéo ou une photo dans un coin de l'image, à la tête de lecture">➕ Incrustation</button>
                    <button type="button" class="button small secondary" data-mt-op="kfprev" title="Aller à l'image clé précédente de l'élément choisi">◀ ◆</button>
                    <button type="button" class="button small secondary" data-mt-op="kfnext" title="Aller à l'image clé suivante de l'élément choisi">◆ ▶</button>
                    <button type="button" class="button small secondary" data-mt-op="addtext">➕ Titre / texte</button>
                    <button type="button" class="button small secondary" data-mt-op="adda">➕ Son / musique</button>
                    <button type="button" class="button small secondary" data-mt-op="voice" title="Enregistre ta voix au micro pendant que le film défile (casque conseillé)">🎙 Voix off</button>
                    <button type="button" class="button small secondary" data-mt-op="sub" title="Un sous-titre de 3 s à la tête de lecture, sur la piste « Sous-titres »">💬 Sous-titre ici</button>
                    <button type="button" class="button small secondary" data-mt-op="chapter" title="Un chapitre commence à la tête de lecture">🔖 Chapitre ici</button>
                </div>
                <div class="h-mt-tl" data-mt-tl></div>
                <p class="muted h-avx-help">Clique sur la frise pour te placer, sur un élément pour le choisir ; glisse un élément pour le déplacer dans le temps, ou sur une autre piste du même genre (vidéos et photos vont sur toutes les pistes vidéo, texte ↔ texte, son ↔ son). Espace = lire / pause · ⌫ ou Suppr = enlever · B = couper ici · ◇ = image clé.</p>
                ${ver.html}
                <div class="modal-actions"><button type="button" class="button secondary" data-mt-projects title="Rouvrir un montage enregistré">📂 Projets…</button><span class="h-mt-projname" data-mt-projname></span><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save title="Fabrique le fichier vidéo (MP4 ou WebM, plusieurs formats d’image) et le range dans les médias : nouvelle version, copie ou nouvelle vidéo">📥 Garder dans les médias…</button></div></div>`});
        dl.classList.add('h-avx-montage'); dl.classList.toggle('mt-left', MP.side === 'left'); dl.classList.toggle('mt-nohelp', !MP.help);
        dl.style.setProperty('--mt-stage', MP.stage + 'vh'); dl.style.setProperty('--mt-lane', MP.lane + 'px');
        [['colV1', 'v1'], ['colV2', 'v2'], ['colT', 't'], ['colA', 'a']].forEach(([k, v]) => { dl.style.setProperty(`--mt-c-${v}`, MP[k]); dl.style.setProperty(`--mt-i-${v}`, inkOn(MP[k])); });
        const $ = s => dl.querySelector(s), cv = $('[data-mt-canvas]');
        if (media.id) bindVersions(dl, media, 'video', () => { dirty = false; dl.close(); onDone?.(); });
        $('[data-avx-cancel]').addEventListener('click', () => dl.querySelector('[data-avx-close]').click());
        const sizeFor = () => { const ad = aspectDims(P.aspect); if (ad) { const k = Math.min(1, 1280 / Math.max(...ad)); return [Math.round(ad[0] * k), Math.round(ad[1] * k)]; } const so = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s]; const turn = P.fx.rotate % 180 !== 0; const w = so?.w || 1280, h = so?.h || 720, k = Math.min(1, 1280 / Math.max(w, h)); return [Math.round((turn ? h : w) * k), Math.round((turn ? w : h) * k)]; };
        const fitCanvas = () => { [cv.width, cv.height] = sizeFor(); }; // l'image prend le format de la première vidéo
        let eng = null;
        const rebuild = async () => { const t = eng?.t || 0; eng?.destroy(); fitCanvas(); eng = montageEngine(P, cv, {onTime}); eng.decorate = decorate; await eng.seek(t); };
        // 0 : redessiner · 1 : recaler les vidéos · 2 : refaire le moteur (son général, rotation) ; pane=false : on écrit dans le panneau
        // ↶ ↷ : chaque changement du montage (couper, déplacer, régler…) est une étape ; les rushes, eux, restent
        let hist = [], hpos = -1, histTimer = 0;
        const snapP = () => JSON.stringify({v1: P.v1, v2: P.v2, texts: P.texts, audio: P.audio, tracks: P.tracks, look: P.look, fx: P.fx, fadeStart: !!P.fadeStart, fadeEnd: !!P.fadeEnd, aspect: P.aspect || '', blurBars: !!P.blurBars, kbAuto: !!P.kbAuto, duck: P.duck || null, chapters: P.chapters || []});
        const record = () => { clearTimeout(histTimer); histTimer = 0; const v = snapP(); if (hist[hpos] === v) return; hist = hist.slice(0, hpos + 1); hist.push(v); if (hist.length > 300) hist.shift(); hpos = hist.length - 1; syncUndo(); };
        const schedHist = () => { clearTimeout(histTimer); histTimer = setTimeout(record, 350); };
        const syncUndo = () => { const u = dl.querySelector('[data-mt-op="undo"]'), r = dl.querySelector('[data-mt-op="redo"]'); if (u) u.disabled = hpos <= 0; if (r) r.disabled = hpos >= hist.length - 1; };
        const undoTo = async i => {
            if (histTimer) record();
            if (i < 0 || i >= hist.length) return toast(i < 0 ? 'Rien à annuler.' : 'Rien à rétablir.');
            hpos = i; Object.assign(P, JSON.parse(hist[i])); if (sel && !all().some(([tr, c]) => tr === sel.track && c.id === sel.id)) sel = null;
            dirty = true; const [w, h] = sizeFor(); if (w !== cv.width || h !== cv.height) await rebuild(); drawTl(); drawRush(true); eng?.seek(eng.t); syncUndo();
        };
        const touch = async (lvl = 1, pane = true) => { dirty = true; schedHist(); const [w, h] = sizeFor(); if (w !== cv.width || h !== cv.height) lvl = 2; if (lvl === 2) { await rebuild(); drawTl(pane); return; } drawTl(pane); if (lvl === 1) eng?.seek(eng.t); else eng?.refresh(); };
        const onTime = (t, end) => { $('[data-mt-cur]').textContent = fmt(t); const ph = $('[data-mt-ph]'); if (ph) ph.style.left = (t * pxs + OFF) + 'px'; if (end) $('[data-mt-play]').textContent = '▶ Lire'; if (!eng?.playing || end) syncInspector(); };
        const all = () => [...P.v1.map(c => ['v1', c]), ...P.v2.map(c => ['v2', c]), ...P.texts.map(c => ['texts', c]), ...P.audio.map(c => ['audio', c])];
        const selected = () => { const f = all().find(([tr, c]) => sel && tr === sel.track && c.id === sel.id); return f ? f[1] : null; };
        // frise : une ligne par piste
        function drawTl(pane = true) {
            const L = layoutV1(P), T = montageEnd(P), W = Math.max(600, T * pxs + 160);
            const kfMarks = c => { const ts = [...new Set(Object.values(c.kf || {}).flat().map(k => Math.round(k.t * 100) / 100))]; return ts.map(t => `<i class="h-mt-kfm" style="left:${(t - (c.from || 0)) / spd(c) * pxs}px" title="Image clé ${fmt(t - (c.from || 0))}"></i>`).join(''); };
            const block = (tr, c, at, len, label, cls = '') => `<button type="button" class="h-mt-clip ${cls} ${isImg(c) ? 'is-img' : ''} ${sel && sel.track === tr && sel.id === c.id ? 'is-sel' : ''}" style="left:${OFF + at * pxs}px;width:${Math.max(6, len * pxs)}px" data-mt-clip="${tr}:${c.id}" title="${esc(label)} · ${fmt(at)} → ${fmt(at + len)}">${isImg(c) ? '🖼️ ' : ''}${esc(label)}${kfMarks(c)}</button>`;
            const lane = (key, name, inner) => `<div class="h-mt-lane" data-mt-lane="${key}"><span class="h-mt-lname">${name}</span>${inner}</div>`;
            const ruler = Array.from({length: Math.ceil(T) + 1}, (_, s) => s % Math.max(1, Math.round(60 / pxs * 2)) === 0 ? `<span style="left:${OFF + s * pxs}px">${fmt(s, false)}</span>` : '').join('');
            const clipsOf = tr => tr.kind === 'main' ? L.map(x => block('v1', x.c, x.at, x.end - x.at, (x.c.tr?.type && x.c.tr.type !== 'none' ? '◇ ' : '') + (P.sources[x.c.s]?.title || 'Vidéo') + (x.c.mute ? ' 🔇' : ''), 'is-v1')).join('')
                : tr.kind === 'v' ? P.v2.filter(c => trackOf(P, c, 'v2') === tr.id).map(c => block('v2', c, c.at, clen(c), P.sources[c.s]?.title || 'Incrustation', 'is-v2')).join('')
                : tr.kind === 't' ? P.texts.filter(x => trackOf(P, x, 'texts') === tr.id).map(x => block('texts', x, x.at, x.dur, x.text.split('\n')[0] || 'Texte', 'is-text')).join('')
                : P.audio.filter(a => trackOf(P, a, 'audio') === tr.id).map(a => block('audio', a, a.at, clen(a), (a.detached ? '🔊 ' : '🎵 ') + (P.sources[a.s]?.title || 'Son'), 'is-audio')).join('');
            const laneOf = tr => `<div class="h-mt-lane ${tr.hidden ? 'is-hidden' : ''}" data-mt-lane="${tr.id}" data-kind="${tr.kind}"><span class="h-mt-lname"><b title="Double-clic pour renommer" data-mt-tname="${tr.id}">${TRACK_KINDS[tr.kind][0]} ${esc(tr.name)}</b><span class="h-mt-tbtns">${`<button type="button" data-mt-tvis="${tr.id}" title="${tr.hidden ? 'Montrer cette piste' : 'Cacher cette piste (ni vue ni entendue)'}">${tr.hidden ? '🙈' : '👁'}</button>`}<button type="button" data-mt-tup="${tr.id}" title="Monter la piste">↑</button><button type="button" data-mt-tdown="${tr.id}" title="Descendre la piste">↓</button><button type="button" data-mt-tdel="${tr.id}" title="${tr.kind === 'main' ? 'Vider cette piste (elle reste, c’est la piste de base du film)' : 'Supprimer cette piste'}">🗑</button></span></span>${clipsOf(tr)}</div>`;
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
        const chk = (k, label, on) => `<label class="checkbox-line"><input type="checkbox" data-mt-k="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
        // les réglages du son : pour un morceau (afx) ou pour tout le film (fx)
        const soundFx = (pre, f) => `${chk(pre + '.clarity', '🗣️ Voix plus nette', f.clarity)}${chk(pre + '.noise', '🧹 Moins de souffle et de grondement', f.noise)}${rng(pre + '.bass', 'Graves', -12, 12, 1, f.bass || 0, ' dB')}${rng(pre + '.treble', 'Aigus', -12, 12, 1, f.treble || 0, ' dB')}${chk(pre + '.mono', '🎧 Mono (le même son des deux côtés)', f.mono)}`;
        const speedHtml = c => `${rng('speed', 'Vitesse', 0.1, 10, 0.05, spd(c), ' ×')}<label class="h-avx-row">Vitesse exacte <input type="number" class="h-mt-num" min="0.1" max="10" step="0.05" value="${spd(c)}" data-mt-k="speedn"> ×</label><div class="h-mt-quick">${montagePrefs().speeds.map(v => `<button type="button" data-mt-speed="${v}" class="${spd(c) === v ? 'is-on' : ''}">${String(v).replace('.', ',')} ×</button>`).join('')}<button type="button" data-mt-speededit title="Choisir les vitesses de ces boutons (aussi dans Maintenance → Montage)">✎</button></div>${chk('pitch', 'garder la hauteur de la voix', c.pitch !== false)}`;
        const clipSound = c => `<details class="h-mt-isec h-mt-sfx" ${c.afx && Object.values(c.afx).some(Boolean) ? 'open' : ''}><summary><b>🔊 Son de ce morceau</b></summary>${soundFx('afx', c.afx || {})}<div class="h-mt-quick"><button type="button" data-mt-afxall title="Mettre ces réglages du son sur tous les morceaux et sons du projet">Appliquer à tous les sons du projet</button><button type="button" data-mt-afxreset>↺ Remettre comme au départ</button></div><p class="muted">Pour tout le film d’un coup : onglet 🔊 Son.</p></details>`;
        const kbHtml = c => `<label class="h-avx-row">Effet Ken Burns <select data-mt-k="kb">${KB.map(([k, l]) => `<option value="${k}" ${(c.kb ?? (P.kbAuto ? 'auto' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span data-help="Un lent mouvement de caméra sur la photo : elle s’approche, s’éloigne ou glisse doucement pendant qu’elle est à l’écran."></span></label>`;
        const imgDur = c => `<label class="h-avx-row">Durée à l’écran <input type="number" class="h-mt-num" min="0.1" max="3600" step="0.1" value="${Math.round(clen(c) * 10) / 10}" data-mt-k="imgdur"> s</label><div class="h-mt-quick">${[2, 3, 5, 8, 10, 15].map(v => `<button type="button" data-mt-imgdur="${v}">${v} s</button>`).join('')}</div>`;
        const rng = (k, label, min, max, step, v, unit = '') => `<label class="h-avx-row">${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-mt-k="${k}"><output data-u="${unit}">${unit === '%' ? Math.round(v * 100) + ' %' : v + unit}</output></label>`;
        const lookHtml = (L, scope) => `<div class="h-mt-looks">${LOOKS.map(([n], i) => `<button type="button" class="button small secondary" data-mt-look="${scope}:${i}">${esc(n)}</button>`).join('')}</div>
            ${rng(scope + '.bright', 'Luminosité', 0.4, 1.8, 0.02, L.bright ?? 1, '%')}${rng(scope + '.contrast', 'Contraste', 0.4, 1.8, 0.02, L.contrast ?? 1, '%')}${rng(scope + '.sat', 'Saturation', 0, 2, 0.02, L.sat ?? 1, '%')}${rng(scope + '.warm', 'Température (froid ↔ chaud)', -0.8, 0.8, 0.02, L.warm ?? 0)}${rng(scope + '.hue', 'Teinte', -60, 60, 1, L.hue ?? 0, '°')}`;
        const trackSel = (list, c) => { const cur = trackOf(P, c, list); return `<label class="h-avx-row">Piste <select data-mt-k="track">${P.tracks.filter(t => t.kind === KIND_OF_LIST[list]).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`; };
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
                <label class="h-avx-row">Transition avant <select data-mt-k="tr.type">${TRANS.map(([k, l]) => `<option value="${k}" ${(c.tr?.type || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${rng('tr.d', 'Durée du fondu', 0.2, 4, 0.1, c.tr?.d ?? 1, ' s')}
                ${isImg(c) ? '' : `${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}<label class="checkbox-line"><input type="checkbox" data-mt-k="mute" ${c.mute ? 'checked' : ''}> 🔇 Sans son</label>${c.detached ? '<p class="muted">🔊 Son séparé : il est sur une piste son, à part.</p>' : '<button type="button" class="button small secondary" data-mt-sep title="Le son passe sur une piste son : on le déplace, le coupe ou le règle à part de l’image">🔊 Séparer le son de l’image</button>'}${clipSound(c)}`}
                ${inspectorHtml(c, true)}
                <h4>🎨 Couleurs de ce morceau</h4>${lookHtml(c.look || {}, 'look')}`;
            else if (sel.track === 'v2') item.innerHTML = `<h4>🖼️ Incrustation${isImg(c) ? ' (photo)' : ''}</h4><p class="muted">${esc(P.sources[c.s]?.title || '')}</p>${isImg(c) ? imgDur(c) + kbHtml(c) : speedHtml(c)}${rng('w', 'Largeur', 10, 100, 1, c.w ?? 35, ' %')}${rng('x', 'Position horizontale', 0, 90, 1, c.x ?? 62, ' %')}${rng('y', 'Position verticale', 0, 90, 1, c.y ?? 6, ' %')}
                ${isImg(c) ? '' : rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 0, '%') + (c.detached ? '<p class="muted">🔊 Son séparé : il est sur une piste son, à part.</p>' : '<button type="button" class="button small secondary" data-mt-sep>🔊 Séparer le son de l’image</button>') + clipSound(c)}${trackSel('v2', c)}<label class="checkbox-line"><input type="checkbox" data-mt-k="border" ${c.border !== false ? 'checked' : ''}> cadre blanc</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}> apparaît et disparaît en fondu</label>
                ${inspectorHtml(c, false)}`;
            else if (sel.track === 'texts') item.innerHTML = `<h4>🔤 Titre / texte</h4>${trackSel('texts', c)}<label class="h-mt-txt">Texte <textarea rows="3" data-mt-k="text">${esc(c.text)}</textarea></label>
                <label class="h-avx-row">Mouvement <select data-mt-k="anim">${ANIMS.map(([k, l]) => `<option value="${k}" ${c.anim === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${rng('dur', 'Durée', 0.5, 30, 0.1, c.dur, ' s')}${rng('size', 'Taille', 2, 20, 0.5, c.size ?? 6, ' %')}
                <div class="h-avx-row">Police <input type="hidden" data-mt-k="font" value="${esc(c.font || FONTS_V[0][0])}"><button type="button" class="button small secondary" data-mt-fontpick style="${esc(`font-family:${c.font || FONTS_V[0][0]}`)}" title="Choisir la police (recherche, récentes, polices de l’ordinateur)">${esc((FONTS_V.find(f => f[0] === c.font) || [0, String(c.font || 'Georgia').split(',')[0].replace(/"/g, '')])[1])} ▾</button></div>
                <label class="h-avx-row">Couleur <input type="color" value="${esc(c.color || '#ffffff')}" data-mt-k="color"> Fond <input type="color" value="${esc(c.bg || '#000000')}" data-mt-k="bg" ${c.bg ? '' : 'disabled'}><label class="checkbox-line"><input type="checkbox" data-mt-k="hasbg" ${c.bg ? 'checked' : ''}> bandeau</label></label>
                ${rng('x', 'Position horizontale', 0, 100, 1, c.x ?? 50, ' %')}${rng('y', 'Position verticale', 0, 100, 1, c.y ?? 80, ' %')}
                <label class="h-avx-row">Alignement <select data-mt-k="align">${[['center', 'centré'], ['left', 'à gauche'], ['right', 'à droite']].map(([k, l]) => `<option value="${k}" ${(c.align || 'center') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-mt-k="bold" ${c.bold ? 'checked' : ''}> gras</label><label class="checkbox-line"><input type="checkbox" data-mt-k="shadow" ${c.shadow !== false ? 'checked' : ''}> ombre</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}> entre et sort en fondu</label>`;
            else item.innerHTML = `<h4>${c.voice ? '🎙 Voix' : '🎵 Son'}</h4><p class="muted">${esc(P.sources[c.s]?.title || '')} · ${fmt(c.from)} → ${fmt(c.to)}</p>${chk('voice', '🎙 C’est une voix (la musique baisse toute seule pendant qu’elle parle)', c.voice)}${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}${rng('fadeIn', 'Fondu d’entrée', 0, 10, 0.1, c.fadeIn || 0, ' s')}${rng('fadeOut', 'Fondu de sortie', 0, 10, 0.1, c.fadeOut || 0, ' s')}
                ${speedHtml(c)}${trackSel('audio', c)}${clipSound(c)}`;
            $('[data-mt-pane="color"]').innerHTML = `<h4>🎨 Couleurs de tout le film</h4><p class="muted">S’ajoutent aux couleurs de chaque morceau (onglet Élément).</p>${lookHtml(P.look, 'film')}`;
            $('[data-mt-pane="sound"]').innerHTML = `<h4>🔊 Le son de tout le film</h4>${rng('fx.volume', 'Volume général', 0, 3, 0.05, P.fx.volume, '%')}${soundFx('fx', P.fx)}${chk('fx.mute', '🔇 Sans le son', P.fx.mute)}<p class="muted">S’ajoute aux réglages de chaque morceau (onglet 🎯 Élément → « 🔊 Son de ce morceau »).</p>`;
            $('[data-mt-pane="film"]').innerHTML = `<h4>🎞️ Le film</h4><div class="h-avx-row"><button type="button" class="button small secondary" data-mt-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-mt-rot="90">⟳ 90°</button><small class="muted">${P.fx.rotate ? `tourné de ${P.fx.rotate}°` : ''}</small></div>
                <label class="checkbox-line"><input type="checkbox" data-mt-k="fadeStart" ${P.fadeStart ? 'checked' : ''}> commence par un fondu depuis le noir</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fadeEnd" ${P.fadeEnd ? 'checked' : ''}> finit par un fondu au noir</label>
                <h4>📐 Format de l’image</h4><label class="h-avx-row">Format <select data-mt-aspect>${ASPECTS.map(([k, l]) => `<option value="${k}" ${(P.aspect || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-mt-k="blurBars" ${P.blurBars ? 'checked' : ''}> bandes floues au lieu des bandes noires (la même image, floutée, derrière)</label>
                <h4>🖼️ Photos</h4><label class="checkbox-line"><input type="checkbox" data-mt-k="kbAuto" ${P.kbAuto ? 'checked' : ''}> effet Ken Burns sur toutes les photos (zoom et glissement lents, variés)</label>
                <h4>🎙 Musique et voix</h4><label class="checkbox-line"><input type="checkbox" data-mt-duck="on" ${P.duck?.on !== false ? 'checked' : ''}> la musique baisse toute seule pendant une voix</label>${rng('duck.amount', 'Musique pendant la voix', 0, 1, 0.05, P.duck?.amount ?? 0.3, '%')}<label class="checkbox-line"><input type="checkbox" data-mt-duck="video" ${P.duck?.video ? 'checked' : ''}> … et aussi pendant le son des vidéos de la piste 1</label>
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
            else if (k.startsWith('fx.') || ['fadeStart', 'fadeEnd', 'blurBars', 'kbAuto'].includes(k) || k.startsWith('duck.')) { if (k.startsWith('duck.')) P.duck = P.duck || {on: true, amount: 0.3}; setK(P, k, v); }
            else if (c) {
                if (k === 'hasbg') { c.bg = v ? (dl.querySelector('[data-mt-k="bg"]').value || '#000000') : ''; dl.querySelector('[data-mt-k="bg"]').disabled = !v; }
                else if (k === 'track') { c.track = v; touch(1); return; }
                else if (k === 'speedn') { const v2 = Number(String(v).replace(',', '.')); if (!(v2 > 0)) return; c.speed = Math.max(0.1, Math.min(10, v2)); touch(1, false); return; }
                else if (k === 'imgdur') { const d = Number(String(v).replace(',', '.')); if (!(d > 0)) return; c.to = c.from + Math.max(0.1, Math.min(IMG_MAX, d)); }
                else if (k === 'tr.type' || k === 'tr.d') { c.tr = c.tr || {type: 'none', d: 1}; c.tr[k.slice(3)] = k === 'tr.d' ? Number(v) : v; }
                else setK(c, k, v);
            }
            touch(audioFx(k) ? 2 : (k === 'speed' || k === 'pitch') ? 1 : 0, false);
        });
        dl.querySelector('.h-mt-side').addEventListener('change', e => {
            if (e.target.matches('[data-mt-aspect]')) { P.aspect = e.target.value; touch(2); return; }
            if (e.target.matches('[data-mt-duck]')) { P.duck = P.duck || {on: true, amount: 0.3}; P.duck[e.target.dataset.mtDuck] = e.target.checked; touch(1); return; }
            if (e.target.matches('[data-mt-chapname]')) { const c = (P.chapters || []).find(x => x.id === e.target.dataset.mtChapname); if (c) { c.title = e.target.value.trim().slice(0, 120) || c.title; touch(0, false); } }
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
        // sur l'image : glisser une incrustation ou un texte pour le déplacer, tirer son coin pour changer sa taille
        const measure = document.createElement('canvas').getContext('2d');
        const boxOf = (track, c) => {
            const W = cv.width, H = cv.height, t = eng?.t || 0;
            if (track === 'v2') { if (t < c.at || t >= c.at + clen(c)) return null; const s = eng.videoSize(c.id) || {vw: 16, vh: 9}, w = (c.w || 35) / 100 * W; return {x: (c.x ?? 62) / 100 * W, y: (c.y ?? 6) / 100 * H, w, h: w * s.vh / s.vw}; }
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
            e.preventDefault(); cv.setPointerCapture(e.pointerId);
            const [track, c] = hit, b0 = boxOf(track, c), hs = HANDLE(), resize = px >= b0.x + b0.w - hs && py >= b0.y + b0.h - hs;
            sel = {track, id: c.id}; drawTl(); eng.redraw();
            const s0 = {x: c.x, y: c.y, w: c.w, size: c.size};
            const mv = ev => {
                const dx = ((ev.clientX - r.left) * k - px), dy = ((ev.clientY - r.top) * k - py);
                if (resize) { if (track === 'v2') c.w = Math.max(8, Math.min(100, Math.round(((s0.w || 35) / 100 * cv.width + dx) / cv.width * 1000) / 10)); else c.size = Math.max(1.5, Math.min(30, Math.round(((s0.size || 6) * (1 + dy / Math.max(20, b0.h))) * 10) / 10)); }
                else { c.x = Math.max(-20, Math.min(110, Math.round(((s0.x ?? (track === 'v2' ? 62 : 50)) + dx / cv.width * 100) * 10) / 10)); c.y = Math.max(-20, Math.min(110, Math.round(((s0.y ?? (track === 'v2' ? 6 : 80)) + dy / cv.height * 100) * 10) / 10)); }
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
            const clip = e.target.closest('[data-mt-clip]'), x0 = e.clientX, inner = tl.querySelector('.h-mt-tlin'), r = inner.getBoundingClientRect();
            const cg = e.target.closest('[data-mt-chapgo]'); if (cg) { e.preventDefault(); eng.seek(Number(cg.dataset.mtChapgo)); return; }
            if (!clip) { if (e.target.closest('.h-mt-lname, .h-mt-addtracks')) return; eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const [track, id] = clip.dataset.mtClip.split(':'); sel = {track, id};
            const c = selected(); drawTl();
            if (!c) { eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const L0 = layoutV1(P), at0 = track === 'v1' ? (L0.find(x => x.c === c)?.at || 0) : c.at, el = tl.querySelector(`[data-mt-clip="${track}:${id}"]`); let moved = false, y0 = e.clientY;
            const mv = ev => { const d = (ev.clientX - x0) / pxs; if (Math.abs(ev.clientX - x0) > 3 || Math.abs(ev.clientY - y0) > 6) moved = true; const at = Math.max(0, Math.round((at0 + d) * 10) / 10); if (track !== 'v1') c.at = at; if (el) { el.style.left = (OFF + at * pxs) + 'px'; el.style.pointerEvents = 'none'; if (track === 'v1') el.style.transform = `translateY(${ev.clientY - y0}px)`; } };
            const up = ev => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
                if (!moved) return eng.seek((ev.clientX - r.left - OFF) / pxs);
                const drop = Math.max(0, at0 + (ev.clientX - x0) / pxs);
                const ln = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-mt-lane]'), kind = ln?.dataset.kind;
                if (track === 'v1') {
                    if (kind === 'v') { // la piste principale → une piste d'incrustation (vidéo ou photo)
                        P.v1.splice(P.v1.indexOf(c), 1); const k = {...c, id: nid('i'), at: Math.round(drop * 10) / 10, w: 35, x: 62, y: 6, opacity: 100, track: ln.dataset.mtLane}; delete k.tr;
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
                else if (ln && kind && kind !== KIND_OF_LIST[track]) toast('Pas sur cette piste : il faut une piste du même genre.', 'error');
                touch(1); };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
        });
        $('[data-mt-zoom]').addEventListener('input', e => { pxs = Number(e.target.value); drawTl(); });
        // pistes : ajouter, cacher, monter, descendre, supprimer, renommer
        tl.addEventListener('click', async e => {
            const b = e.target.closest('[data-mt-addtrack],[data-mt-tvis],[data-mt-tup],[data-mt-tdown],[data-mt-tdel]'); if (!b) return;
            e.stopPropagation(); const d = b.dataset;
            if (d.mtAddtrack) { const id = addTrack(d.mtAddtrack); toast(`Piste « ${P.tracks.find(t => t.id === id).name} » ajoutée.`); return touch(0); }
            const id = d.mtTvis || d.mtTup || d.mtTdown || d.mtTdel, i = trackIdx(P, id), tr = P.tracks[i]; if (!tr) return;
            if (d.mtTvis) { tr.hidden = !tr.hidden; return touch(1); }
            if (d.mtTup || d.mtTdown) { const j = i + (d.mtTup ? -1 : 1); if (j < 0 || j >= P.tracks.length) return; [P.tracks[i], P.tracks[j]] = [P.tracks[j], P.tracks[i]]; return touch(0); }
            if (d.mtTdel && tr.kind === 'main') { // la piste de base du film reste : on la vide
                if (!P.v1.length) return toast('Cette piste est déjà vide.');
                if (!await A().confirmBox(`${P.v1.length > 1 ? `Ses ${P.v1.length} éléments seront retirés` : 'Son élément sera retiré'} du montage.`, {title: `Vider la piste « ${tr.name} » ?`, okLabel: 'Vider la piste'})) return;
                const gone = new Set(P.v1.map(c => c.id)); P.v1.forEach(c => { if (c.detached) { const a = P.audio.find(x => x.id === c.detached); if (a) delete a.detached; } }); P.v1.splice(0);
                if (sel && gone.has(sel.id)) sel = null; toast(`Piste « ${tr.name} » vidée.`); return touch(1);
            }
            if (d.mtTdel) {
                const list = LISTS[tr.kind], mine = list.filter(c => trackOf(P, c, LISTNAME[tr.kind]) === id);
                if (mine.length && !await A().confirmBox('', {title: `Supprimer la piste « ${tr.name} » et ${mine.length > 1 ? `ses ${mine.length} éléments` : 'son élément'} ?`, okLabel: 'Supprimer la piste'})) return;
                mine.forEach(c => { if (tr.kind === 'a') undetach(c); list.splice(list.indexOf(c), 1); });
                P.tracks.splice(i, 1); if (sel && mine.some(c => c.id === sel.id)) sel = null; toast(`Piste « ${tr.name} » supprimée.`); return touch(1);
            }
        });
        tl.addEventListener('dblclick', async e => { const n = e.target.closest('[data-mt-tname]'); if (!n) return; const tr = P.tracks.find(t => t.id === n.dataset.mtTname); const name = ((await window.LCNDA_APP.askText({message: 'Nom de la piste :', value: tr.name})) || '').trim().slice(0, 40); if (name) { tr.name = name; touch(0); } });
        // lecture
        // le bouton change tout de suite ; la lecture démarre dès que les morceaux du moment sont prêts
        const play = () => { const b = $('[data-mt-play]'); if (eng.playing || eng.starting) { eng.pause(); b.textContent = '▶ Lire'; } else { b.textContent = '⏸ Pause'; eng.play().catch(() => { b.textContent = '▶ Lire'; }); } };
        $('[data-mt-play]').addEventListener('click', play);
        $('[data-mt-home]').addEventListener('click', () => eng.seek(0));
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
            else if (how === 'v1') { const k = {id: nid('v'), s, from: 0, to: srcLen(s), tr: {type: P.v1.length ? 'cross' : 'none', d: 1}, look: {}, vol: 1};
                // posé à un endroit précis de la frise : il se range entre les morceaux, sinon à la fin
                const L = layoutV1(P), idx = at === null ? -1 : L.findIndex(x => (x.at + x.end) / 2 > at); if (idx < 0) P.v1.push(k); else { P.v1.splice(idx, 0, k); if (idx === 0) { k.tr = {type: 'none', d: 1}; if (P.v1[1]) P.v1[1].tr = {type: 'cross', d: 1}; } } sel = {track: 'v1', id: k.id}; }
            else { const k = {id: nid('i'), s, from: 0, to: srcLen(s), at: t, w: 35, x: 62, y: 6, opacity: 100, vol: so.kind === 'video' ? 1 : 0}; /* une vidéo garde son son */ k.track = how?.startsWith?.('V') && how !== 'V1' ? how : freeTrack('v', t, k.to); P.v2.push(k); sel = {track: 'v2', id: k.id}; }
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
                <div class="h-mt-rbar"><label class="button small" title="Vidéos, photos ou sons de l’ordinateur (plusieurs à la fois), rangés dans le dossier ouvert">📥 Importer<input type="file" multiple accept="video/*,image/*,audio/*" data-mt-rimport hidden></label><button type="button" class="button small secondary" data-mt-rbase>🗂 De la base</button><button type="button" class="button small secondary" data-mt-rnewdir title="Nouveau dossier dans le dossier ouvert">📁＋ Dossier</button>
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
            d.innerHTML = `<form method="dialog"><h4>${esc(title)}</h4><div class="h-mt-rpicklist"><button value="" type="submit">🎞️ Tous les rushes (racine)</button>${rows.map(([id, dep, n]) => `<button value="${esc(id)}" type="submit" style="padding-left:${dep * 14}px">📁 ${esc(n)}</button>`).join('')}<button value="__new" type="submit">📁＋ Nouveau dossier…</button></div><menu><button value="__cancel" type="submit" class="button small secondary">Annuler</button></menu></form>`;
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
            const r = tlEl.querySelector('.h-mt-tlin').getBoundingClientRect(), at = Math.max(0, (e.clientX - r.left - OFF) / pxs);
            const kind = lane?.dataset.kind || (so.kind === 'audio' ? 'a' : 'main');
            if (so.kind === 'audio' && kind !== 'a') return toast('Un son se pose sur une piste son.', 'error');
            if (so.kind === 'image' && kind === 'a') return toast('Une photo se pose sur une piste vidéo.', 'error');
            if (so.kind === 'video' && kind === 'a') return placeRush(s, lane.dataset.mtLane, at); // une vidéo sur une piste son : seulement son son
            if (kind === 't') return toast('Une piste texte reçoit des titres (« ➕ Titre / texte »).', 'error');
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
            if (voiceRec) { voiceRec.stop(); return; }
            if (!navigator.mediaDevices?.getUserMedia) return toast('Ce navigateur ne donne pas accès au micro.', 'error');
            let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch (_) { return toast('Micro refusé : autorise-le dans les réglages du navigateur ou du système.', 'error'); }
            const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
            const rec = new MediaRecorder(stream, mime ? {mimeType: mime} : {}), chunks = [], at = eng.t;
            rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach(tk => tk.stop()); voiceRec = null; btn.textContent = '🎙 Voix off'; btn.classList.remove('is-rec'); eng.pause(); $('[data-mt-play]').textContent = '▶ Lire';
                const type = (rec.mimeType || mime || 'audio/webm').split(';')[0], ext0 = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
                const file = new File([new Blob(chunks, {type})], `voix-off-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext0}`, {type});
                if (file.size < 2000) return toast('Enregistrement trop court.', 'error');
                const sIdx = await pushSource({src: URL.createObjectURL(file), title: `🎙 Voix off ${fmt(at, false)}`, file}, 'audio'); if (sIdx === null) return;
                let tr = P.tracks.find(x => x.kind === 'a' && /^voix/i.test(x.name))?.id; if (!tr) { tr = addTrack('a'); P.tracks.find(x => x.id === tr).name = 'Voix off'; }
                const k = {id: nid('a'), s: sIdx, from: 0, to: P.sources[sIdx].dur, at, vol: 1, fadeIn: 0, fadeOut: 0.2, voice: true, track: tr}; P.audio.push(k); sel = {track: 'audio', id: k.id};
                await touch(1); toast('Voix off posée sur la piste « Voix off » (la musique baisse pendant qu’elle parle). 💾 Enregistrer le projet l’envoie dans les Médias.');
            };
            voiceRec = rec; rec.start(500); btn.textContent = '⏹ Arrêter la voix off'; btn.classList.add('is-rec');
            toast('🎙 Enregistrement… parle pendant que le film défile (un casque évite que le son du film soit enregistré). ⏹ pour arrêter.');
            if (!eng.playing) { $('[data-mt-play]').textContent = '⏸ Pause'; eng.play().catch(() => {}); }
        }
        /** 🪄 Modèles : « La vie de… » (les photos d'une personne, ses dates) ou « Une famille » (la personne, ses parents, conjoints, enfants) */
        function templateDialog(kind) {
            let chosen = 0;
            ext.openDialog({eyebrow: 'MODÈLE DE MONTAGE', title: kind === 'life' ? '🪄 « La vie de… »' : '🪄 « Une famille »', wide: true, submitLabel: 'Fabriquer le montage',
                body: `<p class="muted">${kind === 'life' ? 'Les photos de la personne, dans l’ordre des dates, avec un titre, sa naissance, ses grandes dates et un mot de la fin.' : 'Le portrait de la personne, puis de ses parents, conjoints et enfants, chacun avec son nom et ses dates.'} Tout reste modifiable ensuite.</p>
                    <div><span class="pk-lab">Personne</span>${(window.LCNDA_PICKER || A()).pickerField({name: 'av_tpl', kind: 'person'})}</div>
                    <div class="form-grid"><label>Durée par photo <select name="dur">${[3, 4, 5, 6, 8].map(v => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${v} s</option>`).join('')}</select></label>
                    <label>Transition <select name="tr">${TRANS.map(([k, l]) => `<option value="${k}" ${k === 'cross' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label class="checkbox-line"><input type="checkbox" name="kb" checked> Ken Burns sur les photos</label><label class="checkbox-line"><input type="checkbox" name="music"> Ajouter une musique (choisie ensuite)</label>
                    <label class="checkbox-line"><input type="checkbox" name="chap" checked> Un chapitre par grande étape</label></div>`,
                onOpen: dg => { setTimeout(() => dg.querySelector('.pk-input')?.focus(), 30); },
                onSubmit: async form => { chosen = Number(form.elements.av_tpl?.value) || 0;
                    if (!chosen) { toast('Choisis une personne.', 'error'); return false; }
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
                    if (!slides.length) { btn.textContent = 'Fabriquer le montage'; toast(kind === 'life' ? 'Cette personne n’a pas de photo dans sa fiche.' : 'Aucun portrait trouvé dans ces fiches.', 'error'); return false; }
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
                    sel = null; await touch(2); record(); toast(`Montage fabriqué : ${A().plural(slides.length, 'photo')}. Retouche ce que tu veux, puis 📤 Exporter.`);
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
            const list = sel.track === 'v1' ? P.v1 : sel.track === 'v2' ? P.v2 : sel.track === 'texts' ? P.texts : P.audio, i = list.indexOf(c);
            const startOf = () => sel.track === 'v1' ? layoutV1(P)[i].at : c.at;
            if (op === 'del') { if (sel.track === 'audio') undetach(c); list.splice(i, 1); sel = null; return touch(1); }
            if (op === 'kfprev' || op === 'kfnext') return jumpKf(op === 'kfnext' ? 1 : -1);
            if (op === 'left' || op === 'right') { if (sel.track !== 'v1') return toast('Pour les incrustations, textes et sons : fais-les glisser sur la frise.', 'error'); const j = i + (op === 'left' ? -1 : 1); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; return touch(1); }
            if (op === 'detach') { if (sel.track !== 'v1' && sel.track !== 'v2') return toast('Choisis un morceau de vidéo.', 'error'); if (c.detached) return toast('Le son de ce morceau est déjà détaché.', 'error'); const at = startOf();
                const k = {id: nid('a'), s: c.s, from: c.from, to: c.to, at, vol: c.vol ?? 1, fadeIn: 0, fadeOut: 0, track: freeTrack('a', at, clen(c)), detached: true, ...(c.speed && c.speed !== 1 ? {speed: c.speed} : {})}; P.audio.push(k); c.mute = true; c.detached = k.id; sel = {track: 'audio', id: k.id}; toast(`Son détaché : il est sur la piste « ${P.tracks.find(x => x.id === k.track)?.name} », tu peux le déplacer, le baisser ou l’enlever.`); return touch(1); }
            if (sel.track === 'texts') { if (op === 'start') { const e2 = c.at + c.dur; c.at = Math.min(t, e2 - 0.3); c.dur = e2 - c.at; } if (op === 'end') c.dur = Math.max(0.3, t - c.at); if (op === 'split') return toast('Un texte ne se coupe pas : change sa durée.', 'error'); return touch(0); }
            const s0 = startOf(), local = c.from + (t - s0) * spd(c);
            if (local <= c.from + 0.1 || local >= c.to - 0.1) return toast('Place la tête de lecture à l’intérieur de l’élément choisi.', 'error');
            if (op === 'split') { const b2 = {...JSON.parse(JSON.stringify(c)), id: nid(sel.track[0]), from: local, tr: {type: 'none', d: 1}}; if (sel.track !== 'v1') b2.at = t; c.to = local; list.splice(i + 1, 0, b2); }
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
                const res = await A().api('save_montage_project', {}, {method: 'POST', body: {id: asNew ? 0 : projId, name, project: {...JSON.parse(JSON.stringify(P)), duration: montageEnd(P)}}});
                projId = res.result.id; projName = res.result.name; dirty = false; const ni = $('[data-avx-name]'); if (ni) ni.value = projName; showProjName();
                if (local.length) toast(`${local.length > 1 ? `Les ${local.length} fichiers importés sont` : 'Le fichier importé est'} maintenant dans les Médias.`);
            } catch (err) { UIx().savedStatus?.(dl, 'error'); toast(err.message, 'error'); }
            finally { savingProj = false; btn.disabled = false; btn.textContent = l0; drawRush(true); }
        }
        $('[data-mt-saveproj]').addEventListener('click', () => saveProject());
        $('[data-avx-name]')?.addEventListener('input', () => { dirty = true; showProjName(); });
        // ⤓ Exporter (E3, la fenêtre commune) : un fichier MP4 / WebM avec les réglages de départ (Maintenance), une copie dans les médias si on veut ;
        // « 📥 Dans les médias… » garde la fenêtre complète (plusieurs formats d'image, nouvelle version…)
        $('[data-mt-export]').addEventListener('click', async () => {
            eng?.pause();
            if (!UIx().openExportDialog) return $('[data-avx-save]').click();
            const types = recordTypes(); const nm = ($('[data-avx-name]')?.value || projName || media.title || 'Montage').trim(), T = montageEnd(P), MP2 = montagePrefs();
            const vid = (t) => async o => {
                if (!P.v1.length && !P.v2.length) throw new Error('le montage est vide : ajoute une vidéo');
                const go = document.querySelector('dialog.ui-export[open] [data-ui-go]'); eng.destroy(); eng = null;
                try { const blob = await recordMontage(P, t[0], x => { if (go) go.textContent = `Enregistrement… ${Math.round(x * 100)} %`; }, {height: Number(MP2.height) || 0, quality: Number(MP2.quality) || 5, fps: Number(MP2.fps) || 30, abr: Number(MP2.abr) || 128});
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
                    if (o.saveCopy) { await uploadResult(media, blob, t[1], {mode: 'copy', duration: T, title: nm}); toast('Vidéo téléchargée, et une copie est rangée dans les médias.'); onDone?.(); } }
                finally { await rebuild(); drawTl(); }
            };
            const formats = types.map(t => ({id: t[1], label: t[1] === 'mp4' ? '🎬 MP4' : '🎞 WebM', hint: t[1] === 'mp4' ? 'lu partout' : 'léger (navigateurs, VLC)', ext: t[1], run: vid(t)}));
            formats.push({id: 'srt', label: '💬 Sous-titres', hint: 'fichier .srt', ext: '', run: async () => exportSubs()}, {id: 'base', label: '📥 Dans les médias…', hint: 'plusieurs formats, nouvelle version', ext: '', run: async () => { setTimeout(() => $('[data-avx-save]').click(), 50); }});
            await UIx().openExportDialog({title: nm, defaultName: nm, quality: false, saveCopy: true, value: MP2.fmt, info: `${fmt(T, false)} · rejoué en temps réel pour être enregistré (laisse la fenêtre ouverte) · taille, qualité et images par seconde : Maintenance → Montage`, formats});
        });
        $('[data-mt-projects]').addEventListener('click', () => projectsDialog({current: projId, onOpen: async pr => { if (dirty && !await A().confirmBox('Les modifications du montage seront perdues.', {title: 'Ouvrir un autre projet sans enregistrer celui-ci ?', okLabel: 'Ouvrir sans enregistrer', danger: true})) return false; dirty = false; dl.close(); await openProject(pr.id, onDone); }}));
        document.addEventListener('keydown', e => { if (!dl.open || [...document.querySelectorAll('dialog[open]')].at(-1) !== dl) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); } }, {signal: keyAc.signal});
        // ── Un menu en haut, à côté du titre (comme la Retouche) : tout ce que fait le montage ──
        const MT_MENUS = [
            ['Fichier', [['proj', '💾 Enregistrer le projet', '⌘S'], ['projas', 'Enregistrer le projet sous un autre nom…', '⇧⌘S'], ['projects', '📂 Projets…'], ['-'], ['export', '📤 Exporter la vidéo (MP4 / WebM, plusieurs formats)…'], ['subexport', '💬 Exporter les sous-titres (.srt)'], ['chapcopy', '🔖 Copier les chapitres (pour YouTube)'], ['-'], ['close', 'Fermer']]],
            ['Édition', [['undo', '↶ Annuler', '⌘Z'], ['redo', '↷ Rétablir', '⇧⌘Z'], ['-'], ['op:split', '✂️ Couper ici', 'B'], ['op:start', '⟦ Commence ici'], ['op:end', '⟧ Finit ici'], ['op:left', '← Avancer le morceau'], ['op:right', 'Reculer le morceau →'], ['-'], ['op:detach', '🔊 Séparer le son de l’image'], ['op:del', '🗑 Enlever l’élément choisi', '⌫']]],
            ['Ajouter', [['import', '📥 Importer des rushes (vidéos, photos, sons)…'], ['base', '🗂 Un rush de la base…'], ['-'], ['op:addv1', '➕ Vidéo / photo à la suite'], ['op:addv2', '➕ Incrustation'], ['op:addtext', '➕ Titre / texte'], ['op:adda', '➕ Son / musique'], ['-'], ['op:voice', '🎙 Enregistrer une voix off'], ['op:sub', '💬 Sous-titre ici'], ['subimport', '💬 Importer des sous-titres (.srt, .vtt)…'], ['op:chapter', '🔖 Chapitre ici'], ['-'], ['tpl:life', '🪄 Modèle « La vie de… »'], ['tpl:family', '🪄 Modèle « Une famille »']]],
            ['Pistes', [['track:v', '＋ Piste vidéo'], ['track:t', '＋ Piste texte'], ['track:a', '＋ Piste son']]],
            ['Lecture', [['play', '▶ Lire / pause', 'Espace'], ['home', '⏮ Au début'], ['-'], ['op:kfprev', '◀ ◆ Image clé précédente'], ['op:kfnext', '◆ ▶ Image clé suivante']]],
            ['Affichage', [['tab:rush', '🎞️ Rushes'], ['tab:item', '🎯 Élément choisi'], ['tab:color', '🎨 Couleurs du film'], ['tab:sound', '🔊 Son du film'], ['tab:film', '🎞️ Le film (rotation, fondus)'], ['-'], ['zoom:in', 'Zoom avant sur la frise', '⌘+'], ['zoom:out', 'Zoom arrière sur la frise', '⌘−'], ['zoom:0', 'Zoom de départ', '⌘0'], ['-'], ['full', '⛶ Plein écran']]],
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
            if (k === 'play') return q('[data-mt-play]'); if (k === 'home') return q('[data-mt-home]');
            if (a === 'tab') return q(`[data-mt-tab="${v}"]`);
            if (a === 'zoom') return ext.editorZoom?.(v === 'in' ? 1 : v === 'out' ? -1 : 0);
            if (k === 'full') return q('[data-full-toggle]');
            if (k === 'subexport') return exportSubs();
            if (k === 'chapcopy') { if (!(P.chapters || []).length) return toast('Aucun chapitre : « 🔖 Chapitre ici ».', 'error'); const txt = chaptersText(); navigator.clipboard?.writeText(txt).then(() => toast('Chapitres copiés.'), () => prompt('Copie ce texte :', txt)); return; }
            if (k === 'subimport') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.srt,.vtt,text/vtt,application/x-subrip'; inp.onchange = async () => { const fl = inp.files?.[0]; if (fl) importSubs(await fl.text()); }; inp.click(); return; }
            if (a === 'tpl') return templateDialog(v);
        });
        dl.addEventListener('keydown', e => { if (e.key === 'Escape' && dl.querySelector('.h-mt-menubar details[open]')) { e.preventDefault(); e.stopPropagation(); closeMenus(); } }, true);
        const markDirty = () => showProjName(); dl.addEventListener('input', markDirty); dl.addEventListener('click', () => setTimeout(markDirty, 0));
        // 📤 Exporter la vidéo : un fichier MP4 / WebM (le projet, lui, reste ouvert)
        $('[data-avx-save]').addEventListener('click', () => {
            eng.pause();
            if (!P.v1.length && !P.v2.length) return toast('Le montage est vide : ajoute une vidéo.', 'error');
            const MP2 = montagePrefs(), types = recordTypes().sort((a, b) => (b[1] === MP2.fmt) - (a[1] === MP2.fmt)); if (!types.length) return toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error');
            const T = montageEnd(P), [sw, sh] = sizeFor();
            const sel2 = (name, list, v) => `<select name="${name}">${list.map(([k, l]) => `<option value="${k}" ${Number(k) === Number(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
            const exportHtml = `<fieldset class="h-rc-modes"><legend>Image et son</legend><div class="form-grid">
                <label>Taille ${sel2('height', MT_SIZES.map(([k, l]) => [k, k ? l : `${l} (${(P.sources[P.v1[0]?.s]?.w || sw)} × ${(P.sources[P.v1[0]?.s]?.h || sh)})`]), MP2.height)}</label>
                <label>Qualité ${sel2('quality', MT_QUALITY, MP2.quality)}</label><label>Images par seconde ${sel2('fps', MT_FPS.map(f => [f, f + ' images/s']), MP2.fps)}</label>
                <label>Son ${sel2('abr', [[96, '96 kb/s'], [128, '128 kb/s'], [192, '192 kb/s'], [256, '256 kb/s']], MP2.abr)}</label></div>
                <div class="h-mt-fmts"><span>Formats (un fichier par format coché, l’un après l’autre) :</span>${ASPECTS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="fmt_${k || 'src'}" ${(P.aspect || '') === k ? 'checked' : ''}> ${l}</label>`).join('')}<label class="checkbox-line"><input type="checkbox" name="blurbars" ${P.blurBars ? 'checked' : ''}> bandes floues plutôt que noires</label></div>
                <p class="muted">Réglages de départ : Maintenance → Montage, retouche, mise en page et son.</p></fieldset>`;
            ext.openDialog({eyebrow: 'EXPORTER LA VIDÉO', title: projName || media.title || 'Montage', wide: true, submitLabel: '📤 Exporter',
                body: `<p class="h-cfg-explain">Le montage est rejoué pour être enregistré : cela prend <b>${fmt(T, false)}</b> (sa durée). Laisse la fenêtre ouverte.</p>` + saveOptionsHtml(media, types.map(([t, e2, label, help]) => ({key: t, label, help}))).replace('<fieldset class="h-rc-modes"><legend>Comment', exportHtml + '<fieldset class="h-rc-modes"><legend>Comment').replace('<input type="hidden" name="mode" value="new">', exportHtml + '<input type="hidden" name="mode" value="new">'),
                onOpen: d => d.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { const ct = d.querySelector('[data-avx-copytitle]'); if (ct) ct.hidden = d.querySelector('[name=mode]:checked')?.value !== 'copy'; })),
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]'), type = types.find(x => x[0] === f.fmt) || types[0];
                    const fmts = ASPECTS.map(a => a[0]).filter(k => f['fmt_' + (k || 'src')]); if (!fmts.length) fmts.push(P.aspect || '');
                    const aspect0 = P.aspect, blur0 = P.blurBars; P.blurBars = !!f.blurbars;
                    eng.destroy(); eng = null;
                    try {
                        for (const [n, fa] of fmts.entries()) {
                            P.aspect = fa; const lab = ASPECTS.find(a => a[0] === fa)?.[1].replace(/^[^\p{L}\p{N}]+\s/u, '') || '';
                            const blob = await recordMontage(P, type[0], p => { prog.textContent = `${fmts.length > 1 ? `Format ${n + 1}/${fmts.length} (${lab}) — ` : ''}Enregistrement… ${Math.round(p * 100)} %`; }, {height: Number(f.height) || 0, quality: Number(f.quality) || 5, fps: Number(f.fps) || 30, abr: Number(f.abr) || 128});
                            prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                            const first = n === 0, mode = first ? (f.mode === 'new' ? 'new' : f.mode === 'copy' ? 'copy' : 'version') : (media.id ? 'copy' : 'new');
                            await uploadResult(media, blob, type[1], {mode, show: first && f.mode === 'show', duration: T, note: f.note, title: first ? f.title : `${f.title || projName || media.title || 'Montage'} (${lab})`});
                        }
                    } catch (err) { P.aspect = aspect0; P.blurBars = blur0; await rebuild(); throw err; }
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
        dl.addEventListener('change', schedHist); dl.addEventListener('pointerup', schedHist); // images clés, glisser sur la frise…
        if (start === 'add' || (proj && !P.v1.length)) $('[data-mt-tab="rush"]')?.click(); // un nouveau montage commence par ses rushes
    }

    /** Point d'entrée : un média {id, filename, title, media_type}. */
    /* ═════════ Maintenance → Montage, retouche, mise en page et son : disposition, enregistrement, boutons, plein écran ═════════ */
    ext.maintenance = ext.maintenance || {};
    const EDITORS = [['video', '🎬 Montage vidéo'], ['retouch', '🎚️ Retouche des photos'], ['audio', '🎧 Modifier le son'], ['layout', '📐 Mise en page (livres de famille)'], ['vector', '✒️ Dessin vectoriel'], ['house', '🏠 Maison (plan et 3D)'], ['decortree', '🌳 Arbre décoratif'], ['keynote', '🎤 Présentation (Keynote)']];
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
    const presetBar = (id, sets, what) => `<div class="h-pp-presets h-mtp-presets" data-set="${id}"><strong>💾 Réglages enregistrés</strong>${sets.length ? `<select data-set-pick aria-label="Réglages enregistrés">${sets.map((x, i) => `<option value="${i}">${esc(x.name)}${x.date ? ' — ' + esc(x.date) : ''}</option>`).join('')}</select><button type="button" class="button small" data-set-apply>Appliquer</button><button type="button" class="button small secondary" data-set-exportone title="Exporter ce réglage dans un fichier (pour un autre ordinateur ou une autre personne)">⤓ Exporter</button><button type="button" class="button small secondary" data-set-del title="Supprimer ces réglages enregistrés">🗑</button>` : `<span class="muted">Aucun pour l’instant.</span>`}
        <button type="button" class="button small secondary" data-set-save title="Garder ${esc(what)} sous un nom">💾 Enregistrer sous ce nom…</button><label class="button small secondary" title="Un fichier .json exporté depuis LCNDA (un réglage, ou un ancien fichier d’ensembles)">⤒ Importer un réglage<input type="file" accept=".json,application/json" data-set-import hidden></label></div>`;
    /* un réglage dans un fichier : {lcnda: 'reglage', outil, nom, version: 1, donnees} → lcnda-reglage-<outil>-<nom>.json */
    const slugOf = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 50) || 'reglage';
    const OUTIL_LABEL = o => o === 'montage-disposition' ? 'la disposition du montage' : /^boutons-/.test(o) ? `les boutons de « ${(EDITORS.find(e => e[0] === o.slice(8)) || [0, o.slice(8)])[1]} »` : `l’outil « ${o} »`;
    ext.maintenance.montage_prefs = async token => {
        const st = S(), ws = A().$('#workspace');
        const lsJson = readJson;
        let which = st.montagePrefsEditor || 'video';
        ext.maintenance.montage_prefs.ac?.abort(); const ac = ext.maintenance.montage_prefs.ac = new AbortController();
        const BLK_KEY = 'genealogie-montage-page-order';
        const blkMove = '<span class="h-mtp-blkmove"><button type="button" class="h-bt" data-blk-up title="Monter ce bloc">↑</button><button type="button" class="h-bt" data-blk-down title="Descendre ce bloc">↓</button><button type="button" class="h-bt" data-blk-side title="Passer dans l’autre colonne">⇄</button></span>';
        const draw = () => {
            if (token !== st.workspaceToken) return;
            const p = montagePrefs(), full = lsJson('genealogie-editor-full', {}), defs = (ext.tbDefs?.() || {})[which], cfg = lsJson('genealogie-toolbars', {})[which] || {};
            const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
            const groups = (defs?.groups || []).map(g => { const order = cfg.order?.[g.key] || [], hidden = cfg.hidden?.[g.key] || []; const items = [...order.map(k => g.items.find(i => i[0] === k)).filter(Boolean), ...g.items.filter(i => !order.includes(i[0]))];
                return `<section><h4>${esc(g.label)}</h4><ol class="h-pet-layout" data-g="${esc(g.key)}">${items.map(([k, l]) => `<li class="h-pet-lrow" data-k="${esc(k)}"><input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} title="Montrer"><span>${esc(l)}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('')}</ol></section>`; }).join('');
            const edName = (EDITORS.find(e => e[0] === which) || EDITORS[0])[1];
            ws.innerHTML = `<section class="page h-mtp"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>Montage, retouche, mise en page et son</h2><p>La disposition du montage vidéo, l’enregistrement des vidéos par défaut, les boutons et options de chaque éditeur (montrés, cachés, rangés), tes raccourcis clavier dans chaque outil et le plein écran.</p></div>
                <div class="page-actions"><button type="button" class="button" data-mtp-save>Enregistrer</button></div></header>
                <div class="h-mtp-cols">
                <div class="h-mtp-stack">
                <section class="maintenance-panel" data-mtp-blk="layout"><h3>🎬 Disposition du montage${blkMove}</h3>
                    ${presetBar('layout', layoutSets(), 'cette disposition')}
                    <div class="form-grid h-mtp-grid">
                    <label>Panneau des réglages<select data-mtp="side">${opt([['right', 'À droite de l’image'], ['left', 'À gauche de l’image']], p.side)}</select></label>
                    <label>Aide sous la frise<select data-mtp="help">${opt([['1', 'Montrée'], ['0', 'Cachée']], p.help ? '1' : '0')}</select></label>
                    <label>Hauteur de l’image<span class="h-mtp-range"><input type="range" min="25" max="80" value="${p.stage}" data-mtp="stage"><output>${p.stage} %</output></span></label>
                    <label>Hauteur des pistes<span class="h-mtp-range"><input type="range" min="28" max="70" value="${p.lane}" data-mtp="lane"><output>${p.lane} px</output></span></label>
                    </div>
                    <h4>🎨 Couleur des blocs sur la frise</h4><div class="h-mtp-colors">${MT_COLORS.map(([k, l]) => `<label class="h-mtp-color"><input type="color" data-mtp="${k}" value="${esc(p[k])}"> <span class="h-mtp-swatch" data-mtp-sw="${k}" style="background:${esc(p[k])};color:${inkOn(p[k])}">${esc(l)}</span></label>`).join('')}</div>
                    <button type="button" class="button small secondary" data-mtp-colreset>Couleurs de départ</button>
                </section>
                <section class="maintenance-panel" data-mtp-blk="export"><h3>📤 Enregistrement des vidéos (par défaut)${blkMove}</h3>
                    <div class="form-grid h-mtp-grid">
                    <label>Format<select data-mtp="fmt">${opt([['mp4', 'MP4 (H.264) — lu partout'], ['webm', 'WebM — léger']], p.fmt)}</select></label>
                    <label>Taille<select data-mtp="height">${opt(MT_SIZES, p.height)}</select></label>
                    <label>Qualité<select data-mtp="quality">${opt(MT_QUALITY, p.quality)}</select></label>
                    <label>Images par seconde<select data-mtp="fps">${opt(MT_FPS.map(f => [f, f + ' images/s']), p.fps)}</select></label>
                    <label>Son<select data-mtp="abr">${opt([[96, '96 kb/s'], [128, '128 kb/s'], [192, '192 kb/s'], [256, '256 kb/s']], p.abr)}</select></label>
                    </div>
                    <label class="h-mtp-speeds">⏩ Boutons rapides de vitesse (de 0,1 à 10, séparés par « ; ») <input data-mtp="speeds" value="${esc(speedsText(p.speeds))}" placeholder="0,1 ; 0,25 ; 0,5 ; 1 ; 1,5 ; 2 ; 4 ; 10"></label>
                    <p class="muted">On peut toujours les changer au moment d’enregistrer. MP4 seulement si l’ordinateur sait le faire, sinon WebM.</p>
                </section>
                <section class="maintenance-panel" data-mtp-blk="retouch"><h3>🎚️ Retouche des photos${blkMove}</h3>
                    <div class="form-grid h-mtp-grid"><label>Colonne d’outils (➤ ⬚ ◯ 🪄 ⌗ 🖌 T…)<select data-mtp-rttools>${opt([['side', 'À côté de l’image (entre l’image et le panneau)'], ['left', 'Tout à gauche'], ['right', 'Tout à droite (après le panneau)']], lsJson('genealogie-retouch-layout', {}).tools || 'side')}</select></label>
                    <label>Panneau (Réglages, Calques…)<select data-mtp-rtside>${opt([['right', 'À droite'], ['left', 'À gauche']], lsJson('genealogie-retouch-layout', {}).side || 'right')}</select></label></div>
                    <p class="muted">Aussi : la largeur du panneau se règle en tirant son bord dans la Retouche.</p>
                </section>
                ${ext.vectorMapPalette ? `<section class="maintenance-panel" data-mtp-blk="vectormap"><h3>🗺️ Dessin vectoriel — mode Plan : les éléments${blkMove}</h3><p class="muted">Les groupes (voies, eau, zones, symboles…) et leurs éléments : dans quel ordre, lesquels on voit, et les tiens (une allure de départ, un nom, une couleur, une largeur, ou un symbole que tu as dessiné).</p><div data-vmp-box>${ext.vectorMapPalette.html()}</div></section>` : ''}
                ${ext.decorTreePrefs ? `<section class="maintenance-panel" data-mtp-blk="decortree"><h3>🌳 Arbre décoratif${blkMove}</h3><p class="muted">Ce que la fenêtre propose au départ, tes formats et tes styles. Les formes et les boutons se rangent dans « Boutons et options » (éditeur 🌳 Arbre décoratif), avec ses raccourcis.</p><div data-dtp-box>${ext.decorTreePrefs.html()}</div></section>` : ''}
                ${ext.keynotePrefs ? `<section class="maintenance-panel" data-mtp-blk="keynote"><h3>🎤 Présentation (Keynote)${blkMove}</h3><p class="muted">Ce qu’une nouvelle présentation prend au départ : thème, format (16:9, 4:3, sur mesure…), transition, disposition des nouvelles diapositives, aimant, pointeur laser.</p><div data-knp-box>${ext.keynotePrefs.html()}</div></section>` : ''}
                <section class="maintenance-panel" data-mtp-blk="full"><h3>⛶ Plein écran à l’ouverture${blkMove}</h3>
                    <div class="form-grid h-mtp-grid">${FULL_EDITORS.map(([k, l]) => `<label>${esc(l)}<select data-mtp-full="${k}">${opt([['0', 'Fenêtre'], ['1', 'Plein écran']], (full[k] ?? FULL_DEFAULT[k]) ? '1' : '0')}</select></label>`).join('')}</div>
                </section>
                </div>
                <section class="maintenance-panel" data-mtp-blk="tools"><h3>🧰 Boutons et options${blkMove}</h3>
                    <div class="form-grid h-mtp-grid"><label>Éditeur<select data-mtp-which>${opt(EDITORS, which)}</select></label></div>
                    ${presetBar('toolbar', toolbarSets(which), 'ces boutons')}
                    <p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). C’est aussi dans chaque éditeur : « ⚙️ Personnaliser ». Les ensembles ci-dessus sont ceux de « ${esc(edName)} ».</p>
                    ${groups ? `<div class="h-tbcfg-body" data-mtp-groups>${groups}</div><button type="button" class="button small secondary" data-mtp-reset>↺ Remettre comme au départ</button>` : `<p class="muted">Ouvre une fois ${which === 'video' ? 'le montage vidéo (Listes → Vidéos → « 🎬 Montage »)' : which === 'retouch' ? 'la retouche d’une photo (visionneuse → « Retoucher »)' : which === 'layout' ? 'l’atelier de mise en page (Listes → 📐 Livres de famille, ou Export propre → Livre de famille)' : which === 'vector' ? 'le dessin vectoriel (Listes → Outils de modification → ✒️ Dessin vectoriel)' : which === 'house' ? 'le plan d’une maison (Listes → 🏠 Maisons de famille)' : which === 'decortree' ? 'l’arbre décoratif (Listes → Outils de modification → 🌳 Arbre décoratif → ＋)' : which === 'keynote' ? 'une présentation (Listes → Outils de modification → 🎞️ Présentation et diaporama → ＋ Nouveau → Présentation)' : 'la modification d’un son (Listes → Audios → ✏️)'} : ses boutons apparaîtront ici.</p>`}
                <div class="h-ek-panel h-mtp-keys"><h4>⌨️ Raccourcis de « ${esc(edName)} »</h4><div data-ek-box></div><p class="muted"><button type="button" class="button small secondary" data-mtp-allkeys>⌨️ Tous les raccourcis de l’app (Maintenance → Raccourcis clavier)</button></p></div>
                </section></div></section>`;
            // les raccourcis suivent l'éditeur choisi (même liste que Maintenance → Raccourcis clavier)
            try { localStorage.setItem('genealogie-editor-shortcuts-tab', which === 'video' ? 'montage' : which); } catch (_) {}
            ext.editorKeysPanel?.(ws.querySelector('[data-ek-box]'));
            { const box = ws.querySelector('[data-dtp-box]'); if (box) ext.decorTreePrefs.bind(box, () => { box.innerHTML = ext.decorTreePrefs.html(); }); } // 🌳 arbre décoratif
            { const box = ws.querySelector('[data-knp-box]'); if (box) ext.keynotePrefs.bind(box, () => { box.innerHTML = ext.keynotePrefs.html(); }); } // 🎤 présentation
            { const box = ws.querySelector('[data-vmp-box]'); if (box) ext.vectorMapPalette.bind(box, () => { box.innerHTML = ext.vectorMapPalette.html(); }); } // 🗺️ éléments du mode Plan
            ws.querySelectorAll('[data-ek-tab]').forEach(b => { b.hidden = true; }); // l'éditeur se choisit plus haut
            // les grands blocs : deux colonnes, chacune dans son ordre (↑ ↓, ⇄ pour changer de colonne), gardé pour la prochaine fois
            { const cols = ws.querySelector('.h-mtp-cols'), left = ws.querySelector('.h-mtp-stack'), right = document.createElement('div'); right.className = 'h-mtp-stack'; right.dataset.col = 'right'; left.dataset.col = 'left'; cols.appendChild(right);
              const saved = lsJson(BLK_KEY, null), def = {left: ['layout', 'export', 'retouch', 'full'], right: ['tools']}, lay = saved && Array.isArray(saved.left) && Array.isArray(saved.right) ? saved : def;
              const all = [...ws.querySelectorAll('[data-mtp-blk]')], put = (col, keys) => keys.forEach(k => { const el = all.find(x => x.dataset.mtpBlk === k); if (el) col.appendChild(el); });
              put(left, lay.left); put(right, lay.right); all.filter(el => !lay.left.includes(el.dataset.mtpBlk) && !lay.right.includes(el.dataset.mtpBlk)).forEach(el => (el.dataset.mtpBlk === 'tools' ? right : left).appendChild(el)); }
        };
        draw();
        // ce qui est à l'écran (pas encore enregistré) : disposition, boutons de l'éditeur choisi
        const layoutNow = () => { const v = {}; ws.querySelectorAll('[data-mtp]').forEach(el => { v[el.dataset.mtp] = el.dataset.mtp === 'help' ? el.value === '1' : el.value; }); return cleanLayout(v); };
        const toolbarNow = () => { const box = ws.querySelector('[data-mtp-groups]'); if (!box) return cleanToolbar(lsJson('genealogie-toolbars', {})[which] || {}); const cfg = {order: {}, hidden: {}}; box.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; cfg.order[ol.dataset.g] = lis.map(l => l.dataset.k); cfg.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); }); return cfg; };
        const applyLayout = v => { const cur = readJson(MT_KEY, {}); writeJson(MT_KEY, {...cur, ...cleanLayout(v)}); };
        const applyToolbar = v => { const all = lsJson('genealogie-toolbars', {}); all[which] = cleanToolbar(v); writeJson('genealogie-toolbars', all); };
        const setOps = {
            layout: {list: layoutSets, save: list => writeJson(LAYOUT_SETS, list), now: layoutNow, apply: applyLayout, clean: cleanLayout, type: 'lcnda-montage-disposition', file: 'disposition-montage', outil: () => 'montage-disposition'},
            toolbar: {list: () => toolbarSets(which), save: list => saveToolbarSets(which, list), now: toolbarNow, apply: applyToolbar, clean: cleanToolbar, type: 'lcnda-boutons-editeur', file: () => `boutons-${which}`, outil: () => `boutons-${which}`},
        };
        ws.addEventListener('input', e => { const el = e.target.closest('[data-mtp]'); if (el?.type === 'color') { const sw = ws.querySelector(`[data-mtp-sw="${el.dataset.mtp}"]`); if (sw) { sw.style.background = el.value; sw.style.color = inkOn(el.value); } return; } if (el?.type === 'range') el.nextElementSibling.textContent = el.value + (el.dataset.mtp === 'stage' ? ' %' : ' px'); }, {signal: ac.signal});
        ws.addEventListener('change', async e => {
            if (e.target.matches('[data-mtp-which]')) { which = st.montagePrefsEditor = e.target.value; draw(); return; }
            const inp = e.target.closest('[data-set-import]'); if (!inp) return;
            const op = setOps[inp.closest('[data-set]').dataset.set], file = inp.files?.[0]; inp.value = ''; if (!file) return;
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
                while (list.some(y => y.name === name)) { const n = await A().askText({title: 'Ce nom est déjà pris', message: `Un réglage s’appelle déjà « ${name} ». Quel nom pour celui-ci ?`, value: `${name} (2)`.slice(0, 80), okLabel: 'Importer'}); if (n === null) return; name = cleanName(n); if (!name) return; }
                list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: op.clean(data.donnees)});
                if (op.save(list.slice(-60))) { draw(); toast(`Réglage « ${name} » importé : choisis-le puis « Appliquer ».`); }
                return;
            }
            if (data?.type !== op.type) return toast(op === setOps.layout ? 'Ce fichier n’est pas une disposition du montage.' : 'Ce fichier n’est pas un réglage de boutons.', 'error');
            if (op === setOps.toolbar && data.editor && data.editor !== which) { which = st.montagePrefsEditor = EDITORS.some(x => x[0] === data.editor) ? data.editor : which; }
            const list = op.list(), add = cleanSets(data.sets, op.clean); let n = 0;
            add.forEach(x => { let name = x.name; while (list.some(y => y.name === name)) name = `${name} (2)`.slice(0, 80); list.push({...x, name}); n++; });
            if (data.current && typeof data.current === 'object') { let name = cleanName(data.name) || 'Importé'; while (list.some(y => y.name === name)) name = `${name} (2)`.slice(0, 80); list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: op.clean(data.current)}); n++; }
            if (op.save(list.slice(-60))) { draw(); toast(`${A().plural(n, 'ensemble importé', 'ensembles importés')} : choisis-en un puis « Appliquer ».`); }
        }, {signal: ac.signal});
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
            const bar = e.target.closest('[data-set]');
            if (bar) {
                const op = setOps[bar.dataset.set], pick = () => op.list()[Number(bar.querySelector('[data-set-pick]')?.value)];
                if (e.target.closest('[data-set-save]')) { const name = cleanName((await window.LCNDA_APP.askText({message: bar.dataset.set === 'layout' ? 'Nom de cette disposition (ex. Grand écran) :' : 'Nom de ces boutons (ex. L’essentiel) :'})) || ''); if (!name) return; const list = op.list().filter(x => x.name !== name); list.push({name, date: new Date().toLocaleDateString('fr-FR'), v: op.now()}); if (op.save(list)) { draw(); toast(`Ensemble « ${name} » enregistré.`); } return; }
                if (e.target.closest('[data-set-apply]')) { const x = pick(); if (!x || !await A().confirmBox('', {title: `Remplacer les réglages actuels par l’ensemble « ${x.name} » ?`, okLabel: 'Remplacer'})) return; op.apply(x.v); draw(); toast(`Ensemble « ${x.name} » appliqué.`); return; }
                if (e.target.closest('[data-set-del]')) { const x = pick(); if (!x || !await A().confirmBox('', {title: `Supprimer l’ensemble « ${x.name} » ?`, okLabel: 'Supprimer l’ensemble'})) return; op.save(op.list().filter(y => y !== x && y.name !== x.name)); draw(); return; }
                if (e.target.closest('[data-set-exportone]')) { const x = pick(); if (!x) return; downloadJson(`lcnda-reglage-${op.outil()}-${slugOf(x.name)}.json`, {lcnda: 'reglage', outil: op.outil(), nom: x.name, version: 1, donnees: x.v}); toast(`Fichier prêt : il s’importe dans Maintenance → Montage, retouche, mise en page et son (« ⤒ Importer un réglage »).`); return; }
                if (e.target.closest('[data-set-export]')) { const f = typeof op.file === 'function' ? op.file() : op.file; downloadJson(`${f}-${new Date().toISOString().slice(0, 10)}.json`, {type: op.type, version: 1, editor: bar.dataset.set === 'toolbar' ? which : undefined, name: bar.dataset.set === 'layout' ? 'Disposition exportée' : 'Boutons exportés', current: op.now(), sets: op.list()}); return; }
                return;
            }
            if (e.target.closest('[data-mtp-colreset]')) { MT_COLORS.forEach(([k, , d]) => { const el = ws.querySelector(`[data-mtp="${k}"]`); if (el) { el.value = d; el.dispatchEvent(new Event('input', {bubbles: true})); } }); toast('Couleurs de départ remises (n’oublie pas « Enregistrer »).'); return; }
            if (e.target.closest('[data-mtp-reset]')) { const all = lsJson('genealogie-toolbars', {}); delete all[which]; writeJson('genealogie-toolbars', all); toast('Boutons remis comme au départ.'); draw(); }
            if (e.target.closest('[data-mtp-save]')) {
                const v = {}; ws.querySelectorAll('[data-mtp]').forEach(el => { v[el.dataset.mtp] = el.dataset.mtp === 'help' ? el.value === '1' : el.value; });
                writeJson(MT_KEY, v);
                const full = lsJson('genealogie-editor-full', {}); ws.querySelectorAll('[data-mtp-full]').forEach(el => { full[el.dataset.mtpFull] = el.value === '1'; }); writeJson('genealogie-editor-full', full);
                writeJson('genealogie-retouch-layout', {tools: ws.querySelector('[data-mtp-rttools]')?.value || 'side', side: ws.querySelector('[data-mtp-rtside]')?.value || 'right'});
                if (ws.querySelector('[data-mtp-groups]')) applyToolbar(toolbarNow());
                toast('Réglages du montage, de la retouche et du son enregistrés.'); draw();
            }
        }, {signal: ac.signal});
    };
    // Listes → Vidéos / Audios → « 🎬 Montage » : un montage fait de zéro, enregistré comme un nouveau média
    /** 📂 Les projets de montage enregistrés : ouvrir, renommer, supprimer (ou en commencer un nouveau) */
    async function projectsDialog({current = 0, onOpen, onNew = null} = {}) {
        let list = []; try { list = (await A().api('montage_projects')).projects || []; } catch (e) { return toast(e.message, 'error'); }
        const when = d => { const x = new Date(String(d || '').replace(' ', 'T') + 'Z'); return isNaN(x) ? '' : x.toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}); };
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-mt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎬 MONTAGE</span><h2>Projets de montage</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${onNew ? '<div class="h-mt-pnew"><button type="button" class="button" data-new>＋ Nouveau montage</button></div>' : ''}
            ${list.length ? `<div class="h-mt-plist">${list.map(p => `<div class="h-mt-prow${p.id === current ? ' is-cur' : ''}"><button type="button" class="h-mt-popen" data-open="${p.id}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="h-mt-pico">🎬</span>'}<span><b>${esc(p.name)}</b><small>${p.clips} morceau${p.clips > 1 ? 'x' : ''} · ${p.sources} rush${p.sources > 1 ? 'es' : ''}${p.duration ? ' · ' + fmt(p.duration, false) : ''} · ${esc(when(p.updated_at))}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (les vidéos et photos restent dans les Médias)">🗑</button></div>`).join('')}</div>`
                : A().emptyState({icon: '🎬', text: 'Aucun projet de montage pour l’instant', hint: 'Dans le montage, « 💾 Enregistrer le projet ».'})}`; };
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
        const when = d => { const x = new Date(String(d || '').replace(' ', 'T') + 'Z'); return isNaN(x) ? '' : x.toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}); };
        const dlg = document.createElement('dialog'); dlg.className = 'modal h-modal h-mt-projdlg';
        const draw = () => { dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">🎧 SON</span><h2>Projets son</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            ${onNew ? '<div class="h-mt-pnew"><button type="button" class="button" data-new>＋ Nouveau projet son</button></div>' : ''}
            ${list.length ? `<div class="h-mt-plist">${list.map(p => `<div class="h-mt-prow${p.id === current ? ' is-cur' : ''}"><button type="button" class="h-mt-popen" data-open="${p.id}" ${p.exists ? '' : 'disabled'}><span class="h-mt-pico">🎧</span><span><b>${esc(p.name)}</b><small>${esc(p.media_title || 'son de départ importé')} · ${fmt(p.duration, false)} · ${esc(when(p.updated_at))}${p.exists ? '' : ' · fichier de travail introuvable'}</small></span></button><button type="button" class="icon-button small" data-ren="${p.id}" title="Renommer">✎</button><button type="button" class="icon-button small" data-del="${p.id}" title="Supprimer le projet (le son de départ reste dans les Médias)">🗑</button></div>`).join('')}</div>`
                : A().emptyState({icon: '🎵', text: 'Aucun projet son pour l’instant', hint: 'Dans « Modifier le son », « 💾 Enregistrer le projet ».'})}`; };
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
        return openAudio({id: pr.media_id, filename: pr.source, title: pr.media_title || pr.name, media_type: 'audio', src: url(pr.work_file)}, onDone, pr);
    };
    // un nouveau projet son : un son de la base ou de l'ordinateur, ouvert dans « Modifier le son »
    ext.newAudioProject = async onDone => { const o = await pickOther('audio'); if (!o) return; return openAudio(o.media ? {...o.media, media_type: 'audio'} : {id: 0, title: o.title || 'Son', media_type: 'audio', src: o.src}, onDone); };
    ext.openAudioProjects = onDone => audioProjectsDialog({onOpen: p => ext.openAudioProject(p.id, onDone), onNew: () => ext.newAudioProject(onDone)});
    ext.openMontageProject = (id, onDone) => openProject(id, onDone);
    ext.newMontage = onDone => openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add');
    ext.openMontageProjects = onDone => projectsDialog({onOpen: p => openProject(p.id, onDone), onNew: () => openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add')});
    ext.openMontage = async (kind, onDone) => {
        if (kind === 'video') { let has = false; try { has = ((await A().api('montage_projects')).projects || []).length > 0; } catch (_) {} if (has) return ext.openMontageProjects(onDone); return openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add'); }
        const o = await pickOther('audio'); if (!o) return;
        return openAudio({id: 0, title: (o.title || 'Son') + ' (montage)', media_type: 'audio', src: o.src}, onDone);
    };
    ext.openAvEditor = (media, {onDone} = {}) => kindOf(media) === 'video' ? openVideo(media, onDone) : openAudio(media, onDone);
    // Visionneuse : « ✂️ Modifier »
    document.addEventListener('click', e => {
        if (!e.target.closest('#edit-av-media')) return;
        const st = S(), item = st.lightboxMedia?.[st.lightboxIndex];
        if (!item) return;
        A().$('#lightbox')?.close();
        ext.openAvEditor(item, {onDone: () => ext.refreshView?.()});
    });
})();
