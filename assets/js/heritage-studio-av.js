/**
 * ✂️ Atelier son et vidéo (visionneuse → « ✂️ Modifier », listes Audios / Vidéos → ✏️) : simple mais complet.
 *  - Son : forme d'onde, sélection à la souris, couper / garder / silence, fondus, volume, normaliser, réduire le souffle,
 *    voix plus nette, raccourcir les longs silences, mono, ajouter un autre son (assembler), annuler / rétablir ;
 *    enregistré en WAV (sans perte) ou Ogg Opus (léger) — on choisit à chaque fois.
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
    function bigDialog({eyebrow, title, body, onClose}) {
        const dl = document.createElement('dialog');
        dl.className = 'modal h-modal h-modal-wide h-avx';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-avx-close aria-label="Fermer">×</button></div><div class="h-avx-body">${body}</div>`;
        document.body.appendChild(dl);
        const close = () => { if (onClose?.() === false) return; dl.close(); };
        dl.querySelector('[data-avx-close]').addEventListener('click', close);
        dl.addEventListener('cancel', e => { e.preventDefault(); close(); });
        dl.addEventListener('close', () => dl.remove());
        dl.showModal();
        return dl;
    }

    /** Choisir un autre son ou une autre vidéo : de la base, ou un fichier de l'ordinateur. */
    function pickOther(kind) {
        return new Promise(async resolve => {
            let rows = [];
            try { rows = (await A().api('media_av_list', {kind})).items.filter(i => i.exists); } catch (_) {}
            let done = false;
            const dl = ext.openDialog({eyebrow: 'ASSEMBLER', title: kind === 'video' ? 'Ajouter une vidéo' : 'Ajouter un son', wide: true, submitLabel: 'Ajouter',
                body: `<label class="h-rc-drop"><input type="file" name="file" accept="${kind}/*"><span>📁 Un fichier de l’ordinateur…</span></label>
                    <p class="muted">… ou ${kind === 'video' ? 'une vidéo' : 'un son'} déjà dans la base :</p>
                    <input type="search" data-avx-q placeholder="Chercher…">
                    <div class="h-rc-results" data-avx-list>${rows.map(r => `<label class="checkbox-line"><input type="radio" name="pick" value="${r.id}"> ${esc(r.title || r.filename)} <small class="muted">${r.duration ? fmt(r.duration, false) : ''}</small></label>`).join('') || '<p class="muted">Rien dans la base.</p>'}</div>`,
                onOpen: d => d.querySelector('[data-avx-q]').addEventListener('input', e => { const q = e.target.value.toLowerCase(); d.querySelectorAll('[data-avx-list] label').forEach(l => { l.hidden = !l.textContent.toLowerCase().includes(q); }); }),
                onSubmit: form => {
                    const f = form.querySelector('[name=file]').files[0], pick = form.querySelector('[name=pick]:checked');
                    if (f) { done = true; resolve({src: URL.createObjectURL(f), title: f.name.replace(/\.[^.]+$/, ''), file: f}); return; }
                    if (pick) { const r = rows.find(x => x.id === Number(pick.value)); done = true; resolve({src: url(r.filename), title: r.title || r.filename, media: r}); return; }
                    toast('Choisis un fichier ou un élément de la liste.', 'error'); return false;
                },
            });
            dl.addEventListener('close', () => { if (!done) resolve(null); });
        });
    }

    /** Envoi du résultat : nouvelle version (montrée ou non) ou copie à part. L'original reste toujours. */
    async function uploadResult(media, blob, ext0, {mode, show, duration, note, title}) {
        const fd = new FormData();
        fd.append('file', blob, 'montage.' + ext0); fd.append('media_id', media.id); fd.append('mode', mode); fd.append('show', show ? '1' : '0');
        if (duration) fd.append('duration', String(duration));
        if (note) fd.append('note', note);
        if (title) fd.append('title', title);
        const r = await fetch('api.php?action=retouch_media', {method: 'POST', body: fd, headers: {'X-CSRF-Token': S().csrf}});
        const j = await r.json().catch(() => ({error: 'Réponse illisible du serveur'}));
        if (!r.ok || j.error) throw new Error(j.error || 'Enregistrement impossible.');
        return j.result;
    }
    const saveOptionsHtml = (media, formats) => `<fieldset class="h-rc-modes"><legend>Format</legend>${formats.map((f, i) => `<label class="checkbox-line"><input type="radio" name="fmt" value="${f.key}" ${i ? '' : 'checked'}> <b>${esc(f.label)}</b> <small class="muted">${esc(f.help)}</small></label>`).join('')}</fieldset>
        <fieldset class="h-rc-modes"><legend>Comment le garder ?</legend>
            <label class="checkbox-line"><input type="radio" name="mode" value="show" checked> <b>Nouvelle version, montrée partout</b> <small class="muted">(l’original reste gardé : on peut y revenir)</small></label>
            <label class="checkbox-line"><input type="radio" name="mode" value="version"> Nouvelle version, <b>sans la montrer</b> pour l’instant</label>
            <label class="checkbox-line"><input type="radio" name="mode" value="copy"> <b>Un ${kindOf(media) === 'video' ? 'autre média' : 'autre son'} à part</b>, rattaché aux mêmes fiches</label></fieldset>
        <div class="form-grid"><label>Note de version <small class="muted">(facultatif)</small><input name="note" maxlength="120" placeholder="sans les blancs, voix plus nette…"></label><label data-avx-copytitle hidden>Titre de la copie<input name="title" value="${esc((media.title || '') + ' (montage)')}"></label></div>
        <p class="muted" data-avx-progress></p>`;

    /** Versions d'un son / d'une vidéo : écouter, montrer, supprimer (jamais l'original). */
    async function versionsHtml(media) {
        let v = [];
        try { v = (await A().api('media_versions', {id: media.id})).versions || []; } catch (_) {}
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
            if (!confirm('Supprimer cette version ? (l’original et les autres versions restent)')) return;
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

    async function openAudio(media, onDone) {
        const ctx = audioCtx();
        let buf;
        const loading = toast('Ouverture du son…');
        try { const res = await fetch(url(media.filename)); if (!res.ok) throw new Error('Fichier introuvable.'); buf = await ctx.decodeAudioData(await res.arrayBuffer()); }
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
        const dl = bigDialog({eyebrow: 'MODIFIER LE SON', title: media.title || media.filename, onClose: () => { stop(); return !dirty || confirm('Fermer sans enregistrer les modifications ?'); },
            body: `<div class="h-avx-top"><span class="h-avx-time"><b data-avx-cur>0:00.0</b> / <span data-avx-total></span></span><span class="h-avx-sel muted" data-avx-seltxt></span>
                    <span class="h-avx-zoom"><button type="button" class="button small secondary" data-avx-zoom="fit" title="Tout voir">⤢ Tout</button><button type="button" class="button small secondary" data-avx-zoom="sel" title="Zoomer sur la sélection">🔍 Sélection</button><button type="button" class="button small secondary" data-avx-zoom="out">−</button><button type="button" class="button small secondary" data-avx-zoom="in">+</button></span></div>
                <div class="h-avx-wave"><canvas data-avx-canvas></canvas></div>
                <input type="range" class="h-avx-scroll" data-avx-scroll min="0" max="1000" value="0" aria-label="Défiler">
                <div class="h-avx-transport"><button type="button" class="button" data-avx-play>▶ Écouter</button><button type="button" class="button small secondary" data-avx-home title="Au début">⏮</button>
                    <button type="button" class="button small secondary" data-avx-undo disabled>↶ Annuler</button><button type="button" class="button small secondary" data-avx-redo disabled>↷ Rétablir</button>
                    <span class="muted h-avx-tip">Glisse sur l’onde pour sélectionner · clic = se placer · Espace = écouter · molette = défiler, Ctrl + molette = zoom</span></div>
                <div class="h-avx-ops">${OPS.map(([k, label, need]) => `<button type="button" class="button small secondary" data-avx-op="${k}" data-need="${need}">${label}</button>`).join('')}</div>
                <p class="muted h-avx-help" data-avx-help>Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.</p>
                ${ver.html}
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save>💾 Enregistrer…</button></div>`});
        const $ = s => dl.querySelector(s), cv = $('[data-avx-canvas]'), g = cv.getContext('2d');
        bindVersions(dl, media, 'audio', () => { dirty = false; dl.close(); onDone?.(); });
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
        const setBuf = (nb, keepSel = false) => { history.push({buf, sel, cursor}); if (history.length > 15) history.shift(); future.length = 0; buf = nb; dirty = true; if (!keepSel) sel = null; cursor = Math.min(cursor, buf.duration); if (view.dur > buf.duration || view.start + view.dur > buf.duration) { view.start = 0; view.dur = buf.duration; } clampView(); buildPeaks(); draw(); };
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
        $('[data-avx-undo]').addEventListener('click', () => { const h = history.pop(); if (!h) return; stop(); future.push({buf, sel, cursor}); ({buf, sel, cursor} = h); dirty = true; view = {start: 0, dur: buf.duration}; buildPeaks(); draw(); });
        $('[data-avx-redo]').addEventListener('click', () => { const h = future.pop(); if (!h) return; stop(); history.push({buf, sel, cursor}); ({buf, sel, cursor} = h); view = {start: 0, dur: buf.duration}; buildPeaks(); draw(); });
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
                if (k === 'gain') { const db = prompt('Monter ou baisser le volume de combien de décibels ?\n(ex. 6 = deux fois plus fort, -6 = deux fois moins fort)', '6'); if (db === null || !isFinite(Number(db))) return; await onRange(async p => scale(p, 10 ** (Number(db) / 20))); }
                if (k === 'normalize') await onRange(async p => { const pk = peakOf(p); return pk > 0 ? scale(p, 0.89 / pk) : p; });
                if (k === 'denoise') {
                    const useSel = sel && confirm('Prendre la sélection comme exemple de souffle (un passage sans voix) ?\n\nOK : oui, c’est du bruit seul · Annuler : je veux nettoyer la sélection');
                    let floor;
                    if (useSel) { floor = percentile(frameRms(sliceBuf(buf, i0, i1), Math.round(sr * 0.01)), 0.9); sel = null; }
                    else floor = percentile(frameRms(buf, Math.round(sr * 0.01)), 0.1);
                    await onRange(async p => gate(await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70; s.connect(hp); return hp; }), floor));
                }
                if (k === 'clarity') await onRange(async p => { const out = await through(p, (oc, s) => { const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; const pres = oc.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9; pres.gain.value = 4; const comp = oc.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2; s.connect(hp).connect(pres).connect(comp); return comp; }); const pk = peakOf(out); return pk > 0 ? scale(out, 0.89 / pk) : out; });
                if (k === 'hum') { const f = confirm('Courant à 50 Hz (Europe) ?\n\nOK : 50 Hz · Annuler : 60 Hz (Amérique du Nord)') ? 50 : 60; await onRange(async p => through(p, (oc, s) => { let last = s; for (let h = 1; h <= 4; h++) { const n = oc.createBiquadFilter(); n.type = 'notch'; n.frequency.value = f * h; n.Q.value = 30; last.connect(n); last = n; } return last; })); }
                if (k === 'silences') {
                    const minS = Number(prompt('Raccourcir les blancs plus longs que combien de secondes ?', '1.5')); if (!isFinite(minS) || minS <= 0) return;
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
                    const where = confirm(`Mettre « ${other.title} » à la fin ?\n\nOK : à la fin · Annuler : à l’endroit du repère orange (${fmt(cursor)})`) ? buf.length : Math.round(cursor * sr);
                    setBuf(concatBufs([sliceBuf(buf, 0, where), ob, sliceBuf(buf, where, buf.length)].filter(b => b.length > 1), ch, sr));
                    sel = {a: where / sr, b: where / sr + ob.duration}; draw();
                    toast('Son ajouté (il est sélectionné).');
                }
            } catch (e) { toast(e.message || String(e), 'error'); }
            finally { busy.forEach(b => { b.disabled = false; }); help.textContent = 'Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.'; draw(); }
        }
        dl.querySelectorAll('[data-avx-op]').forEach(b => b.addEventListener('click', () => op(b.dataset.avxOp)));
        // enregistrer
        $('[data-avx-save]').addEventListener('click', async () => {
            stop();
            const formats = [{key: 'wav', label: 'WAV', help: `sans perte, lu partout (Mac, Windows, Audacity) · environ ${Math.max(1, Math.round(buf.length * buf.numberOfChannels * 2 / 1048576))} Mo`}];
            if (await opusSupported()) formats.push({key: 'ogg', label: 'Ogg Opus', help: `très léger · environ ${Math.max(1, Math.round(buf.duration * (buf.numberOfChannels > 1 ? 16000 : 9000) / 1048576))} Mo · QuickTime ne le lit pas`});
            ext.openDialog({eyebrow: 'ENREGISTRER LE SON', title: media.title || 'Son', wide: true, submitLabel: 'Enregistrer', body: saveOptionsHtml(media, formats),
                onOpen: d => d.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { d.querySelector('[data-avx-copytitle]').hidden = d.querySelector('[name=mode]:checked').value !== 'copy'; })),
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]');
                    prog.textContent = 'Préparation du fichier…';
                    const blob = f.fmt === 'ogg' ? await encodeOpus(buf, x => { prog.textContent = `Compression… ${Math.round(x * 100)} %`; }) : encodeWav(buf);
                    prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                    await uploadResult(media, blob, f.fmt === 'ogg' ? 'ogg' : 'wav', {mode: f.mode === 'copy' ? 'copy' : 'version', show: f.mode === 'show', duration: buf.duration, note: f.note, title: f.title});
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
    const loadMeta = src => new Promise((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => res({dur: v.duration, w: v.videoWidth, h: v.videoHeight}); v.onerror = () => rej(new Error('Vidéo illisible')); v.src = src; });

    async function openVideo(media, onDone) {
        let meta;
        try { meta = await loadMeta(url(media.filename)); } catch (e) { toast(e.message, 'error'); return; }
        const sources = [{src: url(media.filename), title: media.title || 'Vidéo', ...meta}];
        let segs = [{s: 0, from: 0, to: meta.dur}], cur = 0, dirty = false, playingAll = false;
        const fx = {volume: 1, clarity: false, noise: false, mute: false, rotate: 0, bright: 1, contrast: 1};
        const ver = await versionsHtml(media);
        const total = () => segs.reduce((t, x) => t + (x.to - x.from), 0);
        const dl = bigDialog({eyebrow: 'MODIFIER LA VIDÉO', title: media.title || media.filename, onClose: () => { vid.pause(); return !dirty || confirm('Fermer sans enregistrer les modifications ?'); },
            body: `<div class="h-avx-vgrid"><div class="h-avx-vstage"><video data-avx-video playsinline preload="auto"></video></div>
                <div class="h-avx-vside">
                    <h4>🔊 Le son</h4><label class="h-avx-row">Volume <input type="range" min="0" max="3" step="0.05" value="1" data-fx="volume"><output data-fx-out="volume">100 %</output></label>
                    <label class="checkbox-line"><input type="checkbox" data-fx="clarity"> 🗣️ Voix plus nette</label><label class="checkbox-line"><input type="checkbox" data-fx="noise"> 🧹 Moins de souffle et de grondement</label><label class="checkbox-line"><input type="checkbox" data-fx="mute"> 🔇 Sans le son</label>
                    <h4>🖼️ L’image</h4><label class="h-avx-row">Luminosité <input type="range" min="0.5" max="1.8" step="0.05" value="1" data-fx="bright"></label><label class="h-avx-row">Contraste <input type="range" min="0.5" max="1.8" step="0.05" value="1" data-fx="contrast"></label>
                    <div class="h-avx-row"><button type="button" class="button small secondary" data-avx-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-avx-rot="90">⟳ 90°</button><small class="muted" data-avx-rotout></small></div>
                    <p class="muted">Le son et l’image s’entendent et se voient tout de suite ; ils sont appliqués à l’enregistrement.</p>
                </div></div>
                <div class="h-avx-top"><span class="h-avx-time"><b data-avx-cur>0:00.0</b> · montage <b data-avx-total></b></span>
                    <span class="h-avx-zoom"><button type="button" class="button small" data-avx-vplay>▶ Lire le morceau</button><button type="button" class="button small secondary" data-avx-vall>▶▶ Tout le montage</button></span></div>
                <div class="h-avx-tl" data-avx-tl></div>
                <div class="h-avx-ops"><button type="button" class="button small secondary" data-avx-v="split">✂️ Couper ici</button><button type="button" class="button small secondary" data-avx-v="start">⟦ Le morceau commence ici</button><button type="button" class="button small secondary" data-avx-v="end">⟧ Le morceau finit ici</button>
                    <button type="button" class="button small secondary" data-avx-v="del">🗑 Enlever ce morceau</button><button type="button" class="button small secondary" data-avx-v="left">← Avancer</button><button type="button" class="button small secondary" data-avx-v="right">Reculer →</button><button type="button" class="button small secondary" data-avx-v="add">➕ Ajouter une vidéo…</button></div>
                <p class="muted h-avx-help">Pour enlever un passage : place-toi au début, « ✂️ Couper ici », puis à la fin, « ✂️ Couper ici », sélectionne le morceau du milieu et « 🗑 Enlever ».</p>
                ${ver.html}
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save>💾 Enregistrer…</button></div>`});
        const $ = s => dl.querySelector(s), vid = $('[data-avx-video]');
        bindVersions(dl, media, 'video', () => { dirty = false; dl.close(); onDone?.(); });
        $('[data-avx-cancel]').addEventListener('click', () => dl.querySelector('[data-avx-close]').click());
        // aperçu du son à travers les mêmes filtres que l'enregistrement
        const ctx = audioCtx(), node = ctx.createMediaElementSource(vid);
        const chain = (c, input) => { const gain = c.createGain(); let last = input;
            if (fx.noise) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; last.connect(hp).connect(lp); last = lp; }
            if (fx.clarity) { const pr = c.createBiquadFilter(); pr.type = 'peaking'; pr.frequency.value = 3000; pr.Q.value = 0.9; pr.gain.value = 4; const cp = c.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 3; last.connect(pr).connect(cp); last = cp; }
            gain.gain.value = fx.mute ? 0 : fx.volume; last.connect(gain); return gain; };
        let out = null;
        const rewire = () => { try { node.disconnect(); out?.disconnect(); } catch (_) {} out = chain(ctx, node); out.connect(ctx.destination); };
        rewire();
        const applyLook = () => { vid.style.filter = `brightness(${fx.bright}) contrast(${fx.contrast})`; vid.style.transform = fx.rotate ? `rotate(${fx.rotate}deg)${fx.rotate % 180 ? ' scale(.75)' : ''}` : ''; $('[data-avx-rotout]').textContent = fx.rotate ? `tournée de ${fx.rotate}°` : ''; };
        dl.querySelectorAll('[data-fx]').forEach(el => el.addEventListener('input', () => { const k = el.dataset.fx; fx[k] = el.type === 'checkbox' ? el.checked : Number(el.value); const o = dl.querySelector(`[data-fx-out="${k}"]`); if (o) o.textContent = Math.round(fx[k] * 100) + ' %'; dirty = true; rewire(); applyLook(); }));
        dl.querySelectorAll('[data-avx-rot]').forEach(b => b.addEventListener('click', () => { fx.rotate = (fx.rotate + Number(b.dataset.avxRot) + 360) % 360; dirty = true; applyLook(); }));
        // morceaux
        const load = (k, at = null) => { cur = Math.max(0, Math.min(segs.length - 1, k)); const sg = segs[cur], so = sources[sg.s]; if (!vid.src.endsWith(so.src)) vid.src = so.src; vid.currentTime = at ?? sg.from; drawTl(); };
        function drawTl() {
            const T = total(), tl = $('[data-avx-tl]');
            tl.innerHTML = segs.map((sg, k) => `<button type="button" class="h-avx-seg ${k === cur ? 'is-current' : ''}" style="flex:${Math.max(0.02, (sg.to - sg.from) / T)}" data-seg="${k}" title="${esc(sources[sg.s].title)} : ${fmt(sg.from)} → ${fmt(sg.to)}"><span>${k + 1}. ${esc(sources[sg.s].title)}</span><small>${fmt(sg.to - sg.from, false)}</small>${k === cur ? `<i style="left:${Math.min(100, Math.max(0, (vid.currentTime - sg.from) / (sg.to - sg.from) * 100))}%"></i>` : ''}</button>`).join('');
            tl.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', e => { const k = Number(b.dataset.seg), sg = segs[k], r = b.getBoundingClientRect(); playingAll = false; load(k, sg.from + (e.clientX - r.left) / r.width * (sg.to - sg.from)); }));
            $('[data-avx-total]').textContent = fmt(T);
        }
        vid.addEventListener('timeupdate', () => {
            const sg = segs[cur]; if (!sg) return;
            $('[data-avx-cur]').textContent = fmt(segs.slice(0, cur).reduce((t, x) => t + x.to - x.from, 0) + Math.max(0, vid.currentTime - sg.from));
            const i = $('.h-avx-seg.is-current i'); if (i) i.style.left = Math.min(100, Math.max(0, (vid.currentTime - sg.from) / (sg.to - sg.from) * 100)) + '%';
            if (vid.currentTime >= sg.to - 0.03 && !vid.paused) { if (playingAll && cur < segs.length - 1) { load(cur + 1); vid.play(); } else { vid.pause(); playingAll = false; } }
        });
        $('[data-avx-vplay]').addEventListener('click', () => { if (ctx.state === 'suspended') ctx.resume(); playingAll = false; if (vid.paused) { const sg = segs[cur]; if (vid.currentTime >= sg.to - 0.05 || vid.currentTime < sg.from) vid.currentTime = sg.from; vid.play(); } else vid.pause(); });
        $('[data-avx-vall]').addEventListener('click', () => { if (ctx.state === 'suspended') ctx.resume(); playingAll = true; load(0); vid.play(); });
        vid.addEventListener('play', () => { $('[data-avx-vplay]').textContent = '⏸ Pause'; }); vid.addEventListener('pause', () => { $('[data-avx-vplay]').textContent = '▶ Lire le morceau'; });
        dl.querySelectorAll('[data-avx-v]').forEach(b => b.addEventListener('click', async () => {
            const a = b.dataset.avxV, sg = segs[cur], t = vid.currentTime;
            if (a === 'split') { if (t <= sg.from + 0.1 || t >= sg.to - 0.1) return toast('Place-toi à l’intérieur du morceau (avec la barre de la vidéo).', 'error'); segs.splice(cur, 1, {...sg, to: t}, {...sg, from: t}); load(cur + 1, t); }
            if (a === 'start') { if (t >= sg.to - 0.1) return; sg.from = Math.max(0, t); drawTl(); }
            if (a === 'end') { if (t <= sg.from + 0.1) return; sg.to = Math.min(sources[sg.s].dur, t); drawTl(); }
            if (a === 'del') { if (segs.length === 1) return toast('Il faut garder au moins un morceau.', 'error'); segs.splice(cur, 1); load(Math.min(cur, segs.length - 1)); }
            if (a === 'left' && cur > 0) { [segs[cur - 1], segs[cur]] = [segs[cur], segs[cur - 1]]; load(cur - 1); }
            if (a === 'right' && cur < segs.length - 1) { [segs[cur + 1], segs[cur]] = [segs[cur], segs[cur + 1]]; load(cur + 1); }
            if (a === 'add') { const o = await pickOther('video'); if (!o) return; try { const m = await loadMeta(o.src); sources.push({src: o.src, title: o.title, ...m}); segs.push({s: sources.length - 1, from: 0, to: m.dur}); load(segs.length - 1); toast('Vidéo ajoutée à la fin du montage.'); } catch (e) { toast(e.message, 'error'); } }
            dirty = true;
        }));
        load(0);
        // enregistrer (en temps réel : le navigateur rejoue le montage dans une image cachée)
        $('[data-avx-save]').addEventListener('click', () => {
            vid.pause();
            const types = recordTypes();
            if (!types.length) return toast('Ce navigateur ne sait pas enregistrer de vidéo.', 'error');
            const T = total();
            ext.openDialog({eyebrow: 'ENREGISTRER LA VIDÉO', title: media.title || 'Vidéo', wide: true, submitLabel: 'Enregistrer',
                body: `<p class="h-cfg-explain">La vidéo est rejouée pour être enregistrée : cela prend <b>${fmt(T, false)}</b> (la durée du montage). Laisse la fenêtre ouverte.</p>` + saveOptionsHtml(media, types.map(([t, e, label, help]) => ({key: t, label, help}))),
                onOpen: d => d.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { d.querySelector('[data-avx-copytitle]').hidden = d.querySelector('[name=mode]:checked').value !== 'copy'; })),
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]'), type = types.find(x => x[0] === f.fmt) || types[0];
                    const blob = await recordMontage(sources, segs, fx, type[0], p => { prog.textContent = `Enregistrement… ${Math.round(p * 100)} %`; });
                    prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                    await uploadResult(media, blob, type[1], {mode: f.mode === 'copy' ? 'copy' : 'version', show: f.mode === 'show', duration: T, note: f.note, title: f.title});
                    toast(f.mode === 'copy' ? 'Nouvelle vidéo enregistrée, rattachée aux mêmes fiches.' : f.mode === 'show' ? 'Nouvelle version montrée partout. L’original est gardé.' : 'Version enregistrée (l’ancienne reste montrée).');
                    dirty = false; dl.close(); onDone?.();
                },
            });
        });
        dl.addEventListener('close', () => { vid.pause(); vid.removeAttribute('src'); try { node.disconnect(); out?.disconnect(); } catch (_) {} });
    }

    /** Rejoue les morceaux dans une image cachée et les enregistre (MediaRecorder), avec le son filtré. */
    async function recordMontage(sources, segs, fx, mime, onStep) {
        const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
        const first = sources[segs[0].s], turn = fx.rotate % 180 !== 0;
        const W0 = first.w || 1280, H0 = first.h || 720, W = (turn ? H0 : W0) & ~1, H = (turn ? W0 : H0) & ~1;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
        const ctx = new AudioContext(), srcNode = ctx.createMediaElementSource(v), dest = ctx.createMediaStreamDestination();
        const gain = ctx.createGain(); gain.gain.value = fx.mute ? 0 : fx.volume; let last = srcNode;
        if (fx.noise) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; last.connect(hp).connect(lp); last = lp; }
        if (fx.clarity) { const pr = ctx.createBiquadFilter(); pr.type = 'peaking'; pr.frequency.value = 3000; pr.Q.value = 0.9; pr.gain.value = 4; const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 3; last.connect(pr).connect(cp); last = cp; }
        last.connect(gain).connect(dest);
        const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
        const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: Math.min(8e6, Math.max(2.5e6, W * H * 4)), audioBitsPerSecond: 128000});
        const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        const T = segs.reduce((t, x) => t + x.to - x.from, 0); let doneT = 0, raf = 0;
        const paint = () => {
            g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.filter = `brightness(${fx.bright}) contrast(${fx.contrast})`;
            g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180);
            const vw = v.videoWidth || W0, vh = v.videoHeight || H0, bw = turn ? H : W, bh = turn ? W : H, k = Math.min(bw / vw, bh / vh);
            g.drawImage(v, -vw * k / 2, -vh * k / 2, vw * k, vh * k); g.restore();
        };
        const loop = () => { paint(); raf = requestAnimationFrame(loop); };
        rec.start(1000); rec.pause();
        try {
            for (const sg of segs) {
                const so = sources[sg.s];
                if (!v.src.endsWith(so.src)) { v.src = so.src; await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('Vidéo illisible : ' + so.title)); }); }
                v.currentTime = sg.from; await new Promise(r => { v.onseeked = r; });
                paint(); if (ctx.state === 'suspended') await ctx.resume();
                rec.resume(); loop(); await v.play();
                await new Promise(r => { const chk = () => { onStep?.((doneT + Math.max(0, v.currentTime - sg.from)) / T); if (v.currentTime >= sg.to || v.ended) { r(); return; } setTimeout(chk, 40); }; chk(); });
                v.pause(); rec.pause(); cancelAnimationFrame(raf); doneT += sg.to - sg.from;
            }
        } finally { cancelAnimationFrame(raf); }
        const blob = await new Promise(r => { rec.onstop = () => r(new Blob(chunks, {type: mime.split(';')[0]})); rec.stop(); });
        v.removeAttribute('src'); ctx.close();
        return blob;
    }

    /** Point d'entrée : un média {id, filename, title, media_type}. */
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
