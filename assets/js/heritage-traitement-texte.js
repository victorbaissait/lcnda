/**
 * 📝 Traitement de texte : Listes → 🛠️ Outils de modification → « 📝 Traitement de texte ».
 * L'outil pour ÉCRIRE un texte suivi (lettre, récit, rapport, transcription mise au propre) ; la Mise en page reste l'outil
 * pour composer un livre (un document peut y être envoyé : « 📐 Envoyer vers la mise en page »).
 * Ce fichier : l'éditeur (pages blanches avec marges et sauts de page, sections, en-têtes et pieds, notes de bas de page en bas
 * de leur page), le nettoyage de tout HTML (fichier, base, collage depuis Word, Google Docs ou le web), les commandes de
 * mise en forme, les styles, ↶ ↷ sans limite, le suivi des modifications, les commentaires, la barre E1 et ses menus,
 * la barre d'outils réglable, la colonne d'outils (K19), le panneau E2, la barre du bas (K18).
 * Les insertions, outils, fichiers, modèles et la liste : heritage-traitement-texte-outils.js.
 * Les fichiers (.docx, .odt, .rtf, .md, .txt) : app-texte-engine.js et app-texte-formats.js (window.LCNDA_TEXT).
 * Base : lib/textdocs.php (tables text_documents et text_document_versions). Styles : assets/css/traitement-texte.css.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const T = () => window.LCNDA_TEXT;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const plural = (n, w) => (A()?.plural ? A().plural(n, w) : `${n} ${w}${n > 1 ? 's' : ''}`);
    const kbd = k => (A()?.keys?.text ? A().keys.text(k) : k);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
    const MM = 96 / 25.4, PT = 96 / 72, GAP = 26, NOTE_SEP = 10;
    const PREF_KEY = 'genealogie-traitement-texte';
    const prefs = () => { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (_) { return {}; } };
    const setPrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {} };
    const pref = (k, d) => { const v = prefs()[k]; return v === undefined ? d : v; };
    const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien'], ['pt', 'Portugais'], ['nl', 'Néerlandais'], ['la', 'Latin'], ['oc', 'Occitan'], ['br', 'Breton'], ['pl', 'Polonais']];
    const FONTS = ['Georgia', 'Garamond', 'Palatino', 'Times New Roman', 'Baskerville', 'Didot', 'Helvetica Neue', 'Arial', 'Verdana', 'Calibri', 'Courier New', 'American Typewriter', 'Snell Roundhand', 'Brush Script MT'];
    const SIZES = [8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
    const BLOCK_TAGS = /^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE|TD|TH|FIGCAPTION)$/;
    const isBlock = n => n?.nodeType === 1 && /^(P|H[1-6]|LI|UL|OL|TABLE|FIGURE|HR|DIV|BLOCKQUOTE|PRE)$/.test(n.tagName);

    /* ═════════ Nettoyer tout HTML (fichier, base, collage) : seulement ce qui est prévu ═════════ */
    const TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP', 'A', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'FIGURE', 'FIGCAPTION', 'IMG', 'HR', 'BLOCKQUOTE', 'SMALL', 'MARK', 'CODE', 'PRE', 'FONT', 'CENTER']);
    const DROP = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|LINK|META|BASE|FORM|INPUT|BUTTON|TEXTAREA|SELECT|OPTION|FRAME|FRAMESET|APPLET|AUDIO|VIDEO|SOURCE|TRACK|CANVAS|TITLE|HEAD|XML|PORTAL|DIALOG|SLOT)$/;
    const CSS_OK = new Set(['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-variant-caps', 'text-decoration', 'text-decoration-line', 'text-transform', 'text-align', 'text-indent', 'line-height', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'vertical-align', 'width', 'border', 'border-bottom', 'padding', 'letter-spacing']);
    const CLASSES = new Set(['wp-fn', 'wp-field', 'wp-person', 'wp-place', 'wp-cm', 'wp-ins', 'wp-del', 'wp-fig', 'wp-inl', 'wp-pb', 'wp-hr', 'wp-cols', 'wp-gen', 'wp-table', 'wp-xe', 'wp-ph', 'wp-tree', 'wp-media', 'is-done']);
    const DATA = /^data-(st|cs|drop|keep|fn|kind|note|src|field|part|wp-person|wp-place|cm|tc|a|t|wrap|align|media|break|cols|gen|bd|xe|start|fmt)$/;
    const srcOk = s => /^media\/[A-Za-z0-9._%\-]{1,240}$/.test(s) || /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
    const hrefOk = s => /^(https?:\/\/|mailto:|#)/i.test(s) && !/^\s*(javascript|data|vbscript):/i.test(s);
    function cleanCss(st, {paste = '', tag = ''} = {}) {
        const out = new Map();
        String(st || '').split(';').forEach(d => {
            const i = d.indexOf(':'); if (i < 0) return;
            let k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim().replace(/\s*!important\s*$/i, '');
            if (k === 'background') { const c = /(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(v); if (!c) return; k = 'background-color'; v = c[1]; }
            if (!CSS_OK.has(k) || !v || v.length > 160 || /url\s*\(|expression|javascript|@import|[<>\\{}]/i.test(v)) return;
            if (k === 'width' && !/^(IMG|FIGURE|COL|TABLE)$/.test(tag)) return;
            if ((k === 'border' || k === 'border-bottom' || k === 'padding') && !/^(P|H[1-6]|LI|DIV)$/.test(tag)) return;
            if (paste) { // un collage : le bruit des sites et des traitements de texte part
                if (k === 'color' && /^(#000(000)?|black|rgb\(0,\s*0,\s*0\)|windowtext|inherit|initial)$/i.test(v)) return;
                if (k === 'background-color' && /^(#fff(fff)?|white|transparent|rgba\(0,\s*0,\s*0,\s*0\)|inherit|initial)$/i.test(v)) return;
                if (paste === 'web' && (k === 'font-family' || k === 'font-size' || k === 'line-height' || /^margin/.test(k) || k === 'text-indent' || k === 'letter-spacing' || k === 'color' || k === 'background-color')) return;
                if (k === 'font-family' && /^(inherit|initial|-apple-system|system-ui|arial,\s*sans-serif)$/i.test(v)) return;
                if (k === 'line-height' && /^(normal|inherit|1\.\d+|100%|115%)$/i.test(v)) return;
                if (/^margin/.test(k) && /^(0|0px|0pt|0in|0cm|auto)$/i.test(v)) return;
            }
            if (k === 'font-size' && /px$/.test(v)) v = `${Math.round(parseFloat(v) * 0.75 * 2) / 2}pt`;
            if (k === 'font-family') v = v.replace(/["']/g, '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 2).map(x => `'${x.replace(/[^\w\s\-À-ÿ.]/g, '')}'`).join(',');
            out.delete(k); out.set(k, v);
        });
        return [...out].map(([k, v]) => `${k}:${v}`).join(';');
    }
    /** Le HTML reçu → un HTML sûr. paste : '' (fichier ou base), 'word', 'gdocs', 'web'. Rend {html, dropped} */
    function cleanHtml(html, {paste = ''} = {}) {
        const doc = new DOMParser().parseFromString(`<!doctype html><body><div id="wp-root">${String(html || '').slice(0, 30000000)}</div></body>`, 'text/html');
        const root = doc.getElementById('wp-root'); let dropped = 0, extImg = 0;
        // Word : les listes sont des paragraphes « mso-list » avec une puce écrite dans une petite zone à ignorer
        if (paste === 'word') root.querySelectorAll('p[style*="mso-list"], li[style*="mso-list"]').forEach(p => {
            const lv = /level(\d)/.exec(p.getAttribute('style') || ''), ign = p.querySelector('span[style*="mso-list:Ignore"], span[style*="mso-list: Ignore"]');
            const mark = (ign?.textContent || '').trim(); ign?.remove();
            p.setAttribute('data-wp-list', `${/^[\d\w]{1,4}[.)]$/.test(mark) && !/^[·o§•▪◦-]$/.test(mark) ? 'ol' : 'ul'}:${clamp((Number(lv?.[1]) || 1) - 1, 0, 8)}`);
        });
        const walk = node => [...node.childNodes].forEach(n => {
            if (n.nodeType === 3) return;
            if (n.nodeType !== 1) { n.remove(); return; }
            const tag = n.tagName.toUpperCase();
            if (DROP.test(tag) || tag.includes(':') && /^O:P$/i.test(tag)) { n.remove(); dropped++; return; }
            if (!TAGS.has(tag)) { walk(n); n.replaceWith(...n.childNodes); return; }
            // Google Docs : tout est dans un <b style="font-weight:normal">
            if ((tag === 'B' || tag === 'STRONG') && /font-weight\s*:\s*(normal|400)/i.test(n.getAttribute('style') || '')) { const s = doc.createElement('span'); s.setAttribute('style', (n.getAttribute('style') || '').replace(/font-weight\s*:\s*(normal|400);?/i, '')); s.append(...n.childNodes); n.replaceWith(s); walk(s); return clean1(s); }
            if (tag === 'FONT') { const s = doc.createElement('span'); const c = n.getAttribute('color'), f = n.getAttribute('face'), z = Number(n.getAttribute('size')); s.setAttribute('style', [c ? `color:${c}` : '', f ? `font-family:${f}` : '', z ? `font-size:${[0, 7.5, 10, 12, 13.5, 18, 24, 36][clamp(z, 1, 7)]}pt` : ''].filter(Boolean).join(';')); s.append(...n.childNodes); n.replaceWith(s); walk(s); return clean1(s); }
            if (tag === 'CENTER') { const p = doc.createElement('div'); p.setAttribute('style', 'text-align:center'); p.append(...n.childNodes); n.replaceWith(p); walk(p); return clean1(p); }
            walk(n); clean1(n);
        });
        const clean1 = n => {
            const tag = n.tagName.toUpperCase();
            const wl = n.getAttribute('data-wp-list');
            [...n.attributes].forEach(a => {
                const k = a.name.toLowerCase(), v = a.value;
                if (k === 'style') { const c = cleanCss(v, {paste, tag}); if (c) n.setAttribute('style', c); else n.removeAttribute('style'); return; }
                if (k === 'class') { const c = v.split(/\s+/).filter(x => CLASSES.has(x)); if (paste === 'word' && /\bMso(Title|Subtitle|Quote|IntenseQuote|Heading\d)\b/.test(v)) { const m = /Mso(Title|Subtitle|Quote|IntenseQuote|Heading(\d))/.exec(v); n.setAttribute('data-st', m[2] ? 'h' + Math.min(6, m[2]) : m[1] === 'Title' ? 'title' : m[1] === 'Subtitle' ? 'subtitle' : 'quote'); } if (c.length && !paste) n.setAttribute('class', c.join(' ')); else n.removeAttribute('class'); return; }
                if (k === 'href' && tag === 'A') { if (!hrefOk(v.trim())) n.removeAttribute('href'); return; }
                if (k === 'src' && tag === 'IMG') { if (!srcOk(v.trim())) { n.removeAttribute('src'); if (/^https?:/i.test(v)) extImg++; } return; }
                if ((k === 'colspan' || k === 'rowspan') && /^T[DH]$/.test(tag)) { const x = clamp(parseInt(v, 10) || 1, 1, 60); if (x > 1) n.setAttribute(k, String(x)); else n.removeAttribute(k); return; }
                if (k === 'alt' && tag === 'IMG') { n.setAttribute('alt', v.slice(0, 300)); return; }
                if (DATA.test(k) && !paste) { if (v.length > 4000 || /[<>]/.test(v) && k !== 'data-note') n.removeAttribute(a.name); return; }
                if (k === 'data-st' && paste === 'word') return;
                n.removeAttribute(a.name);
            });
            if (wl) n.setAttribute('data-wp-list', wl);
            if (tag === 'IMG' && !n.getAttribute('src')) { n.remove(); return; }
            if (tag === 'A' && !n.getAttribute('href') && !n.hasAttribute('data-wp-person') && !n.hasAttribute('data-wp-place')) { n.replaceWith(...n.childNodes); return; }
            if (tag === 'SPAN' && !n.attributes.length) { n.replaceWith(...n.childNodes); return; }
            if (paste && tag === 'SPAN') { const st = n.getAttribute('style') || ''; // gras, italique, souligné écrits en style (Google Docs, le web)
                let el = n; const wrap = t => { const w = doc.createElement(t); w.append(...el.childNodes); el.appendChild(w); };
                if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) wrap('b'); if (/font-style:\s*italic/i.test(st)) wrap('i'); if (/text-decoration[^;]*underline/i.test(st)) wrap('u'); if (/text-decoration[^;]*line-through/i.test(st)) wrap('s'); if (/vertical-align:\s*super/i.test(st)) wrap('sup'); if (/vertical-align:\s*sub/i.test(st)) wrap('sub');
                const rest = cleanCss(st.replace(/font-weight[^;]*;?|font-style[^;]*;?|text-decoration[^;]*;?|vertical-align[^;]*;?/gi, ''), {paste, tag}); if (rest) n.setAttribute('style', rest); else { n.removeAttribute('style'); n.replaceWith(...n.childNodes); } }
        };
        walk(root);
        return {html: root.innerHTML, dropped, extImg};
    }

    /* ═════════ Les petits outils du DOM ═════════ */
    const blockOf = (n, body) => { while (n && n !== body) { if (n.nodeType === 1 && /^(P|H[1-6]|LI)$/.test(n.tagName)) return n; if (n.nodeType === 1 && /^(TD|TH|FIGCAPTION)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
    const parseLen = (v, unit = 'mm') => { const m = /^(-?[\d.]+)(px|pt|mm|cm|in|em)?$/.exec(String(v || '').trim()); if (!m) return undefined; const n = Number(m[1]), u = m[2] || 'px'; const px = u === 'px' ? n : u === 'pt' ? n * PT : u === 'mm' ? n * MM : u === 'cm' ? n * MM * 10 : u === 'in' ? n * 96 : n * 16; return unit === 'pt' ? Math.round(px / PT * 10) / 10 : Math.round(px / MM * 10) / 10; };
    const rgbHex = c => T()?.col(c) || '';

    /* ═════════ HTML de l'éditeur → document neutre (pour les fichiers et la mise en page) ═════════ */
    function runsOf(el, fmt = {}, out = []) {
        el.childNodes.forEach(n => {
            if (n.nodeType === 3) { const t = n.data.replace(/[​﻿]/g, ''); if (!t) return; t.split(/(\t|\n)/).forEach(x => { if (x === '\t') out.push({tab: true, x: '', ...fmt}); else if (x === '\n') out.push({br: true}); else if (x) out.push({x, ...fmt}); }); return; }
            if (n.nodeType !== 1) return;
            const tag = n.tagName, f = {...fmt};
            if (n.matches('.wp-endnotes, .wp-h')) return;
            if (tag === 'BR') { out.push({br: true}); return; }
            if (tag === 'IMG') { if (n.src) out.push({img: {src: n.getAttribute('src'), w: Math.round(n.getBoundingClientRect().width / (n.closest('.wp-zoom') ? zoomOf(n) : 1)) || parseFloat(n.style.width) || 120, alt: n.alt || '', mid: Number(n.dataset.media) || undefined}}); return; }
            if (tag === 'SUP' && n.classList.contains('wp-fn')) { out.push({note: {id: n.dataset.fn, k: n.dataset.kind === 'end' ? 'end' : 'foot', text: n.dataset.note || '', ...(n.dataset.src ? {src: Number(n.dataset.src)} : {})}}); return; }
            if (n.classList.contains('wp-field')) { out.push({field: n.dataset.field === 'pages' ? 'pages' : n.dataset.field === 'page' ? 'page' : '', fieldText: n.textContent, ...(n.dataset.field === 'page' || n.dataset.field === 'pages' ? {} : {x: n.textContent})}); if (!['page', 'pages'].includes(n.dataset.field)) { out.pop(); out.push({x: n.textContent, ...fmt}); } return; }
            if (tag === 'B' || tag === 'STRONG') f.b = 1; if (tag === 'I' || tag === 'EM') f.i = 1; if (tag === 'U') f.u = 1; if (tag === 'S' || tag === 'STRIKE') f.s = 1;
            if (tag === 'SUB') f.sub = 1; if (tag === 'SUP') f.sup = 1;
            if (tag === 'INS' && n.dataset.tc) f.tc = {k: 'ins', id: n.dataset.tc, a: n.dataset.a || '', t: n.dataset.t || ''};
            if (tag === 'DEL' && n.dataset.tc) f.tc = {k: 'del', id: n.dataset.tc, a: n.dataset.a || '', t: n.dataset.t || ''};
            if (n.classList.contains('wp-cm') && n.dataset.cm) f.cm = [...(f.cm || []), n.dataset.cm];
            if (tag === 'A') { if (n.dataset.wpPerson) f.link = {k: 'person', id: Number(n.dataset.wpPerson), ...(n.dataset.part ? {part: n.dataset.part} : {})}; else if (n.dataset.wpPlace) f.link = {k: 'place', id: Number(n.dataset.wpPlace)}; else if (n.getAttribute('href')) f.href = n.getAttribute('href'); }
            if (n.dataset.cs) f.cs = n.dataset.cs;
            const s = n.style;
            if (s) { if (s.color) f.col = rgbHex(s.color); if (s.backgroundColor) f.bg = rgbHex(s.backgroundColor); if (s.fontFamily) f.font = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (s.fontSize) f.sz = parseLen(s.fontSize, 'pt'); if (/small-caps/.test(s.fontVariant || s.fontVariantCaps || '')) f.sc = 1; if (/bold|[6-9]00/.test(s.fontWeight)) f.b = 1; if (s.fontStyle === 'italic') f.i = 1; if (/underline/.test(s.textDecoration)) f.u = 1; if (/line-through/.test(s.textDecoration)) f.s = 1; if (s.textTransform === 'uppercase') f.caps = 1; }
            Object.keys(f).forEach(k => { if (f[k] === '' || f[k] == null || Number.isNaN(f[k])) delete f[k]; });
            runsOf(n, f, out);
        });
        return out;
    }
    const zoomOf = n => { const z = n.closest('.wp-zoom'); const m = /scale\(([\d.]+)\)/.exec(z?.style.transform || ''); return m ? Number(m[1]) : 1; };
    function paraOf(el, extra = {}) {
        const s = el.style, b = {t: 'p', st: el.dataset.st || (/^H[1-6]$/.test(el.tagName) ? el.tagName.toLowerCase() : 'normal'), ...extra};
        if (s.textAlign) b.al = s.textAlign === 'start' ? 'left' : s.textAlign === 'end' ? 'right' : s.textAlign;
        if (s.lineHeight && /^[\d.]+$/.test(s.lineHeight)) b.lh = Number(s.lineHeight);
        if (s.marginTop) b.sb = parseLen(s.marginTop, 'pt'); if (s.marginBottom) b.sa = parseLen(s.marginBottom, 'pt');
        if (s.marginLeft) b.il = parseLen(s.marginLeft); if (s.marginRight) b.ir = parseLen(s.marginRight); if (s.textIndent) b.fi = parseLen(s.textIndent);
        if (s.backgroundColor) b.bg = rgbHex(s.backgroundColor); if (s.border && !/none|^0/.test(s.border)) b.bd = true;
        if (el.dataset.drop) b.drop = true; if (el.dataset.keep) b.keep = true;
        const clone = el.cloneNode(true); clone.querySelectorAll(':scope > ul, :scope > ol').forEach(x => x.remove());
        b.runs = T().mergeRuns(runsOf(clone));
        Object.keys(b).forEach(k => { if (b[k] === undefined || Number.isNaN(b[k])) delete b[k]; });
        return b;
    }
    function blocksOfEl(root, opts = {}) {
        const out = [];
        const listWalk = (ul, lvl) => [...ul.children].forEach(li => {
            if (li.tagName === 'LI') { out.push(paraOf(li, {list: {k: ul.tagName === 'OL' ? 'ol' : 'ul', l: clamp(lvl, 0, 8)}})); [...li.children].filter(x => /^(UL|OL)$/.test(x.tagName)).forEach(x => listWalk(x, lvl + 1)); }
            else if (/^(UL|OL)$/.test(li.tagName)) listWalk(li, lvl + 1);
        });
        const walk = el => [...el.childNodes].forEach(n => {
            if (n.nodeType === 3) { if (n.data.trim()) out.push({t: 'p', st: 'normal', runs: [{x: n.data}]}); return; }
            if (n.nodeType !== 1 || n.matches('.wp-endnotes, .wp-h')) return;
            const tag = n.tagName;
            if (/^(P|H[1-6]|BLOCKQUOTE|PRE)$/.test(tag) || (tag === 'DIV' && !n.className && ![...n.children].some(isBlock))) { out.push(paraOf(n)); return; }
            if (tag === 'UL' || tag === 'OL') { listWalk(n, 0); return; }
            if (tag === 'HR') { out.push(n.classList.contains('wp-pb') ? {t: 'pb'} : {t: 'hr'}); return; }
            if (tag === 'FIGURE') { const img = n.querySelector('img'); if (img?.getAttribute('src')) out.push({t: 'img', src: img.getAttribute('src'), w: parseFloat(n.style.width) || img.naturalWidth || 300, alt: img.alt || '', wrap: n.dataset.wrap || 'topbottom', al: n.dataset.align || 'center', cap: n.querySelector('figcaption')?.textContent.trim() || '', mid: Number(img.dataset.media) || undefined}); return; }
            if (tag === 'TABLE') { out.push(tableOf(n)); return; }
            if (n.classList.contains('wp-cols')) { out.push({t: 'cols', n: Number(n.dataset.cols) || 2, blocks: blocksOfEl(n)}); return; }
            if (n.classList.contains('wp-gen')) { const k = n.dataset.gen; out.push({t: k, blocks: [...n.querySelectorAll('[data-lvl], .wp-gen-b, .wp-gen-k, .wp-gen-h')].map(x => ({t: 'p', st: 'normal', lvl: x.classList.contains('wp-gen-h') ? undefined : Number(x.dataset.lvl) || 1, runs: [{x: x.classList.contains('wp-gen-l') ? `${x.querySelector('span')?.textContent || ''}\t${x.querySelector('b')?.textContent || ''}` : x.textContent}].flatMap(r => r.x.split('\t').flatMap((y, i) => (i ? [{tab: true, x: ''}, {x: y}] : [{x: y}]))), b: x.classList.contains('wp-gen-k') ? 1 : undefined}))}); return; }
            if (tag === 'DIV') { walk(n); return; }
            out.push({t: 'p', st: 'normal', runs: T().mergeRuns(runsOf({childNodes: [n]}))});
        });
        walk(root);
        return out;
    }
    function tableOf(t) {
        const rows = [], head = t.tHead ? t.tHead.rows.length : 0;
        [...t.rows].forEach(tr => rows.push([...tr.cells].map(c => { const o = {blocks: [...c.children].some(isBlock) ? blocksOfEl(c) : [{t: 'p', st: 'normal', runs: T().mergeRuns(runsOf(c))}]}; if (c.colSpan > 1) o.cs = c.colSpan; if (c.rowSpan > 1) o.rs = c.rowSpan; if (c.style.backgroundColor) o.bg = rgbHex(c.style.backgroundColor); return o; })));
        const cols = [...t.querySelectorAll('col')].map(c => parseFloat(c.style.width)).filter(x => x > 0);
        const o = {t: 'table', head, rows}; if (cols.length) o.cols = cols; if (t.dataset.bd === '0') o.bd = false; return o;
    }

    /* ═════════ Les menus du haut (E1) : chaque ligne a sa commande (data-wp-cmd), réglable dans les raccourcis ═════════ */
    const M = (cmd, label, key = '') => ({cmd, label, key});
    const MENUS = () => [
        ['Fichier', [M('new', '＋ Nouveau document'), M('template', '📋 Partir d’un modèle…'), M('import', '⤒ Importer (Word, LibreOffice…)…', '⌘O'), '-', M('save', '💾 Enregistrer', '⌘S'), M('saveas', 'Enregistrer une copie…'), M('savetpl', 'Enregistrer comme modèle…'), M('version', '🕘 Enregistrer comme nouvelle version'), M('versions', '🕘 Versions du document…'), M('compare', '⇄ Comparer deux versions…'), '-', M('export', '⤓ Exporter…', '⌥⌘E'), M('print', '🖨 Imprimer…', '⌘P'), M('tomedia', '📁 Ranger une copie dans les médias'), M('tolayout', '📐 Envoyer vers la mise en page…'), '-', M('pagesetup', '📄 Format, marges et orientation…'), M('props', 'ℹ️ Propriétés du document…'), M('settings', '⚙️ Réglages du traitement de texte…'), M('close', 'Fermer')]],
        ['Édition', [M('undo', '↶ Annuler', '⌘Z'), M('redo', '↷ Rétablir', '⇧⌘Z'), '-', M('cut', 'Couper', '⌘X'), M('copy', 'Copier', '⌘C'), M('paste', 'Coller', '⌘V'), M('pasteplain', 'Coller sans la mise en forme', '⇧⌘V'), M('selectall', 'Tout sélectionner', '⌘A'), '-', M('find', '🔍 Rechercher', '⌘F'), M('replace', 'Rechercher et remplacer', '⇧⌘H'), M('goto', 'Aller à la page…', '⌥⌘G')]],
        ['Affichage', [M('view:page', '📄 Pages'), M('view:draft', '📜 Brouillon (sans les pages)'), '-', M('ribbon', 'Barre d’outils en ruban (avec les noms)'), M('nav', '🧭 Panneau de navigation'), M('panel', 'Panneau de droite'), M('marks', '¶ Marques de mise en forme', '⌥⌘8'), M('showcm', '💬 Montrer les commentaires'), '-', M('zoomfit', 'Ajuster à la fenêtre', '⌘0'), M('zoom100', '100 %', '⌘1'), '-', M('keys', '⌨️ Raccourcis du traitement de texte…'), M('help', '❓ Aide (FAQ)')]],
        ['Insertion', [M('image', '🖼 Image…'), M('table', '▦ Tableau…'), M('sheet', '🧮 Tableau venu du Tableur…'), M('link', '🔗 Lien…', '⌘K'), '-', M('footnote', '¹ Note de bas de page', '⌥⌘F'), M('endnote', 'ⁱ Note de fin', '⌥⌘D'), M('cite', '❝ Source citée…'), M('bib', '📚 Bibliographie'), M('toc', '📑 Sommaire'), M('index', '🔤 Index'), M('xe', 'Marquer pour l’index'), '-', M('person', '👤 Une personne de la base…', '⇧⌘P'), M('place', '📍 Un lieu de la base…'), M('media', '🎞 Un média (lien)…'), M('bio', '📖 La biographie d’une personne…'), M('tree', '🌳 Un petit arbre…'), M('diagram', '📊 Un diagramme…'), '-', M('chars', 'Ω Caractères spéciaux…'), M('date', '📅 Date du jour'), M('field', '# Champ (page, nombre de pages, titre, auteur)…'), '-', M('pagebreak', '⤓ Saut de page', '⌘↩'), M('sectionbreak', '📄 Saut de section (autre orientation)…'), M('columns', '▥ Colonnes…'), M('hr', '― Ligne horizontale'), M('headfoot', 'En-tête et pied de page…')]],
        ['Format', [M('bold', 'Gras', '⌘B'), M('italic', 'Italique', '⌘I'), M('underline', 'Souligné', '⌘U'), M('strike', 'Barré', '⇧⌘X'), M('sup', 'Exposant', '⌘.'), M('sub', 'Indice', '⌘,'), M('smallcaps', 'Petites capitales', '⇧⌘K'), '-', M('font', 'Police…'), M('color', 'Couleur du texte…'), M('highlight', 'Surlignage…'), '-', M('case:upper', 'MAJUSCULES'), M('case:lower', 'minuscules'), M('case:sentence', 'Majuscule en début de phrase'), M('case:title', 'Chaque Mot Avec Une Majuscule'), '-', M('paragraph', '¶ Paragraphe (espacements, retraits, interligne)…'), M('dropcap', 'Lettrine'), M('border', 'Bordure et trame…'), M('tabs', 'Tabulations…'), M('ul', '• Liste à puces', '⇧⌘8'), M('ol', '1. Liste numérotée', '⇧⌘7'), M('indent', 'Augmenter le retrait', '⌘]'), M('outdent', 'Diminuer le retrait', '⌘['), '-', M('styles', '🎨 Styles…'), M('newstyle', '＋ Nouveau style d’après la sélection…'), M('styleset', 'Jeu de styles…'), M('layoutstyles', '📐 Reprendre les styles d’un livre…'), M('clearfmt', 'Effacer la mise en forme', '⌘\\')]],
        ['Outils', [M('words', '🔢 Nombre de mots…'), M('lang', '🌐 Langue…'), M('spell', 'Vérifier l’orthographe pendant la frappe'), '-', M('track', '✍ Suivre les modifications', '⌥⌘T'), M('tcshow', 'Montrer les modifications…'), M('accept', '✓ Accepter la modification'), M('reject', '✗ Refuser la modification'), M('acceptall', 'Tout accepter'), M('rejectall', 'Tout refuser'), M('tcnext', 'Modification suivante'), M('tcprev', 'Modification précédente'), '-', M('comment', '💬 Nouveau commentaire', '⌥⌘M'), M('comments', 'Commentaires (panneau)'), '-', M('facts', '🔎 Vérifier avec les fiches'), M('read', '🔊 Lire à voix haute'), M('stopread', '⏹ Arrêter la lecture')]],
        ['Tableau', [M('table', '▦ Insérer un tableau…'), M('sheet', '🧮 Tableau venu du Tableur…'), '-', M('rowabove', 'Ligne au-dessus'), M('rowbelow', 'Ligne en dessous'), M('colleft', 'Colonne à gauche'), M('colright', 'Colonne à droite'), M('delrow', 'Supprimer la ligne'), M('delcol', 'Supprimer la colonne'), M('deltable', 'Supprimer le tableau'), '-', M('merge', '⊞ Fusionner les cellules'), M('split', 'Séparer la cellule'), M('headrow', 'Ligne d’en-tête (répétée sur chaque page)'), M('tborders', 'Bordures du tableau'), M('cellbg', 'Trame de la cellule…'), '-', M('sortaz', '↕ Trier A → Z (cette colonne)'), M('sortza', '↕ Trier Z → A (cette colonne)'), '-', M('tosheet', '🧮 Ouvrir ce tableau dans le Tableur')]],
    ];
    // ext.textDocMenuExtra : [{menu: 'Outils', cmd, label, key}] — des lignes ajoutées par d'autres fichiers (publipostage…), leur commande dans ext.textDocCommands
    const withExtra = (title, base) => { const more = (ext.textDocMenuExtra || []).filter(x => x && x.menu === title && x.cmd); return more.length ? [...base, '-', ...more.map(x => M(x.cmd, x.label, x.key || ''))] : base; };
    const menusHtml = () => MENUS().map(([title, items]) => [title, withExtra(title, items)]).map(([title, items]) => `<details class="wp-menu" data-wp-menu="${esc(title)}"><summary>${esc(title)}</summary><div class="wp-menu-list" role="menu">${items.map(it => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-wp-cmd="${esc(it.cmd)}"><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(kbd(it.key))}</kbd>` : ''}</button>`)).join('')}</div></details>`).join('');
    const tb = (cmd, icon, title, key = '', lab = '') => `<button type="button" class="icon-button small" data-wp-cmd="${cmd}" title="${esc(title)}"${key ? ` data-shortcut="${key}"` : ''} aria-label="${esc(title)}">${icon}<span class="wp-tb-lab">${esc(lab || title.split(' ')[0])}</span></button>`;
    const toolsHtml = () => toolsHtml0().replace(/<span class="wp-g" data-tb="([\w-]+)" data-tb-label="([^"]*)"/g, (m, k, l) => `${m} data-tbg="wp-g-${k}" data-tbg-label="Barre d’outils · ${l}"`); // chaque bouton d'un groupe se range aussi un par un (⚙️ Personnaliser)
    const toolsHtml0 = () => `<div class="wp-tools" data-tbg="wp-tools" data-tbg-label="Barre d’outils">
        <span class="wp-g" data-tb="style" data-tb-label="Style du paragraphe"><select data-wp-style aria-label="Style du paragraphe" title="Style du paragraphe"></select></span>
        <span class="wp-g" data-tb="font" data-tb-label="Police et taille (E5)"><button type="button" class="button small secondary wp-fontbtn" data-wp-cmd="font" title="Police (E5)">Georgia</button><input type="number" data-wp-size data-unit="pt" min="4" max="144" step="0.5" value="12" aria-label="Taille" title="Taille du texte"></span>
        <span class="wp-g" data-tb="fmt" data-tb-label="Gras, italique…">${tb('bold', '<b>G</b>', 'Gras', '⌘B')}${tb('italic', '<i>I</i>', 'Italique', '⌘I')}${tb('underline', '<u>S</u>', 'Souligné', '⌘U')}${tb('strike', '<s>ab</s>', 'Barré', '⇧⌘X')}${tb('sup', 'x²', 'Exposant', '⌘.')}${tb('sub', 'x₂', 'Indice', '⌘,')}${tb('smallcaps', 'Pᴄ', 'Petites capitales', '⇧⌘K')}</span>
        <span class="wp-g" data-tb="colors" data-tb-label="Couleur et surlignage (C2)"><button type="button" class="icon-button small wp-colbtn" data-wp-cmd="color" title="Couleur du texte" aria-label="Couleur du texte"><b>A</b><i data-wp-sw="color"></i><span class="wp-tb-lab">Couleur</span></button><button type="button" class="icon-button small wp-colbtn" data-wp-cmd="highlight" title="Surlignage" aria-label="Surlignage">🖍<i data-wp-sw="hl" style="--c:#fff176"></i><span class="wp-tb-lab">Surligner</span></button>${tb('clearfmt', '⌫', 'Effacer la mise en forme', '⌘\\', 'Effacer')}</span>
        <span class="wp-g" data-tb="para" data-tb-label="Paragraphe">${tb('al:left', '⟸', 'Aligner à gauche', '⇧⌘L', 'Gauche')}${tb('al:center', '≡', 'Centrer', '⇧⌘E', 'Centre')}${tb('al:right', '⟹', 'Aligner à droite', '⇧⌘R', 'Droite')}${tb('al:justify', '☰', 'Justifier', '⇧⌘J', 'Justifier')}<button type="button" class="icon-button small" data-wp-cmd="linemenu" title="Interligne et espacement" aria-label="Interligne">↕<span class="wp-tb-lab">Interligne</span></button>${tb('ul', '•≡', 'Liste à puces', '⇧⌘8', 'Puces')}${tb('ol', '1≡', 'Liste numérotée', '⇧⌘7', 'Numéros')}${tb('outdent', '⇤', 'Diminuer le retrait', '⌘[', 'Retrait −')}${tb('indent', '⇥', 'Augmenter le retrait', '⌘]', 'Retrait +')}</span>
        <span class="wp-g" data-tb="insert" data-tb-label="Insérer">${tb('image', '🖼', 'Image', '', 'Image')}${tb('table', '▦', 'Tableau', '', 'Tableau')}${tb('link', '🔗', 'Lien', '⌘K', 'Lien')}${tb('footnote', '¹', 'Note de bas de page', '⌥⌘F', 'Note')}${tb('person', '👤', 'Une personne de la base', '⇧⌘P', 'Personne')}${tb('place', '📍', 'Un lieu de la base', '', 'Lieu')}${tb('chars', 'Ω', 'Caractères spéciaux', '', 'Caractères')}</span>
        <span class="wp-g" data-tb="review" data-tb-label="Relecture">${tb('track', '✍', 'Suivre les modifications', '⌥⌘T', 'Suivi')}${tb('comment', '💬', 'Nouveau commentaire', '⌥⌘M', 'Commenter')}${tb('find', '🔍', 'Rechercher', '⌘F', 'Chercher')}</span>
    </div>`;

    /* ═════════ L'éditeur ═════════ */
    const DEF_DOC = () => ({v: 1, page: {...T().PAGE0, m: {...T().PAGE0.m}, size: 'A4'}, sections: [{html: ''}], header: {html: '', first: false, firstHtml: ''}, footer: {html: '<p data-st="normal" style="text-align:center"><span class="wp-field" data-field="page" contenteditable="false">1</span></p>', first: true, firstHtml: ''}, styles: T().styleSet(pref('set', 'classique')), comments: [], lang: pref('lang', 'fr'), set: pref('set', 'classique'), track: false, meta: {author: pref('author', ''), subject: ''}});
    class Editor {
        constructor(o) {
            Object.assign(this, {id: o.id || 0, name: o.name || 'Mon document', kind: o.kind === 'template' ? 'template' : 'doc', ctx: o, rev: o.rev || ''});
            const d = o.data && typeof o.data === 'object' ? o.data : DEF_DOC();
            this.doc = {...DEF_DOC(), ...d, page: {...T().PAGE0, ...(d.page || {}), m: {...T().PAGE0.m, ...(d.page?.m || {})}}, header: {html: '', first: false, firstHtml: '', ...(d.header || {})}, footer: {html: '', first: false, firstHtml: '', ...(d.footer || {})}, meta: {author: '', subject: '', ...(d.meta || {})}};
            this.doc.styles = (Array.isArray(this.doc.styles) && this.doc.styles.length ? this.doc.styles : T().styleSet(this.doc.set)).map(T().cleanStyle).filter(Boolean);
            T().BASE_STYLES.forEach(b => { if (!this.doc.styles.some(s => s.id === b.id)) this.doc.styles.push({...b}); });
            this.doc.comments = Array.isArray(this.doc.comments) ? this.doc.comments : [];
            this.dirty = !!o.dirty || (!!o.data && !o.id); this.secs = []; this.zoom = 1; this.zoomMode = pref('zoomMode', 'fit');
            this.view = pref('view', 'page'); this.tcShow = pref('tcShow', 'all'); this.hist = []; this.hpos = -1; this.intern = new Map();
        }
        $(s) { return this.dlg?.querySelector(s); }
        $$(s) { return [...(this.dlg?.querySelectorAll(s) || [])]; }
        get author() { return pref('author', '') || this.doc.meta?.author || 'Moi'; }
    }
    ext.textDocKit = {Editor, cleanHtml, cleanCss, blocksOfEl, runsOf, paraOf, tableOf, prefs, setPrefs, pref, MENUS, LANGS, FONTS, SIZES, MM, PT, GAP, esc, clamp, blockOf, parseLen};

    Object.assign(Editor.prototype, {
        open() {
            const U = UI(), dlg = this.dlg = document.createElement('dialog');
            dlg.className = 'modal wp-dlg'; dlg.dataset.ownClose = '1'; dlg.dataset.noFoot = '1'; dlg.setAttribute('data-no-foot', '');
            const top = U.editorTopbar({icon: '📝', name: this.name, nameAttrs: 'data-wp-name', menus: [{html: `<nav class="wp-menus">${menusHtml()}</nav>`}], undo: true, status: this.id && !this.dirty ? 'saved' : '',
                buttons: {customize: ext.tbButton ? {html: '⚙️ Personnaliser', attrs: 'data-tb-config="textdoc"'} : null, export: {attrs: 'data-wp-cmd="export"', title: 'Word (.docx), LibreOffice (.odt), PDF, RTF, Markdown, texte, HTML, impression'}, save: {attrs: 'data-wp-cmd="save"'}, full: ext.fullButton ? {attrs: 'data-full-toggle="textdoc"', title: 'Plein écran (⛶)'} : null, close: {attrs: 'data-wp-cmd="close"'}}});
            dlg.innerHTML = `<div class="wp${pref('ribbon', false) ? ' is-ribbon' : ''}">${top}${toolsHtml()}
                <div class="wp-find" data-wp-findbar hidden></div>
                <div class="wp-main"><nav class="wp-rail" data-wp-rail aria-label="Outils">
                    <button type="button" class="ed-tool" data-wp-cmd="nav" title="Panneau de navigation : titres, pages, résultats" aria-label="Navigation">🧭</button>
                    <button type="button" class="ed-tool" data-wp-cmd="find" title="Rechercher et remplacer" data-shortcut="⌘F" aria-label="Rechercher">🔍</button>
                    <button type="button" class="ed-tool" data-wp-cmd="panel:format" title="Mise en forme (panneau de droite)" aria-label="Mise en forme">🎨</button>
                    <button type="button" class="ed-tool" data-wp-cmd="panel:comments" title="Commentaires" aria-label="Commentaires">💬</button>
                    <button type="button" class="ed-tool" data-wp-cmd="panel:changes" title="Modifications suivies" aria-label="Modifications suivies">✍</button>
                    <button type="button" class="ed-tool" data-wp-cmd="facts" title="Vérifier avec les fiches" aria-label="Vérifier avec les fiches">🔎</button>
                    <button type="button" class="ed-tool" data-wp-cmd="read" title="Lire à voix haute" aria-label="Lire à voix haute">🔊</button>
                    <button type="button" class="ed-tool" data-wp-cmd="marks" title="Marques de mise en forme ¶" data-shortcut="⌥⌘8" aria-label="Marques de mise en forme">¶</button></nav>
                    <aside class="wp-side" data-wp-side hidden aria-label="Navigation"></aside>
                    <div class="wp-scroll" data-wp-scroll data-ctx-off><div class="wp-sizer" data-wp-sizer><div class="wp-zoom" data-wp-zoom><div class="wp-doc" data-wp-doc></div></div></div></div>
                    <aside class="wp-panel" data-wp-panel aria-label="Panneau de droite"${pref('panel', true) && innerWidth > 760 ? '' : ' hidden'}></aside></div></div>`;
            document.body.appendChild(dlg);
            ext.fullInit?.(dlg, 'textdoc', true);
            dlg.showModal();
            this.scroll = this.$('[data-wp-scroll]'); this.docEl = this.$('[data-wp-doc]'); this.zoomEl = this.$('[data-wp-zoom]'); this.sizer = this.$('[data-wp-sizer]');
            U.editorRail?.(this.$('[data-wp-rail]'), {breaks: ['[data-wp-cmd="panel:format"]', '[data-wp-cmd="facts"]']});
            this.status = U.editorStatus({where: '', help: 'Écris, choisis un style à gauche de la barre ; clic droit pour les actions.', zoom: {get: () => this.zoom, set: k => this.setZoom(k, 'manual'), fit: () => this.setZoom(0, 'fit'), min: 0.25, max: 4}, wheel: this.scroll});
            this.$('.wp').appendChild(this.status);
            const saveBtn = this.$('.ui-topbar [data-wp-cmd="save"]');
            U.saveMenu?.(saveBtn, () => [{icon: '⧉', label: 'Enregistrer une copie…', run: () => this.run('saveas')}, {icon: '📋', label: 'Enregistrer comme modèle…', run: () => this.run('savetpl')}, {icon: '🕘', label: 'Enregistrer comme nouvelle version', run: () => this.run('version')}, '-', {icon: '📁', label: 'Ranger une copie dans les médias', run: () => this.run('tomedia')}, {icon: '📐', label: 'Envoyer vers la mise en page…', run: () => this.run('tolayout')}]);
            document.execCommand('defaultParagraphSeparator', false, 'p');
            this.styleTag = document.createElement('style'); dlg.appendChild(this.styleTag);
            this.build();
            this.bind();
            this.buildPanel();
            ext.tbApply?.(dlg, 'textdoc');
            ext.editorKeysAttach?.(dlg, 'textdoc');
            this.commit(true);
            this.applyView();
            this.layoutSoon(0);
            setTimeout(() => { this.layout(); this.focusEnd(false); ext.textDocTools?.afterOpen?.(this); }, 30);
            if (this.dirty) U.savedStatus?.(dlg, 'dirty');
            if (ext.textDocKit) { const k = ext.textDocKit; k.open = (k.open || []).filter(x => !x.closed).concat(this); k.current = this; } // l’éditeur au premier plan
            this.autosaveTimer = setInterval(() => { const m = Number(pref('autosave', 0)); if (m > 0 && this.id && this.dirty && Date.now() - (this.lastEdit || 0) > 4000 && Date.now() - (this.savedAt || 0) > m * 60000) this.save({quiet: true}); }, 20000);
            return this;
        },
        /* ── les sections (une zone de texte chacune) ── */
        build() {
            this.docEl.innerHTML = ''; this.secs = [];
            (this.doc.sections || [{html: ''}]).forEach(s => this.addSection(s, null));
            this.applyStyles();
        },
        addSection(s, after) {
            const el = document.createElement('section'); el.className = 'wp-sec';
            el.innerHTML = '<div class="wp-sheets" aria-hidden="true"></div><div class="wp-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texte du document" data-ui-off></div>';
            const body = el.querySelector('.wp-body');
            body.innerHTML = cleanHtml(s.html || '').html || '<p data-st="normal"><br></p>';
            const sec = {el, body, sheets: el.querySelector('.wp-sheets'), page: s.page ? {...s.page, m: {...(s.page.m || this.doc.page.m)}} : null, pages: 1};
            if (after) { after.el.after(el); this.secs.splice(this.secs.indexOf(after) + 1, 0, sec); } else { this.docEl.appendChild(el); this.secs.push(sec); }
            this.normalize(body);
            this.spellOn(body);
            return sec;
        },
        spellOn(body) { body.spellcheck = pref('spell', true) !== false; body.lang = this.doc.lang || 'fr'; },
        bodies() { return this.secs.map(s => s.body); },
        secOf(node) { return this.secs.find(s => s.body.contains(node)) || null; },
        /** la feuille de styles du document (styles, polices) */
        applyStyles() {
            const css = T().stylesCss(this.doc.styles, `.wp-dlg .wp-body`);
            this.styleTag.textContent = css + `\n.wp-dlg .wp-body li[data-st="normal"]{margin-bottom:2pt}\n.wp-dlg .wp-sheet-hd,.wp-dlg .wp-sheet-ft{font-family:'${T().fontOk((this.doc.styles.find(s => s.id === 'normal') || {}).font || 'Georgia')}',serif}`;
            this.fillStyleSelect();
        },
        fillStyleSelect() {
            const sel = this.$('[data-wp-style]'); if (!sel) return;
            const ps = this.doc.styles.filter(s => s.kind !== 'c'), cs = this.doc.styles.filter(s => s.kind === 'c');
            sel.innerHTML = `<optgroup label="Paragraphe">${ps.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>${cs.length ? `<optgroup label="Caractère">${cs.map(s => `<option value="c:${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>` : ''}`;
        },
        /** la forme attendue : paragraphes avec un style, listes rangées, éléments spéciaux non modifiables */
        normalize(root) {
            // du texte posé à même la zone : dans un paragraphe
            [...root.childNodes].forEach(n => {
                if (n.nodeType === 3 && !n.data.trim()) { if (!n.data.includes('\n')) n.remove(); else n.remove(); return; }
                if (n.nodeType === 3 || (n.nodeType === 1 && !isBlock(n) && !n.matches('.wp-gen, .wp-cols, .wp-endnotes'))) { const p = document.createElement('p'); p.dataset.st = 'normal'; n.before(p); p.appendChild(n); while (p.nextSibling && (p.nextSibling.nodeType === 3 || (p.nextSibling.nodeType === 1 && !isBlock(p.nextSibling)))) p.appendChild(p.nextSibling); }
            });
            root.querySelectorAll('div:not([class]), blockquote, pre').forEach(d => { if ([...d.children].some(isBlock)) { if (d.tagName === 'BLOCKQUOTE') d.querySelectorAll(':scope > p').forEach(p => { p.dataset.st = 'quote'; }); d.replaceWith(...d.childNodes); return; } const p = document.createElement('p'); [...d.attributes].forEach(a => p.setAttribute(a.name, a.value)); if (d.tagName === 'BLOCKQUOTE') p.dataset.st = 'quote'; if (d.tagName === 'PRE') p.dataset.st = 'mono'; p.append(...d.childNodes); d.replaceWith(p); });
            // Word : les paragraphes « mso-list » deviennent des listes
            let lastList = null;
            [...root.querySelectorAll('[data-wp-list]')].forEach(p => { const [k, l] = p.dataset.wpList.split(':'); p.removeAttribute('data-wp-list'); const li = document.createElement('li'); li.append(...p.childNodes); li.dataset.st = 'normal';
                const prev = p.previousElementSibling; let list = prev && prev === lastList?.root ? lastList : null;
                if (!list) { const ul = document.createElement(k === 'ol' ? 'ol' : 'ul'); p.before(ul); list = lastList = {root: ul, stack: [ul]}; }
                const lvl = Number(l) || 0; while (list.stack.length > lvl + 1) list.stack.pop(); while (list.stack.length < lvl + 1) { const sub = document.createElement(k === 'ol' ? 'ol' : 'ul'); const host = list.stack[list.stack.length - 1].lastElementChild || list.stack[list.stack.length - 1]; host.appendChild(sub); list.stack.push(sub); }
                list.stack[list.stack.length - 1].appendChild(li); p.remove(); });
            // une liste dans un paragraphe (Chrome) : à côté ; un élément de liste dans un élément de liste : après lui
            root.querySelectorAll('p > ul, p > ol, h1 > ul, h1 > ol').forEach(l => { const p = l.parentElement; p.after(l); if (!p.textContent.trim() && !p.querySelector('img, sup')) p.remove(); });
            root.querySelectorAll('li > li').forEach(li => li.parentElement.after(li));
            // des listes posées dans des listes (Chrome) : dans l'élément d'avant
            root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').forEach(x => { const prev = x.previousElementSibling; if (prev?.tagName === 'LI') prev.appendChild(x); });
            root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(p => { if (!p.dataset.st || !this.doc.styles.some(s => s.id === p.dataset.st)) p.dataset.st = /^H[1-6]$/.test(p.tagName) ? p.tagName.toLowerCase() : 'normal'; });
            // un titre doit être un <h…>, un paragraphe un <p> (pour le plan et le sommaire)
            root.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach(p => { const st = p.dataset.st, want = /^h[1-6]$/.test(st) ? st.toUpperCase() : 'P'; if (p.tagName !== want) this.retag(p, want); });
            root.querySelectorAll('sup.wp-fn, .wp-field, figure.wp-fig, hr.wp-pb, .wp-gen').forEach(x => x.setAttribute('contenteditable', 'false'));
            root.querySelectorAll('figure.wp-fig figcaption').forEach(x => x.setAttribute('contenteditable', 'true'));
            root.querySelectorAll('table').forEach(t => { t.classList.add('wp-table'); t.querySelectorAll('td, th').forEach(c => { if (!c.firstChild) c.appendChild(document.createElement('br')); }); });
            root.querySelectorAll('img:not(.wp-inl)').forEach(im => { if (!im.closest('figure')) im.classList.add('wp-inl'); });
            root.querySelectorAll('span:not([class]):not([style]):not([data-cs])').forEach(s => s.replaceWith(...s.childNodes));
            if (!root.firstElementChild) root.innerHTML = '<p data-st="normal"><br></p>';
            const last = root.lastElementChild; if (last && /^(TABLE|FIGURE|HR|DIV)$/.test(last.tagName) && !last.matches('.wp-endnotes')) { const p = document.createElement('p'); p.dataset.st = 'normal'; p.innerHTML = '<br>'; last.after(p); }
        },
        retag(el, tag) {
            const n = document.createElement(tag); [...el.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.append(...el.childNodes); el.replaceWith(n); return n;
        },
        /* ═════════ Mettre en pages ═════════ */
        pageOf(sec) {
            const p = {...T().PAGE0, ...this.doc.page, ...(sec?.page || {})}, m = {...T().PAGE0.m, ...this.doc.page.m, ...(sec?.page?.m || {})};
            let w = p.w, h = p.h; const land = p.orient === 'landscape'; if (land && h > w) [w, h] = [h, w]; if (!land && w > h) [w, h] = [h, w];
            return {W: Math.round(w * MM), H: Math.round(h * MM), mt: m.t * MM, mb: m.b * MM, ml: m.l * MM, mr: m.r * MM, land, wmm: w, hmm: h, m};
        },
        layoutSoon(ms = 120) { clearTimeout(this.lt); this.lt = setTimeout(() => { if (!this.closed) this.layout(); }, ms); },
        /** les morceaux qui passent d'une page à l'autre : paragraphes, éléments de liste, tableaux, figures, blocs */
        units(body) {
            const out = [];
            const add = el => {
                if (el.nodeType !== 1) return;
                if (/^(UL|OL)$/.test(el.tagName)) { [...el.children].forEach(li => { if (li.tagName === 'LI') { out.push({el: li, li: true}); [...li.children].filter(x => /^(UL|OL)$/.test(x.tagName)).forEach(add); } else add(li); }); return; }
                if (el.tagName === 'FIGURE' && el.dataset.wrap === 'square') return; // flotte avec le texte
                out.push({el, br: el.matches('hr.wp-pb')});
            };
            [...body.children].forEach(add);
            return out;
        },
        offTop(el, body) { let y = 0, n = el; while (n && n !== body) { y += n.offsetTop; n = n.offsetParent; if (n && !body.contains(n) && n !== body) break; } return y; },
        noteH(text, width) {
            this.noteCache = this.noteCache || new Map(); const k = `${width}|${text}`; if (this.noteCache.has(k)) return this.noteCache.get(k);
            let m = this.measureBox; if (!m) { m = this.measureBox = document.createElement('div'); m.className = 'wp-sheet-notes'; m.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0'; this.docEl.appendChild(m); }
            m.style.width = `${width}px`; m.innerHTML = `<p><sup>99</sup> ${esc(text)}</p>`; const h = m.getBoundingClientRect().height / (this.zoom || 1) - 4;
            this.noteCache.set(k, h); return h;
        },
        layout() {
            if (!this.dlg?.isConnected) return;
            const t0 = performance.now();
            this.docEl.classList.toggle('show-marks', !!pref('marks', false)); this.docEl.classList.toggle('no-marks', !pref('marks', false) && false);
            this.docEl.classList.remove('tc-simple', 'tc-none'); if (this.tcShow !== 'all') this.docEl.classList.add('tc-' + this.tcShow);
            this.docEl.classList.toggle('no-comments', pref('showcm', true) === false);
            // numéros des notes (dans l'ordre du texte), notes de fin en bas du document
            let fn = 0, en = 0;
            this.bodies().forEach(b => b.querySelectorAll('sup.wp-fn').forEach(s => { const t = s.dataset.kind === 'end' ? toRoman(++en) : String(++fn); if (s.textContent !== t) s.textContent = t; }));
            this.renderEndnotes();
            ext.textDocTools?.refreshGenerated?.(this, false);
            let pageNo = 0; const headings = [];
            const draft = this.view === 'draft';
            this.secs.forEach((sec, si) => {
                const g = this.pageOf(sec), body = sec.body, pitch = g.H + GAP, cap = g.H - g.mt - g.mb, cw = g.W - g.ml - g.mr;
                sec.el.style.width = `${g.W}px`;
                Object.assign(body.style, {left: `${draft ? 30 : g.ml}px`, top: `${draft ? 30 : g.mt}px`, width: `${cw}px`});
                body.querySelectorAll('[data-wp-push]').forEach(e => { e.removeAttribute('data-wp-push'); e.style.removeProperty('--wp-push'); if (!e.getAttribute('style')) e.removeAttribute('style'); });
                const units = this.units(body), notesOn = [];
                let pages = 1;
                if (draft) { pages = 1; sec.el.style.width = `${cw + 60}px`; }
                else {
                    // lire (une seule fois) : position, hauteur, marges, notes de chaque morceau
                    const ms = units.map(u => { const cs = getComputedStyle(u.el), prev = u.el.previousElementSibling; let h = u.el.offsetHeight; if (u.li) { const sub = [...u.el.children].find(x => /^(UL|OL)$/.test(x.tagName)); if (sub) h = sub.offsetTop; }
                        const notes = [...u.el.querySelectorAll('sup.wp-fn[data-kind="foot"]')].filter(s => !u.li || s.closest('li') === u.el);
                        return {top: this.offTop(u.el, body), h, mt: parseFloat(cs.marginTop) || 0, mbPrev: prev ? parseFloat(getComputedStyle(prev).marginBottom) || 0 : 0, notes: notes.map(s => ({el: s, h: this.noteH(s.dataset.note || '', cw)})), keep: u.el.dataset.keep || /^h[1-6]$|^title$|^subtitle$/.test(u.el.dataset.st || '') || (this.doc.styles.find(s => s.id === u.el.dataset.st)?.keep)}; });
                    const used = []; let extra = 0, force = false, page = 0; const pushes = [];
                    units.forEach((u, i) => {
                        const m = ms[i]; let top = m.top + extra;
                        if (u.br) { force = true; return; }
                        let k = Math.max(page, Math.floor(top / pitch)); const nh = m.notes.reduce((a, n) => a + n.h, 0);
                        const room = p => cap - ((used[p] || 0) + (used[p] || nh ? NOTE_SEP : 0));
                        const pageTop = k * pitch, inDead = top - pageTop > cap - (used[k] || 0);
                        const tooLow = top + m.h + (m.keep ? 34 : 0) > pageTop + room(k) - nh;
                        let d = 0;
                        if ((force && top > pageTop + 1) || inDead || (tooLow && top > pageTop + 1 && m.h + nh <= cap - NOTE_SEP)) { d = (k + 1) * pitch - top; k++; }
                        force = false;
                        if (d > 0) { pushes.push([u, d, m]); extra += d; top += d; }
                        used[k] = (used[k] || 0) + nh; m.notes.forEach(n => (notesOn[k] = notesOn[k] || []).push(n.el));
                        page = Math.max(k, Math.floor((top + Math.max(0, m.h - 1)) / pitch));
                    });
                    pushes.forEach(([u, d, m]) => { u.el.setAttribute('data-wp-push', '1'); u.el.style.setProperty('--wp-push', `${Math.max(m.mt, m.mbPrev) + d}px`); });
                    // vérifier : un morceau poussé commence bien en haut de sa page (les marges qui se recouvrent, les flottants)
                    pushes.forEach(([u]) => { const y = this.offTop(u.el, body), k = Math.round(y / pitch), diff = k * pitch - y; if (Math.abs(diff) > 1 && Math.abs(diff) < pitch / 2) u.el.style.setProperty('--wp-push', `${parseFloat(u.el.style.getPropertyValue('--wp-push')) + diff}px`); });
                    pages = Math.max(1, Math.floor((body.offsetHeight - 1) / pitch) + 1, page + 1);
                }
                sec.pages = pages; sec.first = pageNo; sec.notesOn = notesOn; sec.geo = g;
                sec.el.style.height = draft ? `${body.offsetHeight + 60}px` : `${pages * pitch - GAP}px`;
                body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => headings.push({el: h, lvl: Number(h.tagName[1]), text: h.textContent.trim(), page: pageNo + (draft ? 0 : Math.floor(this.offTop(h, body) / pitch)) + 1}));
                pageNo += pages;
            });
            this.totalPages = pageNo; this.headings = headings;
            this.paintSheets();
            const maxW = Math.max(...this.secs.map(s => parseFloat(s.el.style.width) || 800)), totalH = this.secs.reduce((a, s) => a + (parseFloat(s.el.style.height) || 0) + 24, 0) + 64;
            this.docEl.style.width = `${maxW + 90}px`;
            if (this.zoomMode === 'fit') this.zoom = clamp((this.scroll.clientWidth - (innerWidth < 600 ? 12 : 40)) / (maxW + (innerWidth < 600 ? 10 : 90)), 0.2, innerWidth < 600 ? 1 : 1.1);
            this.zoomEl.style.transform = `scale(${this.zoom})`;
            this.sizer.style.width = `${(maxW + 90) * this.zoom}px`; this.sizer.style.height = `${totalH * this.zoom}px`;
            this.status?.sync();
            ext.textDocTools?.refreshGenerated?.(this, true);
            this.paintStatus(); this.paintNav?.();
            this.layoutMs = performance.now() - t0;
        },
        renderEndnotes() {
            const last = this.secs[this.secs.length - 1]?.body; if (!last) return;
            this.bodies().forEach(b => b.querySelectorAll(':scope > .wp-endnotes').forEach(x => { if (b !== last) x.remove(); }));
            const notes = this.bodies().flatMap(b => [...b.querySelectorAll('sup.wp-fn[data-kind="end"]')]);
            let box = last.querySelector(':scope > .wp-endnotes');
            if (!notes.length) { box?.remove(); return; }
            if (!box) { box = document.createElement('div'); box.className = 'wp-endnotes'; box.setAttribute('contenteditable', 'false'); last.appendChild(box); }
            if (box.nextSibling) last.appendChild(box);
            const html = `<p><b>Notes</b></p>${notes.map(s => `<p data-goto-fn="${esc(s.dataset.fn)}"><sup>${esc(s.textContent)}</sup> ${esc(s.dataset.note || '')}</p>`).join('')}`;
            if (box.innerHTML !== html) box.innerHTML = html;
        },
        /** les feuilles : fond, en-tête, pied, notes de bas de page, filigrane, numéro */
        paintSheets() {
            const draft = this.view === 'draft', title = this.name, total = this.totalPages || 1, wm = this.doc.page.wm, color = this.doc.page.color || '#ffffff';
            const field = (html, n) => String(html || '').replace(/<span class="wp-field" data-field="(\w+)"[^>]*>[^<]*<\/span>/g, (m, f) => `<span class="wp-field" data-field="${f}">${esc(f === 'page' ? n : f === 'pages' ? total : f === 'title' ? title : f === 'author' ? (this.doc.meta?.author || '') : f === 'date' ? new Date().toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : '')}</span>`);
            let fnNo = 0;
            this.secs.forEach(sec => {
                const g = sec.geo, pitch = g.H + GAP, H = [];
                if (draft) { sec.sheets.innerHTML = `<div class="wp-sheet" style="top:0;width:100%;height:100%;background:${esc(color)}"></div>`; return; }
                for (let k = 0; k < sec.pages; k++) {
                    const n = sec.first + k + 1, first = n === 1;
                    const hd = first && this.doc.header.first ? this.doc.header.firstHtml : this.doc.header.html, ft = first && this.doc.footer.first ? this.doc.footer.firstHtml : this.doc.footer.html;
                    const notes = (sec.notesOn?.[k] || []).map(s => `<p><sup>${esc(s.textContent || String(++fnNo))}</sup> ${esc(s.dataset.note || '')}</p>`).join('');
                    H.push(`<div class="wp-sheet" data-page="${n}" style="top:${k * pitch}px;width:${g.W}px;height:${g.H}px;background:${esc(color)}">
                        ${wm ? `<div class="wp-sheet-wm" style="opacity:${clamp(this.doc.page.wmo || 12, 2, 60) / 100}">${esc(wm)}</div>` : ''}
                        <div class="wp-sheet-hd" data-wp-hf="header" title="Double-clic : modifier l’en-tête" style="left:${g.ml}px;right:${g.mr}px;top:${Math.max(8, g.mt / 2 - 10)}px">${field(hd, n)}</div>
                        ${notes ? `<div class="wp-sheet-notes" style="left:${g.ml}px;width:${g.W - g.ml - g.mr}px;bottom:${g.mb}px">${notes}</div>` : ''}
                        <div class="wp-sheet-ft" data-wp-hf="footer" title="Double-clic : modifier le pied de page" style="left:${g.ml}px;right:${g.mr}px;bottom:${Math.max(8, g.mb / 2 - 10)}px">${field(ft, n)}</div>
                        <span class="wp-sheet-num">${n}</span></div>`);
                }
                sec.sheets.innerHTML = H.join('');
            });
        },
        applyView() {
            this.docEl.classList.toggle('is-draft', this.view === 'draft');
            this.$$('[data-wp-cmd^="view:"]').forEach(b => b.classList.toggle('is-on', b.dataset.wpCmd === 'view:' + this.view));
            this.$$('[data-wp-cmd="ribbon"]').forEach(b => b.classList.toggle('is-on', !!pref('ribbon', false)));
            this.$$('[data-wp-cmd="marks"]').forEach(b => b.classList.toggle('is-on', !!pref('marks', false)));
            this.$$('[data-wp-cmd="spell"]').forEach(b => b.classList.toggle('is-on', pref('spell', true) !== false));
            this.$$('[data-wp-cmd="track"]').forEach(b => { b.classList.toggle('is-on', !!this.doc.track); b.classList.toggle('is-active', !!this.doc.track); b.setAttribute('aria-pressed', this.doc.track ? 'true' : 'false'); });
            this.$$('[data-wp-cmd="showcm"]').forEach(b => b.classList.toggle('is-on', pref('showcm', true) !== false));
        },
        setZoom(k, mode) {
            this.zoomMode = mode; setPrefs({...prefs(), zoomMode: mode});
            if (mode === 'manual') this.zoom = clamp(k, 0.25, 4);
            this.layout();
        },

        /* ═════════ Choisir, écrire ═════════ */
        sel() { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); return this.secOf(r.startContainer) ? r : null; },
        curBody() { const r = this.sel(); return r ? this.secOf(r.startContainer)?.body : (this.lastBody && this.lastBody.isConnected ? this.lastBody : this.secs[0]?.body); },
        /** les paragraphes touchés par la sélection */
        selBlocks() {
            const r = this.sel() || this.lastRange; if (!r) return [];
            const body = this.secOf(r.startContainer)?.body; if (!body) return [];
            const out = [], first = blockOf(r.startContainer, body), last = blockOf(r.endContainer, body);
            if (r.collapsed) return first ? [first] : [];
            body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td > p, th > p').forEach(b => { if (r.intersectsNode(b)) out.push(b); });
            if (!out.length && first) out.push(first); if (last && !out.includes(last)) out.push(last);
            return out.filter(b => !out.some(o => o !== b && o.contains(b) && o.tagName !== 'LI'));
        },
        focusEnd(scroll = true) { const b = this.secs[0]?.body; if (!b) return; b.focus({preventScroll: true}); const r = document.createRange(); const first = b.firstElementChild || b; r.setStart(first, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); this.lastBody = b; if (scroll) this.revealCaret(); },
        revealCaret() {
            const r = this.sel(); if (!r) return; const rc = (r.getClientRects()[0] || r.startContainer.parentElement?.getBoundingClientRect?.()); if (!rc) return;
            const vp = this.scroll.getBoundingClientRect(); if (rc.bottom > vp.bottom - 20) this.scroll.scrollTop += rc.bottom - vp.bottom + 60; else if (rc.top < vp.top + 10) this.scroll.scrollTop -= vp.top - rc.top + 60;
        },
        /* ═════════ ↶ ↷ sans limite : un instantané par étape (les paragraphes qui ne changent pas sont partagés) ═════════ */
        snapshot() {
            const it = s => { let v = this.intern.get(s); if (v === undefined) { this.intern.set(s, s); v = s; } return v; };
            const clean = h => h.replace(/ data-wp-push="1"/g, '').replace(/ style="--wp-push:\s*[\d.]+px;?"/g, '').replace(/\s*--wp-push:\s*[\d.]+px;?/g, '').replace(/ style=""/g, '');
            return {secs: this.secs.map(s => ({page: s.page ? JSON.stringify(s.page) : '', blocks: [...s.body.childNodes].filter(n => !(n.nodeType === 1 && n.matches('.wp-endnotes'))).map(n => it(clean(n.nodeType === 1 ? n.outerHTML : n.textContent)))})),
                meta: it(JSON.stringify({page: this.doc.page, header: this.doc.header, footer: this.doc.footer, styles: this.doc.styles, comments: this.doc.comments, lang: this.doc.lang, set: this.doc.set, meta: this.doc.meta})), sel: this.selPos()};
        },
        same(a, b) { return a && b && a.meta === b.meta && a.secs.length === b.secs.length && a.secs.every((s, i) => s.page === b.secs[i].page && s.blocks.length === b.secs[i].blocks.length && s.blocks.every((x, j) => x === b.secs[i].blocks[j])); },
        commit(initial = false) {
            clearTimeout(this.typeT); this.typeT = 0;
            const s = this.snapshot(), cur = this.hist[this.hpos];
            if (this.same(s, cur)) { if (cur) cur.sel = s.sel; return false; }
            this.hist = this.hist.slice(0, this.hpos + 1); this.hist.push(s); this.hpos = this.hist.length - 1;
            if (!initial) this.touch();
            this.histBtns();
            return true;
        },
        commitSoon(ms = 650) { clearTimeout(this.typeT); this.typeT = setTimeout(() => this.commit(), ms); },
        restore(s) {
            const meta = JSON.parse(s.meta); Object.assign(this.doc, meta);
            while (this.secs.length > s.secs.length) { const x = this.secs.pop(); x.el.remove(); }
            s.secs.forEach((x, i) => { let sec = this.secs[i]; if (!sec) sec = this.addSection({html: ''}, this.secs[i - 1] || null); sec.page = x.page ? JSON.parse(x.page) : null; sec.body.innerHTML = x.blocks.join(''); this.normalize(sec.body); });
            this.applyStyles(); this.layout(); this.setSelPos(s.sel); this.syncTools(); this.paintPanel?.();
        },
        undo() { if (this.typeT) this.commit(); if (this.hpos <= 0) return toast('Rien à annuler.'); const sel = this.selPos(); this.hpos--; this.restore(this.hist[this.hpos]); this.touch(); this.histBtns(); this.status?.flash('↶ Annulé'); void sel; },
        redo() { if (this.hpos >= this.hist.length - 1) return toast('Rien à rétablir.'); this.hpos++; this.restore(this.hist[this.hpos]); this.touch(); this.histBtns(); this.status?.flash('↷ Rétabli'); },
        histBtns() { const u = this.$('.ui-topbar [data-ui-cmd="undo"]'), r = this.$('.ui-topbar [data-ui-cmd="redo"]'); if (u) u.disabled = this.hpos <= 0; if (r) r.disabled = this.hpos >= this.hist.length - 1; },
        touch() { this.dirty = true; this.lastEdit = Date.now(); UI()?.savedStatus?.(this.dlg, 'dirty'); },
        /** H7 : un message avec « ↶ Annuler » pour la dernière action */
        undoable(msg) { const at = this.hpos; A().undoToast ? A().undoToast(msg, {undo: () => { if (this.hpos !== at) throw new Error('d’autres changements ont suivi : utilise ↶ (' + kbd('⌘Z') + ')'); this.undo(); }, redo: () => this.redo()}) : toast(msg); },
        /** la sélection en nombres (section, caractère) pour la remettre après ↶ */
        selPos() {
            const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0), sec = this.secOf(r.startContainer); if (!sec) return null;
            return {s: this.secs.indexOf(sec), a: selOff(sec.body, r.startContainer, r.startOffset), b: selOff(sec.body, r.endContainer, r.endOffset)};
        },
        setSelPos(p) {
            if (!p) return; const sec = this.secs[p.s] || this.secs[0]; if (!sec) return;
            try { const [a, ao] = selAt(sec.body, p.a), [b, bo] = selAt(sec.body, p.b), r = document.createRange(); r.setStart(a, ao); r.setEnd(b, bo); sec.body.focus({preventScroll: true}); const s = getSelection(); s.removeAllRanges(); s.addRange(r); this.lastBody = sec.body; this.lastRange = r.cloneRange(); } catch (_) {}
        },
    });

    /* la place du curseur en un nombre (pour la remettre après ↶ ou après avoir déplacé des paragraphes) :
       chaque lettre compte 1 ; un paragraphe compte 1 à son début ; un saut de ligne ou une image comptent 1 */
    const SEL_BLOCK = /^(P|H[1-6]|LI|TD|TH|FIGCAPTION)$/, SEL_ATOM = /^(BR|IMG)$/;
    function selOff(root, node, off) {
        if (node.nodeType === 1) { const c = node.childNodes[off]; if (c) { node = c; off = 0; } else if (node !== root) { let x = node; while (x.lastChild) x = x.lastChild; if (x.nodeType === 3) { node = x; off = x.data.length; } else { const w0 = document.createTreeWalker(root, NodeFilter.SHOW_ALL); let n0 = 0, cur0; while ((cur0 = w0.nextNode())) { if (cur0.nodeType === 3) n0 += cur0.data.length; else if (cur0.nodeType === 1 && (SEL_BLOCK.test(cur0.tagName) || SEL_ATOM.test(cur0.tagName))) n0 += 1; if (cur0 === x) return n0; } return n0; } } }
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n = 0, cur;
        while ((cur = w.nextNode())) {
            if (cur.nodeType === 3) { if (cur === node) return n + off; n += cur.data.length; continue; }
            if (SEL_ATOM.test(cur.tagName)) { if (cur === node) return n; n += 1; continue; }
            if (SEL_BLOCK.test(cur.tagName)) { n += 1; if (cur === node) return n; }
            else if (cur === node) return n;
        }
        return n;
    }
    function selAt(root, target) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n = 0, cur, cand = null, last = null;
        while ((cur = w.nextNode())) {
            if (cur.nodeType === 3) { if (cand) return cand; const L = cur.data.length; if (target < n + L) return [cur, target - n]; if (target === n + L) cand = [cur, L]; n += L; last = cur; continue; }
            if (SEL_ATOM.test(cur.tagName)) { if (cand) return cand; if (target === n) return [cur.parentNode, [...cur.parentNode.childNodes].indexOf(cur)]; n += 1; continue; }
            if (SEL_BLOCK.test(cur.tagName)) { if (target === n + 1) return [cur, 0]; if (cand) return cand; n += 1; }
        }
        return cand || (last ? [last, last.data.length] : [root, 0]);
    }
    const toRoman = n => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; m.forEach(([v, r]) => { while (n >= v) { s += r; n -= v; } }); return s; };
    ext.textDocKit.toRoman = toRoman;
})();
