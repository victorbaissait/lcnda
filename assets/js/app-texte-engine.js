/**
 * 📝 Le moteur du traitement de texte (window.LCNDA_TEXT ; aussi require() dans Node pour les essais).
 * Sans bibliothèque, sans écran : un document « neutre » (sections → blocs → morceaux de texte) et ses fichiers :
 *  - Word (.docx) et LibreOffice (.odt), lus et écrits ici, avec le ZIP et la lecture XML sûre du moteur commun des
 *    tableaux (app-tableur-engine.js : unzip, makeZip, parseXml — tailles bornées, bombe zip, XML sans DOCTYPE ni ENTITY) ;
 *  - RTF, Markdown, texte brut ; le HTML de l'éditeur (htmlOf) et la feuille de styles des styles du document (stylesCss).
 * Ce qui est gardé : paragraphes et styles (Normal, Titre 1–6, Citation, Légende… et les styles à soi), gras, italique,
 * souligné, barré, exposant, indice, petites capitales, couleur, surlignage, police, taille, alignement, interligne,
 * espacements, retraits, lettrine, bordure et trame, listes à puces et numérotées (9 niveaux), tableaux (fusions, en-tête
 * répété, trame), images (alignée, carré, haut et bas ; légende), liens, notes de bas de page et de fin, en-têtes et pieds
 * (numéro de page, nombre de pages), sauts de page, sections (orientation, marges, colonnes), commentaires, modifications
 * suivies (insertions, suppressions), sommaire, index et bibliographie (en paragraphes stylés), personnes et lieux reliés.
 * L'écran (Listes → Outils de modification → 📝 Traitement de texte) est dans heritage-traitement-texte.js.
 */
