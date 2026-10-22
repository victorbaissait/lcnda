/**
 * 🌐 Mon site web — l'éditeur de code (HTML, CSS, JS) : coloration, numéros de ligne, complétion simple (balises,
 * attributs, propriétés et valeurs CSS, mots de JavaScript), Emmet de base (Tab : « ul>li.item*3 », « div#haut.carte{Bonjour} »,
 * « m10 » → margin: 10px;), fermeture automatique des balises, retrait automatique.
 * Un <textarea> (le vrai texte : copier, coller, ↶ du navigateur, lecteurs d'écran) posé sur un <pre> coloré.
 * Sans écran : expandAbbr, expandCss, highlight, completions (aussi require() dans Node, pour les essais).
 * L'éditeur : assets/js/heritage-site-web.js (window.LCNDA_EXT.siteCode).
 */
(function (root) {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const TAGS = ['a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'blockquote', 'br', 'button', 'caption', 'cite', 'code', 'dd', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'option', 'p', 'picture', 'pre', 'q', 'section', 'select', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'video'];
    const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    const INLINE = new Set(['a', 'abbr', 'b', 'cite', 'code', 'em', 'i', 'img', 'label', 'mark', 'q', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'br', 'input', 'button', 'option']);
    const ATTRS = ['class', 'id', 'href', 'src', 'alt', 'title', 'style', 'data-lc-name', 'target', 'rel', 'width', 'height', 'loading', 'type', 'name', 'value', 'placeholder', 'aria-label', 'role', 'lang', 'datetime', 'colspan', 'rowspan'];
    const CSS_VALUES = {
        display: ['block', 'inline', 'inline-block', 'flex', 'grid', 'none', 'contents'], position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        'text-align': ['left', 'center', 'right', 'justify'], 'font-weight': ['normal', 'bold', '300', '400', '600', '700'], 'font-style': ['normal', 'italic'],
        'justify-content': ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'], 'align-items': ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
        'flex-direction': ['row', 'column', 'row-reverse', 'column-reverse'], 'flex-wrap': ['nowrap', 'wrap'], overflow: ['visible', 'hidden', 'auto', 'scroll'],
        'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'], 'text-decoration': ['none', 'underline', 'line-through'], cursor: ['pointer', 'default', 'move', 'text'],
        'object-fit': ['cover', 'contain', 'fill'], 'box-sizing': ['border-box', 'content-box'], 'white-space': ['normal', 'nowrap', 'pre-wrap'], visibility: ['visible', 'hidden'],
        color: ['var(--lc-texte)', 'var(--lc-principale)', 'var(--lc-accent)', '#ffffff', 'inherit'], background: ['var(--lc-fond)', 'var(--lc-principale)', 'none', 'transparent'],
        'background-color': ['var(--lc-fond)', 'var(--lc-principale)', 'transparent'], 'font-family': ['var(--lc-police)', 'var(--lc-police-titres)', 'Georgia, serif', 'system-ui, sans-serif'],
        'max-width': ['var(--lc-largeur)', '100%', 'none'], 'border-radius': ['var(--lc-arrondi)', '50%'],
    };
    const CSS_PROPS = ['align-items', 'align-self', 'animation', 'aspect-ratio', 'background', 'background-color', 'background-image', 'background-position', 'background-size', 'border', 'border-bottom', 'border-color', 'border-left', 'border-radius', 'border-right', 'border-top', 'bottom', 'box-shadow', 'box-sizing', 'clear', 'color', 'column-gap', 'columns', 'content', 'cursor', 'display', 'filter', 'flex', 'flex-direction', 'flex-wrap', 'float', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'gap', 'grid-area', 'grid-column', 'grid-template-columns', 'grid-template-rows', 'height', 'inset', 'justify-content', 'left', 'letter-spacing', 'line-height', 'list-style', 'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'object-fit', 'opacity', 'outline', 'overflow', 'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'place-items', 'position', 'right', 'row-gap', 'text-align', 'text-decoration', 'text-shadow', 'text-transform', 'top', 'transform', 'transition', 'vertical-align', 'visibility', 'white-space', 'width', 'word-break', 'z-index'];
    const JS_WORDS = ['addEventListener', 'async', 'await', 'break', 'catch', 'classList', 'const', 'console.log', 'continue', 'document', 'else', 'export', 'false', 'for', 'forEach', 'function', 'getElementById', 'if', 'import', 'innerHTML', 'let', 'map', 'new', 'null', 'querySelector', 'querySelectorAll', 'return', 'setAttribute', 'setInterval', 'setTimeout', 'switch', 'textContent', 'this', 'true', 'try', 'typeof', 'undefined', 'var', 'while', 'window'];
    const JS_KEY = new Set(['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield']);

    /* ═════ Emmet (HTML) ═════ */
    /** « ul>li.item*3 », « nav>a[href=#]*4{Lien $} », « (header>h1)+main+footer » → {text, cursor} ; null si ce n'en est pas une */
    function expandAbbr(abbr, {indent = '  ', base = ''} = {}) {
        abbr = String(abbr || '').trim();
        if (!abbr || abbr.length > 300 || /^\d/.test(abbr) || /^\.\d/.test(abbr)) return null;
        let i = 0;
        const peek = () => abbr[i], eat = c => (abbr[i] === c ? (i++, true) : false);
        const word = re => { const m = re.exec(abbr.slice(i)); if (!m) return ''; i += m[0].length; return m[0]; };
        function unit(parentTag) {
            if (eat('(')) { const kids = siblings(parentTag); if (!eat(')')) throw new Error('('); const n = mult(); return {group: kids, n}; }
            const tag = word(/^[a-zA-Z][a-zA-Z0-9-]*/).toLowerCase();
            const el = {tag: tag || (/^(ul|ol)$/.test(parentTag) ? 'li' : /^(table|tbody|thead)$/.test(parentTag) ? 'tr' : parentTag === 'tr' ? 'td' : /^(p|span|a|em|strong|b|i|h\d)$/.test(parentTag) ? 'span' : 'div'), cls: [], attrs: [], text: null, id: '', explicit: !!tag, n: 0};
            for (;;) {
                if (peek() === '*' && !el.n) { el.n = mult(); continue; }
                if (eat('#')) { el.id = word(/^[\w$-]+/); if (!el.id) throw new Error('#'); continue; }
                if (eat('.')) { const c = word(/^[\w$-]+/); if (!c) throw new Error('.'); el.cls.push(c); continue; }
                if (eat('[')) { const j = abbr.indexOf(']', i); if (j < 0) throw new Error('['); const raw = abbr.slice(i, j); i = j + 1;
                    (raw.match(/[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s\]]*))?/g) || []).forEach(a => { const k = a.indexOf('='); el.attrs.push(k < 0 ? [a, ''] : [a.slice(0, k), a.slice(k + 1).replace(/^["']|["']$/g, '')]); }); continue; }
                if (eat('{')) { let d = 1, j = i; while (j < abbr.length && d) { if (abbr[j] === '{') d++; else if (abbr[j] === '}') d--; j++; } if (d) throw new Error('{'); el.text = abbr.slice(i, j - 1); i = j; continue; }
                break;
            }
            if (!el.explicit && !el.id && !el.cls.length && !el.attrs.length && el.text === null) throw new Error('vide');
            el.n = el.n || 1;
            return el;
        }
        function mult() { if (!eat('*')) return 1; const n = Number(word(/^\d+/)); if (!n || n > 200) throw new Error('*'); return n; }
        function chain(parentTag) { const u = unit(parentTag); if (eat('>')) u.kids = siblings(u.tag || parentTag); return u; }
        function siblings(parentTag) { const list = [chain(parentTag)]; while (eat('+')) { if (i >= abbr.length) break; list.push(chain(parentTag)); } return list; }
        let tree;
        try { tree = siblings(''); if (i < abbr.length) return null; } catch (_) { return null; }
        // un mot seul doit être une vraie balise (sinon « bonjour » + Tab deviendrait <bonjour>)
        if (tree.length === 1 && !tree[0].group && !tree[0].kids && tree[0].n === 1 && !tree[0].id && !tree[0].cls.length && !tree[0].attrs.length && tree[0].text === null && !TAGS.includes(tree[0].tag) && !tree[0].tag.includes('-')) return null;
        const num = (s, k, n) => String(s).replace(/\$+/g, m => String(k).padStart(m.length, '0')).replace(/@-/g, String(n - k + 1));
        let caret = -1;
        const out = [];
        const put = (s, mark) => { if (mark && caret < 0) caret = out.join('').length + s.length; out.push(s); };
        const attrsOf = (el, k, n) => {
            const a = [];
            if (el.id) a.push(`id="${esc(num(el.id, k, n))}"`);
            if (el.cls.length) a.push(`class="${esc(el.cls.map(c => num(c, k, n)).join(' '))}"`);
            el.attrs.forEach(([x, v]) => a.push(`${x}="${esc(num(v, k, n))}"`));
            if (el.tag === 'a' && !el.attrs.some(([x]) => x === 'href')) a.push('href=""');
            if (el.tag === 'img') { if (!el.attrs.some(([x]) => x === 'src')) a.push('src=""'); if (!el.attrs.some(([x]) => x === 'alt')) a.push('alt=""'); }
            return a.length ? ' ' + a.join(' ') : '';
        };
        function render(list, depth, k0, n0) {
            list.forEach(node => {
                for (let k = 1; k <= node.n; k++) {
                    if (node.group) { render(node.group, depth, k, node.n); continue; }
                    const pad = base + indent.repeat(depth), open = `<${node.tag}${attrsOf(node, node.n > 1 ? k : k0, node.n > 1 ? node.n : n0)}>`;
                    const text = node.text !== null ? esc(num(node.text, node.n > 1 ? k : k0, node.n > 1 ? node.n : n0)) : '';
                    if (out.length) out.push('\n');
                    if (VOID.has(node.tag)) { put(pad + open, false); continue; }
                    if (node.kids && node.kids.some(c => !INLINE.has(c.tag || 'div') || c.kids || c.n > 1 || c.group)) {
                        put(pad + open + text, false); out.push('');
                        render(node.kids, depth + 1, k, node.n);
                        out.push('\n' + pad + `</${node.tag}>`);
                    } else if (node.kids) {
                        const save = out.length; put(pad + open + text, false);
                        const inner = []; node.kids.forEach(c => { for (let q = 1; q <= c.n; q++) inner.push(`<${c.tag}${attrsOf(c, q, c.n)}>${c.text !== null ? esc(num(c.text, q, c.n)) : ''}${VOID.has(c.tag) ? '' : `</${c.tag}>`}`); });
                        out.push(inner.join('')); out.push(`</${node.tag}>`); void save;
                    } else {
                        put(pad + open + text, !text);
                        out.push(`</${node.tag}>`);
                    }
                }
            });
        }
        render(tree, 0, 1, 1);
        const textOut = out.join('').replace(/^\n/, '');
        return {text: textOut, cursor: caret < 0 ? textOut.length : Math.max(0, caret - (out.join('').startsWith('\n') ? 1 : 0))};
    }

    /* ═════ Emmet (CSS) ═════ */
    const CSS_ABBR = {m: 'margin', mt: 'margin-top', mr: 'margin-right', mb: 'margin-bottom', ml: 'margin-left', p: 'padding', pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left',
        w: 'width', h: 'height', maw: 'max-width', mah: 'max-height', miw: 'min-width', mih: 'min-height', t: 'top', r: 'right', b: 'bottom', l: 'left', z: 'z-index', op: 'opacity', g: 'gap',
        fz: 'font-size', fw: 'font-weight', ff: 'font-family', lh: 'line-height', ls: 'letter-spacing', ta: 'text-align', td: 'text-decoration', tt: 'text-transform', c: 'color', bg: 'background', bgc: 'background-color',
        bd: 'border', bdrs: 'border-radius', bxsh: 'box-shadow', d: 'display', pos: 'position', ov: 'overflow', jc: 'justify-content', ai: 'align-items', fxd: 'flex-direction', fxw: 'flex-wrap', gtc: 'grid-template-columns', cur: 'cursor', trf: 'transform', trs: 'transition'};
    const CSS_FIXED = {df: 'display: flex;', dg: 'display: grid;', dn: 'display: none;', db: 'display: block;', dib: 'display: inline-block;', posr: 'position: relative;', posa: 'position: absolute;', posf: 'position: fixed;', poss: 'position: sticky;',
        tac: 'text-align: center;', tal: 'text-align: left;', tar: 'text-align: right;', fwb: 'font-weight: bold;', fsi: 'font-style: italic;', ovh: 'overflow: hidden;', jcc: 'justify-content: center;', jcsb: 'justify-content: space-between;', aic: 'align-items: center;',
        fxdc: 'flex-direction: column;', fxww: 'flex-wrap: wrap;', tdn: 'text-decoration: none;', ttu: 'text-transform: uppercase;', curp: 'cursor: pointer;', bxzbb: 'box-sizing: border-box;', ofc: 'object-fit: cover;'};
    /** « m10 » → « margin: 10px; », « w100p » → « width: 100%; », « c#333 », « p10-20 » → « padding: 10px 20px; » ; null sinon */
    function expandCss(abbr) {
        abbr = String(abbr || '').trim();
        if (CSS_FIXED[abbr]) return {text: CSS_FIXED[abbr], cursor: CSS_FIXED[abbr].length};
        const m = /^([a-z]+)(#[0-9a-fA-F]{3,8}|-?\d*\.?\d+(?:px|p|e|r|x|%|em|rem|vh|vw)?(?:-\d*\.?\d+(?:px|p|e|r|x|%|em|rem)?)*)?$/.exec(abbr);
        if (!m || !CSS_ABBR[m[1]]) return null;
        const prop = CSS_ABBR[m[1]];
        if (!m[2]) { const t = `${prop}: ;`; return {text: t, cursor: t.length - 1}; }
        let v = m[2];
        if (v[0] !== '#') {
            const unitless = /^(z-index|opacity|font-weight|line-height)$/.test(prop);
            v = v.split(/(?<=\d|[a-z%])-(?=\d|\.)/).map(x => { const u = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(x); if (!u) return x; const unit = {p: '%', e: 'em', r: 'rem', x: 'ex', '': unitless || u[1] === '0' ? '' : 'px'}[u[2]] ?? u[2]; return u[1] + unit; }).join(' ');
        }
        const t = `${prop}: ${v};`;
        return {text: t, cursor: t.length};
    }

    /* ═════ Coloration ═════ */
    const span = (cls, s) => `<span class="swc-${cls}">${esc(s)}</span>`;
    function hlHtml(code) {
        let out = '', i = 0;
        const n = code.length;
        while (i < n) {
            if (code.startsWith('<!--', i)) { const j = code.indexOf('-->', i + 4); const e = j < 0 ? n : j + 3; out += span('com', code.slice(i, e)); i = e; continue; }
            if (code[i] === '<' && /[a-zA-Z/!]/.test(code[i + 1] || '')) {
                const m = /^<\/?[a-zA-Z!][\w:-]*/.exec(code.slice(i, i + 80)); if (!m) { out += esc(code[i]); i++; continue; } out += span('tag', m[0]); i += m[0].length;
                while (i < n && code[i] !== '>') {
                    if (code[i] === '"' || code[i] === "'") { const q = code[i]; const j = code.indexOf(q, i + 1); const e = j < 0 ? n : j + 1; out += span('str', code.slice(i, e)); i = e; continue; }
                    const a = /^[^\s=>"'/]+/.exec(code.slice(i, i + 200));
                    if (a) { out += span(/^data-lc-/.test(a[0]) ? 'lc' : 'attr', a[0]); i += a[0].length; continue; }
                    out += esc(code[i]); i++;
                }
                if (i < n) { out += span('tag', '>'); i++; }
                // le contenu d'un <style> ou d'un <script> : couleurs du CSS / du JS
                const t = /^<(style|script)\b/i.exec(m[0] + ' ');
                if (t && m[0][1] !== '/') { const end = code.toLowerCase().indexOf(`</${t[1].toLowerCase()}`, i); const e = end < 0 ? n : end; out += t[1].toLowerCase() === 'style' ? hlCss(code.slice(i, e)) : hlJs(code.slice(i, e)); i = e; }
                continue;
            }
            if (code[i] === '&') { const m = /^&[#\w]{1,12};/.exec(code.slice(i, i + 14)); if (m) { out += span('ent', m[0]); i += m[0].length; continue; } }
            const j = code.slice(i).search(/<|&/); const e = j < 0 ? n : i + Math.max(1, j); out += esc(code.slice(i, e)); i = e;
        }
        return out;
    }
    function hlCss(code) {
        let out = '', i = 0, depth = 0, inValue = false;
        const n = code.length;
        while (i < n) {
            const rest = code.slice(i, i + 400);
            if (code.startsWith('/*', i)) { const j = code.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out += span('com', code.slice(i, e)); i = e; continue; }
            if (code[i] === '"' || code[i] === "'") { const q = code[i]; const j = code.indexOf(q, i + 1); const e = j < 0 ? n : j + 1; out += span('str', code.slice(i, e)); i = e; continue; }
            if (code[i] === '{') { depth++; inValue = false; out += span('pun', '{'); i++; continue; }
            if (code[i] === '}') { depth = Math.max(0, depth - 1); inValue = false; out += span('pun', '}'); i++; continue; }
            if (code[i] === ';') { inValue = false; out += span('pun', ';'); i++; continue; }
            if (code[i] === '@') { const m = /^@[\w-]+/.exec(rest); out += span('at', m[0]); i += m[0].length; continue; }
            if (depth > 0 && !inValue) {
                const m = /^(\s*)([\w-]+)(\s*:)/.exec(rest);
                if (m) { out += esc(m[1]) + span('prop', m[2]) + esc(m[3]); i += m[0].length; inValue = true; continue; }
            }
            if (inValue) {
                let m = /^#[0-9a-fA-F]{3,8}\b/.exec(rest); if (m) { out += span('num', m[0]); i += m[0].length; continue; }
                m = /^-?\d*\.?\d+(px|em|rem|%|vh|vw|s|ms|deg|fr)?/.exec(rest); if (m && !/[\w-]/.test(code[i - 1] || '')) { out += span('num', m[0]); i += m[0].length; continue; }
                m = /^var\(--[\w-]+\)/.exec(rest); if (m) { out += span('lc', m[0]); i += m[0].length; continue; }
                m = /^[\w-]+(?=\()/.exec(rest); if (m) { out += span('fn', m[0]); i += m[0].length; continue; }
            }
            if (depth === 0) { const m = /^[^{/"'@]+/.exec(rest); if (m) { out += span('sel', m[0]); i += m[0].length; continue; } }
            out += esc(code[i]); i++;
        }
        return out;
    }
    function hlJs(code) {
        let out = '', i = 0;
        const n = code.length;
        while (i < n) {
            const rest = code.slice(i, i + 300);
            if (code.startsWith('//', i)) { const j = code.indexOf('\n', i); const e = j < 0 ? n : j; out += span('com', code.slice(i, e)); i = e; continue; }
            if (code.startsWith('/*', i)) { const j = code.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; out += span('com', code.slice(i, e)); i = e; continue; }
            if (code[i] === '"' || code[i] === "'" || code[i] === '`') { const q = code[i]; let j = i + 1; while (j < n && code[j] !== q) { if (code[j] === '\\') j++; if (q !== '`' && code[j] === '\n') break; j++; } const e = Math.min(n, j + 1); out += span('str', code.slice(i, e)); i = e; continue; }
            let m = /^\d[\d_.]*(e[+-]?\d+)?/i.exec(rest); if (m && !/[\w$]/.test(code[i - 1] || '')) { out += span('num', m[0]); i += m[0].length; continue; }
            m = /^[A-Za-z_$][\w$]*/.exec(rest);
            if (m) { out += JS_KEY.has(m[0]) ? span('key', m[0]) : /^\s*\(/.test(code.slice(i + m[0].length, i + m[0].length + 3)) ? span('fn', m[0]) : esc(m[0]); i += m[0].length; continue; }
            out += esc(code[i]); i++;
        }
        return out;
    }
    function highlight(code, lang) { code = String(code ?? ''); return lang === 'css' ? hlCss(code) : lang === 'js' ? hlJs(code) : hlHtml(code); }

    /* ═════ Complétion ═════ */
    /** Ce que l'on peut proposer au curseur : {from, items:[{label, insert, hint}]} ou null */
    function completions(text, pos, lang) {
        const before = String(text).slice(0, pos);
        const pick = (list, w, from, map = x => ({label: x, insert: x})) => { const lw = w.toLowerCase(); const items = list.filter(x => x.toLowerCase().startsWith(lw) && x.toLowerCase() !== lw).slice(0, 12).map(map); return items.length ? {from, items} : null; };
        if (lang === 'html') {
            let m = /<([a-zA-Z][\w-]*)$/.exec(before);
            if (m) return pick(TAGS, m[1], pos - m[1].length, t => ({label: `<${t}>`, insert: t, tag: t}));
            const lt = before.lastIndexOf('<'), gt = before.lastIndexOf('>');
            if (lt > gt && /^<[a-zA-Z]/.test(before.slice(lt))) {
                const inTag = before.slice(lt);
                if ((inTag.match(/"/g) || []).length % 2 === 0 && (m = /\s([a-zA-Z][\w-]*)$/.exec(inTag))) return pick(ATTRS, m[1], pos - m[1].length, a => ({label: a, insert: `${a}=""`, back: 1}));
            }
            return null;
        }
        if (lang === 'css') {
            const open = before.lastIndexOf('{'), close = before.lastIndexOf('}');
            if (open <= close) return null; // dans un sélecteur
            const decl = before.slice(Math.max(before.lastIndexOf(';'), open) + 1);
            let m = /^\s*([\w-]+)\s*:\s*([\w-]*)$/.exec(decl);
            if (m) { const vals = CSS_VALUES[m[1]]; return vals ? pick(vals, m[2], pos - m[2].length) : null; }
            m = /^\s*([a-z-]+)$/.exec(decl);
            if (m && m[1].length >= 1) return pick(CSS_PROPS, m[1], pos - m[1].length, p => ({label: p, insert: `${p}: `}));
            return null;
        }
        if (lang === 'js') {
            const m = /(?:^|[^\w$.])([A-Za-z_$][\w$.]*)$/.exec(before);
            if (m && m[1].length >= 2) return pick(JS_WORDS, m[1], pos - m[1].length);
        }
        return null;
    }

    /** l'abréviation Emmet juste avant le curseur, sur la ligne (après la dernière balise écrite) */
    function abbrBefore(line) {
        let s = line;
        const tags = [...s.matchAll(/<[^<>]*>/g)]; if (tags.length) s = s.slice(tags[tags.length - 1].index + tags[tags.length - 1][0].length);
        let depth = 0, j = s.length;
        while (j > 0) { const c = s[j - 1]; if (c === '}' || c === ']') depth++; else if (c === '{' || c === '[') depth--; else if (/\s/.test(c) && depth <= 0) break; else if (c === '<' && depth <= 0) break; j--; }
        return s.slice(j);
    }

    /* ═════ Les règles de la feuille de styles (le panneau « Ceci est… » écrit de vraies règles) ═════ */
    const normSel = x => String(x || '').replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
    const normMedia = x => String(x || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*:\s*/g, ': ').trim().toLowerCase();
    /** les règles d'une feuille : [{sel, media, start, open, close}] et les blocs @media : [{query, start, open, close}] (commentaires et textes sautés) */
    function cssScan(text) {
        const rules = [], medias = [], n = text.length;
        const skip = i => { // saute un commentaire ou un texte entre guillemets ; rend la position suivante (ou i)
            if (text[i] === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); return j < 0 ? n : j + 2; }
            if (text[i] === '"' || text[i] === "'") { const q = text[i]; let j = i + 1; while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; } return j + 1; }
            return i;
        };
        const match = i => { let d = 0; while (i < n) { const k = skip(i); if (k !== i) { i = k; continue; } if (text[i] === '{') d++; else if (text[i] === '}') { d--; if (!d) return i; } i++; } return n - 1; };
        const block = (i, end, media) => {
            while (i < end) {
                let k = skip(i); if (k !== i) { i = k; continue; }
                if (/\s/.test(text[i]) || text[i] === '}' || text[i] === ';') { i++; continue; }
                const start = i; let j = i;
                while (j < end && text[j] !== '{' && text[j] !== ';' && text[j] !== '}') { const s2 = skip(j); j = s2 !== j ? s2 : j + 1; }
                if (j >= end || text[j] !== '{') { i = j + 1; continue; }
                const prelude = text.slice(start, j).replace(/\/\*[\s\S]*?\*\//g, '').trim(), close = match(j);
                if (/^@media\b/i.test(prelude)) { const query = normMedia(prelude.slice(6)); medias.push({query, start, open: j, close}); block(j + 1, close, query); }
                else if (!prelude.startsWith('@')) rules.push({sel: normSel(prelude), media, start, open: j, close});
                i = close + 1;
            }
        };
        block(0, n, null);
        return {rules, medias};
    }
    const declsOf = body => { const m = new Map(); let depth = 0, cur = '', q = ''; const flush = () => { const i = cur.indexOf(':'); if (i > 0) { const k = cur.slice(0, i).trim().toLowerCase(), v = cur.slice(i + 1).trim(); if (k && v) { m.delete(k); m.set(k, v); } } cur = ''; };
        for (const ch of body.replace(/\/\*[\s\S]*?\*\//g, '')) { if (q) { if (ch === q) q = ''; cur += ch; continue; } if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; } if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ';' && depth <= 0) { flush(); continue; } cur += ch; } flush(); return m; };
    /** les déclarations d'une règle ({sel, media}) → Map, vide si la règle n'existe pas */
    function cssGetDecls(text, {sel, media = null}) {
        const {rules} = cssScan(String(text || '')), want = normSel(sel), wm = media ? normMedia(media) : null;
        const r = rules.filter(x => x.sel === want && x.media === wm).pop();
        return r ? declsOf(text.slice(r.open + 1, r.close)) : new Map();
    }
    /** pose (ou retire, valeur vide) une propriété dans la règle {sel, media} : la règle est retrouvée (pas de doublon), créée sinon,
     *  à sa place (une règle sans écran avant le premier @media qui touche le même sélecteur, sinon à la fin ; une règle d'écran
     *  dans le bloc @media qui existe déjà) ; une règle qui n'a plus rien est retirée. → le nouveau texte */
    function cssSetDecl(text, {sel, media = null, prop, value = ''}) {
        text = String(text || ''); const {rules, medias} = cssScan(text), want = normSel(sel), wm = media ? normMedia(media) : null;
        prop = String(prop || '').trim().toLowerCase(); value = String(value ?? '').trim();
        if (!/^[a-z-]{1,40}$/.test(prop) || /[;{}<>]/.test(value) || /[{};<>]/.test(want) || !want) return text;
        const pad = wm ? '    ' : '  ', close = wm ? '  }' : '}';
        const r = rules.filter(x => x.sel === want && x.media === wm).pop();
        if (r) {
            const d = declsOf(text.slice(r.open + 1, r.close)); if (value) d.set(prop, value); else d.delete(prop); // une propriété déjà là garde sa place
            if (!d.size) { let a = r.start, b = r.close + 1; while (a > 0 && text[a - 1] === ' ') a--; if (text[b] === '\n') b++; return (text.slice(0, a) + text.slice(b)).replace(/\n{3,}/g, '\n\n'); }
            return `${text.slice(0, r.open + 1)}\n${[...d].map(([k, v]) => `${pad}${k}: ${v};`).join('\n')}\n${close}${text.slice(r.close + 1)}`;
        }
        if (!value) return text;
        const rule = `${wm ? '  ' : ''}${want} {\n${pad}${prop}: ${value};\n${close}\n`;
        if (wm) {
            const mb = medias.filter(x => x.query === wm).pop();
            if (mb) { let at = mb.close; while (at > mb.open && /\s/.test(text[at - 1])) at--; return `${text.slice(0, at)}\n${rule.replace(/\n$/, '')}\n${text.slice(at).replace(/^\s*/, '')}`; }
            return `${text.replace(/\s*$/, '')}\n\n@media ${media.trim()} {\n${rule}}\n`;
        }
        const firstMedia = rules.find(x => x.media && x.sel === want);
        if (firstMedia) { const mb = medias.find(x => x.open < firstMedia.open && x.close > firstMedia.close); if (mb) return `${text.slice(0, mb.start)}${rule}\n${text.slice(mb.start)}`; }
        return `${text.replace(/\s*$/, '')}\n\n${rule}`;
    }

    /* ═════ L'éditeur ═════ */
    function create(host, {lang = 'html', value = '', onChange = () => {}, onCursor = () => {}, label = 'Code'} = {}) {
        const el = document.createElement('div'); el.className = 'swc'; el.dataset.lang = lang;
        el.innerHTML = `<div class="swc-gutter" aria-hidden="true"><div></div></div><div class="swc-wrap"><div class="swc-mark" hidden></div><pre class="swc-hl" aria-hidden="true"><code></code></pre><textarea class="swc-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" data-ui-off aria-label="${esc(label)}" data-ctx-off></textarea></div><div class="swc-pop" role="listbox" hidden></div>`;
        host.appendChild(el);
        const ta = el.querySelector('textarea'), markEl = el.querySelector('.swc-mark'), code = el.querySelector('code'), pre = el.querySelector('pre'), gut = el.querySelector('.swc-gutter > div'), pop = el.querySelector('.swc-pop');
        ta.value = value;
        let raf = 0, popState = null, lastLines = -1, mark = null;
        const paint = () => { raf = 0; code.innerHTML = highlight(ta.value, lang) + '\n '; const lines = ta.value.split('\n').length; if (lines !== lastLines) { lastLines = lines; gut.innerHTML = Array.from({length: lines}, (_, k) => `<span>${k + 1}</span>`).join(''); } sync(); };
        const later = () => { if (!raf) raf = requestAnimationFrame(paint); };
        const sync = () => { pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; gut.style.transform = `translateY(${-ta.scrollTop}px)`; if (mark) { const m = metrics(); markEl.style.top = `${m.pt + mark[0] * m.lh - ta.scrollTop}px`; markEl.style.height = `${(mark[1] - mark[0] + 1) * m.lh}px`; } };
        ta.addEventListener('scroll', () => { sync(); closePop(); });
        const metrics = () => { const cs = getComputedStyle(ta); const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontSize} ${cs.fontFamily}`; return {cw: c.measureText('M'.repeat(20)).width / 20, lh: parseFloat(cs.lineHeight) || 18, pt: parseFloat(cs.paddingTop) || 0, pl: parseFloat(cs.paddingLeft) || 0}; };
        const change = () => { later(); onChange(ta.value); };
        const replace = (from, to, text, caret) => { ta.focus(); ta.setSelectionRange(from, to); if (!document.execCommand?.('insertText', false, text)) { ta.setRangeText(text, from, to, 'end'); } const c = from + (caret ?? text.length); ta.setSelectionRange(c, c); change(); };
        function closePop() { pop.hidden = true; popState = null; }
        function showPop(res) {
            if (!res) return closePop();
            popState = {...res, k: 0};
            pop.innerHTML = res.items.map((it, k) => `<div class="swc-opt${k ? '' : ' is-active'}" role="option" data-k="${k}">${esc(it.label)}</div>`).join('');
            const m = metrics(), before = ta.value.slice(0, res.from), line = before.split('\n').length - 1, col = before.length - before.lastIndexOf('\n') - 1;
            pop.style.left = `${Math.max(0, m.pl + col * m.cw - ta.scrollLeft + 40)}px`; pop.style.top = `${m.pt + (line + 1) * m.lh - ta.scrollTop + 4}px`;
            pop.hidden = false;
        }
        const accept = k => {
            const it = popState.items[k]; const pos = ta.selectionStart; const st = popState; closePop();
            replace(st.from, pos, it.insert, it.insert.length - (it.back || 0));
        };
        pop.addEventListener('mousedown', e => { const o = e.target.closest('.swc-opt'); if (!o || !popState) return; e.preventDefault(); accept(Number(o.dataset.k)); });
        ta.addEventListener('keydown', e => {
            if (popState && !pop.hidden) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); popState.k = (popState.k + (e.key === 'ArrowDown' ? 1 : -1) + popState.items.length) % popState.items.length; pop.querySelectorAll('.swc-opt').forEach((o, k) => o.classList.toggle('is-active', k === popState.k)); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(popState.k); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); return; }
            }
            const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
            const lineStart = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(lineStart, s), ind = /^\s*/.exec(line)[0];
            if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                if (e.shiftKey) { if (v.slice(lineStart, lineStart + 2) === '  ') replace(lineStart, lineStart + 2, '', 0); return; }
                if (s === en) {
                    if (lang === 'html') { const ab = abbrBefore(line); const x = ab ? expandAbbr(ab, {base: ind && line.trim() === ab ? '' : ''}) : null; if (x) { const text = x.text.split('\n').map((l, k) => (k ? ind + l : l)).join('\n'); const caretIn = x.text.slice(0, x.cursor).split('\n').length - 1; return replace(s - ab.length, s, text, x.cursor + caretIn * ind.length); } }
                    if (lang === 'css') { const ab = /[\w#.%-]+$/.exec(line)?.[0] || ''; const x = ab ? expandCss(ab) : null; if (x) return replace(s - ab.length, s, x.text, x.cursor); }
                }
                return replace(s, en, '  ');
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && s === en) {
                const prev = v[s - 1], next = v[s];
                if ((prev === '>' && v.slice(s, s + 2) === '</') || (prev === '{' && next === '}')) { e.preventDefault(); return replace(s, s, `\n${ind}  \n${ind}`, ind.length + 3); }
                if (prev === '{' || (lang === 'html' && prev === '>' && /<[a-zA-Z][^/>]*>$/.test(line) && !VOID.has((/<([a-zA-Z][\w-]*)[^>]*>$/.exec(line) || [])[1]))) { e.preventDefault(); return replace(s, s, `\n${ind}  `); }
                if (ind) { e.preventDefault(); return replace(s, s, `\n${ind}`); }
            }
        });
        ta.addEventListener('input', e => {
            change(); if (mark) { mark = null; markEl.hidden = true; }
            const s = ta.selectionStart;
            if (e.inputType === 'insertText' && e.data === '>' && lang === 'html') {
                const m = /<([a-zA-Z][\w-]*)(\s[^<>]*)?>$/.exec(ta.value.slice(0, s));
                if (m && !VOID.has(m[1].toLowerCase()) && !/\/>$/.test(m[0]) && !ta.value.slice(s, s + m[1].length + 3).startsWith(`</${m[1]}`)) { ta.setRangeText(`</${m[1]}>`, s, s, 'start'); ta.setSelectionRange(s, s); change(); }
                const c = /<\/([a-zA-Z][\w-]*)>$/.exec(ta.value.slice(0, s)); // une fermeture tapée à la main devant celle posée toute seule : on « passe dessus » (pas de doublon)
                if (c && ta.value.startsWith(`</${c[1]}>`, s)) { ta.setRangeText('', s, s + c[0].length, 'start'); change(); }
            }
            if (e.inputType === 'insertText' && /[\w<-]/.test(e.data || '')) showPop(completions(ta.value, ta.selectionStart, lang)); else closePop();
        });
        ta.addEventListener('blur', () => setTimeout(closePop, 120));
        const cursorEv = () => onCursor(ta.selectionStart);
        ta.addEventListener('click', cursorEv); ta.addEventListener('keyup', e => { if (/^(Arrow|Home|End|Page)/.test(e.key)) cursorEv(); });
        paint();
        return {
            el, ta,
            get value() { return ta.value; },
            set value(v) { if (v === ta.value) return; const st = ta.scrollTop, sl = ta.scrollLeft, p = ta.selectionStart; ta.value = v; ta.scrollTop = st; ta.scrollLeft = sl; try { ta.setSelectionRange(Math.min(p, v.length), Math.min(p, v.length)); } catch (_) {} paint(); },
            setLang(l) { lang = l; el.dataset.lang = l; closePop(); paint(); },
            get lang() { return lang; },
            focus() { ta.focus(); },
            /** montre et choisit [de, à] (une balise trouvée depuis l'aperçu) */
            reveal(from, to = from) { const m = metrics(); const line = ta.value.slice(0, from).split('\n').length - 1; ta.focus({preventScroll: true}); ta.setSelectionRange(from, to); const top = line * m.lh; if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 2 * m.lh) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3); sync(); },
            cursor() { return ta.selectionStart; },
            /** surligne les lignes de [de, à] sans prendre le curseur (l'élément choisi dans l'aperçu) ; null l'efface */
            mark(from, to = from) {
                if (from == null || from < 0) { mark = null; markEl.hidden = true; return; }
                const a = ta.value.slice(0, from).split('\n').length - 1, b = ta.value.slice(0, Math.max(from, to)).split('\n').length - 1;
                mark = [a, b]; markEl.hidden = false; const m = metrics(), top = a * m.lh;
                if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 2 * m.lh) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
                sync();
            },
        };
    }

    const API = {expandAbbr, expandCss, highlight, completions, abbrBefore, create, cssScan, cssGetDecls, cssSetDecl, TAGS, VOID, CSS_PROPS, ATTRS};
    if (typeof module === 'object' && module.exports) module.exports = API;
    else { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.siteCode = API; }
})(typeof window !== 'undefined' ? window : globalThis);
