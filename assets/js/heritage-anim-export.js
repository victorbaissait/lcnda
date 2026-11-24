/* LCNDA — 🎞 Studio d'animation : fabriquer le film (maquette docs/design/studio-animation.html, partie 5).
 *  - vidéo image par image, plus vite que le temps réel (WebCodecs) : WebM (VP9 ou VP8, son Opus) ou MP4 (H.264, son AAC si l'ordinateur sait) ;
 *    sinon, en temps réel (le navigateur enregistre le canevas et le son pendant que le film se joue) ;
 *  - GIF (palette commune, sans son), images une par une (.zip de PNG), sous-titres (.srt) ;
 *  - le son : la musique (volume, fondus, en boucle, plus bas quand une voix parle) et les voix enregistrées, mélangés d'avance.
 *   ext.animExport = {capabilities, makeVideo, makeGif, makePngZip, srt, mixAudio, webm, mp4, gif, zip}
 * Essais : tests/test-anim-studio.js (formats des fichiers, dans Node) et tests/test-anim-studio-ui.js (navigateur).
 */
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const T = (k, v) => (root.LCNDA_I18N?.t ? root.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    const RN = () => ext.animRender;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const concat = parts => { const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };
    const te = new TextEncoder();

    /* ═════ WebM (Matroska) : en-tête, pistes, grappes de blocs ═════ */
    const vint = n => { for (let len = 1; len <= 8; len++) { if (n < 2 ** (7 * len) - 1) { const out = new Uint8Array(len); let v = n; for (let i = len - 1; i >= 0; i--) { out[i] = v & 255; v = Math.floor(v / 256); } out[0] |= 1 << (8 - len); return out; } } throw new Error('trop grand'); };
    const idBytes = id => { const b = []; let v = id; while (v > 0) { b.unshift(v & 255); v = Math.floor(v / 256); } return Uint8Array.from(b); };
    const uint = n => { const b = []; let v = Math.max(0, Math.floor(n)); do { b.unshift(v & 255); v = Math.floor(v / 256); } while (v > 0); return Uint8Array.from(b); };
    const f64 = x => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
    const el = (id, data) => { const d = data instanceof Uint8Array ? data : Array.isArray(data) ? concat(data) : typeof data === 'string' ? te.encode(data) : uint(data); return concat([idBytes(id), vint(d.length), d]); };
    /** webm({w, h, codec ('V_VP9' | 'V_VP8'), frames: [{data, ts (µs), key}], audio: {packets: [{data, ts}], head, sr, ch} | null, durationMs}) → Uint8Array */
    function webm({w, h, codec = 'V_VP9', frames, audio = null, durationMs}) {
        const header = el(0x1A45DFA3, [el(0x4286, 1), el(0x42F7, 1), el(0x42F2, 4), el(0x42F3, 8), el(0x4282, 'webm'), el(0x4287, 4), el(0x4285, 2)]);
        const info = el(0x1549A966, [el(0x2AD7B1, 1000000), el(0x4489, f64(durationMs)), el(0x4D80, 'LCNDA'), el(0x5741, 'LCNDA')]);
        const vtrack = el(0xAE, [el(0xD7, 1), el(0x73C5, 1), el(0x83, 1), el(0x86, codec), el(0xE0, [el(0xB0, w), el(0xBA, h)])]);
        const atrack = audio ? el(0xAE, [el(0xD7, 2), el(0x73C5, 2), el(0x83, 2), el(0x86, 'A_OPUS'), el(0x63A2, audio.head), el(0x56AA, 6500000), el(0x56BB, 80000000), el(0xE1, [el(0xB5, f64(audio.sr || 48000)), el(0x9F, audio.ch || 2)])]) : null;
        const tracks = el(0x1654AE6B, atrack ? [vtrack, atrack] : [vtrack]);
        // les blocs, rangés par temps, en grappes de 2 s au plus
        const blocks = frames.map(f => ({track: 1, ms: Math.round(f.ts / 1000), key: !!f.key, data: f.data}))
            .concat((audio?.packets || []).map(p => ({track: 2, ms: Math.round(p.ts / 1000), key: true, data: p.data})))
            .sort((a, b) => a.ms - b.ms || a.track - b.track);
        const clusters = []; let i = 0;
        while (i < blocks.length) {
            const t0 = blocks[i].ms, inside = [];
            while (i < blocks.length && blocks[i].ms - t0 < 2000 && !(inside.length && blocks[i].track === 1 && blocks[i].key)) { // une grappe : au plus 2 s, et chaque image clé en commence une
                const b = blocks[i], rel = b.ms - t0, head = new Uint8Array(4); head[0] = 0x80 | b.track; head[1] = (rel >> 8) & 255; head[2] = rel & 255; head[3] = b.key ? 0x80 : 0;
                inside.push(el(0xA3, concat([head, b.data]))); i++;
            }
            clusters.push(el(0x1F43B675, [el(0xE7, t0), ...inside]));
        }
        const segment = el(0x18538067, [info, tracks, ...clusters]);
        return concat([header, segment]);
    }

    /* ═════ MP4 : ftyp, mdat, moov (une piste vidéo H.264, une piste son AAC) ═════ */
    const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], u16 = v => [(v >> 8) & 255, v & 255];
    const box = (type, ...kids) => { const body = concat(kids.map(k => (k instanceof Uint8Array ? k : Uint8Array.from(k)))); return concat([Uint8Array.from(u32(body.length + 8)), te.encode(type), body]); };
    const full = (type, ver, flags, ...kids) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...kids);
    const matrix = () => Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0, 0, 0]);
    /** mp4({w, h, fps, frames: [{data, key}], avcC, audio: {frames: [Uint8Array], asc, sr, ch} | null}) → Uint8Array */
    function mp4({w, h, fps, frames, avcC, audio = null}) {
        const vScale = fps * 1000, vDur = 1000, aSr = audio?.sr || 48000;
        const ftyp = box('ftyp', te.encode('isom'), u32(512), te.encode('isom'), te.encode('iso2'), te.encode('avc1'), te.encode('mp41'));
        const vData = frames.map(f => f.data), aData = audio ? audio.frames : [];
        const mdatBody = concat([...vData, ...aData]), mdat = concat([Uint8Array.from(u32(mdatBody.length + 8)), te.encode('mdat'), mdatBody]);
        const base = ftyp.length + 8; let off = base;
        const vOff = vData.map(d => { const o = off; off += d.length; return o; }), aOff = aData.map(d => { const o = off; off += d.length; return o; });
        const durSec = frames.length / fps;
        const tkhd = (id, isAudio) => full('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(Math.round(durSec * 1000)), u32(0), u32(0), u16(0), u16(isAudio ? 1 : 0), u16(isAudio ? 0x0100 : 0), u16(0), matrix(), u32(isAudio ? 0 : w << 16), u32(isAudio ? 0 : h << 16));
        const stbl = (entry, sizes, offs, stts, stss) => box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(stts.length), ...stts.map(([c, d]) => Uint8Array.from([...u32(c), ...u32(d)]))),
            ...(stss ? [full('stss', 0, 0, u32(stss.length), ...stss.map(n => Uint8Array.from(u32(n))))] : []),
            full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)), full('stsz', 0, 0, u32(0), u32(sizes.length), ...sizes.map(s => Uint8Array.from(u32(s)))), full('stco', 0, 0, u32(offs.length), ...offs.map(o => Uint8Array.from(u32(o)))));
        const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
        const avc1 = box('avc1', [0, 0, 0, 0, 0, 0], u16(1), new Uint8Array(16), u16(w), u16(h), u32(0x00480000), u32(0x00480000), u32(0), u16(1), new Uint8Array(32), u16(0x18), u16(0xFFFF), box('avcC', avcC));
        const vTrak = box('trak', tkhd(1, false), box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(vScale), u32(frames.length * vDur), u16(0x55C4), u16(0)), full('hdlr', 0, 0, u32(0), te.encode('vide'), new Uint8Array(12), te.encode('VideoHandler\0')),
            box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf, stbl(avc1, vData.map(d => d.length), vOff, [[frames.length, vDur]], frames.map((f, i) => (f.key ? i + 1 : 0)).filter(Boolean)))));
        let aTrak = new Uint8Array(0);
        if (audio) {
            const asc = audio.asc, esLen = 3 + (2 + 13 + 2 + asc.length) + 3;
            const esds = full('esds', 0, 0, [0x03, esLen, 0, 1, 0, 0x04, 13 + 2 + asc.length, 0x40, 0x15, 0, 0, 0, ...u32(128000), ...u32(128000), 0x05, asc.length, ...asc, 0x06, 1, 2]);
            const mp4a = box('mp4a', [0, 0, 0, 0, 0, 0], u16(1), u32(0), u32(0), u16(audio.ch || 2), u16(16), u16(0), u16(0), u32(aSr << 16), esds);
            aTrak = box('trak', tkhd(2, true), box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(aSr), u32(aData.length * 1024), u16(0x55C4), u16(0)), full('hdlr', 0, 0, u32(0), te.encode('soun'), new Uint8Array(12), te.encode('SoundHandler\0')),
                box('minf', full('smhd', 0, 0, u16(0), u16(0)), dinf, stbl(mp4a, aData.map(d => d.length), aOff, [[aData.length, 1024]], null))));
        }
        const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(Math.round(durSec * 1000)), u32(0x00010000), u16(0x0100), new Uint8Array(10), matrix(), new Uint8Array(24), u32(audio ? 3 : 2));
        const moov = box('moov', mvhd, vTrak, aTrak);
        return concat([ftyp, mdat, moov]);
    }

    /* ═════ GIF : une palette commune (les couleurs les plus présentes), LZW ═════ */
    function palette(samples) {
        const hist = new Uint32Array(32768);
        samples.forEach(d => { for (let i = 0; i < d.length; i += 16) hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++; });
        const idx = []; for (let i = 0; i < 32768; i++) if (hist[i]) idx.push(i);
        idx.sort((a, b) => hist[b] - hist[a]);
        const pal = [];
        for (const c of idx) { const r = ((c >> 10) & 31) * 8 + 4, g = ((c >> 5) & 31) * 8 + 4, b = (c & 31) * 8 + 4; if (pal.every(p => (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2 > 140)) pal.push([r, g, b]); if (pal.length >= 256) break; }
        while (pal.length < 256) pal.push([0, 0, 0]);
        const lut = new Uint8Array(32768);
        for (let c = 0; c < 32768; c++) { const r = ((c >> 10) & 31) * 8 + 4, g = ((c >> 5) & 31) * 8 + 4, b = (c & 31) * 8 + 4; let best = 0, bd = 1e9; for (let j = 0; j < 256; j++) { const p = pal[j], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = j; if (!d) break; } } lut[c] = best; }
        return {pal, lut};
    }
    function lzw(pixels) {
        const out = [], clear = 256, eoi = 257; let size = 9, next = 258, dict = new Map(), cur = 0, bits = 0, block = [];
        const emit = code => { cur |= code << bits; bits += size; while (bits >= 8) { block.push(cur & 255); cur >>>= 8; bits -= 8; if (block.length === 255) { out.push(255, ...block); block = []; } } };
        emit(clear); let w = pixels[0];
        for (let i = 1; i < pixels.length; i++) {
            const k = pixels[i], key = w * 256 + k + 1;
            if (dict.has(key)) { w = dict.get(key); continue; }
            emit(w);
            if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = 9; next = 258; }
            w = k;
        }
        emit(w); emit(eoi); if (bits > 0) block.push(cur & 255); if (block.length) out.push(block.length, ...block); out.push(0);
        return Uint8Array.from(out);
    }
    /** gif({w, h, frames: [Uint8ClampedArray RGBA], delay (centièmes de s), loop}) → Uint8Array */
    function gif({w, h, frames, delay = 8, loop = true}) {
        const {pal, lut} = palette(frames.filter((_, i) => i % Math.max(1, Math.floor(frames.length / 6)) === 0));
        const parts = [te.encode('GIF89a'), Uint8Array.from([w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0]), Uint8Array.from(pal.flat())];
        if (loop) parts.push(Uint8Array.from([0x21, 0xFF, 11, ...te.encode('NETSCAPE2.0'), 3, 1, 0, 0, 0]));
        frames.forEach(d => {
            const px = new Uint8Array(w * h); for (let i = 0, j = 0; i < px.length; i++, j += 4) px[i] = lut[((d[j] >> 3) << 10) | ((d[j + 1] >> 3) << 5) | (d[j + 2] >> 3)];
            parts.push(Uint8Array.from([0x21, 0xF9, 4, 0x04, delay & 255, delay >> 8, 0, 0]), Uint8Array.from([0x2C, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8]), lzw(px));
        });
        parts.push(Uint8Array.from([0x3B]));
        return concat(parts);
    }

    /* ═════ .zip sans compression (les images PNG le sont déjà) ═════ */
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255], le16 = v => [v & 255, (v >> 8) & 255];
    function zip(files) {
        const parts = [], dir = []; let off = 0;
        files.forEach(({name, data}) => {
            const n = te.encode(name), c = crc32(data);
            const loc = Uint8Array.from([...le32(0x04034b50), ...le16(20), 0, 0, 0, 0, 0, 0, 0, 0x21, ...le32(c), ...le32(data.length), ...le32(data.length), ...le16(n.length), 0, 0]);
            parts.push(loc, n, data);
            dir.push(Uint8Array.from([...le32(0x02014b50), ...le16(20), ...le16(20), 0, 0, 0, 0, 0, 0, 0, 0x21, ...le32(c), ...le32(data.length), ...le32(data.length), ...le16(n.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le32(off)]), n);
            off += loc.length + n.length + data.length;
        });
        const cd = concat(dir), end = Uint8Array.from([...le32(0x06054b50), 0, 0, 0, 0, ...le16(files.length), ...le16(files.length), ...le32(cd.length), ...le32(off), 0, 0]);
        return concat([...parts, cd, end]);
    }

    /* ═════ sous-titres ═════ */
    const ts = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
    /** cues = [{start, end, text}] (secondes) → texte .srt */
    const srt = cues => cues.filter(c => c.text).sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${String(c.text).replace(/\r/g, '')}\n`).join('\n');
    /** les légendes du film, avec leurs heures (une légende d'année : le premier instant où l'année est atteinte) */
    async function cues(proj, W, H) {
        const R = RN(), out = []; let t0 = 0;
        for (const s of proj.scenes || []) {
            const d = R.durOf(s), st = await R.prepare(s, W, H), rg = R.range(s);
            const caps = [...(s.captions || []), ...((st.caps || []).filter(c => !(s.hiddenAuto || []).includes(c.text)))];
            caps.forEach(c => {
                let p = Number(c.t) || 0;
                if (Number.isFinite(c.year)) { p = 1; for (let j = 0; j <= 400; j++) { if (R.yearAt(rg, j / 400, st.warp) >= c.year) { p = j / 400; break; } } }
                const start = t0 + p * d; out.push({start, end: Math.min(t0 + d, start + (Number(c.dur) || 3.5)), text: c.text});
            });
            if (s.type === 'image' && s.text) out.push({start: t0, end: t0 + d, text: s.text});
            t0 += d;
        }
        return out;
    }

    /* ═════ le son : musique et voix, mélangés d'avance ═════ */
    async function decode(m) {
        const fn = m && typeof m === 'object' ? m.filename : ''; if (!fn) return null;
        const buf = await (await fetch(`media/${encodeURIComponent(fn)}`)).arrayBuffer();
        const Ctx = root.AudioContext || root.webkitAudioContext, ctx = new Ctx(); try { return await ctx.decodeAudioData(buf); } finally { ctx.close?.(); }
    }
    /** → AudioBuffer (48 kHz, stéréo) de la durée du film, ou null s'il n'y a pas de son */
    async function mixAudio(proj, total) {
        const mus = proj.music?.media ? proj.music : null, voices = (proj.voices || []).filter(v => v.media);
        if (!mus && !voices.length) return null;
        const Off = root.OfflineAudioContext || root.webkitOfflineAudioContext; if (!Off) return null;
        const sr = 48000, ctx = new Off(2, Math.ceil(total * sr), sr);
        const vbufs = await Promise.all(voices.map(v => decode(v.media).catch(() => null)));
        const busy = voices.map((v, i) => (vbufs[i] ? [Number(v.at) || 0, (Number(v.at) || 0) + vbufs[i].duration] : null)).filter(Boolean);
        if (mus) {
            const b = await decode(mus.media).catch(() => null);
            if (b) {
                const src = ctx.createBufferSource(), gn = ctx.createGain(), vol = clamp(Number(mus.vol ?? .7), 0, 1.5), fi = clamp(Number(mus.fadeIn ?? 2), 0, 30), fo = clamp(Number(mus.fadeOut ?? 3), 0, 30);
                src.buffer = b; src.loop = mus.loop !== false && b.duration < total; src.connect(gn); gn.connect(ctx.destination);
                const G = gn.gain, start = clamp(Number(mus.start) || 0, 0, Math.max(0, b.duration - .5));
                G.setValueAtTime(fi ? 0 : vol, 0); if (fi) G.linearRampToValueAtTime(vol, fi);
                if (mus.duck !== false) busy.forEach(([a, z]) => { const low = vol * clamp(Number(mus.duckLevel ?? .3), 0, 1); G.setValueAtTime(vol, Math.max(fi, a - .4)); G.linearRampToValueAtTime(low, Math.max(fi, a)); G.setValueAtTime(low, z); G.linearRampToValueAtTime(vol, z + .5); });
                G.setValueAtTime(vol, Math.max(0, total - fo)); G.linearRampToValueAtTime(0, total);
                src.start(0, start);
            }
        }
        voices.forEach((v, i) => { const b = vbufs[i]; if (!b) return; const src = ctx.createBufferSource(), gn = ctx.createGain(); src.buffer = b; gn.gain.value = clamp(Number(v.vol ?? 1), 0, 2); src.connect(gn); gn.connect(ctx.destination); src.start(clamp(Number(v.at) || 0, 0, total)); });
        return ctx.startRendering();
    }

    /* ═════ ce que cet ordinateur sait faire ═════ */
    async function capabilities(W = 1920, H = 1080) {
        const out = {webcodecs: typeof root.VideoEncoder !== 'undefined', vp9: false, vp8: false, avc: '', opus: false, aac: false, recorder: typeof root.MediaRecorder !== 'undefined', recMp4: false};
        if (out.webcodecs) {
            const ok = async c => { try { return (await root.VideoEncoder.isConfigSupported({codec: c, width: W, height: H, bitrate: 6e6, framerate: 30})).supported; } catch (_) { return false; } };
            out.vp9 = await ok(W * H > 2073600 ? 'vp09.00.51.08' : 'vp09.00.40.08'); out.vp8 = await ok('vp8');
            for (const c of W * H > 2073600 ? ['avc1.640033', 'avc1.4D0033'] : ['avc1.640028', 'avc1.4D0028', 'avc1.42E028']) if (await ok(c)) { out.avc = c; break; }
            const aok = async c => { try { return !!root.AudioEncoder && (await root.AudioEncoder.isConfigSupported({codec: c, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000})).supported; } catch (_) { return false; } };
            out.opus = await aok('opus'); out.aac = await aok('mp4a.40.2');
        }
        if (out.recorder) out.recMp4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'].some(m => root.MediaRecorder.isTypeSupported?.(m));
        return out;
    }

    /* ═════ l'audio encodé (Opus pour le WebM, AAC pour le MP4) ═════ */
    async function encodeAudio(buf, codec) {
        if (!buf) return null;
        const packets = [], frames = []; let head = null, asc = null, err = null;
        const enc = new root.AudioEncoder({output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); packets.push({data: d, ts: chunk.timestamp}); frames.push(d); const desc = meta?.decoderConfig?.description; if (desc && !head && !asc) { const u = new Uint8Array(desc.buffer ? desc.buffer.slice(desc.byteOffset || 0, (desc.byteOffset || 0) + desc.byteLength) : desc); if (codec === 'opus') head = u; else asc = u; } }, error: e => { err = e; }});
        enc.configure({codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000});
        const N = codec === 'opus' ? 960 : 1024, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
        for (let i = 0; i < buf.length; i += N) {
            const n = Math.min(N, buf.length - i), data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
            const ad = new root.AudioData({format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48 * 1000), data});
            enc.encode(ad); ad.close();
            if (enc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 0));
        }
        await enc.flush(); enc.close(); if (err) throw err;
        if (codec === 'opus' && !head) { head = new Uint8Array(19); head.set(te.encode('OpusHead')); head[8] = 1; head[9] = 2; new DataView(head.buffer).setUint16(10, 312, true); new DataView(head.buffer).setUint32(12, 48000, true); }
        if (codec !== 'opus' && !asc) asc = Uint8Array.from([0x11, 0x90]); // AAC-LC, 48 kHz, stéréo
        return {packets, frames, head, asc, sr: 48000, ch: 2};
    }

    /* ═════ fabriquer la vidéo ═════ */
    const makeCanvas = (w, h) => { const c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; };
    /** makeVideo(proj, {format: 'webm' | 'mp4', W, H, fps, onProgress(k, texte), signal}) → {blob, ext, realtime} */
    async function makeVideo(proj, {format = 'mp4', W = 1920, H = 1080, fps = 30, onProgress = null, signal = null} = {}) {
        const R = RN(), total = R.totalDur(proj); if (!total) throw new Error(T('Le film est vide : ajoute une scène.'));
        const caps = await capabilities(W, H), stop = () => { if (signal?.aborted) throw new DOMException(T('Arrêté'), 'AbortError'); };
        onProgress?.(0, T('Préparation des scènes…'));
        for (const s of proj.scenes) { stop(); await R.prepare(s, W, H, {onStep: m => onProgress?.(0, m)}); }
        onProgress?.(0, T('Le son…'));
        const audioBuf = await mixAudio(proj, total);
        const wantMp4 = format === 'mp4', fast = caps.webcodecs && (wantMp4 ? !!caps.avc && (!audioBuf || caps.aac) : (caps.vp9 || caps.vp8) && (!audioBuf || caps.opus));
        if (!fast) return realtime(proj, {W, H, fps, audioBuf, wantMp4, onProgress, signal, total});
        const cv = makeCanvas(W, H), g = cv.getContext('2d'), frames = []; let err = null, avcC = null;
        const codec = wantMp4 ? caps.avc : caps.vp9 ? (W * H > 2073600 ? 'vp09.00.51.08' : 'vp09.00.40.08') : 'vp8';
        const enc = new root.VideoEncoder({output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); frames.push({data: d, ts: chunk.timestamp, key: chunk.type === 'key'}); if (meta?.decoderConfig?.description && !avcC) { const x = meta.decoderConfig.description; avcC = new Uint8Array(x.buffer ? x.buffer.slice(x.byteOffset || 0, (x.byteOffset || 0) + x.byteLength) : x); } }, error: e => { err = e; }});
        enc.configure({codec, width: W, height: H, bitrate: Math.round(W * H * fps * .1), framerate: fps, ...(wantMp4 ? {avc: {format: 'avc'}} : {})});
        const n = Math.max(1, Math.round(total * fps));
        for (let i = 0; i < n; i++) {
            stop(); if (err) throw err;
            await R.drawFrame(g, proj, i / fps, W, H);
            const vf = new root.VideoFrame(cv, {timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps)});
            enc.encode(vf, {keyFrame: i % (fps * 2) === 0}); vf.close();
            while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
            if (i % 5 === 0) onProgress?.(i / n * .92, T('Image {a} sur {b}', {a: String(i + 1), b: String(n)}));
        }
        await enc.flush(); enc.close(); if (err) throw err;
        onProgress?.(.95, T('Le son…'));
        const audio = audioBuf ? await encodeAudio(audioBuf, wantMp4 ? 'mp4a.40.2' : 'opus') : null;
        const bytes = wantMp4 ? mp4({w: W, h: H, fps, frames, avcC, audio}) : webm({w: W, h: H, codec: codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8', frames, audio, durationMs: total * 1000});
        onProgress?.(1, T('Fini'));
        return {blob: new Blob([bytes], {type: wantMp4 ? 'video/mp4' : 'video/webm'}), ext: wantMp4 ? 'mp4' : 'webm', realtime: false};
    }
    /** en temps réel : le film se joue sur un canevas enregistré par le navigateur, avec le son */
    async function realtime(proj, {W, H, fps, audioBuf, wantMp4, onProgress, signal, total}) {
        if (!root.MediaRecorder) throw new Error(T('Cet ordinateur ne sait pas fabriquer de vidéo.'));
        const R = RN(), cv = makeCanvas(W, H), g = cv.getContext('2d'), stream = cv.captureStream(fps);
        let actx = null, src = null;
        if (audioBuf) { actx = new (root.AudioContext || root.webkitAudioContext)(); const dest = actx.createMediaStreamDestination(); src = actx.createBufferSource(); src.buffer = audioBuf; src.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
        const mimes = wantMp4 ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        const mime = mimes.find(m => root.MediaRecorder.isTypeSupported?.(m)) || '';
        const rec = new root.MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: Math.round(W * H * fps * .1)} : {}), chunks = [];
        rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
        const done = new Promise(r => { rec.onstop = r; });
        await R.drawFrame(g, proj, 0, W, H); rec.start(500); src?.start();
        const t0 = performance.now();
        while (true) {
            if (signal?.aborted) { rec.stop(); src?.stop(); actx?.close(); throw new DOMException(T('Arrêté'), 'AbortError'); }
            const t = (performance.now() - t0) / 1000; if (t >= total) break;
            await R.drawFrame(g, proj, t, W, H); onProgress?.(t / total, T('En temps réel : {a} s sur {b}', {a: String(Math.floor(t)), b: String(Math.ceil(total))}));
            await new Promise(r => setTimeout(r, Math.max(0, 1000 / fps - 4)));
        }
        rec.stop(); src?.stop?.(); await done; actx?.close();
        const type = (mime || 'video/webm').split(';')[0];
        return {blob: new Blob(chunks, {type}), ext: /mp4/.test(type) ? 'mp4' : 'webm', realtime: true};
    }
    /** makeGif(proj, {W (≤ 960), fps (≤ 15)}) */
    async function makeGif(proj, {W = 640, H = 360, fps = 10, onProgress = null, signal = null} = {}) {
        const R = RN(), total = R.totalDur(proj), cv = makeCanvas(W, H), g = cv.getContext('2d', {willReadFrequently: true}), n = Math.max(1, Math.round(total * fps)), frames = [];
        for (const s of proj.scenes) await R.prepare(s, W, H);
        for (let i = 0; i < n; i++) { if (signal?.aborted) throw new DOMException(T('Arrêté'), 'AbortError'); await R.drawFrame(g, proj, i / fps, W, H); frames.push(g.getImageData(0, 0, W, H).data.slice()); if (i % 3 === 0) onProgress?.(i / n * .8, T('Image {a} sur {b}', {a: String(i + 1), b: String(n)})); }
        onProgress?.(.85, T('Les couleurs…'));
        const bytes = gif({w: W, h: H, frames, delay: Math.round(100 / fps), loop: proj.gifLoop !== false});
        onProgress?.(1, T('Fini'));
        return {blob: new Blob([bytes], {type: 'image/gif'}), ext: 'gif'};
    }
    /** une image par seconde (ou par année), en PNG, dans un .zip */
    async function makePngZip(proj, {W = 1920, H = 1080, every = 1, onProgress = null, signal = null} = {}) {
        const R = RN(), total = R.totalDur(proj), cv = makeCanvas(W, H), g = cv.getContext('2d'), files = [], n = Math.max(1, Math.floor(total / every));
        for (const s of proj.scenes) await R.prepare(s, W, H);
        for (let i = 0; i <= n; i++) {
            if (signal?.aborted) throw new DOMException(T('Arrêté'), 'AbortError');
            await R.drawFrame(g, proj, Math.min(total - .01, i * every), W, H);
            const b = await new Promise(r => cv.toBlob(r, 'image/png')); files.push({name: `image-${String(i + 1).padStart(4, '0')}.png`, data: new Uint8Array(await b.arrayBuffer())});
            onProgress?.(i / n, T('Image {a} sur {b}', {a: String(i + 1), b: String(n + 1)}));
        }
        return {blob: new Blob([zip(files)], {type: 'application/zip'}), ext: 'zip'};
    }

    ext.animExport = {capabilities, makeVideo, makeGif, makePngZip, srt, cues, mixAudio, webm, mp4, gif, zip, crc32, lzw};
    if (typeof module === 'object' && module.exports) module.exports = ext.animExport;
})();
