/**
 * 🗂 PSD (Photoshop, GIMP, Photopea, Affinity, Krita) — lire et écrire, avec les calques, sans rien installer :
 *  - lire : 8 bits, RVB ou niveaux de gris, sans compression ou RLE (PackBits) ; les calques (nom avec accents, position,
 *    opacité, visible ou non, mode de fusion, transparence) et l'image aplatie ; les dossiers et masques sont passés ;
 *  - écrire : RVB 8 bits, un calque par calque de la retouche (rogné à ce qu'il contient), plus l'image aplatie.
 * Dans la retouche (menu Fichier) : ⤓ Exporter en PSD, ⤒ Importer les calques d'un PSD (posés comme calques, à la taille de la photo).
 * Sans écran (Node, essais) : ext.psd = {read, write, BLEND_IN, BLEND_OUT}.
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const BLEND_IN = {norm: 'source-over', 'mul ': 'multiply', scrn: 'screen', over: 'overlay', dark: 'darken', lite: 'lighten', 'div ': 'color-dodge', idiv: 'color-burn',
        hLit: 'hard-light', sLit: 'soft-light', diff: 'difference', smud: 'exclusion', 'hue ': 'hue', 'sat ': 'saturation', colr: 'color', 'lum ': 'luminosity'};
    const BLEND_OUT = Object.fromEntries(Object.entries(BLEND_IN).map(([k, v]) => [v, k]));

    /* ═════════ Lire ═════════ */
    /** RLE PackBits : n octets attendus à partir de p ; rend [données, position suivante] */
    function unpack(u, p, n, out, o) {
        const end = o + n;
        while (o < end && p < u.length) {
            const h = u[p++];
            if (h < 128) { const k = h + 1; out.set(u.subarray(p, p + k), o); p += k; o += k; }
            else if (h > 128) { const k = 257 - h, v = u[p++]; out.fill(v, o, Math.min(end, o + k)); o += k; }
        }
        return p;
    }
    function read(buf) {
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let p = 0;
        const u8 = () => u[p++], u16 = () => { const v = dv.getUint16(p); p += 2; return v; }, i16 = () => { const v = dv.getInt16(p); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p); p += 4; return v; }, i32 = () => { const v = dv.getInt32(p); p += 4; return v; };
        const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u[p + i]); p += n; return s; };
        if (u.length < 26 || str(4) !== '8BPS') throw new Error('ce n’est pas un fichier PSD');
        const ver = u16(); if (ver !== 1) throw new Error(ver === 2 ? 'les très grands PSD (PSB) ne sont pas lus' : 'version de PSD inconnue');
        p += 6; const nch = u16(), H = u32(), W = u32(), depth = u16(), mode = u16();
        if (depth !== 8) throw new Error(`profondeur ${depth} bits non lue (seulement 8 bits)`);
        if (mode !== 3 && mode !== 1) throw new Error('seuls les PSD en RVB ou en niveaux de gris sont lus');
        if (W * H > 60e6 || !W || !H) throw new Error('image trop grande');
        const skip = () => { const n = u32(); p += n; }; // (« p += u32() » lirait p avant que u32 ne l'avance)
        skip(); // couleurs indexées : rien
        skip(); // ressources de l'image
        const lmLen = u32(), lmEnd = p + lmLen, layers = [];
        if (lmLen) {
            const liLen = u32(), liEnd = p + liLen;
            if (liLen) {
                const n = Math.abs(i16()), recs = [];
                for (let k = 0; k < n; k++) {
                    const top = i32(), left = i32(), bottom = i32(), right = i32(), cc = u16(), chans = [];
                    for (let c = 0; c < cc; c++) chans.push({id: i16(), len: u32()});
                    p += 4; const key = str(4), opacity = u8(); p++; const flags = u8(); p++;
                    const exLen = u32(), exEnd = p + exLen;
                    skip(); skip(); // masque du calque, plages de fusion
                    const nl = u8(); let name = String.fromCharCode(...u.subarray(p, p + nl)); p += nl + ((1 + nl) % 4 ? 4 - (1 + nl) % 4 : 0); // nom Pascal, complété à 4 octets
                    let folder = 0;
                    while (p + 12 <= exEnd) { // les informations en plus : nom en Unicode, dossiers
                        const sig = str(4); if (sig !== '8BIM' && sig !== '8B64') break; const k2 = str(4), len = u32(), at = p;
                        if (k2 === 'luni') { const cnt = u32(); let s = ''; for (let i = 0; i < cnt; i++) s += String.fromCharCode(dv.getUint16(p + i * 2)); if (s.replace(/\0+$/, '')) name = s.replace(/\0+$/, ''); }
                        if (k2 === 'lsct' || k2 === 'lsdk') folder = dv.getUint32(at);
                        p = at + len + (len % 2);
                    }
                    p = exEnd;
                    recs.push({top, left, w: Math.max(0, right - left), h: Math.max(0, bottom - top), chans, blend: BLEND_IN[key] || 'source-over', opacity: opacity / 255, visible: !(flags & 2), name, folder});
                }
                for (const r of recs) { // les pixels, canal par canal
                    const n2 = r.w * r.h, rgba = n2 ? new Uint8ClampedArray(n2 * 4).fill(255) : null;
                    for (const ch of r.chans) {
                        const start = p, comp = u16(), idx = ch.id === -1 ? 3 : ch.id >= 0 && ch.id <= 2 ? ch.id : -1;
                        if (rgba && idx >= 0 && (comp === 0 || comp === 1)) {
                            const plane = new Uint8Array(n2);
                            if (comp === 0) plane.set(u.subarray(p, p + n2));
                            else { let q = p + r.h * 2; for (let y = 0; y < r.h; y++) q = unpack(u, q, r.w, plane, y * r.w); }
                            if (mode === 1 && idx === 0) for (let i = 0; i < n2; i++) rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = plane[i];
                            else if (!(mode === 1 && idx > 0 && idx < 3)) for (let i = 0; i < n2; i++) rgba[i * 4 + idx] = plane[i];
                        }
                        p = start + ch.len;
                    }
                    r.rgba = rgba; delete r.chans;
                    if (!r.folder && rgba) layers.push(r);
                }
            }
            p = lmEnd;
        }
        // l'image aplatie
        const comp = u16(), n2 = W * H, rgba = new Uint8ClampedArray(n2 * 4).fill(255), planes = [];
        if (comp === 1) { let q = p + nch * H * 2; for (let c = 0; c < nch; c++) { const pl = new Uint8Array(n2); for (let y = 0; y < H; y++) q = unpack(u, q, W, pl, y * W); planes.push(pl); } }
        else if (comp === 0) for (let c = 0; c < nch; c++) planes.push(u.subarray(p + c * n2, p + (c + 1) * n2));
        else throw new Error('compression ZIP non lue');
        const map = mode === 1 ? [0, 0, 0, nch > 1 ? 1 : -1] : [0, 1, 2, nch > 3 ? 3 : -1];
        for (let i = 0; i < n2; i++) for (let c = 0; c < 4; c++) { const s = map[c]; if (s >= 0 && planes[s]) rgba[i * 4 + c] = planes[s][i]; }
        return {w: W, h: H, composite: rgba, layers};
    }

    /* ═════════ Écrire ═════════ */
    /** {w, h, composite: RGBA, layers: [{name, rgba (w × h du document), opacity, visible, blend}]} (du bas vers le haut) → Uint8Array */
    function write({w: W, h: H, composite, layers = []}) {
        const parts = []; let len = 0;
        const push = a => { parts.push(a); len += a.length; };
        const be = (n, v) => { const a = new Uint8Array(n); for (let i = n - 1; i >= 0; i--) { a[i] = v & 255; v = Math.floor(v / 256); } return a; };
        const i32 = v => be(4, v < 0 ? v + 4294967296 : v), i16 = v => be(2, v < 0 ? v + 65536 : v), ascii = s => Uint8Array.from([...s].map(c => c.charCodeAt(0) & 255));
        push(ascii('8BPS')); push(be(2, 1)); push(new Uint8Array(6)); push(be(2, 3)); push(be(4, H)); push(be(4, W)); push(be(2, 8)); push(be(2, 3));
        push(be(4, 0)); push(be(4, 0));
        // les calques : rognés à ce qu'ils contiennent
        const recs = layers.map(l => {
            let x0 = W, y0 = H, x1 = -1, y1 = -1; const d = l.rgba;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            const w = x1 >= x0 ? x1 - x0 + 1 : 0, h = y1 >= y0 ? y1 - y0 + 1 : 0, planes = [-1, 0, 1, 2].map(id => { const c = id < 0 ? 3 : id, pl = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pl[y * w + x] = d[((y0 + y) * W + x0 + x) * 4 + c]; return [id, pl]; });
            return {l, x0: w ? x0 : 0, y0: h ? y0 : 0, w, h, planes};
        });
        const info = [];
        info.push(i16(recs.length));
        const nameBytes = s => { const a = ascii(String(s).replace(/[^\x20-\x7e]/g, '_').slice(0, 255)), n = a.length + 1, pad = (4 - n % 4) % 4, o = new Uint8Array(n + pad); o[0] = a.length; o.set(a, 1); return o; };
        const luni = s => { const cs = [...String(s).slice(0, 255)].map(c => c.charCodeAt(0)), body = new Uint8Array(4 + cs.length * 2 + ((cs.length * 2) % 4 ? 2 : 0)); body.set(be(4, cs.length)); cs.forEach((c, i) => { body[4 + i * 2] = c >> 8; body[5 + i * 2] = c & 255; }); return [ascii('8BIM'), ascii('luni'), be(4, body.length), body]; };
        for (const r of recs) {
            info.push(i32(r.y0), i32(r.x0), i32(r.y0 + r.h), i32(r.x0 + r.w), be(2, 4));
            r.planes.forEach(([id, pl]) => info.push(i16(id), be(4, pl.length + 2)));
            const blend = BLEND_OUT[r.l.blend] || 'norm', extra = [be(4, 0), be(4, 0), nameBytes(r.l.name || 'Calque'), ...luni(r.l.name || 'Calque')], exLen = extra.reduce((s, a) => s + a.length, 0);
            info.push(ascii('8BIM'), ascii(blend), Uint8Array.of(Math.round(Math.max(0, Math.min(1, r.l.opacity ?? 1)) * 255)), Uint8Array.of(0), Uint8Array.of(r.l.visible === false ? 2 : 0), Uint8Array.of(0), be(4, exLen), ...extra);
        }
        for (const r of recs) r.planes.forEach(([, pl]) => info.push(be(2, 0), pl));
        let infoLen = info.reduce((s, a) => s + a.length, 0); if (infoLen % 2) { info.push(new Uint8Array(1)); infoLen++; }
        push(be(4, 4 + infoLen + 4)); push(be(4, infoLen)); info.forEach(push); push(be(4, 0));
        // l'image aplatie (RVB, sans compression)
        push(be(2, 0)); for (let c = 0; c < 3; c++) { const pl = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) pl[i] = composite[i * 4 + c]; push(pl); }
        const out = new Uint8Array(len); let o = 0; parts.forEach(a => { out.set(a, o); o += a.length; }); return out;
    }
    ext.psd = {read, write, BLEND_IN, BLEND_OUT};
    if (typeof module === 'object' && module.exports) module.exports = {read, write, BLEND_IN, BLEND_OUT};
    if (typeof document === 'undefined') return;

    /* ═════════ Dans la retouche ═════════ */
    const A = () => root.LCNDA_APP;
    const rgbaOf = cv => cv.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, cv.width, cv.height).data;
    const canvasOf = (rgba, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0); return c; };
    ext.rtPsd = {
        /** ⤓ un PSD : la photo (avec ses réglages) en bas, puis chaque calque ; et l'image aplatie telle qu'on la voit */
        async export(c) {
            const W = c.pw, H = c.ph, base = c.photo(), list = [{name: 'Photo', rgba: rgbaOf(base), opacity: 1, visible: true, blend: 'source-over'}];
            c.psdLayers().forEach(l => { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').drawImage(l.canvas, 0, 0, W, H); list.push({...l, rgba: rgbaOf(t)}); });
            const flat = document.createElement('canvas'); flat.width = W; flat.height = H; const fg = flat.getContext('2d'); fg.fillStyle = '#fff'; fg.fillRect(0, 0, W, H); fg.drawImage(c.composite(), 0, 0);
            const bytes = write({w: W, h: H, composite: rgbaOf(flat), layers: list});
            const name = `${String(c.title() || 'photo').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'photo'}.psd`;
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type: 'image/vnd.adobe.photoshop'})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
            A().toast(`🗂 PSD prêt : ${list.length} calque${list.length > 1 ? 's' : ''}, ${W} × ${H} px (les calques de réglage sont dans l’image aplatie).`, 'success');
        },
        /** ⤒ les calques d'un PSD posés sur la photo, à sa taille (le PSD est étiré s'il n'a pas les mêmes proportions) */
        async import(c) {
            const f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.psd,image/vnd.adobe.photoshop'; i.hidden = true; i.onchange = () => { res(i.files?.[0] || null); i.remove(); }; document.body.appendChild(i); i.click(); }); if (!f) return; // la fenêtre d'import commune de l'app (dépôt, ou choisir le fichier)
            if (f.size > 400e6) return A().toast('Fichier trop gros.', 'error');
            let d; try { d = read(await f.arrayBuffer()); } catch (err) { return A().toast(`PSD illisible : ${err.message}.`, 'error'); }
            const list = d.layers.length ? d.layers : [{name: f.name.replace(/\.psd$/i, ''), top: 0, left: 0, w: d.w, h: d.h, rgba: d.composite, opacity: 1, visible: true, blend: 'source-over'}];
            c.setActive('');
            for (const l of list) {
                if (!l.w || !l.h) continue;
                const node = c.newLayer(l.name || 'Calque PSD'); node.ops = [{type: 'image', mask: c.addMask(canvasOf(l.rgba, l.w, l.h)), x: l.left / d.w, y: l.top / d.h, w: l.w / d.w, h: l.h / d.h, rot: 0, opacity: 1}];
                node.opacity = l.opacity; node.visible = l.visible; if (l.blend !== 'source-over') node.blend = l.blend; c.renderLayer(node);
            }
            c.refresh(); c.commit(`PSD importé : ${f.name}`); c.showTab?.('layers');
            A().toast(`🗂 ${list.length} calque${list.length > 1 ? 's' : ''} importé${list.length > 1 ? 's' : ''} de « ${f.name} »${d.w / d.h !== c.pw / c.ph ? ' (proportions différentes : ajusté à la photo)' : ''}.`, 'success');
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);
