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
    function bigDialog({eyebrow, title, body, onClose, id = ''}) {
        const dl = document.createElement('dialog');
        dl.className = 'modal h-modal h-modal-wide h-avx';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><span class="h-avx-headbtns">${id && ext.fullButton ? ext.fullButton(id) : ''}<button type="button" class="icon-button" data-avx-close aria-label="Fermer">×</button></span></div><div class="h-avx-body">${body}</div>`;
        if (id) ext.fullInit?.(dl, id);
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

    async function openAudio(media, onDone) {
        const ctx = audioCtx();
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
        const dl = bigDialog({eyebrow: 'MODIFIER LE SON', id: 'audio', title: media.title || media.filename, onClose: () => { stop(); return !dirty || confirm('Fermer sans enregistrer les modifications ?'); },
            body: `<div class="h-avx-top"><span class="h-avx-time"><b data-avx-cur>0:00.0</b> / <span data-avx-total></span></span><span class="h-avx-sel muted" data-avx-seltxt></span>
                    <span class="h-avx-zoom" data-tbg="au-zoom" data-tbg-label="Zoom"><button type="button" class="button small secondary" data-avx-zoom="fit" title="Tout voir">⤢ Tout</button><button type="button" class="button small secondary" data-avx-zoom="sel" title="Zoomer sur la sélection">🔍 Sélection</button><button type="button" class="button small secondary" data-avx-zoom="out">−</button><button type="button" class="button small secondary" data-avx-zoom="in">+</button></span></div>
                <div class="h-avx-wave"><canvas data-avx-canvas></canvas></div>
                <input type="range" class="h-avx-scroll" data-avx-scroll min="0" max="1000" value="0" aria-label="Défiler">
                <div class="h-avx-transport" data-tbg="au-transport" data-tbg-label="Lecture"><button type="button" class="button" data-avx-play>▶ Écouter</button><button type="button" class="button small secondary" data-avx-home title="Au début">⏮</button>
                    <button type="button" class="button small secondary" data-avx-undo disabled>↶ Annuler</button><button type="button" class="button small secondary" data-avx-redo disabled>↷ Rétablir</button>
                    <span class="muted h-avx-tip" data-tb-label="Aide (glisser, Espace, molette)">Glisse sur l’onde pour sélectionner · clic = se placer · Espace = écouter · molette = défiler, Ctrl + molette = zoom</span>${ext.tbButton ? ext.tbButton('audio') : ''}</div>
                <div class="h-avx-ops" data-tbg="au-ops" data-tbg-label="Outils du son">${OPS.map(([k, label, need]) => `<button type="button" class="button small secondary" data-avx-op="${k}" data-need="${need}">${label}</button>`).join('')}</div>
                <p class="muted h-avx-help" data-avx-help>Les réglages s’appliquent à la sélection ; sans sélection, à tout le son.</p>
                ${ver.html}
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save>💾 Enregistrer…</button></div>`});
        ext.tbApply?.(dl, 'audio');
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
                if (k === 'gain') { const ans = await A().askText({title: 'Volume', message: `Monter ou baisser le volume${sel ? ' de la sélection' : ''} de combien de décibels ?\n6 = deux fois plus fort · -6 = deux fois moins fort`, value: '6', okLabel: 'Appliquer', inputMode: 'decimal'}); if (ans == null) return; const db = Number(String(ans).replace(',', '.').trim()); if (!String(ans).trim() || !isFinite(db)) { toast('Indique un nombre, par exemple 6 ou -3.', 'error'); return; } await onRange(async p => scale(p, 10 ** (db / 20))); }
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
    const FONTS_V = [['Georgia, serif', 'Georgia'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['"Times New Roman", serif', 'Times'], ['"Courier New", monospace', 'Courier'], ['"Brush Script MT", cursive', 'Manuscrite'], ['Impact, sans-serif', 'Impact']];
    let uid = 0; const nid = p => p + (++uid) + Date.now().toString(36).slice(-3);
    /* Réglages du montage (Maintenance → Montage, retouche et son) : disposition et enregistrement par défaut */
    const MT_KEY = 'genealogie-montage-prefs';
    const MT_SIZES = [[0, 'Comme la vidéo'], [2160, '4K (2160 p)'], [1080, 'Full HD (1080 p)'], [720, 'HD (720 p)'], [480, '480 p'], [360, '360 p (léger)']];
    const MT_QUALITY = [[2, 'Légère (petit fichier)'], [5, 'Normale'], [8, 'Haute'], [14, 'Très haute (gros fichier)']];
    const MT_FPS = [24, 25, 30, 50, 60];
    const MT_COLORS = [['colV1', '🎬 Vidéo principale (Vidéo 1)', '#cfe0ff'], ['colV2', '🖼️ Vidéos incrustées', '#e3d4ff'], ['colT', '🔤 Textes', '#ffe7a8'], ['colA', '🎵 Sons', '#c9f0d4']];
    const MT_DEF = {side: 'right', stage: 50, lane: 40, help: true, fmt: 'mp4', height: 0, quality: 5, fps: 30, abr: 128, ...Object.fromEntries(MT_COLORS.map(c => [c[0], c[2]]))};
    // texte lisible (noir ou blanc) sur la couleur choisie
    const inkOn = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#111'; const n = parseInt(m[1], 16), l = 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); return l > 150 ? '#111' : '#fff'; };
    function montagePrefs() {
        let v = {}; try { v = JSON.parse(localStorage.getItem(MT_KEY) || '{}') || {}; } catch (_) {}
        const pick = (x, list, d) => list.includes(x) ? x : d, num = (x, a, b, d) => Number.isFinite(Number(x)) ? Math.min(b, Math.max(a, Number(x))) : d;
        return {side: pick(v.side, ['right', 'left'], 'right'), stage: num(v.stage, 25, 80, 50), lane: num(v.lane, 28, 70, 40), help: v.help !== false, fmt: pick(v.fmt, ['mp4', 'webm'], 'mp4'),
            height: pick(Number(v.height), MT_SIZES.map(x => x[0]), 0), quality: pick(Number(v.quality), MT_QUALITY.map(x => x[0]), 5), fps: pick(Number(v.fps), MT_FPS, 30), abr: pick(Number(v.abr), [96, 128, 192, 256], 128),
            ...Object.fromEntries(MT_COLORS.map(([k, , d]) => [k, /^#[0-9a-f]{6}$/i.test(v[k] || '') ? v[k] : d]))};
    }
    ext.montagePrefs = montagePrefs; ext.montagePrefsDefaults = {MT_KEY, MT_SIZES, MT_QUALITY, MT_FPS, MT_DEF};

    // les pistes, de haut en bas : vidéos incrustées (au-dessus = devant), la vidéo principale, les textes, les sons
    const TRACK_KINDS = {v: ['🖼️', 'Vidéo'], main: ['🎬', 'Vidéo 1'], t: ['🔤', 'Textes'], a: ['🎵', 'Son']};
    function montageModel(sources) {
        return {sources, v1: [], v2: [], texts: [], audio: [], look: {...LOOK0}, fx: {volume: 1, clarity: false, noise: false, mute: false, rotate: 0},
            tracks: [{id: 'V2', kind: 'v', name: 'Vidéo 2'}, {id: 'V1', kind: 'main', name: 'Vidéo 1'}, {id: 'T1', kind: 't', name: 'Textes 1'}, {id: 'A1', kind: 'a', name: 'Son 1'}, {id: 'A2', kind: 'a', name: 'Son 2'}]};
    }
    const KIND_OF_LIST = {v2: 'v', texts: 't', audio: 'a'};
    /** La piste d'un élément (une ancienne piste « 1 / 2 » des sons devient A1 / A2) */
    const trackOf = (P, c, list) => { const k = KIND_OF_LIST[list]; if (typeof c.track === 'number') c.track = 'A' + c.track; if (c.track && P.tracks.some(t => t.id === c.track && t.kind === k)) return c.track; return P.tracks.find(t => t.kind === k)?.id || ''; };
    const trackIdx = (P, id) => P.tracks.findIndex(t => t.id === id);
    const trackHidden = (P, id) => !!P.tracks.find(t => t.id === id)?.hidden;
    /** Moments de chaque morceau de la piste 1 (un fondu enchaîné fait se chevaucher deux morceaux) */
    function layoutV1(P) {
        let t = 0; return P.v1.map((c, k) => { const len = Math.max(0.05, c.to - c.from), d = k && c.tr?.type === 'cross' ? Math.min(c.tr.d || 1, len / 2, (P.v1[k - 1].to - P.v1[k - 1].from) / 2) : 0; const at = Math.max(0, t - d); t = at + len; return {c, at, end: at + len, cross: d}; });
    }
    const montageEnd = P => Math.max(0.1, layoutV1(P).at(-1)?.end || 0, ...P.v2.map(c => c.at + c.to - c.from), ...P.texts.map(x => x.at + x.dur), ...P.audio.map(a => a.at + a.to - a.from));
    const lookFilter = (a, b = LOOK0) => `brightness(${(a.bright ?? 1) * (b.bright ?? 1)}) contrast(${(a.contrast ?? 1) * (b.contrast ?? 1)}) saturate(${(a.sat ?? 1) * (b.sat ?? 1)}) hue-rotate(${(a.hue || 0) + (b.hue || 0)}deg)`;

    /**
     * Le moteur : des <video>/<audio> cachés (un par morceau), une image et un mélange. play()/pause()/seek(t) ;
     * out : 'preview' (haut-parleurs) ou 'record' (flux pour l'enregistrement).
     */
    function montageEngine(P, canvas, {out = 'preview', onTime} = {}) {
        const g = canvas.getContext('2d');
        const ctx = out === 'record' ? new AudioContext() : audioCtx();
        const master = ctx.createGain(); let tail = master;
        const fx = P.fx;
        if (fx.noise) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; tail.connect(hp).connect(lp); tail = lp; }
        if (fx.clarity) { const pr = ctx.createBiquadFilter(); pr.type = 'peaking'; pr.frequency.value = 3000; pr.Q.value = 0.9; pr.gain.value = 4; const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 3; tail.connect(pr).connect(cp); tail = cp; }
        const outGain = ctx.createGain(); outGain.gain.value = fx.mute ? 0 : fx.volume; tail.connect(outGain);
        const dest = out === 'record' ? ctx.createMediaStreamDestination() : null; outGain.connect(dest || ctx.destination);
        const els = new Map(); // id du morceau → {el, gain}
        const elFor = (id, src, isAudio) => {
            let e = els.get(id); if (e && e.src === src) return e;
            if (e) { e.el.pause(); e.el.removeAttribute('src'); }
            const el = document.createElement(isAudio ? 'audio' : 'video'); el.preload = 'auto'; el.playsInline = true; el.crossOrigin = 'anonymous'; el.src = src; el.muted = false;
            const node = ctx.createMediaElementSource(el), gain = ctx.createGain(); gain.gain.value = 0; node.connect(gain).connect(master);
            e = {el, gain, src}; els.set(id, e); return e;
        };
        let t = 0, playing = false, t0 = 0, p0 = 0, raf = 0, W = canvas.width, H = canvas.height;
        // ce qui joue au moment t
        function active(tt) {
            const L = layoutV1(P), list = [];
            L.forEach((x, k) => { if (tt >= x.at && tt < x.end) list.push({kind: 'v1', x, k, local: x.c.from + tt - x.at}); });
            P.v2.forEach(c => { if (tt >= c.at && tt < c.at + c.to - c.from && !trackHidden(P, trackOf(P, c, 'v2'))) list.push({kind: 'v2', c, local: c.from + tt - c.at}); });
            P.audio.forEach(a => { if (tt >= a.at && tt < a.at + a.to - a.from && !trackHidden(P, trackOf(P, a, 'audio'))) list.push({kind: 'a', c: a, local: a.from + tt - a.at}); });
            return {L, list};
        }
        function sync(tt, hard = false) {
            const {list} = active(tt), keep = new Set();
            for (const it of list) {
                const c = it.kind === 'v1' ? it.x.c : it.c, so = P.sources[c.s]; if (!so) continue;
                const e = elFor(c.id, so.src, it.kind === 'a'); keep.add(c.id);
                if (hard || Math.abs(e.el.currentTime - it.local) > 0.35) { try { e.el.currentTime = it.local; } catch (_) {} }
                // volume (fondus du son, morceau muet ou son détaché)
                let v = it.kind === 'a' ? (c.vol ?? 1) : (c.mute ? 0 : (c.vol ?? 1));
                if (it.kind === 'a') { const len = c.to - c.from, x = tt - c.at; if (c.fadeIn && x < c.fadeIn) v *= x / c.fadeIn; if (c.fadeOut && len - x < c.fadeOut) v *= Math.max(0, (len - x) / c.fadeOut); }
                if (it.kind === 'v1' && it.x.cross && tt < it.x.at + it.x.cross) v *= (tt - it.x.at) / it.x.cross; // le son suit le fondu enchaîné
                e.gain.gain.value = Math.max(0, v);
                if (playing && e.el.paused) e.el.play().catch(() => {}); if (!playing && !e.el.paused) e.el.pause();
            }
            els.forEach((e, id) => { if (!keep.has(id)) { e.gain.gain.value = 0; if (!e.el.paused) e.el.pause(); } });
        }
        function drawVideo(el, alpha, look) {
            const vw = el.videoWidth, vh = el.videoHeight; if (!vw || alpha <= 0) return;
            const turn = fx.rotate % 180 !== 0;
            g.save(); g.globalAlpha = alpha; g.filter = lookFilter(look || {}, P.look); g.translate(W / 2, H / 2); g.rotate(fx.rotate * Math.PI / 180);
            const bw = turn ? H : W, bh = turn ? W : H, k = Math.min(bw / vw, bh / vh); g.drawImage(el, -vw * k / 2, -vh * k / 2, vw * k, vh * k); g.restore();
        }
        function warmth(look) {
            const w = (look?.warm || 0) + (P.look.warm || 0); if (!w) return;
            g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = Math.min(0.8, Math.abs(w)); g.fillStyle = w > 0 ? '#ff9a3c' : '#3c8bff'; g.fillRect(0, 0, W, H); g.restore();
        }
        function drawText(x, tt) {
            const local = tt - x.at, d = x.dur, size = Math.round((x.size || 6) / 100 * H), lines = String(x.text || '').split('\n');
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
                drawVideo(e.el, a, it.x.c.look); warmth(it.x.c.look);
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
                const e = els.get(it.c.id); if (!e?.el.videoWidth) return; const c = it.c, vw = e.el.videoWidth, vh = e.el.videoHeight;
                const w = (c.w || 35) / 100 * W, h = w * vh / vw, x0 = (c.x ?? 62) / 100 * W, y0 = (c.y ?? 6) / 100 * H, local = tt - c.at, len = c.to - c.from;
                let a = (c.opacity ?? 100) / 100; if (c.fade !== false) { if (local < 0.5) a *= local / 0.5; if (len - local < 0.5) a *= (len - local) / 0.5; }
                g.save(); g.globalAlpha = Math.max(0, a); g.filter = lookFilter(c.look || {}, P.look); g.drawImage(e.el, x0, y0, w, h); g.restore();
                if (c.border !== false) { g.save(); g.globalAlpha = Math.max(0, a); g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, W / 400); g.strokeRect(x0, y0, w, h); g.restore(); }
            });
            P.texts.filter(x => tt >= x.at && tt < x.at + x.dur && !trackHidden(P, trackOf(P, x, 'texts'))).sort((a, b) => trackIdx(P, trackOf(P, b, 'texts')) - trackIdx(P, trackOf(P, a, 'texts'))).forEach(x => drawText(x, tt));
            if (out === 'preview' && api.decorate) { g.save(); api.decorate(g, W, H, tt); g.restore(); } // cadre de l'élément choisi (aperçu seulement)
        }
        const loop = () => {
            if (!playing) return;
            t = t0 + (performance.now() - p0) / 1000;
            const T = montageEnd(P);
            if (t >= T) { t = T; paint(t); api.pause(); onTime?.(t, true); return; }
            sync(t); paint(t); onTime?.(t); raf = requestAnimationFrame(loop);
        };
        const ready = () => Promise.all([...els.values()].map(e => e.el.readyState >= 2 ? 0 : new Promise(r => { const f = () => { e.el.removeEventListener('loadeddata', f); r(); }; e.el.addEventListener('loadeddata', f); setTimeout(r, 4000); })));
        const seeked = () => Promise.all([...els.values()].map(e => e.el.seeking ? new Promise(r => { e.el.addEventListener('seeked', r, {once: true}); setTimeout(r, 2500); }) : 0));
        const api = {
            get t() { return t; }, get playing() { return playing; }, ctx, stream: dest?.stream,
            async seek(tt) { t = Math.max(0, Math.min(montageEnd(P), tt)); const was = playing; if (was) api.pause(); sync(t, true); await ready(); await seeked(); paint(t); onTime?.(t); if (was) api.play(); },
            async play() { if (playing) return; if (ctx.state === 'suspended') await ctx.resume(); if (t >= montageEnd(P) - 0.05) t = 0; sync(t, true); await ready(); await seeked(); playing = true; t0 = t; p0 = performance.now(); sync(t); raf = requestAnimationFrame(loop); },
            pause() { playing = false; cancelAnimationFrame(raf); els.forEach(e => e.el.pause()); },
            redraw() { paint(t); },
            decorate: null,
            videoSize(id) { const e = els.get(id); return e?.el.videoWidth ? {vw: e.el.videoWidth, vh: e.el.videoHeight} : null; },
            async refresh() { sync(t); await ready(); paint(t); },
            destroy() { api.pause(); els.forEach(e => { e.el.removeAttribute('src'); try { e.el.load(); } catch (_) {} }); els.clear(); if (out === 'record') ctx.close(); else { try { master.disconnect(); outGain.disconnect(); } catch (_) {} } },
        };
        return api;
    }

    /** Enregistre le montage (en temps réel) : l'image du moteur et son mélange de sons. */
    async function recordMontage(P, mime, onStep, {height = 0, quality = 5, fps = 30, abr = 128} = {}) {
        const first = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s] || {w: 1280, h: 720}, turn = P.fx.rotate % 180 !== 0;
        const W0 = first.w || 1280, H0 = first.h || 720, Wn = turn ? H0 : W0, Hn = turn ? W0 : H0;
        // taille choisie (hauteur en lignes : 1080 p, 720 p…) ou celle de la vidéo (2 000 px au plus)
        const sc = height ? height / Hn : Math.min(1, 2000 / Math.max(Wn, Hn));
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

    async function openVideo(media, onDone, start = null) {
        const sources = [];
        if (media.id || media.src) {
            let meta; try { meta = await loadMeta(media.src || url(media.filename)); } catch (e) { toast(e.message, 'error'); return; }
            sources.push({src: media.src || url(media.filename), title: media.title || 'Vidéo', kind: 'video', ...meta});
        }
        const P = montageModel(sources);
        if (sources.length) P.v1.push({id: nid('v'), s: 0, from: 0, to: sources[0].dur, tr: {type: 'none', d: 1}, look: {}, vol: 1});
        let sel = P.v1[0] ? {track: 'v1', id: P.v1[0].id} : null, dirty = false, pxs = 40; // pixels par seconde sur la frise
        const OFF = 150; // largeur des noms de pistes, à gauche de la frise
        // une piste libre de ce genre à ce moment-là, sinon une nouvelle
        const LISTS = {v: P.v2, t: P.texts, a: P.audio}, LISTNAME = {v: 'v2', t: 'texts', a: 'audio'};
        const lenOf = c => c.dur ?? (c.to - c.from);
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
        const dl = bigDialog({eyebrow: '🎬 MONTAGE VIDÉO', id: 'video', title: media.title || media.filename || 'Nouveau montage', onClose: () => { eng?.pause(); return !dirty || confirm('Fermer sans enregistrer le montage ?'); },
            body: `<div class="h-mt">
                <div class="h-mt-top">
                    <div class="h-mt-stage"><canvas data-mt-canvas width="1280" height="720"></canvas><p class="h-mt-empty" data-mt-empty hidden>Ajoute une vidéo avec « ➕ Vidéo à la suite ».</p></div>
                    <aside class="h-mt-side">
                        <div class="h-rt-tabs" data-tbg="mt-tabs" data-tbg-label="Onglets de droite"><button type="button" class="is-active" data-mt-tab="item">🎯 Élément</button><button type="button" data-mt-tab="color">🎨 Couleurs</button><button type="button" data-mt-tab="sound">🔊 Son</button><button type="button" data-mt-tab="film">🎞️ Film</button></div>
                        <div data-mt-pane="item"></div>
                        <div data-mt-pane="color" hidden></div>
                        <div data-mt-pane="sound" hidden></div>
                        <div data-mt-pane="film" hidden></div>
                    </aside>
                </div>
                <div class="h-mt-transport" data-tbg="mt-transport" data-tbg-label="Lecture"><button type="button" class="button" data-mt-play>▶ Lire</button><button type="button" class="button small secondary" data-mt-home title="Au début">⏮</button><span class="h-avx-time" data-tb-label="Temps (où on en est / durée)"><b data-mt-cur>0:00.0</b> / <span data-mt-total></span></span>
                    <label class="h-mt-zoomr" data-tb-label="Zoom de la frise" title="Aussi ⌘ + / ⌘ − (Ctrl + / Ctrl − sur PC et Linux), ⌘ 0 pour revenir">Zoom de la frise <input type="range" min="4" max="200" value="40" data-mt-zoom></label>${ext.tbButton ? ext.tbButton('video') : ''}</div>
                <div class="h-mt-ops" data-tbg="mt-ops" data-tbg-label="Outils du montage">
                    <button type="button" class="button small secondary" data-mt-op="split" title="Coupe le morceau choisi à la tête de lecture">✂️ Couper ici</button>
                    <button type="button" class="button small secondary" data-mt-op="start" title="Le morceau choisi commence à la tête de lecture">⟦ Commence ici</button>
                    <button type="button" class="button small secondary" data-mt-op="end" title="Le morceau choisi finit à la tête de lecture">⟧ Finit ici</button>
                    <button type="button" class="button small secondary" data-mt-op="left" title="Avancer le morceau dans la piste 1">← Avancer</button>
                    <button type="button" class="button small secondary" data-mt-op="right" title="Reculer le morceau dans la piste 1">Reculer →</button>
                    <button type="button" class="button small secondary" data-mt-op="detach" title="Le son du morceau passe sur une piste son, à part">🔊 Détacher le son</button>
                    <button type="button" class="button small secondary" data-mt-op="del" title="Enlever l'élément choisi">🗑 Enlever</button>
                    <button type="button" class="button small" data-mt-op="addv1">➕ Vidéo à la suite</button>
                    <button type="button" class="button small secondary" data-mt-op="addv2" title="Une vidéo dans un coin de l'image, à la tête de lecture">➕ Incrustation</button>
                    <button type="button" class="button small secondary" data-mt-op="addtext">➕ Titre / texte</button>
                    <button type="button" class="button small secondary" data-mt-op="adda">➕ Son / musique</button>
                </div>
                <div class="h-mt-tl" data-mt-tl></div>
                <p class="muted h-avx-help">Clique sur la frise pour te placer, sur un élément pour le choisir ; glisse les incrustations, les textes et les sons pour les déplacer dans le temps. Espace = lire / pause.</p>
                ${ver.html}
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-avx-cancel>Fermer</button><button type="button" class="button" data-avx-save>💾 Enregistrer…</button></div></div>`});
        dl.classList.add('h-avx-montage'); dl.classList.toggle('mt-left', MP.side === 'left'); dl.classList.toggle('mt-nohelp', !MP.help);
        dl.style.setProperty('--mt-stage', MP.stage + 'vh'); dl.style.setProperty('--mt-lane', MP.lane + 'px');
        [['colV1', 'v1'], ['colV2', 'v2'], ['colT', 't'], ['colA', 'a']].forEach(([k, v]) => { dl.style.setProperty(`--mt-c-${v}`, MP[k]); dl.style.setProperty(`--mt-i-${v}`, inkOn(MP[k])); });
        const $ = s => dl.querySelector(s), cv = $('[data-mt-canvas]');
        if (media.id) bindVersions(dl, media, 'video', () => { dirty = false; dl.close(); onDone?.(); });
        $('[data-avx-cancel]').addEventListener('click', () => dl.querySelector('[data-avx-close]').click());
        const sizeFor = () => { const so = P.sources[P.v1[0]?.s] || P.sources[P.v2[0]?.s]; const turn = P.fx.rotate % 180 !== 0; const w = so?.w || 1280, h = so?.h || 720, k = Math.min(1, 1280 / Math.max(w, h)); return [Math.round((turn ? h : w) * k), Math.round((turn ? w : h) * k)]; };
        const fitCanvas = () => { [cv.width, cv.height] = sizeFor(); }; // l'image prend le format de la première vidéo
        let eng = null;
        const rebuild = async () => { const t = eng?.t || 0; eng?.destroy(); fitCanvas(); eng = montageEngine(P, cv, {onTime}); eng.decorate = decorate; await eng.seek(t); };
        // 0 : redessiner · 1 : recaler les vidéos · 2 : refaire le moteur (son général, rotation) ; pane=false : on écrit dans le panneau
        const touch = async (lvl = 1, pane = true) => { dirty = true; const [w, h] = sizeFor(); if (w !== cv.width || h !== cv.height) lvl = 2; if (lvl === 2) { await rebuild(); drawTl(pane); return; } drawTl(pane); if (lvl === 1) eng?.seek(eng.t); else eng?.refresh(); };
        const onTime = (t, end) => { $('[data-mt-cur]').textContent = fmt(t); const ph = $('[data-mt-ph]'); if (ph) ph.style.left = (t * pxs + OFF) + 'px'; if (end) $('[data-mt-play]').textContent = '▶ Lire'; };
        const all = () => [...P.v1.map(c => ['v1', c]), ...P.v2.map(c => ['v2', c]), ...P.texts.map(c => ['texts', c]), ...P.audio.map(c => ['audio', c])];
        const selected = () => { const f = all().find(([tr, c]) => sel && tr === sel.track && c.id === sel.id); return f ? f[1] : null; };
        // frise : une ligne par piste
        function drawTl(pane = true) {
            const L = layoutV1(P), T = montageEnd(P), W = Math.max(600, T * pxs + 160);
            const block = (tr, c, at, len, label, cls = '') => `<button type="button" class="h-mt-clip ${cls} ${sel && sel.track === tr && sel.id === c.id ? 'is-sel' : ''}" style="left:${OFF + at * pxs}px;width:${Math.max(6, len * pxs)}px" data-mt-clip="${tr}:${c.id}" title="${esc(label)} · ${fmt(at)} → ${fmt(at + len)}">${esc(label)}</button>`;
            const lane = (key, name, inner) => `<div class="h-mt-lane" data-mt-lane="${key}"><span class="h-mt-lname">${name}</span>${inner}</div>`;
            const ruler = Array.from({length: Math.ceil(T) + 1}, (_, s) => s % Math.max(1, Math.round(60 / pxs * 2)) === 0 ? `<span style="left:${OFF + s * pxs}px">${fmt(s, false)}</span>` : '').join('');
            const clipsOf = tr => tr.kind === 'main' ? L.map(x => block('v1', x.c, x.at, x.end - x.at, (x.c.tr?.type && x.c.tr.type !== 'none' ? '◇ ' : '') + (P.sources[x.c.s]?.title || 'Vidéo') + (x.c.mute ? ' 🔇' : ''), 'is-v1')).join('')
                : tr.kind === 'v' ? P.v2.filter(c => trackOf(P, c, 'v2') === tr.id).map(c => block('v2', c, c.at, c.to - c.from, P.sources[c.s]?.title || 'Incrustation', 'is-v2')).join('')
                : tr.kind === 't' ? P.texts.filter(x => trackOf(P, x, 'texts') === tr.id).map(x => block('texts', x, x.at, x.dur, x.text.split('\n')[0] || 'Texte', 'is-text')).join('')
                : P.audio.filter(a => trackOf(P, a, 'audio') === tr.id).map(a => block('audio', a, a.at, a.to - a.from, (a.detached ? '🔊 ' : '🎵 ') + (P.sources[a.s]?.title || 'Son'), 'is-audio')).join('');
            const laneOf = tr => `<div class="h-mt-lane ${tr.hidden ? 'is-hidden' : ''}" data-mt-lane="${tr.id}" data-kind="${tr.kind}"><span class="h-mt-lname"><b title="Double-clic pour renommer" data-mt-tname="${tr.id}">${TRACK_KINDS[tr.kind][0]} ${esc(tr.name)}</b><span class="h-mt-tbtns">${tr.kind === 'main' ? '' : `<button type="button" data-mt-tvis="${tr.id}" title="${tr.hidden ? 'Montrer cette piste' : 'Cacher cette piste (ni vue ni entendue)'}">${tr.hidden ? '🙈' : '👁'}</button>`}<button type="button" data-mt-tup="${tr.id}" title="Monter la piste">↑</button><button type="button" data-mt-tdown="${tr.id}" title="Descendre la piste">↓</button>${tr.kind === 'main' ? '' : `<button type="button" data-mt-tdel="${tr.id}" title="Supprimer cette piste">🗑</button>`}</span></span>${clipsOf(tr)}</div>`;
            $('[data-mt-tl]').innerHTML = `<div class="h-mt-tlin" style="width:${W}px" data-dnd-off><div class="h-mt-ruler" data-mt-ruler>${ruler}</div><div>
                ${P.tracks.map(laneOf).join('')}</div>
                <div class="h-mt-addtracks"><button type="button" class="button small secondary" data-mt-addtrack="v">＋ Piste vidéo</button><button type="button" class="button small secondary" data-mt-addtrack="t">＋ Piste texte</button><button type="button" class="button small secondary" data-mt-addtrack="a">＋ Piste son</button></div>
                <i class="h-mt-ph" data-mt-ph style="left:${OFF + (eng?.t || 0) * pxs}px"></i></div>`;
            ext.tbApply?.(dl, 'video'); // pistes rangées ou cachées à sa façon
            $('[data-mt-total]').textContent = fmt(T);
            $('[data-mt-empty]').hidden = P.v1.length > 0;
            if (pane) drawPane();
        }
        // panneau de droite : réglages de l'élément choisi
        const rng = (k, label, min, max, step, v, unit = '') => `<label class="h-avx-row">${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-mt-k="${k}"><output data-u="${unit}">${unit === '%' ? Math.round(v * 100) + ' %' : v + unit}</output></label>`;
        const lookHtml = (L, scope) => `<div class="h-mt-looks">${LOOKS.map(([n], i) => `<button type="button" class="button small secondary" data-mt-look="${scope}:${i}">${esc(n)}</button>`).join('')}</div>
            ${rng(scope + '.bright', 'Luminosité', 0.4, 1.8, 0.02, L.bright ?? 1, '%')}${rng(scope + '.contrast', 'Contraste', 0.4, 1.8, 0.02, L.contrast ?? 1, '%')}${rng(scope + '.sat', 'Saturation', 0, 2, 0.02, L.sat ?? 1, '%')}${rng(scope + '.warm', 'Température (froid ↔ chaud)', -0.8, 0.8, 0.02, L.warm ?? 0)}${rng(scope + '.hue', 'Teinte', -60, 60, 1, L.hue ?? 0, '°')}`;
        const trackSel = (list, c) => { const cur = trackOf(P, c, list); return `<label class="h-avx-row">Piste <select data-mt-k="track">${P.tracks.filter(t => t.kind === KIND_OF_LIST[list]).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`; };
        function drawPane() {
            const c = selected(), item = $('[data-mt-pane="item"]');
            if (!c) item.innerHTML = '<p class="muted">Choisis un élément sur la frise (un morceau, une incrustation, un texte, un son).</p>';
            else if (sel.track === 'v1') item.innerHTML = `<h4>🎬 Morceau de la piste 1</h4><p class="muted">${esc(P.sources[c.s]?.title || '')} · ${fmt(c.from)} → ${fmt(c.to)}</p>
                <label class="h-avx-row">Transition avant <select data-mt-k="tr.type">${TRANS.map(([k, l]) => `<option value="${k}" ${(c.tr?.type || 'none') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${rng('tr.d', 'Durée du fondu', 0.2, 4, 0.1, c.tr?.d ?? 1, ' s')}
                ${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}<label class="checkbox-line"><input type="checkbox" data-mt-k="mute" ${c.mute ? 'checked' : ''}> 🔇 Sans son</label>
                <h4>🎨 Couleurs de ce morceau</h4>${lookHtml(c.look || {}, 'look')}`;
            else if (sel.track === 'v2') item.innerHTML = `<h4>🖼️ Incrustation</h4><p class="muted">${esc(P.sources[c.s]?.title || '')}</p>${rng('w', 'Largeur', 10, 100, 1, c.w ?? 35, ' %')}${rng('x', 'Position horizontale', 0, 90, 1, c.x ?? 62, ' %')}${rng('y', 'Position verticale', 0, 90, 1, c.y ?? 6, ' %')}${rng('opacity', 'Opacité', 10, 100, 1, c.opacity ?? 100, ' %')}
                ${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 0, '%')}${trackSel('v2', c)}<label class="checkbox-line"><input type="checkbox" data-mt-k="border" ${c.border !== false ? 'checked' : ''}> cadre blanc</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}> apparaît et disparaît en fondu</label>`;
            else if (sel.track === 'texts') item.innerHTML = `<h4>🔤 Titre / texte</h4>${trackSel('texts', c)}<label class="h-mt-txt">Texte <textarea rows="3" data-mt-k="text">${esc(c.text)}</textarea></label>
                <label class="h-avx-row">Mouvement <select data-mt-k="anim">${ANIMS.map(([k, l]) => `<option value="${k}" ${c.anim === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                ${rng('dur', 'Durée', 0.5, 30, 0.1, c.dur, ' s')}${rng('size', 'Taille', 2, 20, 0.5, c.size ?? 6, ' %')}
                <label class="h-avx-row">Police <select data-mt-k="font">${FONTS_V.map(([k, l]) => `<option value="${esc(k)}" ${c.font === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="h-avx-row">Couleur <input type="color" value="${esc(c.color || '#ffffff')}" data-mt-k="color"> Fond <input type="color" value="${esc(c.bg || '#000000')}" data-mt-k="bg" ${c.bg ? '' : 'disabled'}><label class="checkbox-line"><input type="checkbox" data-mt-k="hasbg" ${c.bg ? 'checked' : ''}> bandeau</label></label>
                ${rng('x', 'Position horizontale', 0, 100, 1, c.x ?? 50, ' %')}${rng('y', 'Position verticale', 0, 100, 1, c.y ?? 80, ' %')}
                <label class="h-avx-row">Alignement <select data-mt-k="align">${[['center', 'centré'], ['left', 'à gauche'], ['right', 'à droite']].map(([k, l]) => `<option value="${k}" ${(c.align || 'center') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label class="checkbox-line"><input type="checkbox" data-mt-k="bold" ${c.bold ? 'checked' : ''}> gras</label><label class="checkbox-line"><input type="checkbox" data-mt-k="shadow" ${c.shadow !== false ? 'checked' : ''}> ombre</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fade" ${c.fade !== false ? 'checked' : ''}> entre et sort en fondu</label>`;
            else item.innerHTML = `<h4>🎵 Son</h4><p class="muted">${esc(P.sources[c.s]?.title || '')} · ${fmt(c.from)} → ${fmt(c.to)}</p>${rng('vol', 'Volume', 0, 2, 0.05, c.vol ?? 1, '%')}${rng('fadeIn', 'Fondu d’entrée', 0, 10, 0.1, c.fadeIn || 0, ' s')}${rng('fadeOut', 'Fondu de sortie', 0, 10, 0.1, c.fadeOut || 0, ' s')}
                ${trackSel('audio', c)}`;
            $('[data-mt-pane="color"]').innerHTML = `<h4>🎨 Couleurs de tout le film</h4><p class="muted">S’ajoutent aux couleurs de chaque morceau (onglet Élément).</p>${lookHtml(P.look, 'film')}`;
            $('[data-mt-pane="sound"]').innerHTML = `<h4>🔊 Le son de tout le film</h4>${rng('fx.volume', 'Volume général', 0, 3, 0.05, P.fx.volume, '%')}<label class="checkbox-line"><input type="checkbox" data-mt-k="fx.clarity" ${P.fx.clarity ? 'checked' : ''}> 🗣️ Voix plus nette</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fx.noise" ${P.fx.noise ? 'checked' : ''}> 🧹 Moins de souffle et de grondement</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fx.mute" ${P.fx.mute ? 'checked' : ''}> 🔇 Sans le son</label>`;
            $('[data-mt-pane="film"]').innerHTML = `<h4>🎞️ Le film</h4><div class="h-avx-row"><button type="button" class="button small secondary" data-mt-rot="-90">⟲ 90°</button><button type="button" class="button small secondary" data-mt-rot="90">⟳ 90°</button><small class="muted">${P.fx.rotate ? `tourné de ${P.fx.rotate}°` : ''}</small></div>
                <label class="checkbox-line"><input type="checkbox" data-mt-k="fadeStart" ${P.fadeStart ? 'checked' : ''}> commence par un fondu depuis le noir</label><label class="checkbox-line"><input type="checkbox" data-mt-k="fadeEnd" ${P.fadeEnd ? 'checked' : ''}> finit par un fondu au noir</label>
                <p class="muted">Durée du film : <b>${fmt(montageEnd(P))}</b></p>`;
        }
        // réglages → modèle
        const setK = (obj, k, v) => { const ks = k.split('.'); let o = obj; ks.slice(0, -1).forEach(x => { o[x] = o[x] || {}; o = o[x]; }); o[ks.at(-1)] = v; };
        const audioFx = k => /^fx\.(clarity|noise|mute|volume)$/.test(k);
        dl.querySelector('.h-mt-side').addEventListener('input', e => {
            const el = e.target.closest('[data-mt-k]'); if (!el) return;
            let k = el.dataset.mtK, v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
            const o = el.parentElement.querySelector('output'); if (o && el.type === 'range') o.textContent = o.dataset.u === '%' ? Math.round(v * 100) + ' %' : v + o.dataset.u;
            const film = k.startsWith('film.'), c = selected();
            if (film) setK(P.look, k.slice(5), v);
            else if (k.startsWith('fx.') || k === 'fadeStart' || k === 'fadeEnd') setK(P, k, v);
            else if (c) {
                if (k === 'hasbg') { c.bg = v ? (dl.querySelector('[data-mt-k="bg"]').value || '#000000') : ''; dl.querySelector('[data-mt-k="bg"]').disabled = !v; }
                else if (k === 'track') { c.track = v; touch(1); return; }
                else if (k === 'tr.type' || k === 'tr.d') { c.tr = c.tr || {type: 'none', d: 1}; c.tr[k.slice(3)] = k === 'tr.d' ? Number(v) : v; }
                else setK(c, k, v);
            }
            touch(audioFx(k) ? 2 : 0, false);
        });
        dl.querySelector('.h-mt-side').addEventListener('click', e => {
            const tab = e.target.closest('[data-mt-tab]'); if (tab) { dl.querySelectorAll('[data-mt-tab]').forEach(b => b.classList.toggle('is-active', b === tab)); dl.querySelectorAll('[data-mt-pane]').forEach(p => { p.hidden = p.dataset.mtPane !== tab.dataset.mtTab; }); return; }
            const lk = e.target.closest('[data-mt-look]'); if (lk) { const [scope, i] = lk.dataset.mtLook.split(':'), target = scope === 'film' ? P.look : (selected() ? (selected().look = selected().look || {}) : null); if (!target) return; Object.assign(target, LOOK0, LOOKS[Number(i)][1]); touch(0); return; }
            const rot = e.target.closest('[data-mt-rot]'); if (rot) { P.fx.rotate = (P.fx.rotate + Number(rot.dataset.mtRot) + 360) % 360; touch(2); }
        });
        // sur l'image : glisser une incrustation ou un texte pour le déplacer, tirer son coin pour changer sa taille
        const measure = document.createElement('canvas').getContext('2d');
        const boxOf = (track, c) => {
            const W = cv.width, H = cv.height, t = eng?.t || 0;
            if (track === 'v2') { if (t < c.at || t >= c.at + c.to - c.from) return null; const s = eng.videoSize(c.id) || {vw: 16, vh: 9}, w = (c.w || 35) / 100 * W; return {x: (c.x ?? 62) / 100 * W, y: (c.y ?? 6) / 100 * H, w, h: w * s.vh / s.vw}; }
            if (track === 'texts') { if (t < c.at || t >= c.at + c.dur) return null; const size = (c.size || 6) / 100 * H, lines = String(c.text || ' ').split('\n'); measure.font = `${c.bold ? '700 ' : ''}${size}px ${c.font || 'Georgia, serif'}`;
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
            if (!clip) { if (e.target.closest('.h-mt-lname, .h-mt-addtracks')) return; eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const [track, id] = clip.dataset.mtClip.split(':'); sel = {track, id};
            const c = selected(); drawTl();
            if (track === 'v1' || !c) { eng.seek((e.clientX - r.left - OFF) / pxs); return; }
            const at0 = c.at, el = tl.querySelector(`[data-mt-clip="${track}:${id}"]`); let moved = false;
            const mv = ev => { const d = (ev.clientX - x0) / pxs; if (Math.abs(ev.clientX - x0) > 3) moved = true; c.at = Math.max(0, Math.round((at0 + d) * 10) / 10); if (el) el.style.left = (OFF + c.at * pxs) + 'px'; };
            const up = ev => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
                const ln = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-mt-lane]'); // posé sur une autre piste du même genre
                if (ln && ln.dataset.kind === KIND_OF_LIST[track] && ln.dataset.mtLane !== trackOf(P, c, track)) { c.track = ln.dataset.mtLane; moved = true; }
                if (moved) touch(1); else eng.seek((ev.clientX - r.left - OFF) / pxs); };
            document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
        });
        $('[data-mt-zoom]').addEventListener('input', e => { pxs = Number(e.target.value); drawTl(); });
        // pistes : ajouter, cacher, monter, descendre, supprimer, renommer
        tl.addEventListener('click', e => {
            const b = e.target.closest('[data-mt-addtrack],[data-mt-tvis],[data-mt-tup],[data-mt-tdown],[data-mt-tdel]'); if (!b) return;
            e.stopPropagation(); const d = b.dataset;
            if (d.mtAddtrack) { const id = addTrack(d.mtAddtrack); toast(`Piste « ${P.tracks.find(t => t.id === id).name} » ajoutée.`); return touch(0); }
            const id = d.mtTvis || d.mtTup || d.mtTdown || d.mtTdel, i = trackIdx(P, id), tr = P.tracks[i]; if (!tr) return;
            if (d.mtTvis) { tr.hidden = !tr.hidden; return touch(1); }
            if (d.mtTup || d.mtTdown) { const j = i + (d.mtTup ? -1 : 1); if (j < 0 || j >= P.tracks.length) return; [P.tracks[i], P.tracks[j]] = [P.tracks[j], P.tracks[i]]; return touch(0); }
            if (d.mtTdel) {
                const list = LISTS[tr.kind], mine = list.filter(c => trackOf(P, c, LISTNAME[tr.kind]) === id);
                if (mine.length && !confirm(`Supprimer la piste « ${tr.name} » et ${mine.length > 1 ? `ses ${mine.length} éléments` : 'son élément'} ?`)) return;
                mine.forEach(c => { if (tr.kind === 'a') undetach(c); list.splice(list.indexOf(c), 1); });
                P.tracks.splice(i, 1); if (sel && mine.some(c => c.id === sel.id)) sel = null; toast(`Piste « ${tr.name} » supprimée.`); return touch(1);
            }
        });
        tl.addEventListener('dblclick', e => { const n = e.target.closest('[data-mt-tname]'); if (!n) return; const tr = P.tracks.find(t => t.id === n.dataset.mtTname); const name = (prompt('Nom de la piste :', tr.name) || '').trim().slice(0, 40); if (name) { tr.name = name; touch(0); } });
        // lecture
        const play = async () => { if (eng.playing) { eng.pause(); $('[data-mt-play]').textContent = '▶ Lire'; } else { await eng.play(); $('[data-mt-play]').textContent = '⏸ Pause'; } };
        $('[data-mt-play]').addEventListener('click', play);
        $('[data-mt-home]').addEventListener('click', () => eng.seek(0));
        dl.addEventListener('keydown', e => { if (e.key === ' ' && !e.target.closest('input, textarea, select')) { e.preventDefault(); play(); } });
        // outils
        const addSource = async kind => { const o = await pickOther(kind); if (!o) return null; try { const m = kind === 'video' ? await loadMeta(o.src) : await new Promise((res, rej) => { const a = document.createElement('audio'); a.preload = 'metadata'; a.onloadedmetadata = () => realDuration(a).then(dur => res({dur}), () => rej(new Error('Son illisible (durée inconnue)'))); a.onerror = () => rej(new Error('Son illisible')); a.src = o.src; }); P.sources.push({src: o.src, title: o.title, kind, ...m}); return P.sources.length - 1; } catch (e) { toast(e.message, 'error'); return null; } };
        dl.querySelector('.h-mt-ops').addEventListener('click', async e => {
            const b = e.target.closest('[data-mt-op]'); if (!b) return; const op = b.dataset.mtOp, c = selected(), t = eng.t;
            if (op === 'addv1') { const s = await addSource('video'); if (s === null) return; const k = {id: nid('v'), s, from: 0, to: P.sources[s].dur, tr: {type: P.v1.length ? 'cross' : 'none', d: 1}, look: {}, vol: 1}; P.v1.push(k); sel = {track: 'v1', id: k.id}; return touch(1); }
            if (op === 'addv2') { const s = await addSource('video'); if (s === null) return; const k = {id: nid('i'), s, from: 0, to: P.sources[s].dur, at: t, w: 35, x: 62, y: 6, opacity: 100, vol: 0}; k.track = freeTrack('v', t, k.to); P.v2.push(k); sel = {track: 'v2', id: k.id}; return touch(1); }
            if (op === 'adda') { const s = await addSource('audio'); if (s === null) return; const k = {id: nid('a'), s, from: 0, to: P.sources[s].dur, at: t, vol: 1, fadeIn: 0, fadeOut: 1}; k.track = freeTrack('a', t, k.to); P.audio.push(k); sel = {track: 'audio', id: k.id}; return touch(1); }
            if (op === 'addtext') { const k = {id: nid('t'), at: t, dur: 4, text: 'Mon titre', size: 7, color: '#ffffff', bg: '', font: 'Georgia, serif', x: 50, y: P.texts.length ? 82 : 50, anim: 'fade', align: 'center'}; k.track = freeTrack('t', t, 4); P.texts.push(k); sel = {track: 'texts', id: k.id}; touch(0); dl.querySelector('[data-mt-tab="item"]').click(); dl.querySelector('[data-mt-k="text"]')?.select(); return; }
            if (!c) return toast('Choisis d’abord un élément sur la frise.', 'error');
            const list = sel.track === 'v1' ? P.v1 : sel.track === 'v2' ? P.v2 : sel.track === 'texts' ? P.texts : P.audio, i = list.indexOf(c);
            const startOf = () => sel.track === 'v1' ? layoutV1(P)[i].at : c.at;
            if (op === 'del') { if (sel.track === 'audio') undetach(c); list.splice(i, 1); sel = null; return touch(1); }
            if (op === 'left' || op === 'right') { if (sel.track !== 'v1') return toast('Pour les incrustations, textes et sons : fais-les glisser sur la frise.', 'error'); const j = i + (op === 'left' ? -1 : 1); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; return touch(1); }
            if (op === 'detach') { if (sel.track !== 'v1' && sel.track !== 'v2') return toast('Choisis un morceau de vidéo.', 'error'); if (c.detached) return toast('Le son de ce morceau est déjà détaché.', 'error'); const at = startOf();
                const k = {id: nid('a'), s: c.s, from: c.from, to: c.to, at, vol: c.vol ?? 1, fadeIn: 0, fadeOut: 0, track: freeTrack('a', at, c.to - c.from), detached: true}; P.audio.push(k); c.mute = true; c.detached = k.id; sel = {track: 'audio', id: k.id}; toast(`Son détaché : il est sur la piste « ${P.tracks.find(x => x.id === k.track)?.name} », tu peux le déplacer, le baisser ou l’enlever.`); return touch(1); }
            if (sel.track === 'texts') { if (op === 'start') { const e2 = c.at + c.dur; c.at = Math.min(t, e2 - 0.3); c.dur = e2 - c.at; } if (op === 'end') c.dur = Math.max(0.3, t - c.at); if (op === 'split') return toast('Un texte ne se coupe pas : change sa durée.', 'error'); return touch(0); }
            const s0 = startOf(), local = c.from + (t - s0);
            if (local <= c.from + 0.1 || local >= c.to - 0.1) return toast('Place la tête de lecture à l’intérieur de l’élément choisi.', 'error');
            if (op === 'split') { const b2 = {...JSON.parse(JSON.stringify(c)), id: nid(sel.track[0]), from: local, tr: {type: 'none', d: 1}}; if (sel.track !== 'v1') b2.at = t; c.to = local; list.splice(i + 1, 0, b2); }
            if (op === 'start') { if (sel.track !== 'v1') c.at = t; c.from = local; }
            if (op === 'end') c.to = local;
            touch(1);
        });
        // enregistrer
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
                <p class="muted">Réglages de départ : Maintenance → Montage, retouche et son.</p></fieldset>`;
            ext.openDialog({eyebrow: 'ENREGISTRER LA VIDÉO', title: media.title || 'Montage', wide: true, submitLabel: 'Enregistrer',
                body: `<p class="h-cfg-explain">Le montage est rejoué pour être enregistré : cela prend <b>${fmt(T, false)}</b> (sa durée). Laisse la fenêtre ouverte.</p>` + saveOptionsHtml(media, types.map(([t, e2, label, help]) => ({key: t, label, help}))).replace('<fieldset class="h-rc-modes"><legend>Comment', exportHtml + '<fieldset class="h-rc-modes"><legend>Comment').replace('<input type="hidden" name="mode" value="new">', exportHtml + '<input type="hidden" name="mode" value="new">'),
                onOpen: d => d.querySelectorAll('[name=mode]').forEach(r => r.addEventListener('change', () => { const ct = d.querySelector('[data-avx-copytitle]'); if (ct) ct.hidden = d.querySelector('[name=mode]:checked')?.value !== 'copy'; })),
                onSubmit: async form => {
                    const f = Object.fromEntries(new FormData(form)), prog = form.querySelector('[data-avx-progress]'), type = types.find(x => x[0] === f.fmt) || types[0];
                    eng.destroy(); eng = null;
                    try {
                        const blob = await recordMontage(P, type[0], p => { prog.textContent = `Enregistrement… ${Math.round(p * 100)} %`; }, {height: Number(f.height) || 0, quality: Number(f.quality) || 5, fps: Number(f.fps) || 30, abr: Number(f.abr) || 128});
                        prog.textContent = `Envoi (${(blob.size / 1048576).toFixed(1)} Mo)…`;
                        await uploadResult(media, blob, type[1], {mode: f.mode === 'new' ? 'new' : f.mode === 'copy' ? 'copy' : 'version', show: f.mode === 'show', duration: T, note: f.note, title: f.title});
                    } catch (err) { await rebuild(); throw err; }
                    toast(f.mode === 'new' ? 'Montage enregistré : il est dans Listes → Vidéos.' : f.mode === 'copy' ? 'Nouvelle vidéo enregistrée, rattachée aux mêmes fiches.' : f.mode === 'show' ? 'Nouvelle version montrée partout. L’original est gardé.' : 'Version enregistrée (l’ancienne reste montrée).');
                    dirty = false; dl.close(); onDone?.();
                },
            });
        });
        dl.addEventListener('close', () => { eng?.destroy(); });
        if (ext.tbApply) ext.tbApply(dl, 'video');
        await rebuild();
        drawTl();
        if (start === 'add') $('[data-mt-op="addv1"]').click();
    }

    /** Point d'entrée : un média {id, filename, title, media_type}. */
    /* ═════════ Maintenance → Montage, retouche et son : disposition, enregistrement, boutons, plein écran ═════════ */
    ext.maintenance = ext.maintenance || {};
    const EDITORS = [['video', '🎬 Montage vidéo'], ['retouch', '🎚️ Retouche des photos'], ['audio', '🎧 Modifier le son']];
    ext.maintenance.montage_prefs = async token => {
        const st = S(), ws = A().$('#workspace');
        const lsJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (_) { return d; } };
        let which = st.montagePrefsEditor || 'video';
        ext.maintenance.montage_prefs.ac?.abort(); const ac = ext.maintenance.montage_prefs.ac = new AbortController();
        const draw = () => {
            if (token !== st.workspaceToken) return;
            const p = montagePrefs(), full = lsJson('genealogie-editor-full', {}), defs = (ext.tbDefs?.() || {})[which], cfg = lsJson('genealogie-toolbars', {})[which] || {};
            const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
            const groups = (defs?.groups || []).map(g => { const order = cfg.order?.[g.key] || [], hidden = cfg.hidden?.[g.key] || []; const items = [...order.map(k => g.items.find(i => i[0] === k)).filter(Boolean), ...g.items.filter(i => !order.includes(i[0]))];
                return `<section><h4>${esc(g.label)}</h4><ol class="h-pet-layout" data-g="${esc(g.key)}">${items.map(([k, l]) => `<li class="h-pet-lrow" data-k="${esc(k)}"><input type="checkbox" ${hidden.includes(k) ? '' : 'checked'} title="Montrer"><span>${esc(l)}</span><button type="button" class="h-bt" data-up title="Monter">↑</button><button type="button" class="h-bt" data-down title="Descendre">↓</button></li>`).join('')}</ol></section>`; }).join('');
            ws.innerHTML = `<section class="page h-mtp"><header class="page-header"><div><span class="eyebrow">MAINTENANCE</span><h2>Montage, retouche et son</h2><p>La disposition du montage vidéo, l’enregistrement des vidéos par défaut, les boutons et options de chaque éditeur (montrés, cachés, rangés) et le plein écran.</p></div>
                <div class="page-actions"><button type="button" class="button" data-mtp-save>Enregistrer</button></div></header>
                <div class="h-mtp-cols">
                <section class="maintenance-panel"><h3>🎬 Disposition du montage</h3>
                    <label class="h-avx-row">Panneau des réglages <select data-mtp="side">${opt([['right', 'à droite de l’image'], ['left', 'à gauche de l’image']], p.side)}</select></label>
                    <label class="h-avx-row">Hauteur de l’image <input type="range" min="25" max="80" value="${p.stage}" data-mtp="stage"><output>${p.stage} %</output></label>
                    <label class="h-avx-row">Hauteur des pistes <input type="range" min="28" max="70" value="${p.lane}" data-mtp="lane"><output>${p.lane} px</output></label>
                    <label class="checkbox-line"><input type="checkbox" data-mtp="help" ${p.help ? 'checked' : ''}> montrer l’aide sous la frise</label>
                    <h4>🎨 Couleur des blocs sur la frise</h4><div class="h-mtp-colors">${MT_COLORS.map(([k, l]) => `<label class="h-avx-row"><input type="color" data-mtp="${k}" value="${esc(p[k])}"> <span class="h-mtp-swatch" data-mtp-sw="${k}" style="background:${esc(p[k])};color:${inkOn(p[k])}">${esc(l)}</span></label>`).join('')}</div>
                    <button type="button" class="button small secondary" data-mtp-colreset>Couleurs de départ</button>
                    <h3>📤 Enregistrement des vidéos (par défaut)</h3>
                    <label class="h-avx-row">Format <select data-mtp="fmt">${opt([['mp4', 'MP4 (H.264) — lu partout'], ['webm', 'WebM — léger']], p.fmt)}</select></label>
                    <label class="h-avx-row">Taille <select data-mtp="height">${opt(MT_SIZES, p.height)}</select></label>
                    <label class="h-avx-row">Qualité <select data-mtp="quality">${opt(MT_QUALITY, p.quality)}</select></label>
                    <label class="h-avx-row">Images par seconde <select data-mtp="fps">${opt(MT_FPS.map(f => [f, f + ' images/s']), p.fps)}</select></label>
                    <label class="h-avx-row">Son <select data-mtp="abr">${opt([[96, '96 kb/s'], [128, '128 kb/s'], [192, '192 kb/s'], [256, '256 kb/s']], p.abr)}</select></label>
                    <p class="muted">On peut toujours les changer au moment d’enregistrer. MP4 seulement si l’ordinateur sait le faire, sinon WebM.</p>
                    <h3>⛶ Plein écran à l’ouverture</h3>${EDITORS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" data-mtp-full="${k}" ${full[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
                </section>
                <section class="maintenance-panel"><h3>🧰 Boutons et options</h3>
                    <label class="h-avx-row">Éditeur <select data-mtp-which>${opt(EDITORS, which)}</select></label>
                    <p class="muted">Coche ce qu’on montre, range avec ↑ ↓ (ou en glissant ⠿). C’est aussi dans chaque éditeur : « ⚙️ Personnaliser ».</p>
                    ${groups ? `<div class="h-tbcfg-body" data-mtp-groups>${groups}</div><button type="button" class="button small secondary" data-mtp-reset>Tout remettre comme au départ</button>` : `<p class="muted">Ouvre une fois ${which === 'video' ? 'le montage vidéo (Listes → Vidéos → « 🎬 Montage »)' : which === 'retouch' ? 'la retouche d’une photo (visionneuse → « Retoucher »)' : 'la modification d’un son (Listes → Audios → ✏️)'} : ses boutons apparaîtront ici.</p>`}
                </section></div></section>`;
        };
        draw();
        ws.addEventListener('input', e => { const el = e.target.closest('[data-mtp]'); if (el?.type === 'color') { const sw = ws.querySelector(`[data-mtp-sw="${el.dataset.mtp}"]`); if (sw) { sw.style.background = el.value; sw.style.color = inkOn(el.value); } return; } if (el?.type === 'range') el.nextElementSibling.textContent = el.value + (el.dataset.mtp === 'stage' ? ' %' : ' px'); }, {signal: ac.signal});
        ws.addEventListener('change', e => { if (e.target.matches('[data-mtp-which]')) { which = st.montagePrefsEditor = e.target.value; draw(); } }, {signal: ac.signal});
        ws.addEventListener('click', e => {
            const li = e.target.closest('li');
            if (e.target.closest('[data-up]') && li?.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
            if (e.target.closest('[data-down]') && li?.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
            if (e.target.closest('[data-mtp-colreset]')) { MT_COLORS.forEach(([k, , d]) => { const el = ws.querySelector(`[data-mtp="${k}"]`); if (el) { el.value = d; el.dispatchEvent(new Event('input', {bubbles: true})); } }); toast('Couleurs de départ remises (n’oublie pas « Enregistrer »).'); return; }
            if (e.target.closest('[data-mtp-reset]')) { const all = lsJson('genealogie-toolbars', {}); delete all[which]; try { localStorage.setItem('genealogie-toolbars', JSON.stringify(all)); } catch (_) {} toast('Boutons remis comme au départ.'); draw(); }
            if (e.target.closest('[data-mtp-save]')) {
                const v = {}; ws.querySelectorAll('[data-mtp]').forEach(el => { v[el.dataset.mtp] = el.type === 'checkbox' ? el.checked : el.value; });
                try { localStorage.setItem(MT_KEY, JSON.stringify(v)); } catch (_) {}
                const full = lsJson('genealogie-editor-full', {}); ws.querySelectorAll('[data-mtp-full]').forEach(el => { full[el.dataset.mtpFull] = el.checked; }); try { localStorage.setItem('genealogie-editor-full', JSON.stringify(full)); } catch (_) {}
                const box = ws.querySelector('[data-mtp-groups]');
                if (box) { const all = lsJson('genealogie-toolbars', {}), cfg = {order: {}, hidden: {}}; box.querySelectorAll('[data-g]').forEach(ol => { const lis = [...ol.children]; cfg.order[ol.dataset.g] = lis.map(l => l.dataset.k); cfg.hidden[ol.dataset.g] = lis.filter(l => !l.querySelector('input').checked).map(l => l.dataset.k); }); all[which] = cfg; try { localStorage.setItem('genealogie-toolbars', JSON.stringify(all)); } catch (_) {} }
                toast('Réglages du montage, de la retouche et du son enregistrés.'); draw();
            }
        }, {signal: ac.signal});
    };
    // Listes → Vidéos / Audios → « 🎬 Montage » : un montage fait de zéro, enregistré comme un nouveau média
    ext.openMontage = async (kind, onDone) => {
        if (kind === 'video') return openVideo({id: 0, title: 'Nouveau montage', media_type: 'video'}, onDone, 'add');
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