(function (root, factory) {
    const T = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = T;
    if (typeof window !== 'undefined') window.LCNDA_TEXT = T;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
    'use strict';
    const S = () => G.LCNDA_SHEET || (typeof require === 'function' ? require('./app-tableur-engine.js') : null);

    /* ═════════ Unités et limites ═════════ */
    const MM_PX = 96 / 25.4, PT_PX = 96 / 72, TW_MM = 25.4 / 1440, EMU_PX = 9525;
    const LIMITS = {fileBytes: 60 * 1024 * 1024, textBytes: 20 * 1024 * 1024, blocks: 200000, images: 400, imageBytes: 40 * 1024 * 1024, depth: 40};
    const r2 = v => Math.round(Number(v) * 100) / 100;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
    const hex6 = c => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); if (m) return m[1].toUpperCase(); const s = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(String(c || '').trim()); if (s) return (s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase(); const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(c || '')); return rgb ? [rgb[1], rgb[2], rgb[3]].map(x => clamp(x, 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase() : ''; };
    const col = c => { const h = hex6(c); return h ? '#' + h.toLowerCase() : ''; };
    const fontOk = f => String(f || '').replace(/["'<>;{}\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    let seq = 0; const nid = p => `${p}${Date.now().toString(36).slice(-4)}${(++seq).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

    /* base64 (Node et navigateur) */
    function toB64(u8) {
        if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
        let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s);
    }
    function fromB64(b64) {
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
        const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u;
    }
    const sniffImage = u8 => (u8[0] === 0x89 && u8[1] === 0x50 ? 'png' : u8[0] === 0xff && u8[1] === 0xd8 ? 'jpeg' : u8[0] === 0x47 && u8[1] === 0x49 ? 'gif' : u8[0] === 0x52 && u8[8] === 0x57 ? 'webp' : u8[0] === 0x42 && u8[1] === 0x4d ? 'bmp' : '');
    /** la taille en pixels d'une image PNG, JPEG ou GIF (sans la dessiner) */
    function imageSize(u8) {
        try {
            const t = sniffImage(u8), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            if (t === 'png') return {w: dv.getUint32(16), h: dv.getUint32(20)};
            if (t === 'gif') return {w: dv.getUint16(6, true), h: dv.getUint16(8, true)};
            if (t === 'jpeg') { let i = 2; while (i < u8.length - 9) { if (u8[i] !== 0xff) { i++; continue; } const m = u8[i + 1], len = dv.getUint16(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return {h: dv.getUint16(i + 5), w: dv.getUint16(i + 7)}; i += 2 + len; } }
        } catch (_) {}
        return null;
    }
    const dataUrl = (u8, type) => `data:image/${type};base64,${toB64(u8)}`;
    const fromDataUrl = s => { const m = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(s || '')); return m ? {type: m[1], data: fromB64(m[2])} : null; };

    /* ═════════ Les styles du document ═════════ */
    // les styles de départ (« Classique ») : id, nom, sorte (p = paragraphe, c = caractère) ; tailles en points, retraits en mm
    const BASE_STYLES = [
        {id: 'normal', name: 'Normal', kind: 'p', font: 'Georgia', size: 12, line: 1.4, after: 6, color: '#1a1a1a'},
        {id: 'title', name: 'Titre du document', kind: 'p', size: 26, b: 1, align: 'center', after: 12, color: '#1f3a5f', keep: 1},
        {id: 'subtitle', name: 'Sous-titre', kind: 'p', size: 15, i: 1, align: 'center', after: 14, color: '#555555', keep: 1},
        {id: 'h1', name: 'Titre 1', kind: 'p', size: 20, b: 1, before: 18, after: 8, color: '#1f3a5f', keep: 1},
        {id: 'h2', name: 'Titre 2', kind: 'p', size: 16, b: 1, before: 14, after: 6, color: '#1f3a5f', keep: 1},
        {id: 'h3', name: 'Titre 3', kind: 'p', size: 14, b: 1, i: 1, before: 12, after: 4, color: '#2b4c7e', keep: 1},
        {id: 'h4', name: 'Titre 4', kind: 'p', size: 12.5, b: 1, before: 10, after: 4, color: '#333333', keep: 1},
        {id: 'h5', name: 'Titre 5', kind: 'p', size: 12, b: 1, i: 1, before: 8, after: 3, color: '#333333', keep: 1},
        {id: 'h6', name: 'Titre 6', kind: 'p', size: 11, sc: 1, before: 8, after: 3, color: '#555555', keep: 1},
        {id: 'quote', name: 'Citation', kind: 'p', i: 1, il: 12, ir: 12, before: 6, after: 10, color: '#444444'},
        {id: 'caption', name: 'Légende', kind: 'p', size: 10, i: 1, align: 'center', after: 10, color: '#555555'},
        {id: 'mono', name: 'Transcription (machine à écrire)', kind: 'p', font: 'Courier New', size: 11, line: 1.3},
        {id: 'address', name: 'Adresse', kind: 'p', line: 1.2, after: 0},
        {id: 'signature', name: 'Signature', kind: 'p', align: 'right', before: 18},
        {id: 'c-strong', name: 'Mise en évidence', kind: 'c', b: 1},
        {id: 'c-emph', name: 'Accentuation', kind: 'c', i: 1},
        {id: 'c-name', name: 'Nom de famille', kind: 'c', sc: 1},
        {id: 'c-term', name: 'Mot ancien', kind: 'c', i: 1, color: '#7a2e2e'},
    ];
    const BUILTIN = new Set(BASE_STYLES.map(s => s.id));
    // les jeux de styles : polices et couleurs des titres et du texte
    const STYLE_SETS = [
        {id: 'classique', name: 'Classique', body: 'Georgia', head: 'Georgia', ink: '#1f3a5f'},
        {id: 'moderne', name: 'Moderne', body: 'Helvetica Neue', head: 'Helvetica Neue', ink: '#055dff', size: 11},
        {id: 'elegant', name: 'Élégant', body: 'Garamond', head: 'Didot', ink: '#7a2e2e', size: 12.5},
        {id: 'archives', name: 'Archives', body: 'Courier New', head: 'Courier New', ink: '#222222', size: 11},
        {id: 'lisible', name: 'Très lisible', body: 'Verdana', head: 'Verdana', ink: '#000000', size: 13, line: 1.6},
        {id: 'livre', name: 'Livre ancien', body: 'Palatino', head: 'Palatino', ink: '#5b3a1a', size: 12},
    ];
    function styleSet(id = 'classique') {
        const set = STYLE_SETS.find(s => s.id === id) || STYLE_SETS[0];
        return BASE_STYLES.map(s => {
            const o = {...s};
            if (s.kind === 'p') { o.font = /^h\d|title|subtitle$/.test(s.id) ? set.head : s.id === 'mono' ? 'Courier New' : set.body; }
            if (s.id === 'normal') { if (set.size) o.size = set.size; if (set.line) o.line = set.line; }
            if (/^h[1-3]$|^title$/.test(s.id)) o.color = set.ink;
            if (set.id === 'elegant' && /^h[12]$|^title$/.test(s.id)) { o.sc = 1; o.b = 0; }
            return o;
        });
    }
    /** un style reçu (fichier, base, écran) remis d'aplomb */
    function cleanStyle(s) {
        if (!s || typeof s !== 'object') return null;
        const id = String(s.id || '').replace(/[^\w-]/g, '').slice(0, 40); if (!id) return null;
        const o = {id, name: String(s.name || id).replace(/[<>]/g, '').slice(0, 60), kind: s.kind === 'c' ? 'c' : 'p'};
        if (s.base && /^[\w-]{1,40}$/.test(s.base)) o.base = s.base;
        if (s.font) o.font = fontOk(s.font);
        if (Number(s.size) > 0) o.size = clamp(s.size, 4, 144);
        ['color', 'bg'].forEach(k => { const c = col(s[k]); if (c) o[k] = c; });
        ['b', 'i', 'u', 's', 'sc', 'caps', 'keep', 'bd'].forEach(k => { if (s[k]) o[k] = 1; });
        if (['left', 'center', 'right', 'justify'].includes(s.align)) o.align = s.align;
        if (Number(s.line) > 0) o.line = clamp(s.line, 0.6, 4);
        ['before', 'after'].forEach(k => { if (s[k] != null && s[k] !== '') o[k] = clamp(s[k], 0, 200); });
        ['il', 'ir'].forEach(k => { if (s[k]) o[k] = clamp(s[k], 0, 200); });
        if (s.fi) o.fi = clamp(s.fi, -100, 100);
        return o;
    }
    const styleId = (styles, id) => (styles || []).find(s => s.id === id);
    /** la feuille de styles des styles du document (pour l'éditeur, l'impression et le HTML) */
    function stylesCss(styles, scope = '.wp-doc') {
        const out = [], normal = styleId(styles, 'normal') || BASE_STYLES[0];
        const decl = s => [
            s.font ? `font-family:'${fontOk(s.font)}',${/courier|mono/i.test(s.font) ? 'monospace' : 'serif'}` : '', s.size ? `font-size:${s.size}pt` : '', s.color ? `color:${s.color}` : '', s.bg ? `background-color:${s.bg}` : '',
            s.b ? 'font-weight:700' : s.b === 0 ? 'font-weight:400' : '', s.i ? 'font-style:italic' : '', s.u || s.s ? `text-decoration:${[s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ')}` : '',
            s.sc ? 'font-variant:small-caps' : '', s.caps ? 'text-transform:uppercase' : '', s.kind === 'p' && s.align ? `text-align:${s.align}` : '', s.kind === 'p' && s.line ? `line-height:${s.line}` : '',
            s.kind === 'p' && s.before != null ? `margin-top:${s.before}pt` : '', s.kind === 'p' && s.after != null ? `margin-bottom:${s.after}pt` : '', s.kind === 'p' && s.il ? `margin-left:${s.il}mm` : '', s.kind === 'p' && s.ir ? `margin-right:${s.ir}mm` : '',
            s.kind === 'p' && s.fi ? `text-indent:${s.fi}mm` : '', s.kind === 'p' && s.bd ? 'border:1px solid currentColor;padding:4pt 6pt' : ''].filter(Boolean).join(';');
        out.push(`${scope}{${decl({...normal, kind: 'p', before: undefined, after: undefined, align: undefined})}}`);
        (styles || []).forEach(s => {
            if (s.kind === 'c') out.push(`${scope} [data-cs="${s.id}"]{${decl(s)}}`);
            else out.push(`${scope} [data-st="${s.id}"]{${decl(s)}}`);
        });
        return out.join('\n');
    }

    /* ═════════ Le document neutre ═════════ */
    const PAGE0 = {w: 210, h: 297, m: {t: 25, r: 25, b: 25, l: 25}, orient: 'portrait', cols: 1, gap: 10};
    function newDoc(o = {}) {
        return {v: 1, title: o.title || '', meta: {author: o.author || '', subject: ''}, lang: 'fr', set: 'classique', page: {...PAGE0, m: {...PAGE0.m}, ...(o.page || {})},
            header: {blocks: [], first: false, firstBlocks: []}, footer: {blocks: [], first: false, firstBlocks: []}, styles: styleSet(o.set || 'classique'), sections: [{page: null, blocks: [para([run('')])]}], comments: [], track: false};
    }
    const run = (x, o = {}) => ({x: String(x ?? ''), ...o});
    const para = (runs, o = {}) => ({t: 'p', st: 'normal', ...o, runs: runs || []});
    const plainOf = runs => (runs || []).map(r => (r.tc?.k === 'del' ? '' : r.br ? '\n' : r.tab ? '\t' : r.note ? '' : r.x || r.fieldText || '')).join('');
    const blockText = b => (b.t === 'p' ? plainOf(b.runs) : b.t === 'table' ? b.rows.map(r => r.map(c => (c.blocks || []).map(blockText).join('\n')).join('\t')).join('\n') : b.t === 'img' ? (b.cap || '') : (b.blocks || []).map(blockText).join('\n'));
    const allBlocks = doc => (doc.sections || []).flatMap(s => s.blocks || []);
    function wordCount(text) { const m = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu); return m ? m.length : 0; }

    /* ═════════ HTML de l'éditeur (le document neutre → HTML) ═════════ */
    const runCss = r => [r.col ? `color:${col(r.col)}` : '', r.bg ? `background-color:${col(r.bg)}` : '', r.font ? `font-family:'${fontOk(r.font)}'` : '', r.sz ? `font-size:${clamp(r.sz, 4, 144)}pt` : '', r.sc ? 'font-variant:small-caps' : ''].filter(Boolean).join(';');
    function runHtml(r) {
        if (r.br) return '<br>';
        if (r.note) return `<sup class="wp-fn" data-fn="${esc(r.note.id || nid('n'))}" data-kind="${r.note.k === 'end' ? 'end' : 'foot'}" data-note="${esc(r.note.text || '')}"${r.note.src ? ` data-src="${Number(r.note.src) || 0}"` : ''} contenteditable="false">*</sup>`;
        if (r.img) return `<img class="wp-inl" src="${esc(r.img.src)}" alt="${esc(r.img.alt || '')}"${r.img.mid ? ` data-media="${Number(r.img.mid)}"` : ''} style="width:${Math.round(clamp(r.img.w || 120, 8, 2000))}px">`;
        if (r.field) return `<span class="wp-field" data-field="${esc(r.field)}" contenteditable="false">${esc(r.fieldText || (r.field === 'page' ? '1' : r.field === 'pages' ? '1' : ''))}</span>`;
        let h = r.tab ? '\t' : esc(r.x || '');
        if (!h) return '';
        if (r.sub) h = `<sub>${h}</sub>`; if (r.sup) h = `<sup>${h}</sup>`;
        if (r.s) h = `<s>${h}</s>`; if (r.u) h = `<u>${h}</u>`; if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`;
        const css = runCss(r); if (css || r.cs) h = `<span${r.cs ? ` data-cs="${esc(r.cs)}"` : ''}${css ? ` style="${css}"` : ''}>${h}</span>`;
        (r.cm || []).forEach(id => { h = `<span class="wp-cm" data-cm="${esc(id)}">${h}</span>`; });
        if (r.tc) { const tag = r.tc.k === 'del' ? 'del' : 'ins'; h = `<${tag} class="wp-${tag}" data-tc="${esc(r.tc.id || nid('t'))}" data-a="${esc(r.tc.a || '')}" data-t="${esc(r.tc.t || '')}">${h}</${tag}>`; }
        if (r.link?.k === 'person') h = `<a class="wp-person" data-wp-person="${Number(r.link.id) || 0}"${r.link.part ? ` data-part="${esc(r.link.part)}"` : ''} href="#">${h}</a>`;
        else if (r.link?.k === 'place') h = `<a class="wp-place" data-wp-place="${Number(r.link.id) || 0}" href="#">${h}</a>`;
        else if (r.href && /^(https?:\/\/|mailto:|#)/i.test(r.href)) h = `<a href="${esc(r.href)}">${h}</a>`;
        return h;
    }
    // des morceaux voisins de même forme sont réunis (moins de balises)
    const sameFmt = (a, b) => ['b', 'i', 'u', 's', 'sup', 'sub', 'sc', 'col', 'bg', 'font', 'sz', 'href', 'cs'].every(k => (a[k] || '') === (b[k] || '')) && JSON.stringify(a.link || null) === JSON.stringify(b.link || null) && JSON.stringify(a.tc || null) === JSON.stringify(b.tc || null) && JSON.stringify(a.cm || []) === JSON.stringify(b.cm || []);
    function mergeRuns(runs) {
        const out = [];
        (runs || []).forEach(r => { if (!r) return; const last = out[out.length - 1]; if (last && !last.br && !r.br && !last.note && !r.note && !last.img && !r.img && !last.field && !r.field && !last.tab && !r.tab && sameFmt(last, r)) last.x += r.x || ''; else out.push({...r}); });
        return out.filter(r => r.br || r.note || r.img || r.field || r.tab || r.x);
    }
    const runsHtml = runs => mergeRuns(runs).map(runHtml).join('') || '<br>';
    function paraAttrs(b) {
        const css = [b.al ? `text-align:${b.al}` : '', b.lh ? `line-height:${clamp(b.lh, 0.6, 4)}` : '', b.sb != null ? `margin-top:${clamp(b.sb, 0, 200)}pt` : '', b.sa != null ? `margin-bottom:${clamp(b.sa, 0, 200)}pt` : '',
            b.il ? `margin-left:${clamp(b.il, -50, 300)}mm` : '', b.ir ? `margin-right:${clamp(b.ir, 0, 300)}mm` : '', b.fi ? `text-indent:${clamp(b.fi, -100, 100)}mm` : '', b.bg ? `background-color:${col(b.bg)}` : '', b.bd ? 'border:1px solid #444;padding:4pt 6pt' : ''].filter(Boolean).join(';');
        return `data-st="${esc(b.st || 'normal')}"${b.drop ? ' data-drop="1"' : ''}${b.keep ? ' data-keep="1"' : ''}${css ? ` style="${css}"` : ''}`;
    }
    const tagOf = st => (/^h[1-6]$/.test(st) ? st : 'p');
    function blocksHtml(blocks) {
        const out = []; let i = 0;
        while (i < blocks.length) {
            const b = blocks[i];
            if (b.t === 'p' && b.list) { // une liste : les paragraphes qui se suivent, imbriqués selon leur niveau
                const items = []; while (i < blocks.length && blocks[i].t === 'p' && blocks[i].list) items.push(blocks[i++]);
                out.push(listHtml(items)); continue;
            }
            out.push(blockHtml(b)); i++;
        }
        return out.join('');
    }
    function listHtml(items) {
        let h = ''; const st = []; // les listes ouvertes (chacune a un <li> ouvert)
        items.forEach(b => {
            const L = clamp(b.list.l || 0, 0, 8), K = b.list.k === 'ol' ? 'ol' : 'ul';
            if (!st.length) { h += `<${K}>`; st.push(K); }
            else if (L + 1 > st.length) { while (st.length < L + 1) { h += `<${K}>`; st.push(K); } } // plus profond : dans le <li> ouvert
            else {
                h += '</li>';
                while (st.length > L + 1) h += `</${st.pop()}></li>`;
                if (st[st.length - 1] !== K) { h += `</${st.pop()}><${K}>`; st.push(K); }
            }
            const p = {...b}; delete p.list;
            h += `<li ${paraAttrs(p)}>${runsHtml(b.runs)}`;
        });
        if (st.length) { h += '</li>'; while (st.length) { h += `</${st.pop()}>`; if (st.length) h += '</li>'; } }
        return h;
    }
    function blockHtml(b) {
        if (b.t === 'p') { const t = tagOf(b.st); return `<${t} ${paraAttrs(b)}>${runsHtml(b.runs)}</${t}>`; }
        if (b.t === 'pb') return '<hr class="wp-pb" data-break="page" contenteditable="false">';
        if (b.t === 'hr') return '<hr class="wp-hr">';
        if (b.t === 'img') {
            const w = Math.round(clamp(b.w || 300, 16, 2000)), wrap = ['square', 'topbottom'].includes(b.wrap) ? b.wrap : 'topbottom', al = ['left', 'right', 'center'].includes(b.al) ? b.al : (wrap === 'square' ? 'left' : 'center');
            return `<figure class="wp-fig" data-wrap="${wrap}" data-align="${al}" contenteditable="false" style="width:${w}px"><img src="${esc(b.src)}" alt="${esc(b.alt || '')}"${b.mid ? ` data-media="${Number(b.mid)}"` : ''}>${b.cap != null && b.cap !== '' ? `<figcaption contenteditable="true">${esc(b.cap)}</figcaption>` : ''}</figure>`;
        }
        if (b.t === 'table') {
            const cols = (b.cols || []).length ? `<colgroup>${b.cols.map(w => `<col style="width:${r2(clamp(w, 1, 100))}%">`).join('')}</colgroup>` : '';
            const rowH = (row, head) => `<tr>${row.map(c => `<${head ? 'th' : 'td'}${c.cs > 1 ? ` colspan="${Math.round(c.cs)}"` : ''}${c.rs > 1 ? ` rowspan="${Math.round(c.rs)}"` : ''}${c.bg ? ` style="background-color:${col(c.bg)}"` : ''}>${cellHtml(c)}</${head ? 'th' : 'td'}>`).join('')}</tr>`;
            const nh = clamp(b.head || 0, 0, b.rows.length);
            return `<table class="wp-table"${b.bd === false ? ' data-bd="0"' : ''}>${cols}${nh ? `<thead>${b.rows.slice(0, nh).map(r => rowH(r, true)).join('')}</thead>` : ''}<tbody>${b.rows.slice(nh).map(r => rowH(r, false)).join('')}</tbody></table>`;
        }
        if (b.t === 'cols') return `<div class="wp-cols" data-cols="${clamp(b.n || 2, 2, 6)}">${blocksHtml(b.blocks || [])}</div>`;
        if (b.t === 'toc' || b.t === 'index' || b.t === 'bib') return `<div class="wp-gen" data-gen="${b.t}" contenteditable="false"></div>`;
        return '';
    }
    function cellHtml(c) {
        const bl = c.blocks || [];
        if (bl.length === 1 && bl[0].t === 'p' && (bl[0].st || 'normal') === 'normal' && !bl[0].list && !bl[0].al) return runsHtml(bl[0].runs);
        return blocksHtml(bl) || '<br>';
    }
    /** le HTML de l'éditeur : une section → son HTML */
    const sectionHtml = sec => blocksHtml(sec.blocks || []) || '<p data-st="normal"><br></p>';

    /* ═════════ Morceaux communs aux lecteurs ═════════ */
    const P = () => S(); // parseXml, unzip, makeZip…
    const local = n => n.slice(n.indexOf(':') + 1);
    const kids = (el, name) => (el?.c || []).filter(x => typeof x === 'object' && (name == null || local(x.n) === name || x.n === name));
    const kid = (el, name) => kids(el, name)[0] || null;
    const xtext = el => (el == null ? '' : typeof el === 'string' ? el : el.c.map(xtext).join(''));
    const attr = (el, name) => { if (!el) return undefined; if (el.a[name] !== undefined) return el.a[name]; const k = Object.keys(el.a).find(x => local(x) === local(name) && (name.indexOf(':') < 0 || x === name || local(x) === local(name))); return k === undefined ? undefined : el.a[k]; };
    const findAll = (el, name, out = []) => { (el?.c || []).forEach(x => { if (typeof x === 'object') { if (local(x.n) === name) out.push(x); findAll(x, name, out); } }); return out; };
    const onOff = el => !!el && !['0', 'false', 'off', 'none'].includes(String(attr(el, 'w:val') ?? 'true'));
    /** un document lu : blocs remis d'aplomb (texte vide, sections, notes) */
    function finish(doc) {
        doc.sections = (doc.sections || []).filter(s => s && Array.isArray(s.blocks));
        if (!doc.sections.length) doc.sections = [{page: null, blocks: []}];
        doc.sections.forEach(s => { if (!s.blocks.length) s.blocks.push(para([run('')])); });
        doc.styles = (doc.styles || []).map(cleanStyle).filter(Boolean);
        BASE_STYLES.forEach(b => { if (!doc.styles.some(s => s.id === b.id)) doc.styles.push({...b}); });
        return doc;
    }
    const docProps = {};

    return Object.assign(docProps, {
        MM_PX, PT_PX, TW_MM, EMU_PX, LIMITS, BASE_STYLES, BUILTIN, STYLE_SETS, PAGE0,
        esc, xe, col, hex6, fontOk, nid, clamp, toB64, fromB64, sniffImage, imageSize, dataUrl, fromDataUrl,
        styleSet, cleanStyle, stylesCss, newDoc, run, para, plainOf, blockText, allBlocks, wordCount, mergeRuns,
        htmlOf: sectionHtml, blocksHtml, runsHtml, runHtml,
        _x: {local, kids, kid, xtext, attr, findAll, onOff, finish, P},
    });
});
