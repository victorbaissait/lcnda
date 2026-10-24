/**
 * 📐 Mise en page — ⤓ PDF/A (archivage, norme ISO 19005-2, niveau B) : un PDF fait pour durer, sans rien d'extérieur.
 *  - chaque page est dessinée en image haute définition (200 ou 300 points par pouce), photos comprises ;
 *  - le fichier porte son profil de couleur sRGB (intégré), ses métadonnées XMP (titre, auteur, sujet, mots-clés, langue,
 *    dates, « PDF/A-2B ») identiques au dictionnaire d'informations, un identifiant ; ni police à aller chercher, ni lien
 *    actif, ni script, ni chiffrement.
 * Sans écran (Node, essais) : ext.layoutPdfA = {build, icc} ; build(pages, meta) → Uint8Array, une page = {jpeg, w, h, wPt, hPt}.
 * Branché dans la fenêtre « ⤓ Exporter » de la mise en page (heritage-layout.js) par ext.layoutPdfA.fromDoc(doc, name, opts).
 */
(function (root) {
    'use strict';
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};

    /* ═════════ Le profil sRGB (ICC v2.1, « mntr », RGB → XYZ), fabriqué ici : ~1 Ko ═════════ */
    function icc() {
        const tags = [], u8 = [], be32 = (a, v) => a.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255), s15 = v => Math.round(v * 65536) | 0, sig = (a, s) => [...s].forEach(c => a.push(c.charCodeAt(0)));
        const xyz = (x, y, z) => { const a = []; sig(a, 'XYZ '); be32(a, 0); [x, y, z].forEach(v => be32(a, s15(v))); return a; };
        const text = s => { const a = []; sig(a, 'text'); be32(a, 0); sig(a, s); a.push(0); return a; };
        const desc = s => { const a = []; sig(a, 'desc'); be32(a, 0); be32(a, s.length + 1); sig(a, s); a.push(0); be32(a, 0); be32(a, 0); a.push(0, 0, 0); for (let i = 0; i < 67; i++) a.push(0); return a; };
        // la courbe sRGB (IEC 61966-2-1), en 1024 points
        const curv = (() => { const a = []; sig(a, 'curv'); be32(a, 0); be32(a, 1024); for (let i = 0; i < 1024; i++) { const v = i / 1023, l = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4), n = Math.round(l * 65535); a.push(n >> 8, n & 255); } return a; })();
        tags.push(['desc', desc('sRGB IEC61966-2.1')], ['cprt', text('No copyright, use freely')], ['wtpt', xyz(0.9642, 1, 0.8249)],
            ['rXYZ', xyz(0.4361, 0.2225, 0.0139)], ['gXYZ', xyz(0.3851, 0.7169, 0.0971)], ['bXYZ', xyz(0.1431, 0.0606, 0.7141)], ['rTRC', curv], ['gTRC', curv], ['bTRC', curv]);
        let off = 128 + 4 + tags.length * 12; const table = [], seen = new Map(), body = [];
        tags.forEach(([s, d]) => { let o = seen.get(d); if (o === undefined) { o = off; seen.set(d, o); body.push(...d); while (body.length % 4) body.push(0); off = 128 + 4 + tags.length * 12 + body.length; } sig(table, s); be32(table, o); be32(table, d.length); });
        const size = 128 + 4 + table.length + body.length, h = [];
        be32(h, size); be32(h, 0); be32(h, 0x02100000); sig(h, 'mntrRGB XYZ '); [2026, 1, 1, 0, 0, 0].forEach(v => h.push(v >> 8, v & 255)); sig(h, 'acsp'); be32(h, 0); be32(h, 0); be32(h, 0); be32(h, 0); be32(h, 0); be32(h, 0); be32(h, 0);
        [0.9642, 1, 0.8249].forEach(v => be32(h, s15(v))); be32(h, 0); while (h.length < 128) h.push(0);
        u8.push(...h); be32(u8, tags.length); u8.push(...table, ...body);
        return new Uint8Array(u8);
    }

    /* ═════════ L'écriture du fichier ═════════ */
    const pdfDate = d => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
    const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    /** une chaîne PDF : ASCII entre parenthèses, sinon UTF-16BE en hexadécimal (avec la marque FEFF) */
    const pdfStr = s => { s = String(s ?? ''); if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, '\\$&')})`; let h = 'FEFF'; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xffff) { const v = c - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 1023)).toString(16).padStart(4, '0'); } else h += c.toString(16).padStart(4, '0'); } return `<${h.toUpperCase()}>`; };
    const hex = n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0'); return s; };
    /** pages : [{jpeg: Uint8Array, w, h (pixels), wPt, hPt}] ; meta : {title, author, subject, keywords, lang, date} */
    function build(pages, meta = {}) {
        const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
        const push = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
        const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
        const stream = (dict, data) => { const u = typeof data === 'string' ? enc.encode(data) : data; push(`<< ${dict} /Length ${u.length} >>\nstream\n`); push(u); push('\nendstream'); };
        const d = meta.date instanceof Date ? meta.date : new Date(), iso = d.toISOString().replace(/\.\d+Z$/, 'Z'), lang = /^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(meta.lang || '') ? meta.lang : 'fr';
        const title = String(meta.title || 'Document').slice(0, 300), author = String(meta.author || '').slice(0, 200), subject = String(meta.subject || '').slice(0, 500), keywords = String(meta.keywords || '').slice(0, 500);
        const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>
${author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEsc(author)}</rdf:li></rdf:Seq></dc:creator>\n` : ''}${subject ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(subject)}</rdf:li></rdf:Alt></dc:description>\n` : ''}<dc:language><rdf:Bag><rdf:li>${lang}</rdf:li></rdf:Bag></dc:language>
<xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate><xmp:MetadataDate>${iso}</xmp:MetadataDate><xmp:CreatorTool>LCNDA, mise en page</xmp:CreatorTool>
<pdf:Producer>LCNDA</pdf:Producer>${keywords ? `<pdf:Keywords>${xmlEsc(keywords)}</pdf:Keywords>` : ''}
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
        const n0 = 7, ids = pages.map((_, i) => n0 + i * 3); // par page : la page, son image, son contenu
        push('%PDF-1.7\n'); push(new Uint8Array([37, 0xe2, 0xe3, 0xcf, 0xd3, 10]));
        obj(1, () => push(`<< /Type /Catalog /Pages 2 0 R /Metadata 3 0 R /OutputIntents [4 0 R] /Lang ${pdfStr(lang)} /ViewerPreferences << /DisplayDocTitle true >> >>`));
        obj(2, () => push(`<< /Type /Pages /Kids [${ids.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`));
        obj(3, () => stream('/Type /Metadata /Subtype /XML', xmp));
        obj(4, () => push('<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /RegistryName (http://www.color.org) /DestOutputProfile 5 0 R >>'));
        obj(5, () => stream('/N 3', icc()));
        obj(6, () => push(`<< /Title ${pdfStr(title)}${author ? ` /Author ${pdfStr(author)}` : ''}${subject ? ` /Subject ${pdfStr(subject)}` : ''}${keywords ? ` /Keywords ${pdfStr(keywords)}` : ''} /Creator (LCNDA, mise en page) /Producer (LCNDA) /CreationDate (${pdfDate(d)}) /ModDate (${pdfDate(d)}) >>`));
        pages.forEach((p, i) => {
            const n = ids[i], W = +p.wPt.toFixed(2), H = +p.hPt.toFixed(2);
            obj(n, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`));
            obj(n + 1, () => stream(`/Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg));
            obj(n + 2, () => stream('', `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`));
        });
        const total = n0 + pages.length * 3, xref = len, id = hex(16);
        push(`xref\n0 ${total}\n0000000000 65535 f \n${[...Array(total - 1)].map((_, k) => String(offs[k + 1]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${total} /Root 1 0 R /Info 6 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`);
        const out = new Uint8Array(len); let o = 0; parts.forEach(u => { out.set(u, o); o += u.length; }); return out;
    }

    /* ═════════ Dans le navigateur : chaque page de la mise en page dessinée en image ═════════ */
    const toData = async (url, cache) => { if (cache.has(url)) return cache.get(url); let v = null; try { const r = await fetch(url); if (r.ok) { const b = await r.blob(); v = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }); } } catch (_) {} cache.set(url, v); return v; };
    /** les images de la base (media/…) et les autres adresses locales deviennent des data: (une image SVG ne charge rien d'extérieur) */
    async function inline(wrap, cache) {
        const local = v => v && !/^(data:|#|blob:)/.test(v) && !/^https?:/i.test(v);
        for (const el of wrap.querySelectorAll('[src], [href], [*|href]')) {
            for (const a of ['src', 'href']) { const v = el.getAttribute(a); if (local(v) && (a === 'src' || el.namespaceURI === 'http://www.w3.org/2000/svg')) { const d = await toData(v.replace(/&amp;/g, '&'), cache); if (d) el.setAttribute(a, d); else el.removeAttribute(a); } }
            const xv = el.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href'); if (local(xv)) { const d = await toData(xv, cache); if (d) el.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', d); else el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href'); }
            if (el.tagName === 'A') el.removeAttribute('href'); // pas de lien actif dans un PDF/A dessiné
        }
        for (const el of wrap.querySelectorAll('[style*="url("]')) {
            let st = el.getAttribute('style'); for (const m of [...st.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]) { if (!local(m[2])) continue; const d = await toData(m[2], cache); st = st.replace(m[0], d ? `url("${d}")` : 'none'); } el.setAttribute('style', st);
        }
    }
    const fontsCss = () => { let s = ''; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.type === CSSRule.FONT_FACE_RULE && /url\((['"]?)data:/.test(r.cssText)) s += r.cssText; } catch (_) {} } return s; };
    /** doc : le document (déjà résolu ou non) ; rend un Blob application/pdf */
    async function fromDoc(doc0, name, {dpi = 200, quality = 0.9, onStep} = {}) {
        const K = ext.layoutKit; if (!K?.pageHtml) throw new Error('la mise en page n’est pas chargée');
        const doc = K.resolveDoc(doc0), css = K.BASE_CSS + K.docCss(doc, '.lyfo') + fontsCss() + '.lyfo .ly-page{margin:0;box-shadow:none}', cache = new Map(), pages = [], k = dpi / 96;
        for (let i = 0; i < doc.pages.length; i++) {
            onStep?.(i / doc.pages.length);
            const PS = K.pageSize(doc, i), W = Math.max(1, K.px(PS.w)), H = Math.max(1, K.px(PS.h));
            const wrap = document.createElement('div'); wrap.className = 'lyfo'; wrap.innerHTML = K.pageHtml(doc, i, {print: true, preview: true, keyPrefix: 'a' + i});
            await inline(wrap, cache);
            const st = document.createElement('style'); st.textContent = css; wrap.prepend(st);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
            const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            try { await img.decode(); } catch (_) { throw new Error(`la page ${i + 1} n’a pas pu être dessinée`); }
            const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
            const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
            const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', quality)); if (!blob) throw new Error('image trop grande');
            pages.push({jpeg: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height, wPt: PS.w * 72 / 25.4, hPt: PS.h * 72 / 25.4});
            await new Promise(r => setTimeout(r, 0));
        }
        onStep?.(1);
        const info = doc.info || {};
        return new Blob([build(pages, {title: info.title || name, author: info.author, subject: info.subject || info.desc, keywords: info.keywords, lang: info.lang})], {type: 'application/pdf'});
    }
    ext.layoutPdfA = {build, icc, fromDoc};
    if (typeof module === 'object' && module.exports) module.exports = {build, icc};
})(typeof window !== 'undefined' ? window : globalThis);
