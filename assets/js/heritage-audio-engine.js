/**
 * ⚙️ Moteur son commun (lot 1 du Studio son, maquette « Studio son » validée) : tout ce qui calcule le son, sans rien dessiner.
 * Servi à « 🎧 Modifier le son » et au 🎬 montage (heritage-studio-av.js), au « ⚡ Son rapide » (heritage-audio-quick.js)
 * et au « 🎚️ Studio son » (heritage-audio-studio.js). Tout se fait dans le navigateur (Web Audio, OfflineAudioContext, calculs JS) :
 * rien n'est envoyé ailleurs.
 *  - tampons : couper, coller, mélanger, niveau, crête, sonie (LUFS), crêtes de l'onde ;
 *  - FFT et STFT (spectre, réduction de bruit par empreinte, réparation au pinceau) ;
 *  - analyses : passage le plus calme (empreinte), fréquence du courant (50 / 60 Hz), silences du début et de la fin, blancs ;
 *  - effets (le rack, non destructif : une liste d'effets rejouée) : égaliseurs, compresseur, limiteur, réduction de bruit,
 *    De-clicker, De-hum, De-esser, réverbération, vitesse et hauteur, normaliser, volume égal, fondus à 4 courbes… ;
 *  - multipiste : mélange des pistes (volume, panoramique, courbes, muet / solo), baisse de la musique sous la voix ;
 *  - micro (getUserMedia + MediaRecorder) ; encodeurs MP3 (LAME), WAV, FLAC, Ogg Opus, AIFF, M4A (si le navigateur sait) ;
 *    étiquettes et chapitres (ID3), textes et repères (.txt, .srt, .vtt, .cue).
 * window.LCNDA_EXT.audioEngine ; window.LCNDA_EXT.audioEncoders (compatibilité).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    if (ext.audioEngine) return;
    const E = ext.audioEngine = {};
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const yieldUi = () => new Promise(r => setTimeout(r, 0));
    const dbToLin = db => 10 ** (db / 20), linToDb = v => 20 * Math.log10(Math.max(1e-12, v));
    E.dbToLin = dbToLin; E.linToDb = linToDb;

    /* ═════ Contexte, lecture d'un fichier ═════ */
    let AC = null;
    E.ctx = () => (AC && AC.state !== 'closed') ? AC : (AC = new (window.AudioContext || window.webkitAudioContext)());
    E.decode = async ab => E.ctx().decodeAudioData(ab);
    E.load = async src => { const r = await fetch(src); if (!r.ok) throw new Error('Fichier introuvable.'); return E.decode(await r.arrayBuffer()); };

    /* ═════ Tampons ═════ */
    const mkBuf = (len, ch, sr) => new AudioBuffer({length: Math.max(1, Math.round(len)), numberOfChannels: Math.max(1, ch), sampleRate: sr});
    function sliceBuf(b, i0, i1) { i0 = clamp(Math.round(i0), 0, b.length); i1 = clamp(Math.round(i1), i0, b.length); const out = mkBuf(i1 - i0, b.numberOfChannels, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(i0, Math.max(i0 + 1, i1)).slice(0, out.length), c); return out; }
    function concatBufs(list, ch, sr) {
        const len = list.reduce((s, b) => s + b.length, 0), out = mkBuf(len, ch, sr);
        for (let c = 0; c < ch; c++) { let off = 0; const d = out.getChannelData(c); for (const b of list) { d.set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), off); off += b.length; } }
        return out;
    }
    const cloneBuf = b => { const o = mkBuf(b.length, b.numberOfChannels, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) o.copyToChannel(b.getChannelData(c), c); return o; };
    /** Un tampon fait de tableaux (un par voie) */
    const fromArrays = (arrs, sr) => { const o = mkBuf(arrs[0].length, arrs.length, sr); arrs.forEach((a, c) => o.copyToChannel(a, c)); return o; };
    const chans = b => [...Array(b.numberOfChannels).keys()].map(c => b.getChannelData(c));
    /** Passe un tampon par une chaîne de nœuds Web Audio (rendu hors ligne, rapide). */
    async function through(b, build, {sr = b.sampleRate, ch = b.numberOfChannels, len = null} = {}) {
        const n = len ?? Math.ceil(b.duration * sr);
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const oc = new Off(ch, Math.max(1, n), sr);
        const src = oc.createBufferSource(); src.buffer = b;
        const last = build ? build(oc, src) : src;
        last.connect(oc.destination); src.start();
        return oc.startRendering();
    }
    const resample = (b, sr, ch) => b.sampleRate === sr && b.numberOfChannels === ch ? Promise.resolve(b) : through(b, null, {sr, ch});
    /** Niveau (RMS) par tranche de « hop » échantillons, toutes voies mêlées. */
    function frameRms(b, hop) {
        const n = Math.ceil(b.length / hop), out = new Float32Array(n), cs = chans(b);
        for (let f = 0; f < n; f++) { let s = 0, k = 0; const i1 = Math.min(b.length, (f + 1) * hop); for (let i = f * hop; i < i1; i++) for (const d of cs) { s += d[i] * d[i]; k++; } out[f] = Math.sqrt(s / Math.max(1, k)); }
        return out;
    }
    const percentile = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0; };
    function peakOf(b) { let m = 0; for (const d of chans(b)) for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } return m; }
    function scale(b, g) { for (const d of chans(b)) for (let i = 0; i < d.length; i++) d[i] *= g; return b; }
    function mono(b) { const out = new Float32Array(b.length), cs = chans(b); for (const d of cs) for (let i = 0; i < d.length; i++) out[i] += d[i] / cs.length; return out; }
    /** Réduction du souffle « porte » (l'ancien outil) : expandeur doux sous le niveau du bruit. */
    function gate(b, floorRms, strength = 0.85) {
        const hop = Math.round(b.sampleRate * 0.01), rms = frameRms(b, hop), thr = Math.max(1e-5, floorRms * 2.8), minG = 1 - strength;
        const target = rms.map(r => r >= thr ? 1 : Math.max(minG, (r / thr) ** 2));
        const g = new Float32Array(target.length); let cur = 1;
        for (let f = 0; f < g.length; f++) { const t = target[f]; cur += (t - cur) * (t > cur ? 0.6 : 0.12); g[f] = cur; }
        for (const d of chans(b)) for (let i = 0; i < d.length; i++) { const f = i / hop, f0 = Math.floor(f), f1 = Math.min(g.length - 1, f0 + 1); d[i] *= g[f0] + (g[f1] - g[f0]) * (f - f0); }
        return b;
    }
    /** Crêtes de l'onde (min et max par paquet de step échantillons, voies mêlées) */
    function peaks(b, step = 256) {
        const n = Math.ceil(b.length / step), mn = new Float32Array(n), mx = new Float32Array(n), cs = chans(b);
        for (let k = 0; k < n; k++) { let lo = 1, hi = -1; const i1 = Math.min(b.length, (k + 1) * step); for (let i = k * step; i < i1; i++) { let v = 0; for (const d of cs) v += d[i]; v /= cs.length; if (v < lo) lo = v; if (v > hi) hi = v; } mn[k] = lo; mx[k] = hi; }
        return {step, mn, mx};
    }
    Object.assign(E, {mkBuf, sliceBuf, concatBufs, cloneBuf, fromArrays, through, resample, frameRms, percentile, peakOf, scale, gate, peaks, mono, chans});

    /* ═════ FFT (en place, taille puissance de 2), STFT ═════ */
    const twCache = new Map();
    function twiddles(n) { let t = twCache.get(n); if (!t) { t = {c: new Float64Array(n / 2), s: new Float64Array(n / 2), rev: new Uint32Array(n)}; for (let k = 0; k < n / 2; k++) { t.c[k] = Math.cos(-2 * Math.PI * k / n); t.s[k] = Math.sin(-2 * Math.PI * k / n); } for (let i = 0, j = 0; i < n; i++) { t.rev[i] = j; let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; } twCache.set(n, t); } return t; }
    function fft(re, im) {
        const n = re.length, t = twiddles(n);
        for (let i = 0; i < n; i++) { const j = t.rev[i]; if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
        for (let len = 2; len <= n; len <<= 1) { const half = len >> 1, st = n / len;
            for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) { const p = i + k, q = p + half, wr = t.c[k * st], wi = t.s[k * st], tr = re[q] * wr - im[q] * wi, ti = re[q] * wi + im[q] * wr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; } }
    }
    function ifft(re, im) { const n = re.length; for (let i = 0; i < n; i++) im[i] = -im[i]; fft(re, im); for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; } }
    const hann = n => Float32Array.from({length: n}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
    /** STFT → traitement de chaque trame (bins 0..N/2, la moitié haute est refaite) → signal ; fn(frame, re, im, t) */
    async function stftProcess(x, {N = 2048, hop = N / 4, sr = 44100, onStep = null} = {}, fn) {
        const win = hann(N), y = new Float32Array(x.length), norm = new Float32Array(x.length), re = new Float64Array(N), im = new Float64Array(N);
        const nf = Math.ceil((x.length + N) / hop); let f = 0;
        for (let start = -N + hop; start < x.length; start += hop, f++) {
            for (let i = 0; i < N; i++) { const j = start + i; re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[i] = 0; }
            fft(re, im);
            fn(f, re, im, (start + N / 2) / sr);
            for (let k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
            ifft(re, im);
            for (let i = 0; i < N; i++) { const j = start + i; if (j >= 0 && j < x.length) { y[j] += re[i] * win[i]; norm[j] += win[i] * win[i]; } }
            if (f % 256 === 255) { onStep?.(f / nf); await yieldUi(); }
        }
        for (let i = 0; i < y.length; i++) y[i] = norm[i] > 1e-6 ? y[i] / norm[i] : 0;
        return y;
    }
    /** Spectre (dB) pour le dessin : {nf, bins, hop, N, sr, data (nf × bins, dB)} ; calcul par tranches (la page reste fluide) */
    async function spectrogram(b, {N = 1024, hop = 256, t0 = 0, t1 = null, onStep = null} = {}) {
        const sr = b.sampleRate, x = mono(b), i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(x.length, Math.ceil((t1 ?? b.duration) * sr));
        const win = hann(N), bins = N / 2, nf = Math.max(1, Math.floor((i1 - i0) / hop)), data = new Float32Array(nf * bins), re = new Float64Array(N), im = new Float64Array(N);
        for (let f = 0; f < nf; f++) {
            const s = i0 + f * hop - N / 2;
            for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[i] = 0; }
            fft(re, im);
            for (let k = 0; k < bins; k++) data[f * bins + k] = 10 * Math.log10(1e-12 + (re[k] * re[k] + im[k] * im[k]) / (N * N / 4));
            if (f % 400 === 399) { onStep?.(f / nf); await yieldUi(); }
        }
        return {nf, bins, hop, N, sr, t0: i0 / sr, data};
    }
    /** Le même spectre calculé en tâche de fond (Worker) : la page reste fluide pendant le calcul ; sans Worker, sur place */
    let specWorker = null, specSeq = 0; const specWait = new Map();
    const SPEC_WORKER = `self.onmessage = e => { const {id, x, N, hop, nf} = e.data, bins = N / 2, data = new Float32Array(nf * bins), re = new Float64Array(N), im = new Float64Array(N), win = new Float64Array(N), rev = new Uint32Array(N);
        for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
        for (let i = 0, j = 0; i < N; i++) { rev[i] = j; let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; }
        for (let f = 0; f < nf; f++) { const s0 = f * hop - N / 2; for (let i = 0; i < N; i++) { const j = s0 + i; re[rev[i]] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[i] = 0; }
            for (let len = 2; len <= N; len <<= 1) { const h = len >> 1, a = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < h; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), p = i + k, q = p + h, tr = re[q] * wr - im[q] * wi, ti = re[q] * wi + im[q] * wr; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; } }
            for (let k = 0; k < bins; k++) data[f * bins + k] = 10 * Math.log10(1e-12 + (re[k] * re[k] + im[k] * im[k]) / (N * N / 4)); }
        self.postMessage({id, data}, [data.buffer]); };`;
    async function spectrogramBg(b, {N = 1024, hop = 256, t0 = 0, t1 = null} = {}) {
        try {
            if (!window.Worker) throw new Error('pas de Worker');
            if (!specWorker) { specWorker = new Worker(URL.createObjectURL(new Blob([SPEC_WORKER], {type: 'application/javascript'}))); specWorker.onmessage = e => { const w = specWait.get(e.data.id); if (w) { specWait.delete(e.data.id); w(e.data.data); } }; }
            const sr = b.sampleRate, full = mono(b), i0 = Math.max(0, Math.floor(t0 * sr)), i1 = Math.min(full.length, Math.ceil((t1 ?? b.duration) * sr)), x = full.slice(i0, i1), nf = Math.max(1, Math.floor((i1 - i0) / hop)), id = ++specSeq;
            const data = await new Promise((ok, ko) => { specWait.set(id, ok); setTimeout(() => { if (specWait.delete(id)) ko(new Error('trop long')); }, 20000); specWorker.postMessage({id, x, N, hop, nf}, [x.buffer]); });
            return {nf, bins: N / 2, hop, N, sr, t0: i0 / sr, data};
        } catch (_) { return spectrogram(b, {N, hop, t0, t1}); }
    }
    /** Énergie (dB) dans une bande de fréquences entre deux temps (pour les tests et l'aperçu) */
    function bandEnergy(b, f0, f1, {t0 = 0, t1 = null, N = 2048} = {}) {
        const sr = b.sampleRate, x = mono(b), i0 = Math.floor(t0 * sr), i1 = Math.min(x.length, Math.ceil((t1 ?? b.duration) * sr)), win = hann(N), re = new Float64Array(N), im = new Float64Array(N);
        const k0 = Math.max(0, Math.floor(f0 / sr * N)), k1 = Math.min(N / 2, Math.ceil(f1 / sr * N)); let s = 0, n = 0;
        for (let st = i0; st + N <= i1 || (n === 0 && st < i1); st += N / 2) { for (let i = 0; i < N; i++) { const j = st + i; re[i] = j < x.length ? x[j] * win[i] : 0; im[i] = 0; } fft(re, im); for (let k = k0; k <= k1; k++) s += re[k] * re[k] + im[k] * im[k]; n++; }
        return 10 * Math.log10(1e-20 + s / Math.max(1, n));
    }
    /** Fréquence la plus forte (Hz) entre deux temps */
    function dominantFreq(b, {t0 = 0, t1 = null, N = 8192, fmin = 20} = {}) {
        const sr = b.sampleRate, x = mono(b), i0 = Math.floor(t0 * sr), win = hann(N), re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) { const j = i0 + i; re[i] = j < x.length && (t1 === null || j < t1 * sr) ? x[j] * win[i] : 0; im[i] = 0; }
        fft(re, im); let bk = 0, bv = -1; for (let k = Math.ceil(fmin / sr * N); k < N / 2; k++) { const v = re[k] * re[k] + im[k] * im[k]; if (v > bv) { bv = v; bk = k; } }
        // affinage parabolique
        const m = k => Math.hypot(re[k], im[k]), a = m(bk - 1), c = m(bk + 1), bb = m(bk), d = a - 2 * bb + c, p = d ? 0.5 * (a - c) / d : 0;
        return (bk + p) * sr / N;
    }
    Object.assign(E, {fft, ifft, hann, stftProcess, spectrogram, spectrogramBg, bandEnergy, dominantFreq});

    /* ═════ Analyses ═════ */
    /** Sonie intégrée (LUFS, BS.1770 : filtre K, blocs de 400 ms, portes absolue et relative) */
    async function lufs(b) {
        if (b.length < b.sampleRate * 0.4) { const r = Math.sqrt(frameRms(b, b.length)[0] ** 2); return -0.691 + 10 * Math.log10(1e-12 + r * r); }
        const k = await through(b, (oc, s) => { const sh = oc.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1681; sh.gain.value = 4; const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5; s.connect(sh).connect(hp); return hp; });
        const sr = k.sampleRate, blk = Math.round(sr * 0.4), step = Math.round(blk / 4), cs = chans(k), z = [];
        for (let s = 0; s + blk <= k.length; s += step) { let e = 0; for (const d of cs) { let q = 0; for (let i = s; i < s + blk; i++) q += d[i] * d[i]; e += q / blk; } z.push(e); }
        const L = e => -0.691 + 10 * Math.log10(1e-12 + e);
        let g = z.filter(e => L(e) > -70); if (!g.length) return -70;
        const rel = L(g.reduce((a, e) => a + e, 0) / g.length) - 10; g = g.filter(e => L(e) > rel);
        return g.length ? L(g.reduce((a, e) => a + e, 0) / g.length) : -70;
    }
    /** Le passage le plus calme (empreinte du bruit) : {a, b} en secondes, de len secondes */
    function quietest(b, len = 0.6) {
        const hop = Math.round(b.sampleRate * 0.02), rms = frameRms(b, hop), w = Math.max(1, Math.round(len * b.sampleRate / hop)); let best = 0, bv = Infinity, s = 0;
        // on évite le tout début et la toute fin (bruit du bouton, silence numérique)
        const lo = Math.min(rms.length - w, Math.round(0.3 * b.sampleRate / hop)), hi = Math.max(lo + 1, rms.length - w - Math.round(0.3 * b.sampleRate / hop));
        for (let i = 0; i < w && i < rms.length; i++) s += rms[i];
        for (let i = 0; i + w <= rms.length; i++) { if (i) s += rms[i + w - 1] - rms[i - 1]; if (i >= lo && i <= hi && s > 1e-7 * w && s < bv) { bv = s; best = i; } }
        if (!Number.isFinite(bv)) best = 0;
        return {a: best * hop / b.sampleRate, b: Math.min(b.duration, (best + w) * hop / b.sampleRate)};
    }
    /** Puissance à une fréquence (Goertzel) sur x */
    function goertzel(x, sr, f) { const w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } return (s1 * s1 + s2 * s2 - c * s1 * s2) / (x.length * x.length); }
    /** Le bourdonnement du courant : 50, 60 ou 0 (rien trouvé) — fondamentale et deux harmoniques, comparées à leurs voisines */
    function detectHum(b) {
        const sr = b.sampleRate, x = mono(b).subarray(0, Math.min(b.length, sr * 20));
        const score = f => { let s = 0, n = 0; for (const h of [1, 2, 3]) { const on = goertzel(x, sr, f * h), off = (goertzel(x, sr, f * h - 7) + goertzel(x, sr, f * h + 7)) / 2; s += 10 * Math.log10((on + 1e-20) / (off + 1e-20)); n++; } return s / n; };
        const s50 = score(50), s60 = score(60);
        if (Math.max(s50, s60) < 6) return 0;
        return s50 >= s60 ? 50 : 60;
    }
    /** Silences du début et de la fin : {a, b} = ce qu'on garde (secondes) */
    function edgeSilences(b, {thrDb = null} = {}) {
        const hop = Math.round(b.sampleRate * 0.02), rms = frameRms(b, hop), floor = percentile(rms, 0.1), loud = percentile(rms, 0.95);
        const thr = thrDb !== null ? dbToLin(thrDb) : Math.max(1e-4, floor + (loud - floor) * 0.12);
        let i = 0; while (i < rms.length && rms[i] < thr) i++;
        let j = rms.length - 1; while (j > i && rms[j] < thr) j--;
        const pad = Math.round(0.25 * b.sampleRate / hop);
        return {a: Math.max(0, (i - pad) * hop / b.sampleRate), b: Math.min(b.duration, (j + 1 + pad) * hop / b.sampleRate)};
    }
    /** Les blancs plus longs que minS : [{a, b}] (secondes) */
    function silenceRuns(b, minS = 2) {
        const sr = b.sampleRate, hop = Math.round(sr * 0.02), rms = frameRms(b, hop), loud = percentile(rms, 0.95), floor = percentile(rms, 0.1), thr = Math.max(1e-4, Math.min(floor * 3, floor + (loud - floor) * 0.08)), out = [];
        let from = -1;
        for (let f = 0; f <= rms.length; f++) { const q = f < rms.length && rms[f] < thr; if (q && from < 0) from = f; if (!q && from >= 0) { const a = from * hop / sr, z = Math.min(b.duration, f * hop / sr); if (z - a > minS) out.push({a, b: z}); from = -1; } }
        return out;
    }
    Object.assign(E, {lufs, quietest, detectHum, edgeSilences, silenceRuns, goertzel});

    /* ═════ Effets : chaque effet prend un tampon et rend un tampon (non destructif : la liste est rejouée) ═════ */
    const biq = (oc, type, f, gain = 0, q = 0.9) => { const n = oc.createBiquadFilter(); n.type = type; n.frequency.value = clamp(f, 10, oc.sampleRate / 2 - 10); n.gain.value = gain; n.Q.value = q; return n; };
    /** chaîne de filtres (rendu hors ligne) */
    const filterChain = (b, list) => list.length ? through(b, (oc, s) => { let last = s; list.forEach(([t, f, g, q]) => { const n = biq(oc, t, f, g, q); last.connect(n); last = n; }); return last; }) : Promise.resolve(cloneBuf(b));
    const EQG_F = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const EQG_PRESETS = {voix: [-6, -4, -2, 0, 1, 3, 4, 3, 1, -1], radio: [-12, -10, -6, 0, 3, 4, 2, -4, -10, -12], telephone: [-12, -12, -12, -6, 3, 6, 4, -6, -12, -12]};
    /** Courbes des fondus : u de 0 à 1 → gain */
    const FADE = {lin: u => u, fast: u => Math.sqrt(u), slow: u => u * u, s: u => u * u * (3 - 2 * u)};
    E.FADE = FADE;
    /** Limiteur à anticipation : la crête ne dépasse jamais le plafond */
    function limitArrays(cs, sr, ceilDb = -1, relMs = 50) {
        const ceil = dbToLin(ceilDb), n = cs[0].length, la = Math.max(1, Math.round(sr * 0.005)), need = new Float32Array(n);
        for (let i = 0; i < n; i++) { let m = 0; for (const d of cs) { const v = Math.abs(d[i]); if (v > m) m = v; } need[i] = m > ceil ? ceil / m : 1; }
        // minimum glissant sur la fenêtre d'anticipation (file monotone)
        const minf = new Float32Array(n), q = new Int32Array(n + la + 1); let h = 0, tl = 0;
        for (let i = 0; i < n + la; i++) {
            if (i < n) { while (tl > h && need[q[tl - 1]] >= need[i]) tl--; q[tl++] = i; }
            const o = i - la; if (o >= 0) { while (q[h] < o - la) h++; minf[o] = need[q[h]]; }
        }
        const rel = Math.exp(-1 / Math.max(1, sr * relMs / 1000)); let g = 1;
        for (let i = 0; i < n; i++) { const t = minf[i]; g = t < g ? t : t + (g - t) * rel; for (const d of cs) { let v = d[i] * g; if (v > ceil) v = ceil; else if (v < -ceil) v = -ceil; d[i] = v; } }
    }
    /** De-clicker : un clic est un écart soudain à la prédiction ; on le remplace par une courbe tirée de ses voisins */
    function declickArray(d, sens = 50) {
        const n = d.length, e = new Float32Array(n), thr = 16 - clamp(sens, 0, 100) / 100 * 12; // 16 (peu) → 4 (beaucoup)
        for (let i = 2; i < n; i++) e[i] = Math.abs(d[i] - (2 * d[i - 1] - d[i - 2]));
        const W = 512, cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + e[i];
        let fixed = 0;
        for (let i = 2; i < n - 2; i++) {
            const a = Math.max(0, i - W), b = Math.min(n, i + W), mean = (cs[b] - cs[a]) / (b - a);
            if (e[i] > thr * Math.max(mean, 1e-5) && e[i] > 0.02) {
                let j = i; while (j < n - 2 && j - i < 48) { const a2 = Math.max(0, j - W), b2 = Math.min(n, j + W), m2 = (cs[b2] - cs[a2]) / (b2 - a2); if (!(e[j + 1] > thr * 0.5 * Math.max(m2, 1e-5) || e[j + 2] > thr * 0.5 * Math.max(m2, 1e-5))) break; j++; }
                const s = Math.max(1, i - 3), z = Math.min(n - 2, j + 3), y0 = d[s - 1], y1 = d[s], y2 = d[z], y3 = d[z + 1], m0 = y1 - y0, m1 = y3 - y2, L = z - s;
                for (let k = s + 1; k < z; k++) { const t = (k - s) / L, t2 = t * t, t3 = t2 * t; d[k] = (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m0 * L + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m1 * L; }
                for (let k = s; k <= z + 2 && k < n; k++) e[k] = Math.abs(d[k] - (2 * d[k - 1] - d[k - 2]));
                fixed++; i = z;
            }
        }
        return fixed;
    }
    /** Réverbération : réponse calculée (bruit qui s'éteint), la même à chaque fois */
    const ROOMS = {piece: {dur: 0.6, pre: 0.008, lp: 7000}, eglise: {dur: 3.2, pre: 0.03, lp: 5000}, salle: {dur: 1.8, pre: 0.02, lp: 6500}, cave: {dur: 1.1, pre: 0.004, lp: 3500}};
    function impulse(sr, ch, dur, pre, seed = 7) {
        const n = Math.max(1, Math.round(sr * (dur + pre))), b = mkBuf(n, ch, sr); let s = seed >>> 0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
        for (let c = 0; c < ch; c++) { const d = b.getChannelData(c), p = Math.round(sr * pre); for (let i = p; i < n; i++) { const t = (i - p) / sr; d[i] = rnd() * Math.exp(-6.9 * t / dur); } }
        return b;
    }
    /** Étirement du temps sans changer la hauteur (WSOLA) : factor > 1 = plus long */
    function stretchArray(x, sr, factor) {
        if (Math.abs(factor - 1) < 1e-3) return Float32Array.from(x);
        const W = Math.round(sr * 0.04), Ha = Math.round(W / 2), tol = Math.round(sr * 0.01), win = hann(W), outLen = Math.round(x.length * factor), y = new Float32Array(outLen + W), nrm = new Float32Array(outLen + W);
        const Hs = Ha; let prevEnd = 0; // fin naturelle du dernier morceau pris
        for (let o = 0, k = 0; o < outLen; o += Hs, k++) {
            const ideal = Math.round(o / factor); let best = ideal;
            if (k > 0) { let bv = -Infinity; for (let dlt = -tol; dlt <= tol; dlt += 2) { const p = ideal + dlt; if (p < 0 || p + W > x.length) continue; let c = 0; for (let i = 0; i < W / 2; i += 2) c += x[p + i] * x[prevEnd + i < x.length ? prevEnd + i : x.length - 1]; if (c > bv) { bv = c; best = p; } } }
            for (let i = 0; i < W; i++) { const j = best + i; const v = j >= 0 && j < x.length ? x[j] : 0; y[o + i] += v * win[i]; nrm[o + i] += win[i]; }
            prevEnd = best + Hs;
        }
        const out = new Float32Array(outLen); for (let i = 0; i < outLen; i++) out[i] = nrm[i] > 1e-3 ? y[i] / nrm[i] : 0;
        return out;
    }
    /** Changer la vitesse d'un tampon comme une bande (la hauteur suit) : rate > 1 = plus vite */
    const rateChange = (b, rate) => through(b, (oc, s) => { s.playbackRate.value = rate; return s; }, {len: Math.max(1, Math.ceil(b.length / rate))});
    /** Réparation au pinceau : chaque zone peinte {t0, t1, f0, f1} est remplacée par ce qui l'entoure dans le temps (spectre interpolé) */
    async function repairArray(x, sr, masks, onStep) {
        const N = 1024, hop = 256, bins = N / 2 + 1;
        // 1. le spectre de tout le son (amplitudes), 2. les cases peintes, 3. on refait chaque trame touchée
        const nf = Math.ceil((x.length + N) / hop), mag = new Float32Array(nf * bins), win = hann(N), re = new Float64Array(N), im = new Float64Array(N);
        let f = 0;
        for (let start = -N + hop; start < x.length; start += hop, f++) { for (let i = 0; i < N; i++) { const j = start + i; re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[i] = 0; } fft(re, im); for (let k = 0; k < bins; k++) mag[f * bins + k] = Math.hypot(re[k], im[k]); if (f % 512 === 511) await yieldUi(); }
        const hit = new Uint8Array(nf * bins), tOf = fr => (-N + hop + fr * hop + N / 2) / sr;
        masks.forEach(m => { const fa = Math.max(0, Math.floor((m.t0 * sr + N / 2 - hop) / hop)), fb = Math.min(nf - 1, Math.ceil((m.t1 * sr + N / 2) / hop)), ka = clamp(Math.floor(m.f0 / sr * N), 0, bins - 1), kb = clamp(Math.ceil(m.f1 / sr * N), 0, bins - 1);
            for (let q = fa; q <= fb; q++) { const t = tOf(q); if (t < m.t0 - 0.02 || t > m.t1 + 0.02) continue; for (let k = ka; k <= kb; k++) hit[q * bins + k] = 1; } });
        const span = Math.round(sr * 2 / hop);
        return stftProcess(x, {N, hop, sr, onStep}, (fr, R, I) => {
            if (fr >= nf) return;
            for (let k = 0; k < bins; k++) {
                if (!hit[fr * bins + k]) continue;
                let l = fr - 1; while (l >= 0 && fr - l < span && hit[l * bins + k]) l--;
                let r = fr + 1; while (r < nf && r - fr < span && hit[r * bins + k]) r++;
                const okL = l >= 0 && !hit[l * bins + k], okR = r < nf && !hit[r * bins + k];
                const cur = Math.hypot(R[k], I[k]) || 1e-12;
                let target;
                if (okL && okR) { const u = (fr - l) / (r - l), a = Math.log(mag[l * bins + k] + 1e-9), b = Math.log(mag[r * bins + k] + 1e-9); target = Math.exp(a + (b - a) * u); }
                else if (okL) target = mag[l * bins + k]; else if (okR) target = mag[r * bins + k]; else target = cur * 0.03;
                const g = Math.min(1, target / cur); R[k] *= g; I[k] *= g;
            }
        });
    }
    /** Réduction de bruit par empreinte (soustraction spectrale douce) */
    async function denoiseArray(x, sr, noise, {reduction = 70, atten = 18, smooth = 50, removed = false} = {}, onStep) {
        const N = 2048, hop = 512, bins = N / 2 + 1, prof = new Float64Array(bins);
        { const win = hann(N), re = new Float64Array(N), im = new Float64Array(N); let n = 0;
          for (let s = 0; s + N <= noise.length || (n === 0 && s < noise.length); s += hop) { for (let i = 0; i < N; i++) { re[i] = s + i < noise.length ? noise[s + i] * win[i] : 0; im[i] = 0; } fft(re, im); for (let k = 0; k < bins; k++) prof[k] += Math.hypot(re[k], im[k]); n++; }
          for (let k = 0; k < bins; k++) prof[k] /= Math.max(1, n); }
        const over = 1 + clamp(reduction, 0, 100) / 100 * 2.5, floor = dbToLin(-clamp(atten, 0, 60)), a = clamp(smooth, 0, 100) / 100 * 0.85, prevG = new Float64Array(bins).fill(1), g = new Float64Array(bins);
        const y = await stftProcess(x, {N, hop, sr, onStep}, (fr, R, I) => {
            for (let k = 0; k < bins; k++) { const m = Math.hypot(R[k], I[k]), v = Math.max(floor, 1 - over * prof[k] / Math.max(m, 1e-12)); g[k] = a * prevG[k] + (1 - a) * v; }
            for (let k = 0; k < bins; k++) { const s = (g[Math.max(0, k - 1)] + g[k] * 2 + g[Math.min(bins - 1, k + 1)]) / 4; prevG[k] = g[k]; R[k] *= s; I[k] *= s; }
        });
        if (removed) for (let i = 0; i < y.length; i++) y[i] = x[i] - y[i];
        return y;
    }
    /** De-esser : on baisse les aigus seulement quand les « s » sifflent */
    async function deessBuf(b, {freq = 6500, thr = -30, amount = 8} = {}) {
        // passe-haut sans déphasage (aller puis retour) : on peut le retrancher du son sans creuser ni gonfler les aigus
        const hpOnce = x => through(x, (oc, s) => { const h1 = biq(oc, 'highpass', freq * 0.8, 0, 0.7); s.connect(h1); return h1; });
        const rev = x => { const o = cloneBuf(x); chans(o).forEach(d => d.reverse()); return o; };
        const hp = rev(await hpOnce(rev(await hpOnce(b))));
        const sr = b.sampleRate, out = cloneBuf(b), hs = chans(hp), os = chans(out), at = Math.exp(-1 / (sr * 0.001)), rl = Math.exp(-1 / (sr * 0.06)), T = dbToLin(thr), minG = dbToLin(-Math.abs(amount));
        let env = 0, g = 1;
        for (let i = 0; i < out.length; i++) {
            let v = 0; for (const d of hs) v = Math.max(v, Math.abs(d[i])); env = v > env ? v + (env - v) * at : v + (env - v) * rl;
            const tg = env > T ? Math.max(minG, T / env) : 1; g = tg < g ? tg + (g - tg) * at : tg + (g - tg) * rl;
            if (g < 0.9999) for (let c = 0; c < os.length; c++) os[c][i] -= hs[c][i] * (1 - g);
        }
        return out;
    }
    /** Volume égal : on amène la sonie vers la cible, avec un niveleur doux (les voix lointaines remontent, les cris baissent) */
    async function levelBuf(b, {target = -16, leveler = 60} = {}) {
        const sr = b.sampleRate, hop = Math.round(sr * 0.05), rms = frameRms(b, hop), loud = percentile(rms, 0.9), floor = percentile(rms, 0.15);
        const out = cloneBuf(b), cs = chans(out), amt = clamp(leveler, 0, 100) / 100;
        if (amt > 0 && loud > 1e-4) {
            // gain par tranche : on rapproche chaque passage parlé du niveau des passages forts (sans remonter le bruit)
            const gate = Math.max(floor * 2.5, loud * 0.05), ref = percentile(rms.filter(r => r > gate), 0.6) || loud, gains = new Float32Array(rms.length);
            const sm = new Float32Array(rms.length); { const R = 8; for (let i = 0; i < rms.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - R); j <= Math.min(rms.length - 1, i + R); j++) { s += rms[j]; n++; } sm[i] = s / n; } }
            for (let i = 0; i < rms.length; i++) { const r = sm[i]; gains[i] = r > gate ? clamp((ref / r) ** amt, dbToLin(-12), dbToLin(12)) : 1; }
            let g = gains[0]; for (let i = 0; i < out.length; i++) { const f = Math.min(gains.length - 1, Math.floor(i / hop)); g += (gains[f] - g) * 0.0006; for (const d of cs) d[i] *= g; }
        }
        const L = await lufs(out); scale(out, dbToLin(clamp(target - L, -30, 30)));
        limitArrays(cs, sr, -1, 60);
        return out;
    }

    /** Les effets du rack. Chaque paramètre : [clé, libellé, min, max, pas, unité, départ]. lengthChange : l'effet change la durée. */
    const P = (k, label, min, max, step, unit, def) => ({k, label, min, max, step, unit, def});
    const FX = {
        gain: {icon: '🔊', label: 'Volume', group: 'Volume', params: [P('db', 'Volume', -24, 24, 0.5, 'dB', 0)], render: async (b, p) => scale(cloneBuf(b), dbToLin(num(p.db, 0)))},
        normalize: {icon: '📏', label: 'Normaliser', group: 'Volume', params: [P('peak', 'Crête', -12, 0, 0.1, 'dB', -1)], render: async (b, p) => { const o = cloneBuf(b), pk = peakOf(o); return pk > 0 ? scale(o, dbToLin(num(p.peak, -1)) / pk) : o; }},
        loudness: {icon: '📏', label: 'Volume égal', group: 'Volume', params: [P('target', 'Sonie visée', -30, -8, 0.5, 'LUFS', -16), P('leveler', 'Niveleur', 0, 100, 1, '%', 60)], render: (b, p) => levelBuf(b, {target: num(p.target, -16), leveler: num(p.leveler, 60)})},
        fade: {icon: '↗', label: 'Fondus', group: 'Volume', params: [P('in', 'Fondu d’entrée', 0, 30, 0.1, 's', 2), P('out', 'Fondu de sortie', 0, 30, 0.1, 's', 2)], choices: {shapeIn: ['lin', 'fast', 'slow', 's'], shapeOut: ['lin', 'fast', 'slow', 's']},
            render: async (b, p) => { const o = cloneBuf(b), sr = o.sampleRate, ni = Math.min(o.length, Math.round(num(p.in, 0) * sr)), no = Math.min(o.length, Math.round(num(p.out, 0) * sr)), fi = FADE[p.shapeIn] || FADE.lin, fo = FADE[p.shapeOut] || FADE.lin;
                for (const d of chans(o)) { for (let i = 0; i < ni; i++) d[i] *= fi(i / ni); for (let i = 0; i < no; i++) d[o.length - 1 - i] *= fo(i / no); } return o; }},
        eqg: {icon: '📊', label: 'Égaliseur graphique', group: 'Égaliseurs', params: EQG_F.map((f, i) => P('g' + i, f >= 1000 ? `${f / 1000}k` : String(f), -12, 12, 0.5, 'dB', 0)), freqs: EQG_F, presets: EQG_PRESETS,
            render: (b, p) => filterChain(b, EQG_F.map((f, i) => [i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking', f, clamp(num(p['g' + i], 0), -12, 12), 1.4]).filter(x => Math.abs(x[2]) > 0.01))},
        eqp: {icon: '📈', label: 'Égaliseur paramétrique', group: 'Égaliseurs', params: [], bandsDef: [{type: 'lowshelf', f: 120, g: 0, q: 0.7}, {type: 'peaking', f: 3000, g: 4, q: 0.9}, {type: 'highshelf', f: 8000, g: 0, q: 0.7}],
            render: (b, p) => filterChain(b, (Array.isArray(p.bands) ? p.bands : []).slice(0, 8).map(x => [['lowshelf', 'highshelf', 'peaking', 'highpass', 'lowpass', 'notch'].includes(x.type) ? x.type : 'peaking', clamp(num(x.f, 1000), 20, 20000), clamp(num(x.g, 0), -24, 24), clamp(num(x.q, 0.9), 0.1, 30)]))},
        filter: {icon: '🎛️', label: 'Filtre passe-haut / passe-bas', group: 'Égaliseurs', params: [P('hp', 'Passe-haut', 0, 1000, 5, 'Hz', 80), P('lp', 'Passe-bas', 1000, 20000, 100, 'Hz', 20000)],
            render: (b, p) => filterChain(b, [num(p.hp, 0) > 0 && ['highpass', num(p.hp, 80), 0, 0.7], num(p.lp, 20000) < 19900 && ['lowpass', num(p.lp, 20000), 0, 0.7]].filter(Boolean))},
        comp: {icon: '🗜', label: 'Compresseur', group: 'Dynamique', params: [P('thr', 'Seuil', -60, 0, 1, 'dB', -24), P('ratio', 'Rapport', 1, 20, 0.5, ':1', 3), P('attack', 'Attaque', 0, 200, 1, 'ms', 10), P('release', 'Relâche', 10, 1000, 10, 'ms', 200), P('makeup', 'Gain de sortie', 0, 24, 0.5, 'dB', 0)],
            render: async (b, p) => { const o = await through(b, (oc, s) => { const c = oc.createDynamicsCompressor(); c.threshold.value = clamp(num(p.thr, -24), -100, 0); c.ratio.value = clamp(num(p.ratio, 3), 1, 20); c.attack.value = clamp(num(p.attack, 10), 0, 1000) / 1000; c.release.value = clamp(num(p.release, 200), 10, 1000) / 1000; c.knee.value = 6; s.connect(c); return c; }); return num(p.makeup, 0) ? scale(o, dbToLin(num(p.makeup, 0))) : o; }},
        limit: {icon: '🧱', label: 'Limiteur', group: 'Dynamique', params: [P('ceil', 'Plafond', -12, 0, 0.1, 'dB', -1), P('release', 'Relâche', 5, 500, 5, 'ms', 50)], help: 'Placé en dernier dans le rack : plus jamais de son qui « crache ».',
            render: async (b, p) => { const o = cloneBuf(b); limitArrays(chans(o), o.sampleRate, num(p.ceil, -1), num(p.release, 50)); return o; }},
        denoise: {icon: '🧹', label: 'Réduction de bruit', group: 'Réparer', params: [P('reduction', 'Réduction', 0, 100, 1, '%', 70), P('atten', 'Atténuer de', 0, 40, 1, 'dB', 18), P('smooth', 'Lissage', 0, 100, 1, '%', 50)], bools: {removed: 'N’écouter que le bruit enlevé'},
            render: async (b, p, ctx) => { const pr = p.print && Number.isFinite(p.print.a) ? p.print : quietest(ctx?.source || b), src = ctx?.source || b, sr = b.sampleRate, i0 = Math.floor(pr.a * src.sampleRate), i1 = Math.max(i0 + 2048, Math.ceil(pr.b * src.sampleRate));
                const o = cloneBuf(b), nz = chans(src);
                for (let c = 0; c < o.numberOfChannels; c++) { const y = await denoiseArray(o.getChannelData(c), sr, nz[Math.min(c, nz.length - 1)].subarray(i0, Math.min(nz[0].length, i1)), {reduction: num(p.reduction, 70), atten: num(p.atten, 18), smooth: num(p.smooth, 50), removed: !!p.removed}, ctx?.onStep); o.copyToChannel(y, c); }
                return o; }},
        declick: {icon: '✨', label: 'De-clicker', group: 'Réparer', params: [P('amount', 'Clics', 0, 100, 1, '%', 50)], render: async (b, p) => { const o = cloneBuf(b); chans(o).forEach(d => declickArray(d, num(p.amount, 50))); return o; }},
        dehum: {icon: '〰️', label: 'De-hum', group: 'Réparer', params: [P('harm', 'Harmoniques', 1, 10, 1, 'harm.', 5)], choices: {freq: ['auto', '50', '60']},
            render: async (b, p) => { let f = p.freq === '60' ? 60 : p.freq === '50' ? 50 : detectHum(b) || 50; const n = clamp(Math.round(num(p.harm, 5)), 1, 10); return filterChain(b, [...Array(n).keys()].map(h => ['notch', f * (h + 1), 0, 30 + h * 4])); }},
        deess: {icon: '🐍', label: 'De-esser', group: 'Réparer', params: [P('freq', 'Sifflantes', 3000, 12000, 100, 'Hz', 6500), P('thr', 'Seuil', -60, 0, 1, 'dB', -30), P('amount', 'Baisser jusqu’à', 0, 24, 1, 'dB', 8)], render: (b, p) => deessBuf(b, {freq: num(p.freq, 6500), thr: num(p.thr, -30), amount: num(p.amount, 8)})},
        repair: {icon: '🩹', label: 'Réparations au pinceau', group: 'Réparer', params: [], hidden: true,
            render: async (b, p, ctx) => { const m = (Array.isArray(p.masks) ? p.masks : []).filter(x => x && x.t1 > x.t0 && x.f1 > x.f0); if (!m.length) return cloneBuf(b); const o = cloneBuf(b); for (let c = 0; c < o.numberOfChannels; c++) o.copyToChannel(await repairArray(o.getChannelData(c), o.sampleRate, m, ctx?.onStep), c); return o; }},
        voice: {icon: '🗣️', label: 'Voix plus claire', group: 'Voix', params: [P('force', 'Force', 1, 3, 1, '', 2)], help: 'Égaliseur (moins de grondement, plus de présence) et compresseur.',
            render: async (b, p) => { const f = clamp(Math.round(num(p.force, 2)), 1, 3), o = await through(b, (oc, s) => { const hp = biq(oc, 'highpass', [80, 90, 110][f - 1], 0, 0.7), pr = biq(oc, 'peaking', 3000, [3, 4, 6][f - 1], 0.9), c = oc.createDynamicsCompressor(); c.threshold.value = [-20, -24, -28][f - 1]; c.ratio.value = [2.5, 3, 4][f - 1]; c.attack.value = 0.01; c.release.value = 0.2; s.connect(hp).connect(pr).connect(c); return c; }); const pk = peakOf(o); return pk > 0 ? scale(o, 0.89 / pk) : o; }},
        reverb: {icon: '⛪', label: 'Réverbération', group: 'Ambiance', params: [P('mix', 'Quantité', 0, 100, 1, '%', 20), P('dur', 'Durée', 0.1, 6, 0.1, 's', 1.2)], choices: {room: ['piece', 'eglise', 'salle', 'cave']},
            render: async (b, p) => { const room = ROOMS[p.room] || ROOMS.piece, dur = num(p.dur, room.dur), mix = clamp(num(p.mix, 20), 0, 100) / 100, ir = impulse(b.sampleRate, b.numberOfChannels, dur, room.pre);
                return through(b, (oc, s) => { const cv = oc.createConvolver(); cv.normalize = true; cv.buffer = ir; const lp = biq(oc, 'lowpass', room.lp, 0, 0.7), wet = oc.createGain(), dry = oc.createGain(), out = oc.createGain(); wet.gain.value = mix * 1.6; dry.gain.value = 1 - mix * 0.5; s.connect(dry).connect(out); s.connect(cv).connect(lp).connect(wet).connect(out); return out; }); }},
        speed: {icon: '⏱', label: 'Vitesse et hauteur', group: 'Temps', lengthChange: true, params: [P('speed', 'Vitesse', 25, 200, 1, '%', 100), P('pitch', 'Hauteur', -12, 12, 0.5, '½ ton', 0)], bools: {keep: 'Garder la hauteur de la voix'}, help: 'Pour une cassette lue trop vite (voix « de canard ») : 96 % la remet à sa vraie vitesse.',
            render: async (b, p) => {
                const sp = clamp(num(p.speed, 100), 25, 400) / 100, st = clamp(num(p.pitch, 0), -24, 24), keep = p.keep !== false, sr = b.sampleRate, pr = 2 ** (st / 12);
                if (!keep) { // comme une bande : vitesse et hauteur ensemble, puis la hauteur en plus
                    let o = Math.abs(sp - 1) > 1e-3 ? await rateChange(b, sp) : cloneBuf(b);
                    if (Math.abs(st) > 1e-3) { const s1 = fromArrays(chans(o).map(d => stretchArray(d, sr, pr)), sr); o = await rateChange(s1, pr); }
                    return o;
                }
                // hauteur gardée : on étire le temps (1 / vitesse × rapport de hauteur), puis on rejoue au rapport de hauteur
                const stretch = pr / sp, s1 = fromArrays(chans(b).map(d => stretchArray(d, sr, stretch)), sr);
                return Math.abs(pr - 1) > 1e-3 ? rateChange(s1, pr) : s1;
            }},
        trim: {icon: '✂️', label: 'Couper le début et la fin', group: 'Temps', lengthChange: true, params: [P('a', 'Début', 0, 86400, 0.1, 's', 0), P('b', 'Fin', 0, 86400, 0.1, 's', 0)], hidden: true,
            render: async (b, p) => { const sr = b.sampleRate, a = clamp(num(p.a, 0), 0, b.duration), z = num(p.b, 0) > a ? Math.min(b.duration, num(p.b, 0)) : b.duration; const o = sliceBuf(b, a * sr, z * sr), n = Math.round(sr * 0.02); for (const d of chans(o)) for (let i = 0; i < Math.min(n, d.length); i++) { const u = i / n; d[i] *= u; d[d.length - 1 - i] *= u; } return o; }},
        silences: {icon: '⏩', label: 'Raccourcir les blancs', group: 'Temps', lengthChange: true, params: [P('min', 'Blancs de plus de', 0.5, 10, 0.1, 's', 2), P('keep', 'Ramenés à', 0.1, 3, 0.1, 's', 0.5)],
            render: async (b, p) => { const runs = silenceRuns(b, num(p.min, 2)), keep = num(p.keep, 0.5), sr = b.sampleRate; if (!runs.length) return cloneBuf(b); const parts = []; let from = 0; runs.forEach(r => { parts.push(sliceBuf(b, from * sr, (r.a + keep / 2) * sr)); from = r.b - keep / 2; }); parts.push(sliceBuf(b, from * sr, b.length)); return concatBufs(parts.filter(x => x.length > 1), b.numberOfChannels, sr); }},
    };
    E.FX = FX;
    E.ROOMS = ROOMS;
    E.fxDefaults = type => { const d = FX[type]; if (!d) return {}; const p = Object.fromEntries(d.params.map(x => [x.k, x.def])); if (d.choices) Object.entries(d.choices).forEach(([k, l]) => { p[k] = l[0]; }); if (d.bools) Object.keys(d.bools).forEach(k => { p[k] = k === 'keep'; }); if (type === 'eqp') p.bands = JSON.parse(JSON.stringify(d.bandsDef)); if (type === 'repair') p.masks = []; if (type === 'reverb') p.room = 'piece'; return p; };
    let fxUid = 0;
    E.newFx = (type, params = {}, extra = {}) => ({id: 'fx' + (++fxUid) + Date.now().toString(36).slice(-4), type, on: true, params: {...E.fxDefaults(type), ...params}, ...extra});
    /** Nettoie un rack venu d'ailleurs (projet, réglage enregistré, fichier) */
    E.cleanRack = rack => (Array.isArray(rack) ? rack : []).filter(x => x && FX[x.type]).slice(0, 40).map(x => {
        const d = FX[x.type], p = {}, src = x.params && typeof x.params === 'object' ? x.params : {};
        d.params.forEach(q => { p[q.k] = clamp(num(src[q.k], q.def), q.min, q.max); });
        if (d.choices) Object.entries(d.choices).forEach(([k, l]) => { p[k] = l.includes(String(src[k])) ? String(src[k]) : l[0]; });
        if (d.bools) Object.keys(d.bools).forEach(k => { p[k] = k === 'keep' ? src[k] !== false : !!src[k]; });
        if (x.type === 'eqp') p.bands = (Array.isArray(src.bands) ? src.bands : d.bandsDef).slice(0, 8).map(bd => ({type: ['lowshelf', 'highshelf', 'peaking', 'highpass', 'lowpass', 'notch'].includes(bd?.type) ? bd.type : 'peaking', f: clamp(num(bd?.f, 1000), 20, 20000), g: clamp(num(bd?.g, 0), -24, 24), q: clamp(num(bd?.q, 0.9), 0.1, 30)}));
        if (x.type === 'repair') p.masks = (Array.isArray(src.masks) ? src.masks : []).slice(0, 400).map(m => ({t0: Math.max(0, num(m?.t0, 0)), t1: Math.max(0, num(m?.t1, 0)), f0: clamp(num(m?.f0, 0), 0, 24000), f1: clamp(num(m?.f1, 0), 0, 24000)})).filter(m => m.t1 > m.t0 && m.f1 > m.f0);
        if (x.type === 'denoise' && src.print && Number.isFinite(Number(src.print.a)) && Number(src.print.b) > Number(src.print.a)) p.print = {a: Math.max(0, Number(src.print.a)), b: Number(src.print.b)};
        const out = {id: /^[A-Za-z0-9_-]{1,40}$/.test(String(x.id || '')) ? String(x.id) : E.newFx(x.type).id, type: x.type, on: x.on !== false, params: p};
        if (x.range && Number(x.range.b) > Number(x.range.a) && !d.lengthChange) out.range = {a: Math.max(0, Number(x.range.a)), b: Number(x.range.b)};
        if (typeof x.quick === 'string' && /^[a-z]{2,12}$/.test(x.quick)) out.quick = x.quick;
        return out;
    });
    /** Applique un effet (sur la sélection seulement s'il a range : rendu avec une marge, recollé avec un fondu croisé de 10 ms) */
    async function applyFx(b, fx, ctx = {}) {
        const d = FX[fx.type]; if (!d || fx.on === false) return b;
        if (!fx.range || d.lengthChange) return d.render(b, fx.params || {}, ctx);
        const sr = b.sampleRate, pad = Math.round(sr * 0.05), a = clamp(Math.round(fx.range.a * sr), 0, b.length), z = clamp(Math.round(fx.range.b * sr), a, b.length);
        if (z - a < 16) return b;
        const s0 = Math.max(0, a - pad), s1 = Math.min(b.length, z + pad), part = await d.render(sliceBuf(b, s0, s1), fx.params || {}, {...ctx, source: ctx.source ? sliceBuf(ctx.source, 0, ctx.source.length) : null});
        const out = cloneBuf(b), xf = Math.round(sr * 0.01);
        for (let c = 0; c < out.numberOfChannels; c++) { const o = out.getChannelData(c), p = part.getChannelData(Math.min(c, part.numberOfChannels - 1));
            for (let i = a; i < z; i++) { const w = Math.min(1, (i - a) / xf, (z - 1 - i) / xf); o[i] = o[i] * (1 - w) + p[i - s0] * w; } }
        return out;
    }
    /** Rejoue tout le rack. cache (facultatif, une Map) : les étapes déjà calculées ne sont pas refaites */
    async function renderRack(b, rack, {onStep = null, cache = null, source = null} = {}) {
        let cur = b, key = '';
        const list = (rack || []).filter(x => x && x.on !== false && FX[x.type]);
        for (let i = 0; i < list.length; i++) {
            key += JSON.stringify([list[i].type, list[i].params, list[i].range || null]) + '|';
            if (cache?.has(key)) { cur = cache.get(key); continue; }
            cur = await applyFx(cur, list[i], {source: source || b, onStep: x => onStep?.((i + x) / list.length)});
            if (cache) { cache.set(key, cur); if (cache.size > 12) cache.delete(cache.keys().next().value); }
            onStep?.((i + 1) / list.length);
        }
        return cur === b ? cloneBuf(b) : cur;
    }
    Object.assign(E, {applyFx, renderRack, limitArrays, declickArray, stretchArray, rateChange, repairArray, denoiseArray, impulse});

    /** Les traitements joués en direct (montage) : souffle, voix plus nette, graves, aigus, mono — f = {noise, clarity, bass, treble, mono} */
    E.liveChain = (ctx, from, f) => {
        let tail = from; if (!f) return tail;
        const b = (type, freq, gain = 0, q = 0.9) => biq(ctx, type, freq, gain, q);
        if (f.noise) { const hp = b('highpass', 100), lp = b('lowpass', 9000); tail.connect(hp).connect(lp); tail = lp; }
        if (f.clarity) { const pr = b('peaking', 3000, 4), cp = ctx.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 3; tail.connect(pr).connect(cp); tail = cp; }
        if (f.bass) { const x = b('lowshelf', 200, clamp(Number(f.bass), -15, 15)); tail.connect(x); tail = x; }
        if (f.treble) { const x = b('highshelf', 4000, clamp(Number(f.treble), -15, 15)); tail.connect(x); tail = x; }
        if (f.mono) { const m = ctx.createGain(); m.channelCount = 1; m.channelCountMode = 'explicit'; m.channelInterpretation = 'speakers'; tail.connect(m); tail = m; }
        return tail;
    };

    /* ═════ ⚡ Son rapide ⇄ rack : les mêmes réglages vus de deux façons ═════ */
    const FORCE = {doux: 0, moyen: 1, fort: 2};
    const Q = {
        hiss: f => E.newFx('denoise', {reduction: [45, 70, 90][f], atten: [10, 18, 28][f], smooth: 50}, {quick: 'hiss'}),
        clicks: f => E.newFx('declick', {amount: [30, 55, 80][f]}, {quick: 'clicks'}),
        hum: (f, o) => E.newFx('dehum', {freq: o?.hum ? String(o.hum) : 'auto', harm: [3, 5, 8][f]}, {quick: 'hum'}),
        voice: f => E.newFx('voice', {force: f + 1}, {quick: 'voice'}),
        level: f => E.newFx('loudness', {target: -16, leveler: [35, 60, 85][f]}, {quick: 'level'}),
        silences: f => E.newFx('silences', {min: [3, 2, 1.2][f], keep: 0.5}, {quick: 'silences'}),
    };
    E.QUICK_KEYS = ['hiss', 'clicks', 'hum', 'voice', 'level', 'trim', 'silences'];
    /** q = {on: {hiss: true…}, force: 'moyen', trim: {a, b}, hum: 50} → rack (dans l'ordre du Son rapide) */
    E.quickToRack = q => {
        const f = FORCE[q?.force] ?? 1, on = q?.on || {}, out = [];
        if (on.trim && q.trim && q.trim.b > q.trim.a) out.push(E.newFx('trim', {a: q.trim.a, b: q.trim.b}, {quick: 'trim'}));
        ['hiss', 'clicks', 'hum', 'voice', 'level', 'silences'].forEach(k => { if (on[k]) out.push(Q[k](f, q)); });
        return out;
    };
    /** rack → {q, extras} : ce que le Son rapide sait montrer revient en boutons ; le reste reste appliqué (extras) */
    E.rackToQuick = rack => {
        const q = {on: {}, force: 'moyen', trim: null}, extras = []; const forces = [];
        (rack || []).forEach(x => {
            if (!x || x.on === false) { if (x && !x.quick) extras.push(x); return; }
            const k = x.quick, p = x.params || {};
            const ref = k && k !== 'trim' && Q[k] ? Q[k](FORCE[q.force] ?? 1, {hum: p.freq !== 'auto' ? p.freq : null}) : null;
            if (k === 'trim' && x.type === 'trim') { q.on.trim = true; q.trim = {a: p.a, b: p.b}; return; }
            if (k && ref && ref.type === x.type && !x.range) {
                const fi = [0, 1, 2].find(i => JSON.stringify(Q[k](i, {hum: p.freq !== 'auto' ? p.freq : null}).params) === JSON.stringify({...ref.params, ...p}) || JSON.stringify(Q[k](i, {hum: p.freq !== 'auto' ? p.freq : null}).params) === JSON.stringify(p));
                if (fi !== undefined) { q.on[k] = true; forces.push(fi); if (k === 'hum' && p.freq !== 'auto') q.hum = Number(p.freq); return; }
            }
            extras.push(x);
        });
        if (forces.length) q.force = ['doux', 'moyen', 'fort'][Math.round(forces.reduce((s, v) => s + v, 0) / forces.length)];
        return {q, extras};
    };
    /** Les ensembles prêts (💾 Réglages enregistrés), partagés entre Son rapide et Studio */
    E.BUILTIN_PRESETS = [
        {id: 'cassette', name: '📼 Cassette des années 70', summary: 'souffle, voix claire, volume égal', quick: {on: {hiss: true, voice: true, level: true, trim: true}, force: 'moyen'}},
        {id: 'dicta', name: '🎙 Dictaphone', summary: 'souffle fort, voix, coupe des blancs', quick: {on: {hiss: true, voice: true, silences: true, trim: true}, force: 'fort'}},
        {id: 'mariage', name: '💒 Vidéo de mariage 1987', summary: 'de-hum, égaliseur, limiteur', rack: () => [E.newFx('dehum', {freq: 'auto', harm: 5}), E.newFx('eqp'), E.newFx('limit', {ceil: -1, release: 50})]},
    ];
    E.presetRack = (p, analysis = {}) => p.rack ? p.rack() : E.quickToRack({...p.quick, trim: analysis.trim || null, hum: analysis.hum || 0});

    /* ═════ Multipiste : mélange (volume, panoramique, courbes, muet / solo), baisse sous la voix ═════ */
    /** valeur d'une courbe [{t, v}] au temps t (entre deux points : en ligne droite) */
    E.autoAt = (pts, t, def = 1) => { if (!pts?.length) return def; if (t <= pts[0].t) return pts[0].v; const l = pts[pts.length - 1]; if (t >= l.t) return l.v; let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; } const a = pts[lo], b = pts[hi], u = (t - a.t) / Math.max(1e-9, b.t - a.t); return a.v + (b.v - a.v) * u; };
    /** Les points de la baisse de la musique sous la voix : la voix parle → la musique descend de db, remonte en ret secondes */
    E.duckPoints = (voice, {db = -12, ret = 0.8, att = 0.15, total = null} = {}) => {
        if (!voice) return [];
        const sr = voice.sampleRate, hop = Math.round(sr * 0.05), rms = frameRms(voice, hop), loud = percentile(rms, 0.95), floor = percentile(rms, 0.2), thr = Math.max(1e-4, floor + (loud - floor) * 0.15);
        const runs = []; let from = -1;
        for (let f = 0; f <= rms.length; f++) { const on = f < rms.length && rms[f] > thr; if (on && from < 0) from = f; if (!on && from >= 0) { runs.push([from * hop / sr, f * hop / sr]); from = -1; } }
        const merged = []; runs.forEach(r => { const l = merged[merged.length - 1]; if (l && r[0] - l[1] < ret * 1.5) l[1] = r[1]; else merged.push([...r]); });
        const low = dbToLin(db), pts = [{t: 0, v: 1}];
        merged.filter(r => r[1] - r[0] > 0.25).forEach(([a, z]) => { pts.push({t: Math.max(0, a - att), v: 1}, {t: a, v: low}, {t: z, v: low}, {t: z + ret, v: 1}); });
        if (total) pts.push({t: total, v: 1});
        return pts.sort((x, y) => x.t - y.t).filter((p, i, arr) => !i || p.t > arr[i - 1].t + 1e-4).map(p => ({t: Math.round(p.t * 1000) / 1000, v: Math.round(p.v * 1000) / 1000, duck: true}));
    };
    /** Mélange d'un projet multipiste → tampon stéréo. tracks: [{vol, pan, mute, solo, rack, clips:[{key, start, offset, dur, gain}], auto:{vol, pan}}] ; bufs: {key: AudioBuffer} */
    E.mixdown = async (proj, bufs, {sr = 44100, onStep = null, only = null} = {}) => {
        const tracks = (proj.tracks || []).filter(t => only ? t.id === only : true), anySolo = tracks.some(t => t.solo);
        let end = 0; tracks.forEach(t => (t.clips || []).forEach(c => { end = Math.max(end, num(c.start, 0) + num(c.dur, 0)); }));
        const n = Math.max(1, Math.ceil(end * sr)), L = new Float32Array(n), R = new Float32Array(n);
        for (const [ti, t] of tracks.entries()) {
            if (t.mute || (anySolo && !t.solo && !only)) continue;
            let tb = mkBuf(n, 2, sr); const tl = tb.getChannelData(0), tr = tb.getChannelData(1);
            for (const c of t.clips || []) {
                let src = bufs[c.key]; if (!src) continue;
                if (src.sampleRate !== sr) { src = await resample(src, sr, src.numberOfChannels); bufs[c.key] = src; }
                const s0 = Math.round(num(c.offset, 0) * sr), len = Math.min(Math.round(num(c.dur, 0) * sr), src.length - s0), at = Math.round(num(c.start, 0) * sr), g = num(c.gain, 1), cl = src.getChannelData(0), cr = src.getChannelData(Math.min(1, src.numberOfChannels - 1));
                const fi = Math.round(num(c.fadeIn, 0.01) * sr), fo = Math.round(num(c.fadeOut, 0.01) * sr);
                for (let i = 0; i < len && at + i < n; i++) { if (at + i < 0) continue; let w = g; if (i < fi) w *= i / fi; if (len - i < fo) w *= (len - i) / fo; tl[at + i] += cl[s0 + i] * w; tr[at + i] += cr[s0 + i] * w; }
            }
            if (t.rack?.length) tb = await renderRack(tb, t.rack);
            const vol = num(t.vol, 1), pan = clamp(num(t.pan, 0), -1, 1), av = t.auto?.vol, ap = t.auto?.pan, l2 = tb.getChannelData(0), r2 = tb.getChannelData(1);
            for (let i = 0; i < n; i++) {
                const tt = i / sr, v = vol * (av?.length ? E.autoAt(av, tt, 1) : 1), p = ap?.length ? clamp(E.autoAt(ap, tt, pan), -1, 1) : pan, a = (p + 1) * Math.PI / 4;
                L[i] += l2[i] * v * Math.cos(a) * Math.SQRT2; R[i] += r2[i] * v * Math.sin(a) * Math.SQRT2;
            }
            onStep?.((ti + 1) / tracks.length); await yieldUi();
        }
        return fromArrays([L, R], sr);
    };

    /* ═════ 🎙 Micro ═════ */
    /** recordMic({onLevel}) → {stop(): Promise<{file, buffer}>, cancel()} ; onLevel(rms 0..1) pour le VU-mètre */
    E.recordMic = async ({onLevel = null, name = 'prise-micro'} = {}) => {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ce navigateur ne donne pas accès au micro.');
        let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch (_) { throw new Error('Micro refusé : autorise-le dans les réglages du navigateur ou du système.'); }
        const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
        const rec = new MediaRecorder(stream, mime ? {mimeType: mime} : {}), chunks = [];
        rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
        let raf = 0, an = null;
        if (onLevel) { try { const c = E.ctx(), s = c.createMediaStreamSource(stream); an = c.createAnalyser(); an.fftSize = 1024; s.connect(an); const d = new Float32Array(an.fftSize); const tick = () => { an.getFloatTimeDomainData(d); let q = 0; for (const v of d) q += v * v; onLevel(Math.sqrt(q / d.length)); raf = requestAnimationFrame(tick); }; tick(); } catch (_) {} }
        const done = new Promise(res => { rec.onstop = () => res(); });
        const off = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(tk => tk.stop()); };
        rec.start(500);
        return {
            stream, recorder: rec,
            stop: async () => { if (rec.state !== 'inactive') rec.stop(); await done; off(); const type = (rec.mimeType || mime || 'audio/webm').split(';')[0], ext0 = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
                const file = new File([new Blob(chunks, {type})], `${name}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext0}`, {type});
                if (file.size < 1500) throw new Error('Enregistrement trop court.');
                let buffer = null; try { buffer = await E.decode(await file.arrayBuffer()); } catch (_) {}
                return {file, buffer}; },
            cancel: () => { rec.onstop = null; try { rec.stop(); } catch (_) {} off(); },
        };
    };

    /* ═════ Encodeurs ═════ */
    const toI16 = v => { v = v > 1 ? 1 : v < -1 ? -1 : v; return v < 0 ? v * 0x8000 : v * 0x7fff; };
    /** WAV 16 bits (lu partout). */
    function encodeWav(b) {
        const ch = b.numberOfChannels, len = b.length, out = new DataView(new ArrayBuffer(44 + len * ch * 2));
        const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
        out.setUint32(24, b.sampleRate, true); out.setUint32(28, b.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
        const cs = chans(b); let o = 44;
        for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, toI16(cs[c][i]), true); o += 2; }
        return new Blob([out.buffer], {type: 'audio/wav'});
    }
    /** AIFF 16 bits (Mac : GarageBand, Logic, QuickTime) */
    function encodeAiff(b) {
        const ch = b.numberOfChannels, len = b.length, size = len * ch * 2, out = new DataView(new ArrayBuffer(54 + size));
        const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'FORM'); out.setUint32(4, 46 + size); w(8, 'AIFF'); w(12, 'COMM'); out.setUint32(16, 18); out.setUint16(20, ch); out.setUint32(22, len); out.setUint16(26, 16);
        let rate = b.sampleRate, e = 16383 + 31; while (rate < 0x80000000) { rate *= 2; e--; }
        out.setUint16(28, e); out.setUint32(30, rate >>> 0); out.setUint32(34, 0);
        w(38, 'SSND'); out.setUint32(42, 8 + size); out.setUint32(46, 0); out.setUint32(50, 0);
        const cs = chans(b); let o = 54;
        for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, toI16(cs[c][i])); o += 2; }
        return new Blob([out.buffer], {type: 'audio/aiff'});
    }
    /** FLAC 16 bits (sans perte) : prédiction fixe et codes de Rice ; tags : {TITLE, ARTIST, …, CHAPTERxx…} (commentaires Vorbis) */
    async function encodeFlac(b, onStep, {tags = null} = {}) {
        const ch = b.numberOfChannels, len = b.length, rate = b.sampleRate, BS = 4096;
        let buf = new Uint8Array(1 << 20), pos = 0, acc = 0, nbits = 0;
        const grow = need => { while (pos + 64 + (need || 0) > buf.length) { const n = new Uint8Array(buf.length * 2); n.set(buf); buf = n; } };
        const put = (v, n) => { acc = (acc * (1 << n)) + (v & ((1 << n) - 1)); nbits += n; while (nbits >= 8) { nbits -= 8; grow(); buf[pos++] = Math.floor(acc / (1 << nbits)) & 255; acc = acc % (1 << nbits); } };
        const putN = (v, n) => { if (n > 24) { put(Math.floor(v / (1 << 24)), n - 24); put(v % (1 << 24), 24); } else put(v, n); };
        const align = () => { if (nbits) put(0, 8 - nbits); };
        const crc8 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; } return c; };
        const crc16 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= buf[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; } return c; };
        const vc = tags && Object.keys(tags).length ? (() => { const te = new TextEncoder(), vendor = te.encode('LCNDA'), items = Object.entries(tags).map(([k, v]) => te.encode(`${k}=${v}`)), size = 4 + vendor.length + 4 + items.reduce((s, x) => s + 4 + x.length, 0), out = new Uint8Array(size), dv = new DataView(out.buffer); let o = 0; dv.setUint32(o, vendor.length, true); o += 4; out.set(vendor, o); o += vendor.length; dv.setUint32(o, items.length, true); o += 4; items.forEach(x => { dv.setUint32(o, x.length, true); o += 4; out.set(x, o); o += x.length; }); return out; })() : null;
        [0x66, 0x4c, 0x61, 0x43].forEach(x => put(x, 8));
        put(vc ? 0x00 : 0x80, 8); put(0, 8); put(0, 8); put(34, 8);
        put(BS, 16); put(BS, 16); put(0, 24); put(0, 24); put(rate, 20); put(ch - 1, 3); put(15, 5); putN(len, 36);
        for (let i = 0; i < 16; i++) put(0, 8);
        if (vc) { put(0x84, 8); put((vc.length >> 16) & 255, 8); put((vc.length >> 8) & 255, 8); put(vc.length & 255, 8); grow(vc.length); buf.set(vc, pos); pos += vc.length; }
        const cs = chans(b);
        const toInt = x => Math.round(toI16(x));
        const res = new Int32Array(BS), smp = new Int32Array(BS);
        for (let start = 0, frame = 0; start < len; start += BS, frame++) {
            const n = Math.min(BS, len - start), f0 = pos;
            put(0x3ffe, 14); put(0, 1); put(0, 1); put(7, 4); put(0, 4); put(ch - 1, 4); put(4, 3); put(0, 1);
            if (frame < 0x80) put(frame, 8);
            else if (frame < 0x800) { put(0xc0 | (frame >> 6), 8); put(0x80 | (frame & 63), 8); }
            else if (frame < 0x10000) { put(0xe0 | (frame >> 12), 8); put(0x80 | ((frame >> 6) & 63), 8); put(0x80 | (frame & 63), 8); }
            else { put(0xf0 | (frame >> 18), 8); put(0x80 | ((frame >> 12) & 63), 8); put(0x80 | ((frame >> 6) & 63), 8); put(0x80 | (frame & 63), 8); }
            put(n - 1, 16);
            put(crc8(f0, pos), 8);
            for (let c = 0; c < ch; c++) {
                const d = cs[c];
                for (let i = 0; i < n; i++) smp[i] = toInt(d[start + i]);
                let best = 0, bestSum = Infinity;
                for (let o = 0; o <= Math.min(4, n - 1); o++) {
                    let sum = 0;
                    for (let i = o; i < n; i++) { const x = smp[i], r = o === 0 ? x : o === 1 ? x - smp[i - 1] : o === 2 ? x - 2 * smp[i - 1] + smp[i - 2] : o === 3 ? x - 3 * smp[i - 1] + 3 * smp[i - 2] - smp[i - 3] : x - 4 * smp[i - 1] + 6 * smp[i - 2] - 4 * smp[i - 3] + smp[i - 4]; sum += r < 0 ? -r : r; }
                    if (sum < bestSum) { bestSum = sum; best = o; }
                }
                const o = best;
                for (let i = o; i < n; i++) { const x = smp[i]; res[i] = o === 0 ? x : o === 1 ? x - smp[i - 1] : o === 2 ? x - 2 * smp[i - 1] + smp[i - 2] : o === 3 ? x - 3 * smp[i - 1] + 3 * smp[i - 2] - smp[i - 3] : x - 4 * smp[i - 1] + 6 * smp[i - 2] - 4 * smp[i - 3] + smp[i - 4]; }
                const mean = bestSum / Math.max(1, n - o);
                const k = mean > 1 ? Math.min(14, Math.max(0, Math.floor(Math.log2(mean * Math.LN2)))) : 0;
                put(0, 1); put(8 | o, 6); put(0, 1);
                for (let i = 0; i < o; i++) put(smp[i] & 0xffff, 16);
                put(0, 2); put(0, 4); put(k, 4);
                for (let i = o; i < n; i++) { const r = res[i], u = r >= 0 ? r * 2 : -r * 2 - 1; let q = Math.floor(u / (1 << k)); while (q >= 24) { put(0, 24); q -= 24; } put(1, q + 1); if (k) put(u & ((1 << k) - 1), k); }
            }
            align();
            const c16 = crc16(f0, pos); put(c16 >> 8, 8); put(c16 & 255, 8);
            if (frame % 40 === 0) { onStep?.(start / len); await yieldUi(); }
        }
        return new Blob([buf.slice(0, pos)], {type: 'audio/flac'});
    }
    /** MP3 : encodeur LAME (assets/vendor/lamejs), chargé seulement à ce moment-là */
    const loadLame = () => window.lamejs ? Promise.resolve() : new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'assets/vendor/lamejs/lame.min.js'; sc.onload = () => ok(); sc.onerror = () => ko(new Error('Encodeur MP3 introuvable.')); document.head.appendChild(sc); });
    async function encodeMp3(b, kbps = 128, onStep, {tags = null} = {}) {
        await loadLame();
        if (b.sampleRate > 48000) b = await resample(b, 44100, b.numberOfChannels);
        const ch = Math.min(2, b.numberOfChannels), enc = new window.lamejs.Mp3Encoder(ch, b.sampleRate, kbps), parts = [];
        const i16 = d => { const o = new Int16Array(d.length); for (let i = 0; i < d.length; i++) o[i] = toI16(d[i]); return o; };
        const Ls = i16(b.getChannelData(0)), Rs = ch > 1 ? i16(b.getChannelData(1)) : null, step = 1152 * 20;
        for (let i = 0; i < Ls.length; i += step) {
            const out = ch > 1 ? enc.encodeBuffer(Ls.subarray(i, i + step), Rs.subarray(i, i + step)) : enc.encodeBuffer(Ls.subarray(i, i + step));
            if (out.length) parts.push(new Uint8Array(out));
            if ((i / step) % 20 === 0) { onStep?.(i / Ls.length); await yieldUi(); }
        }
        const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
        if (tags) parts.unshift(id3(tags));
        return new Blob(parts, {type: 'audio/mpeg'});
    }
    /** Étiquettes ID3v2.3 : {title, artist, comment, chapters:[{title, start, end}]} (chapitres CHAP + table CTOC) */
    function id3({title = '', artist = '', comment = '', chapters = []} = {}) {
        const te = new TextEncoder(), parts = [];
        const u16 = s => { const out = [0xff, 0xfe]; for (const c of String(s)) { const cp = c.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000, hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 1023); out.push(hi & 255, hi >> 8, lo & 255, lo >> 8); } else out.push(cp & 255, cp >> 8); } return out; };
        const frame = (id, body) => { const out = new Uint8Array(10 + body.length), dv = new DataView(out.buffer); out.set(te.encode(id), 0); dv.setUint32(4, body.length); out.set(body, 10); return out; };
        const text = (id, s) => frame(id, Uint8Array.from([1, ...u16(s), 0, 0]));
        if (title) parts.push(text('TIT2', title));
        if (artist) parts.push(text('TPE1', artist));
        if (comment) parts.push(frame('COMM', Uint8Array.from([1, ...te.encode('fra'), 0xff, 0xfe, 0, 0, ...u16(comment).slice(2)])));
        const chs = (chapters || []).slice(0, 255);
        if (chs.length) {
            const ids = chs.map((_, i) => `ch${i}`);
            const ctocBody = [...te.encode('toc'), 0, 0x03, chs.length]; ids.forEach(id => ctocBody.push(...te.encode(id), 0));
            parts.push(frame('CTOC', Uint8Array.from(ctocBody)));
            chs.forEach((c, i) => { const sub = text('TIT2', c.title || `Chapitre ${i + 1}`), head = [...te.encode(ids[i]), 0], tm = new Uint8Array(16), dv = new DataView(tm.buffer); dv.setUint32(0, Math.round(c.start * 1000)); dv.setUint32(4, Math.round(c.end * 1000)); dv.setUint32(8, 0xffffffff); dv.setUint32(12, 0xffffffff); parts.push(frame('CHAP', Uint8Array.from([...head, ...tm, ...sub]))); });
        }
        const size = parts.reduce((s, p) => s + p.length, 0), head = new Uint8Array(10);
        head.set(te.encode('ID3'), 0); head[3] = 3; head[4] = 0; head[5] = 0; head[6] = (size >> 21) & 127; head[7] = (size >> 14) & 127; head[8] = (size >> 7) & 127; head[9] = size & 127;
        const out = new Uint8Array(10 + size); out.set(head, 0); let o = 10; parts.forEach(p => { out.set(p, o); o += p.length; });
        return out;
    }
    const resampleBuffer = (b, rate, channels) => through(b, null, {sr: rate, ch: channels});
    /** Ogg Opus : encodeur du navigateur (WebCodecs) + petite mise en pages Ogg */
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
    async function encodeOpus(b0, onStep, {kbps = null, tags = null} = {}) {
        const ch = Math.min(2, b0.numberOfChannels), b = await resample(b0, 48000, ch);
        const packets = []; let head = null, err = null;
        const enc = new AudioEncoder({output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); packets.push({d, dur: Math.round((chunk.duration || 20000) * 48 / 1000)}); if (meta?.decoderConfig?.description && !head) { const h = new Uint8Array(meta.decoderConfig.description); if (String.fromCharCode(...h.slice(0, 8)) === 'OpusHead') head = h; } }, error: e => { err = e; }});
        enc.configure({codec: 'opus', sampleRate: 48000, numberOfChannels: ch, bitrate: kbps ? kbps * 1000 : (ch > 1 ? 128000 : 72000)});
        const F = 960, cs = chans(b);
        for (let i = 0, k = 0; i < b.length; i += F, k++) {
            const n = Math.min(F, b.length - i), data = new Float32Array(n * ch);
            for (let c = 0; c < ch; c++) data.set(cs[c].subarray(i, i + n), c * n);
            enc.encode(new AudioData({format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(i / 48000 * 1e6), data}));
            if (k % 500 === 0) { onStep?.(i / b.length); await yieldUi(); }
        }
        await enc.flush(); enc.close();
        if (err) throw err;
        const preskip = head ? (head[10] | head[11] << 8) : 312;
        if (!head) { head = new Uint8Array(19); head.set([...'OpusHead'].map(c => c.charCodeAt(0))); head[8] = 1; head[9] = ch; head[10] = preskip & 255; head[11] = preskip >> 8; new DataView(head.buffer).setUint32(12, 48000, true); }
        const te = new TextEncoder(), vendor = te.encode('LCNDA'), items = Object.entries(tags || {}).map(([k, v]) => te.encode(`${k}=${v}`)), tsz = 8 + 4 + vendor.length + 4 + items.reduce((s, x) => s + 4 + x.length, 0), tagsP = new Uint8Array(tsz), tdv = new DataView(tagsP.buffer);
        tagsP.set(te.encode('OpusTags')); let o = 8; tdv.setUint32(o, vendor.length, true); o += 4; tagsP.set(vendor, o); o += vendor.length; tdv.setUint32(o, items.length, true); o += 4; items.forEach(x => { tdv.setUint32(o, x.length, true); o += 4; tagsP.set(x, o); o += x.length; });
        const serial = (Math.random() * 0xffffffff) >>> 0, pages = [oggPage([head], 0, serial, 0, 2), oggPage([tagsP], 0, serial, 1, 0)];
        let seq = 2, gran = preskip, group = [], bytes = 0;
        const total = preskip + b.length;
        packets.forEach((p, i) => {
            group.push(p.d); bytes += p.d.length; gran += p.dur;
            const last = i === packets.length - 1;
            if (last || group.length >= 50 || bytes > 4000) { pages.push(oggPage(group, last ? total : Math.min(gran, total), serial, seq++, last ? 4 : 0)); group = []; bytes = 0; }
        });
        return new Blob(pages, {type: 'audio/ogg'});
    }
    /** M4A (AAC) : seulement si le navigateur sait encoder l'AAC (WebCodecs) ; petit écrivain MP4 maison */
    const m4aSupported = async () => { try { return !!window.AudioEncoder && (await AudioEncoder.isConfigSupported({codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128000})).supported; } catch (_) { return false; } };
    async function encodeM4a(b0, kbps = 160, onStep, {title = ''} = {}) {
        const ch = Math.min(2, b0.numberOfChannels), sr = [48000, 44100].includes(b0.sampleRate) ? b0.sampleRate : 44100, b = await resample(b0, sr, ch);
        const frames = []; let asc = null, err = null;
        const enc = new AudioEncoder({output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); frames.push(d); if (meta?.decoderConfig?.description && !asc) asc = new Uint8Array(meta.decoderConfig.description); }, error: e => { err = e; }});
        enc.configure({codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: kbps * 1000});
        const F = 1024, cs = chans(b);
        for (let i = 0, k = 0; i < b.length; i += F, k++) { const n = Math.min(F, b.length - i), data = new Float32Array(n * ch); for (let c = 0; c < ch; c++) data.set(cs[c].subarray(i, i + n), c * n); enc.encode(new AudioData({format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(i / sr * 1e6), data})); if (k % 500 === 0) { onStep?.(i / b.length); await yieldUi(); } }
        await enc.flush(); enc.close(); if (err) throw err;
        if (!asc) { const idx = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000].indexOf(sr); asc = Uint8Array.from([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (ch << 3)]); }
        return mp4Audio(frames, asc, {sr, ch, title, kbps});
    }
    /** Écrit un MP4 audio (ftyp, moov, mdat) à partir de trames AAC brutes */
    function mp4Audio(frames, asc, {sr, ch, title = '', kbps = 128}) {
        const te = new TextEncoder();
        const box = (type, ...kids) => { const body = kids.map(k => k instanceof Uint8Array ? k : Uint8Array.from(k)); const size = 8 + body.reduce((s, x) => s + x.length, 0), out = new Uint8Array(size), dv = new DataView(out.buffer); dv.setUint32(0, size); out.set(te.encode(type), 4); let o = 8; body.forEach(x => { out.set(x, o); o += x.length; }); return out; };
        const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], u16 = v => [(v >> 8) & 255, v & 255];
        const n = frames.length, dur = n * 1024, mvhdDur = Math.round(dur / sr * 1000);
        const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
        const desc = (tag, body) => [tag, 0x80, 0x80, 0x80, body.length, ...body];
        const dsi = desc(0x05, [...asc]), dcd = desc(0x04, [0x40, 0x15, 0, 0, 0, ...u32(kbps * 1000), ...u32(kbps * 1000), ...dsi]), es = desc(0x03, [0, 1, 0, ...dcd, ...desc(0x06, [2])]);
        const esds = box('esds', [0, 0, 0, 0], es);
        const mp4a = box('mp4a', [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, ...u16(ch), ...u16(16), 0, 0, 0, 0, ...u16(sr), 0, 0], esds);
        const stsd = box('stsd', [0, 0, 0, 0, ...u32(1)], mp4a), stts = box('stts', [0, 0, 0, 0, ...u32(1), ...u32(n), ...u32(1024)]), stsc = box('stsc', [0, 0, 0, 0, ...u32(1), ...u32(1), ...u32(n), ...u32(1)]);
        const stsz = box('stsz', [0, 0, 0, 0, ...u32(0), ...u32(n), ...frames.flatMap(f => u32(f.length))]);
        const ftyp = box('ftyp', te.encode('M4A '), u32(0), te.encode('M4A '), te.encode('mp42'), te.encode('isom'));
        const build = off => { const stco = box('stco', [0, 0, 0, 0, ...u32(1), ...u32(off)]), stbl = box('stbl', stsd, stts, stsc, stsz, stco);
            const minf = box('minf', box('smhd', [0, 0, 0, 0, 0, 0, 0, 0]), box('dinf', box('dref', [0, 0, 0, 0, ...u32(1)], box('url ', [0, 0, 0, 1]))), stbl);
            const mdia = box('mdia', box('mdhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(sr), ...u32(dur), 0x15, 0xc7, 0, 0]), box('hdlr', [0, 0, 0, 0, ...u32(0)], te.encode('soun'), [...u32(0), ...u32(0), ...u32(0)], te.encode('Son'), [0]), minf);
            const trak = box('trak', box('tkhd', [0, 0, 0, 7, ...u32(0), ...u32(0), ...u32(1), ...u32(0), ...u32(mvhdDur), ...u32(0), ...u32(0), 0, 0, 0, 0, 1, 0, 0, 0, ...matrix, ...u32(0), ...u32(0)]), mdia);
            const udta = title ? box('udta', box('meta', [0, 0, 0, 0], box('hdlr', [0, 0, 0, 0, ...u32(0)], te.encode('mdir'), te.encode('appl'), [0, 0, 0, 0, 0, 0, 0, 0, 0]), box('ilst', box('©nam'.replace('©', '©'), box('data', [0, 0, 0, 1, 0, 0, 0, 0], te.encode(title)))))) : new Uint8Array(0);
            return box('moov', box('mvhd', [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(mvhdDur), ...u32(0x10000), 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...matrix, ...Array(24).fill(0), ...u32(2)]), trak, udta); };
        const moov0 = build(0), off = ftyp.length + moov0.length + 8, moov = build(off);
        const mlen = frames.reduce((s, f) => s + f.length, 0), mdatHead = new Uint8Array(8); new DataView(mdatHead.buffer).setUint32(0, 8 + mlen); mdatHead.set(te.encode('mdat'), 4);
        return new Blob([ftyp, moov, mdatHead, ...frames], {type: 'audio/mp4'});
    }
    /** Un format → un fichier. opts : {kbps, rate, channels, tags} */
    E.encode = async (fmt, b, {kbps = 192, rate = 0, channels = 0, tags = null, onStep = null} = {}) => {
        if ((rate && rate !== b.sampleRate) || (channels && channels !== b.numberOfChannels)) b = await resampleBuffer(b, rate || b.sampleRate, channels || b.numberOfChannels);
        if (fmt === 'mp3') return encodeMp3(b, kbps, onStep, {tags});
        if (fmt === 'm4a') return encodeM4a(b, kbps, onStep, {title: tags?.title || ''});
        if (fmt === 'ogg') return encodeOpus(b, onStep, {kbps: Math.min(256, kbps), tags: tags ? {TITLE: tags.title || '', ARTIST: tags.artist || ''} : null});
        if (fmt === 'flac') return encodeFlac(b, onStep, {tags: tags ? {TITLE: tags.title || '', ARTIST: tags.artist || '', ...Object.fromEntries((tags.chapters || []).flatMap((c, i) => [[`CHAPTER${String(i + 1).padStart(2, '0')}`, clockMs(c.start)], [`CHAPTER${String(i + 1).padStart(2, '0')}NAME`, c.title || '']]))} : null});
        if (fmt === 'aiff') return encodeAiff(b);
        return encodeWav(b);
    };
    Object.assign(E, {encodeWav, encodeAiff, encodeFlac, encodeMp3, encodeOpus, encodeM4a, mp4Audio, id3, opusSupported, m4aSupported, resampleBuffer, loadLame});
    ext.audioEncoders = {wav: b => encodeWav(b), aiff: b => encodeAiff(b), flac: (b, f) => encodeFlac(b, f), mp3: (b, k, f) => encodeMp3(b, k, f), resample: (b, r, c) => resampleBuffer(b, r, c)}; // pour les essais

    /* ═════ Textes et repères : .txt, .srt, .vtt, .cue ═════ */
    const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
    const clockMs = s => `${pad(s / 3600)}:${pad(s % 3600 / 60)}:${pad(s % 60)}.${pad(Math.round(s % 1 * 1000) % 1000, 3)}`;
    const srtT = s => clockMs(s).replace('.', ',');
    const short = s => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, '0')}`; };
    /** lines : [{t, who, text}] (la transcription) ; dur : durée du son */
    E.cues = (lines, dur) => { const L = (lines || []).filter(l => l && String(l.text || '').trim()).slice().sort((a, b) => a.t - b.t); return L.map((l, i) => ({start: l.t, end: Math.min(dur || Infinity, L[i + 1] ? L[i + 1].t : l.t + 6, l.t + 8), text: `${l.who ? l.who + ' : ' : ''}${String(l.text).trim()}`})); };
    E.toSrt = (lines, dur) => E.cues(lines, dur).map((c, i) => `${i + 1}\n${srtT(c.start)} --> ${srtT(c.end)}\n${c.text.replace(/-->/g, '->')}\n`).join('\n');
    E.toVtt = (lines, dur, regions = []) => 'WEBVTT\n\n' + [...(regions || []).filter(r => r.kind !== 'marker').map(r => ({start: r.start, end: r.end, text: `[${r.name}]`})), ...E.cues(lines, dur)].sort((a, b) => a.start - b.start).map(c => `${clockMs(c.start)} --> ${clockMs(Math.max(c.end, c.start + 0.5))}\n${c.text.replace(/-->/g, '->')}\n`).join('\n');
    E.toTxt = (lines, regions = [], title = '') => [title && `${title}\n${'='.repeat(Math.min(60, title.length))}\n`, (regions || []).length ? 'Zones et marqueurs\n' + regions.map(r => `[${short(r.start)}${r.kind === 'marker' ? '' : ' → ' + short(r.end)}] ${r.name}${r.people?.length ? ' — ' + r.people.join(', ') : ''}`).join('\n') + '\n' : '', (lines || []).length ? 'Transcription\n' + E.cues(lines).map(c => `[${short(c.start)}] ${c.text}`).join('\n') : ''].filter(Boolean).join('\n');
    E.toCue = (regions, file = 'son.wav', title = '') => { const z = (regions || []).slice().sort((a, b) => a.start - b.start), ff = s => `${pad(s / 60)}:${pad(s % 60)}:${pad(Math.floor(s % 1 * 75 + 1e-6))}`; return [`TITLE "${String(title).replace(/"/g, "'")}"`, `FILE "${String(file).replace(/"/g, "'")}" ${/\.mp3$/i.test(file) ? 'MP3' : 'WAVE'}`, ...(z.length ? z : [{name: title || 'Son', start: 0}]).map((r, i) => `  TRACK ${pad(i + 1)} AUDIO\n    TITLE "${String(r.name || '').replace(/"/g, "'")}"\n    INDEX 01 ${ff(r.start)}`)].join('\n') + '\n'; };
    E.clockMs = clockMs; E.shortTime = short;
})();
