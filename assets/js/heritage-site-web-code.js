/**
 * 🌐 Mon site web — l'éditeur de code (HTML, CSS, JS) : coloration, numéros de ligne, complétion simple (balises,
 * attributs, propriétés et valeurs CSS, mots de JavaScript), Emmet de base (Tab : « ul>li.item*3 », « div#haut.carte{Bonjour} »,
 * « m10 » → margin: 10px;), fermeture automatique des balises, retrait automatique.
 * Un <textarea> (le vrai texte : copier, coller, ↶ du navigateur, lecteurs d'écran) posé sur un <pre> coloré.
 * Comme un vrai éditeur : 🔍 chercher et remplacer (⌘F, ⌥⌘F ; expressions régulières, majuscules, mot entier), aller à la ligne (⌃G),
 * commenter (⌘/), dupliquer (⇧⌥↓), déplacer (⌥↑ ↓) et supprimer (⇧⌘K) des lignes, retrait de plusieurs lignes (Tab, ⇧Tab),
 * sélectionner le mot suivant pareil (⌘D), parenthèses et guillemets fermés tout seuls, accolade jumelle repérée, ↹ remettre en forme (⇧⌥F),
 * 🩺 vérification (balises non fermées, accolades), barre du bas (ligne, colonne, sélection) et ⌨ la liste des raccourcis.
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

    /* ═════ Outils du texte (sans écran : aussi pour les essais) ═════ */
    const COMMENT = {html: ['<!-- ', ' -->'], css: ['/* ', ' */'], js: ['// ', ''], php: ['// ', '']};
    const lineRange = (v, s, e) => { const a = v.lastIndexOf('\n', s - 1) + 1; let b = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (b < 0) b = v.length; return [a, b]; };
    /** commente ou décommente les lignes choisies → {text, s, e} */
    function toggleComment(v, s, e, lang) {
        const [a, b] = lineRange(v, s, e), block = v.slice(a, b), [o, c] = COMMENT[lang] || COMMENT.js;
        if (c) { // un seul bloc pour HTML et CSS
            const t = block.trim(), lead = /^\s*/.exec(block)[0];
            if (t.startsWith(o.trim()) && t.endsWith(c.trim())) { const inner = t.slice(o.trim().length, t.length - c.trim().length).replace(/^ /, '').replace(/ $/, ''); const out = lead + inner; return {text: v.slice(0, a) + out + v.slice(b), s: a, e: a + out.length}; }
            const out = lead + o + block.slice(lead.length) + c; return {text: v.slice(0, a) + out + v.slice(b), s: a, e: a + out.length};
        }
        const lines = block.split('\n'), all = lines.filter(l => l.trim()).every(l => /^\s*\/\//.test(l));
        const ind = Math.min(...lines.filter(l => l.trim()).map(l => /^\s*/.exec(l)[0].length).concat([1e9])) % 1e9;
        const out = lines.map(l => (!l.trim() ? l : all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.slice(0, ind) + o + l.slice(ind))).join('\n');
        return {text: v.slice(0, a) + out + v.slice(b), s: a, e: a + out.length};
    }
    /** les endroits où l'on trouve q → [[de, à]] (bornés) ; null si l'expression régulière est fausse */
    function findAll(v, q, {regex = false, cs = false, word = false} = {}, max = 5000) {
        if (!q) return [];
        let re; try { re = new RegExp(regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi'); } catch (_) { return null; }
        if (word) re = new RegExp(`(?<![\\w$])(?:${re.source})(?![\\w$])`, re.flags);
        const out = []; let m; while ((m = re.exec(v)) && out.length < max) { if (!m[0].length) { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); }
        return out;
    }
    const PAIRS = {'(': ')', '[': ']', '{': '}'}, BACK = {')': '(', ']': '[', '}': '{'};
    /** la parenthèse ou l'accolade jumelle de celle qui touche pos → sa position, ou -1 */
    function matchBracket(v, pos) {
        let i = PAIRS[v[pos]] || BACK[v[pos]] ? pos : PAIRS[v[pos - 1]] || BACK[v[pos - 1]] ? pos - 1 : -1; if (i < 0) return -1;
        const ch = v[i], fwd = !!PAIRS[ch], want = fwd ? PAIRS[ch] : BACK[ch]; let depth = 0;
        for (let j = i; fwd ? j < v.length : j >= 0; j += fwd ? 1 : -1) { if (v[j] === ch) depth++; else if (v[j] === want && --depth === 0) return j; if (Math.abs(j - i) > 200000) break; }
        return -1;
    }
    /** ↹ remettre en forme : un retrait propre (2 espaces) selon les balises (HTML) ou les accolades (CSS, JS) */
    function formatCode(v, lang) {
        const lines = String(v).replace(/\r\n?/g, '\n').split('\n'); let depth = 0, inPre = false, inCom = false; const out = [];
        for (const raw of lines) {
            const t = raw.trim(); if (!t) { out.push(''); continue; }
            if (lang === 'html') {
                if (inPre || inCom) { out.push(raw); if (/<\/(pre|textarea|script|style)>/i.test(t)) inPre = false; if (t.includes('-->')) inCom = false; continue; }
                const opens = (t.match(/<([a-zA-Z][\w-]*)\b[^>]*?(?<!\/)>/g) || []).filter(x => !VOID.has(/<([a-zA-Z][\w-]*)/.exec(x)[1].toLowerCase())).length, closes = (t.match(/<\/[a-zA-Z][\w-]*\s*>/g) || []).length;
                const lead = /^<\//.test(t) ? 1 : 0; depth = Math.max(0, depth - lead); out.push('  '.repeat(depth) + t); depth = Math.max(0, depth + opens - (closes - lead));
                if (/<(pre|textarea|script|style)\b[^>]*>(?![\s\S]*<\/\1>)/i.test(t)) inPre = true; if (t.includes('<!--') && !t.includes('-->')) inCom = true;
            } else {
                const clean = t.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
                if (inCom) { out.push('  '.repeat(depth) + ' ' + t); if (t.includes('*/')) inCom = false; continue; }
                const lead = /^[}\])]/.test(clean) ? 1 : 0; depth = Math.max(0, depth - lead); out.push('  '.repeat(depth) + t);
                const o = (clean.match(/[{[(]/g) || []).length, c = (clean.match(/[}\])]/g) || []).length; depth = Math.max(0, depth + o - (c - lead));
                if (clean.includes('/*') && !clean.includes('*/')) inCom = true;
            }
        }
        return out.join('\n');
    }
    /** 🩺 ce qui cloche (balises non fermées ou mal fermées, accolades et parenthèses) → [{line, msg}] */
    function lintCode(v, lang) {
        v = String(v); const out = [], lineOf = i => v.slice(0, i).split('\n').length;
        if (lang === 'html') {
            const stack = [], re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g; let m;
            const RAW = /^(script|style|textarea|pre)$/i;
            while ((m = re.exec(v)) && out.length < 50) {
                if (!m[2]) continue; const tag = m[2].toLowerCase();
                if (!m[1]) { if (VOID.has(tag) || /\/\s*$/.test(m[3] || '')) continue; stack.push([tag, m.index]); if (RAW.test(tag) && tag !== 'pre') { const end = v.toLowerCase().indexOf(`</${tag}`, re.lastIndex); if (end >= 0) re.lastIndex = end; } continue; }
                if (/^(p|li|td|th|tr|option|dt|dd)$/.test(tag) || !stack.some(x => x[0] === tag)) { if (!stack.some(x => x[0] === tag)) out.push({line: lineOf(m.index), msg: `</${tag}> ferme une balise qui n’est pas ouverte.`}); else while (stack.length && stack[stack.length - 1][0] !== tag) stack.pop(); if (stack.length && stack[stack.length - 1][0] === tag) stack.pop(); continue; }
                while (stack.length && stack[stack.length - 1][0] !== tag) { const [t2, at] = stack.pop(); if (!/^(p|li|td|th|tr|option|dt|dd|html|head|body)$/.test(t2)) out.push({line: lineOf(at), msg: `<${t2}> n’est pas fermée (</${t2}>).`}); }
                stack.pop();
            }
            stack.filter(([t2]) => !/^(p|li|td|th|tr|option|dt|dd|html|head|body)$/.test(t2)).forEach(([t2, at]) => out.push({line: lineOf(at), msg: `<${t2}> n’est pas fermée (</${t2}>).`}));
            (v.match(/\sid="([^"]+)"/g) || []).map(x => x.slice(5, -1)).filter((x, i, a) => a.indexOf(x) !== i).slice(0, 5).forEach(id => out.push({line: lineOf(v.indexOf(`id="${id}"`, v.indexOf(`id="${id}"`) + 1)), msg: `L’id « ${id} » est donné deux fois.`}));
            (v.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).slice(0, 5).forEach(x => out.push({line: lineOf(v.indexOf(x)), msg: 'Une image sans alt (texte pour ceux qui ne la voient pas).'}));
        } else {
            const stack = []; let q = '', com = 0;
            for (let i = 0; i < v.length && out.length < 50; i++) {
                const ch = v[i];
                if (com === 1) { if (ch === '\n') com = 0; continue; } if (com === 2) { if (ch === '*' && v[i + 1] === '/') { com = 0; i++; } continue; }
                if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = ''; else if (ch === '\n' && q !== '`') { out.push({line: lineOf(i), msg: 'Des guillemets ne sont pas fermés.'}); q = ''; } continue; }
                if (ch === '/' && v[i + 1] === '*') { com = 2; i++; continue; } if (lang !== 'css' && ch === '/' && v[i + 1] === '/') { com = 1; continue; }
                if (ch === '"' || ch === "'" || (ch === '`' && lang !== 'css')) { q = ch; continue; }
                if (PAIRS[ch]) stack.push([ch, i]); else if (BACK[ch]) { const top = stack.pop(); if (!top) out.push({line: lineOf(i), msg: `« ${ch} » en trop.`}); else if (top[0] !== BACK[ch]) out.push({line: lineOf(i), msg: `« ${ch} » ferme « ${top[0]} » (ligne ${lineOf(top[1])}).`}); }
            }
            if (com === 2) out.push({line: lineOf(v.length), msg: 'Un commentaire /* … */ n’est pas fermé.'});
            stack.slice(-5).forEach(([ch, at]) => out.push({line: lineOf(at), msg: `« ${ch} » n’est pas fermé.`}));
            if (lang === 'css') (v.match(/^[ \t]*[a-z-]+\s*:[^;{}\n]+$/gm) || []).filter(l => !/[{,]\s*$/.test(l) && !/^\s*(a|li|p|div|span|h\d)?:(hover|focus|active|visited|root|first-child|last-child|not|is|where)/.test(l)).slice(0, 5).forEach(l => { const i = v.indexOf(l); const nx = v.slice(i + l.length).match(/^\s*(\S)/); if (nx && nx[1] !== '}') out.push({line: lineOf(i), msg: 'Il manque sans doute un « ; » au bout de la ligne.'}); });
        }
        return out.sort((a, b) => a.line - b.line);
    }
    const KEYS_HELP = [['⌘F', 'Chercher'], ['⌥⌘F', 'Chercher et remplacer'], ['⌘G / ⇧⌘G', 'Suivant / précédent'], ['⌃G', 'Aller à la ligne'], ['⌘/', 'Commenter, décommenter'], ['⌘D', 'Choisir le mot suivant pareil'],
        ['⇧⌥↓', 'Dupliquer la ligne'], ['⌥↑ / ⌥↓', 'Déplacer la ligne'], ['⇧⌘K', 'Supprimer la ligne'], ['Tab / ⇧Tab', 'Retrait (aussi plusieurs lignes) ; Emmet en HTML et CSS'], ['⇧⌥F', 'Remettre en forme'], ['⌘]  /  ⌘[', 'Retrait de la ligne'], ['Échap', 'Fermer la recherche']];

    /* ═════ L'éditeur ═════ */
    function create(host, {lang = 'html', value = '', onChange = () => {}, onCursor = () => {}, label = 'Code'} = {}) {
        const el = document.createElement('div'); el.className = 'swc'; el.dataset.lang = lang; el.dataset.dndOff = '1'; el.dataset.ordOff = '1'; // ↑ ↓ de la recherche : pas des flèches pour ranger
        el.innerHTML = `<div class="swc-find" hidden role="search" aria-label="Chercher dans le code"><input type="search" class="swc-q" placeholder="Chercher…" aria-label="Chercher" spellcheck="false" data-ui-off><span class="swc-fopts"><button type="button" class="swc-fb" data-swc-opt="cs" title="Majuscules et minuscules" aria-pressed="false">Aa</button><button type="button" class="swc-fb" data-swc-opt="word" title="Mot entier" aria-pressed="false">ab|</button><button type="button" class="swc-fb" data-swc-opt="regex" title="Expression régulière" aria-pressed="false">.*</button></span><span class="swc-count" aria-live="polite"></span><button type="button" class="swc-fb" data-find data-swc-f="prev" title="Précédent (⇧⌘G)" aria-label="Précédent">↑</button><button type="button" class="swc-fb" data-find data-swc-f="next" title="Suivant (⌘G, Entrée)" aria-label="Suivant">↓</button><button type="button" class="swc-fb" data-swc-f="toggle" title="Remplacer (⌥⌘F)" aria-label="Remplacer">⇄</button><button type="button" class="swc-fb" data-swc-f="close" title="Fermer (Échap)" aria-label="Fermer">✕</button>
            <span class="swc-rep" hidden><input type="text" class="swc-r" placeholder="Remplacer par…" aria-label="Remplacer par" spellcheck="false" data-ui-off><button type="button" class="swc-fb" data-swc-f="one" title="Remplacer celui-ci">Remplacer</button><button type="button" class="swc-fb" data-swc-f="all" title="Tout remplacer">Tout</button></span></div>
            <div class="swc-gutter" aria-hidden="true"><div></div></div><div class="swc-wrap"><div class="swc-mark" hidden></div><div class="swc-hits" aria-hidden="true"></div><pre class="swc-hl" aria-hidden="true"><code></code></pre><textarea class="swc-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" data-ui-off aria-label="${esc(label)}" data-ctx-off></textarea></div><div class="swc-pop" role="listbox" hidden></div>
            <div class="swc-status"><span class="swc-pos">Ligne 1, colonne 1</span><span class="swc-lint" role="button" tabindex="0" title="Vérifier le code"></span><span class="swc-sp"></span><button type="button" class="swc-sb" data-swc-act="find" title="Chercher (⌘F)">🔍</button><button type="button" class="swc-sb" data-swc-act="goto" title="Aller à la ligne (⌃G)">↧</button><button type="button" class="swc-sb" data-swc-act="comment" title="Commenter (⌘/)">//</button><button type="button" class="swc-sb" data-swc-act="format" title="Remettre en forme (⇧⌥F)">↹</button><button type="button" class="swc-sb" data-swc-act="keys" title="Les raccourcis">⌨</button></div>`;
        host.appendChild(el);
        const ta = el.querySelector('textarea'), markEl = el.querySelector('.swc-mark'), hitsEl = el.querySelector('.swc-hits'), findEl = el.querySelector('.swc-find'), qEl = el.querySelector('.swc-q'), rEl = el.querySelector('.swc-r'), countEl = el.querySelector('.swc-count'), posEl = el.querySelector('.swc-pos'), lintEl = el.querySelector('.swc-lint'), wrapEl = el.querySelector('.swc-wrap'), code = el.querySelector('code'), pre = el.querySelector('pre'), gut = el.querySelector('.swc-gutter > div'), pop = el.querySelector('.swc-pop');
        ta.value = value;
        let raf = 0, popState = null, lastLines = -1, mark = null;
        const paint = () => { raf = 0; code.innerHTML = highlight(ta.value, lang) + '\n '; const lines = ta.value.split('\n').length; if (lines !== lastLines) { lastLines = lines; gut.innerHTML = Array.from({length: lines}, (_, k) => `<span>${k + 1}</span>`).join(''); } sync(); };
        const later = () => { if (!raf) raf = requestAnimationFrame(paint); };
        const sync = () => { pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; gut.style.transform = `translateY(${-ta.scrollTop}px)`; hitsEl.style.transform = pre.style.transform; if (mark) { const m = metrics(); markEl.style.top = `${m.pt + mark[0] * m.lh - ta.scrollTop}px`; markEl.style.height = `${(mark[1] - mark[0] + 1) * m.lh}px`; } };
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
            pop.style.left = `${Math.max(0, m.pl + col * m.cw - ta.scrollLeft + 40)}px`; pop.style.top = `${wrapEl.offsetTop + m.pt + (line + 1) * m.lh - ta.scrollTop + 4}px`;
            pop.hidden = false;
        }
        const accept = k => {
            const it = popState.items[k]; const pos = ta.selectionStart; const st = popState; closePop();
            replace(st.from, pos, it.insert, it.insert.length - (it.back || 0));
        };
        pop.addEventListener('mousedown', e => { const o = e.target.closest('.swc-opt'); if (!o || !popState) return; e.preventDefault(); accept(Number(o.dataset.k)); });
        /* ── 🔍 chercher, remplacer ── */
        const F = {cs: false, word: false, regex: false, hits: [], k: -1};
        const hitBoxes = () => { if (findEl.hidden || !F.hits.length) { hitsEl.innerHTML = ''; return; } const m = metrics(), v = ta.value; let lastLine = 0, lastPos = 0;
            hitsEl.innerHTML = F.hits.slice(0, 1500).map(([a, b], i) => { lastLine += v.slice(lastPos, a).split('\n').length - 1; lastPos = a; const col = a - v.lastIndexOf('\n', a - 1) - 1; return `<i class="${i === F.k ? 'is-on' : ''}" style="top:${m.pt + lastLine * m.lh}px;left:${m.pl + col * m.cw}px;width:${Math.max(2, (b - a) * m.cw)}px;height:${m.lh}px"></i>`; }).join(''); };
        const runFind = (keep = true) => { const r = findAll(ta.value, qEl.value, F); qEl.classList.toggle('is-bad', r === null); F.hits = r || []; if (!keep || F.k >= F.hits.length) F.k = F.hits.findIndex(([a]) => a >= ta.selectionStart); if (F.k < 0 && F.hits.length) F.k = 0;
            countEl.textContent = r === null ? 'Expression fausse' : qEl.value ? (F.hits.length ? `${F.k + 1} sur ${F.hits.length}${F.hits.length >= 5000 ? '+' : ''}` : 'Aucun') : ''; hitBoxes(); };
        const goHit = d => { if (!F.hits.length) return runFind(false); F.k = (F.k + d + F.hits.length) % F.hits.length; const [a, b] = F.hits[F.k]; api.reveal(a, b); qEl.focus(); countEl.textContent = `${F.k + 1} sur ${F.hits.length}`; hitBoxes(); };
        const openFind = (rep = false) => { findEl.hidden = false; findEl.querySelector('.swc-rep').hidden = !rep && findEl.querySelector('.swc-rep').hidden; if (rep) findEl.querySelector('.swc-rep').hidden = false; const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes('\n') && sel.length < 200) qEl.value = sel; qEl.focus(); qEl.select(); runFind(false); };
        const closeFind = () => { findEl.hidden = true; hitsEl.innerHTML = ''; ta.focus(); };
        const replaceOne = () => { if (!F.hits.length) return; const [a, b] = F.hits[F.k], src = ta.value.slice(a, b); let to = rEl.value; if (F.regex) { try { to = src.replace(new RegExp(qEl.value, F.cs ? '' : 'i'), rEl.value); } catch (_) {} } replace(a, b, to); ta.blur(); runFind(false); if (F.hits.length) { F.k = F.hits.findIndex(([x]) => x >= a + to.length); if (F.k < 0) F.k = 0; } hitBoxes(); qEl.focus(); };
        const replaceAll = () => { if (!F.hits.length) return; let re; try { re = new RegExp(F.regex ? qEl.value : qEl.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), F.cs ? 'g' : 'gi'); if (F.word) re = new RegExp(`(?<![\\w$])(?:${re.source})(?![\\w$])`, re.flags); } catch (_) { return; }
            const n = F.hits.length, text = ta.value.replace(re, F.regex ? rEl.value : () => rEl.value); replace(0, ta.value.length, text, 0); runFind(false); countEl.textContent = `${n} remplacé${n > 1 ? 's' : ''}`; qEl.focus(); };
        qEl.addEventListener('input', () => runFind(false));
        qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goHit(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); } });
        rEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (e.metaKey || e.ctrlKey ? replaceAll : replaceOne)(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); } });
        findEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.swcOpt) { const k = b.dataset.swcOpt; F[k] = !F[k]; b.setAttribute('aria-pressed', String(F[k])); b.classList.toggle('is-on', F[k]); runFind(false); qEl.focus(); return; }
            ({prev: () => goHit(-1), next: () => goHit(1), close: closeFind, one: replaceOne, all: replaceAll, toggle: () => { const r = findEl.querySelector('.swc-rep'); r.hidden = !r.hidden; if (!r.hidden) rEl.focus(); }})[b.dataset.swcF]?.(); });
        /* ── les lignes : aller à, dupliquer, déplacer, supprimer, retrait de plusieurs lignes, commenter ── */
        const lineAt = n => { const v = ta.value; let i = 0; for (let k = 1; k < n && i >= 0; k++) i = v.indexOf('\n', i) + 1 || -1; return Math.max(0, i); };
        const gotoLine = async () => { const total = ta.value.split('\n').length; const ask = window.LCNDA_APP?.askText; const a = ask ? await ask({title: '↧ Aller à la ligne', message: `Le numéro de la ligne (1 à ${total}), ou ligne:colonne :`, value: '', okLabel: 'Aller'}) : window.prompt(`Aller à la ligne (1 à ${total})`);
            const m = /^\s*(\d+)(?:\s*[:,]\s*(\d+))?/.exec(a || ''); if (!m) { ta.focus(); return; } const n = Math.min(total, Math.max(1, +m[1])), st = lineAt(n), end = ta.value.indexOf('\n', st), col = Math.min((end < 0 ? ta.value.length : end) - st, Math.max(0, (+m[2] || 1) - 1)); api.reveal(st + col); status(); };
        const editLines = fn => { const v = ta.value, s = ta.selectionStart, e2 = ta.selectionEnd, [a, b] = lineRange(v, s, e2), r = fn(v, a, b, s, e2); if (!r) return; replace(r.from ?? a, r.to ?? b, r.text, 0); ta.setSelectionRange(r.s, r.e); status(); };
        const indentLines = out => editLines((v, a, b, s, e2) => { const lines = v.slice(a, b).split('\n'); let ds = 0, de = 0; const res = lines.map((l, i) => { if (out) { const k = l.startsWith('  ') ? 2 : l.startsWith('\t') || l.startsWith(' ') ? 1 : 0; if (i === 0) ds = -Math.min(k, s - a); de -= k; return l.slice(k); } if (i === 0) ds = 2; de += 2; return '  ' + l; }).join('\n'); return {text: res, s: Math.max(a, s + ds), e: e2 + de}; });
        const doComment = () => { const r = toggleComment(ta.value, ta.selectionStart, ta.selectionEnd, lang); replace(0, ta.value.length, r.text, 0); ta.setSelectionRange(r.s, r.e); status(); };
        const doFormat = () => { const st = ta.scrollTop, line = ta.value.slice(0, ta.selectionStart).split('\n').length, f = formatCode(ta.value, lang); if (f === ta.value) return say('Déjà en forme.'); replace(0, ta.value.length, f, 0); const p = lineAt(line); ta.setSelectionRange(p, p); ta.scrollTop = st; sync(); say('Code remis en forme.'); };
        const nextSame = () => { const v = ta.value; let s = ta.selectionStart, e2 = ta.selectionEnd; if (s === e2) { while (s > 0 && /[\w$-]/.test(v[s - 1])) s--; while (e2 < v.length && /[\w$-]/.test(v[e2])) e2++; if (s === e2) return; api.reveal(s, e2); return; }
            const w = v.slice(s, e2); let i = v.indexOf(w, e2); if (i < 0) i = v.indexOf(w); if (i >= 0) { api.reveal(i, i + w.length); say(i <= s ? 'Retour au début.' : ''); } };
        const say = t => { if (!t) return; posEl.dataset.msg = t; status(); clearTimeout(say.t); say.t = setTimeout(() => { delete posEl.dataset.msg; status(); }, 1800); };
        const showKeys = () => { const h = `<div class="swc-keys" role="dialog" aria-label="Raccourcis du code"><b>⌨ Raccourcis</b><dl>${KEYS_HELP.map(([k, l]) => `<dt>${esc(k)}</dt><dd>${esc(l)}</dd>`).join('')}</dl><small>Sur PC et Linux : Ctrl au lieu de ⌘, Alt au lieu de ⌥.</small></div>`; const old = el.querySelector('.swc-keys'); if (old) { old.remove(); return; } el.insertAdjacentHTML('beforeend', h); setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!ev.target.closest('.swc-keys')) { el.querySelector('.swc-keys')?.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0); };
        /* ── barre du bas : position, sélection, jumelle, vérification ── */
        let lintT = 0, lintList = [];
        const status = () => { const v = ta.value, s = ta.selectionStart, e2 = ta.selectionEnd, line = v.slice(0, s).split('\n').length, col = s - v.lastIndexOf('\n', s - 1);
            const mb = s === e2 ? matchBracket(v, s) : -1, sel = e2 - s;
            posEl.textContent = posEl.dataset.msg || `Ligne ${line}, colonne ${col}${sel ? ` · ${sel} caractère${sel > 1 ? 's' : ''} choisi${sel > 1 ? 's' : ''}` : ''}${mb >= 0 ? ` · jumelle ligne ${v.slice(0, mb).split('\n').length}` : ''}`; };
        const relint = () => { clearTimeout(lintT); lintT = setTimeout(() => { lintList = ta.value.length < 400000 ? lintCode(ta.value, lang === 'php' ? 'html' : lang) : []; lintEl.textContent = lintList.length ? `⚠️ ${lintList.length} à vérifier` : '✓ Rien à signaler'; lintEl.classList.toggle('is-warn', !!lintList.length); lintEl.title = lintList.slice(0, 12).map(x => `Ligne ${x.line} : ${x.msg}`).join('\n') || 'Le code a l’air bien formé.';
            gut.querySelectorAll('span.is-warn').forEach(x => x.classList.remove('is-warn')); lintList.forEach(x => { const sp = gut.children[x.line - 1]; if (sp) { sp.classList.add('is-warn'); sp.title = x.msg; } }); }, 450); };
        const lintNext = () => { if (!lintList.length) return say('Rien à signaler.'); const cur = ta.value.slice(0, ta.selectionStart).split('\n').length, it = lintList.find(x => x.line > cur) || lintList[0]; api.reveal(lineAt(it.line)); say(`Ligne ${it.line} : ${it.msg}`); };
        lintEl.addEventListener('click', lintNext); lintEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lintNext(); } });
        el.querySelector('.swc-status').addEventListener('click', e => { const b = e.target.closest('[data-swc-act]'); if (!b) return; ({find: () => openFind(), goto: gotoLine, comment: doComment, format: doFormat, keys: showKeys})[b.dataset.swcAct]?.(); });
        const CLOSE = {'(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`'};
        ta.addEventListener('keydown', e => {
            const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
            if (mod && !e.altKey && k === 'f' && !e.shiftKey) { e.preventDefault(); return openFind(false); }
            if ((mod && e.altKey && (k === 'f' || e.code === 'KeyF')) || (e.ctrlKey && k === 'h')) { e.preventDefault(); return openFind(true); }
            if (e.metaKey && !e.ctrlKey && k === 'g') { e.preventDefault(); if (findEl.hidden) openFind(); else goHit(e.shiftKey ? -1 : 1); return; }
            if (e.ctrlKey && !e.metaKey && k === 'g') { e.preventDefault(); return gotoLine(); }
            if (mod && (k === '/' || e.code === 'Slash')) { e.preventDefault(); return doComment(); }
            if (mod && !e.shiftKey && k === 'd') { e.preventDefault(); return nextSame(); }
            if (mod && e.shiftKey && k === 'k') { e.preventDefault(); return editLines((v, a, b) => { const to = b < v.length ? b + 1 : b, from = b >= v.length && a > 0 ? a - 1 : a; return {from, to, text: '', s: from, e: from}; }); }
            if (e.altKey && e.shiftKey && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); return editLines((v, a, b, s, e2) => { const blk = v.slice(a, b); return e.key === 'ArrowDown' ? {text: blk + '\n' + blk, s: s + blk.length + 1, e: e2 + blk.length + 1} : {text: blk + '\n' + blk, s, e: e2}; }); }
            if (e.altKey && !e.shiftKey && !mod && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); return editLines((v, a, b, s, e2) => { const blk = v.slice(a, b);
                if (e.key === 'ArrowUp') { if (a === 0) return null; const pa = v.lastIndexOf('\n', a - 2) + 1, prev = v.slice(pa, a - 1); return {from: pa, to: b, text: blk + '\n' + prev, s: s - prev.length - 1, e: e2 - prev.length - 1}; }
                if (b >= v.length) return null; let nb = v.indexOf('\n', b + 1); if (nb < 0) nb = v.length; const next = v.slice(b + 1, nb); return {from: a, to: nb, text: next + '\n' + blk, s: s + next.length + 1, e: e2 + next.length + 1}; }); }
            if (e.altKey && e.shiftKey && (k === 'f' || e.code === 'KeyF') && !mod) { e.preventDefault(); return doFormat(); }
            if (mod && (e.key === ']' || e.key === '[')) { e.preventDefault(); return indentLines(e.key === '['); }
            if (e.key === 'Escape' && !findEl.hidden) { e.preventDefault(); e.stopPropagation(); return closeFind(); }
            if (e.key === 'Home' && !mod && !e.altKey) { const v = ta.value, s = ta.selectionStart, a = v.lastIndexOf('\n', s - 1) + 1, first = a + /^[ \t]*/.exec(v.slice(a))[0].length, to = s === first ? a : first; e.preventDefault(); if (e.shiftKey) ta.setSelectionRange(Math.min(to, ta.selectionEnd), Math.max(to, ta.selectionEnd)); else ta.setSelectionRange(to, to); status(); return; }
            // multi-lignes : Tab et ⇧Tab décalent toutes les lignes choisies
            if (e.key === 'Tab' && !mod && !e.altKey && ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n')) { e.preventDefault(); return indentLines(e.shiftKey); }
            // fermer tout seul ( [ { " ' ` ; entourer la sélection ; passer par-dessus la fermeture tapée
            if (!mod && !e.altKey && CLOSE[e.key] && (!popState || pop.hidden)) { const s = ta.selectionStart, e2 = ta.selectionEnd, v = ta.value, q = /["'`]/.test(e.key);
                if (q && s === e2 && v[s] === e.key) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
                if (s !== e2) { e.preventDefault(); return replace(s, e2, e.key + v.slice(s, e2) + CLOSE[e.key], e2 - s + 1); }
                const after = v[s] || '', before = v[s - 1] || ''; if (!/^[\s)\]};,:>]?$/.test(after) || (q && /[\w\\]/.test(before)) || (e.key === "'" && lang === 'html' && !/[=(\[{,\s]/.test(before))) return;
                if (e.key === '`' && lang === 'css') return; e.preventDefault(); return replace(s, s, e.key + CLOSE[e.key], 1); }
            if (!mod && /^[)\]}]$/.test(e.key) && ta.selectionStart === ta.selectionEnd && ta.value[ta.selectionStart] === e.key) { e.preventDefault(); const p = ta.selectionStart + 1; ta.setSelectionRange(p, p); return; }
            if (e.key === 'Backspace' && !mod && ta.selectionStart === ta.selectionEnd) { const s = ta.selectionStart, v = ta.value; if (CLOSE[v[s - 1]] && v[s] === CLOSE[v[s - 1]]) { e.preventDefault(); return replace(s - 1, s + 1, '', 0); } }
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
            change(); relint(); if (!findEl.hidden) runFind(); if (mark) { mark = null; markEl.hidden = true; }
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
        const cursorEv = () => { onCursor(ta.selectionStart); status(); };
        ta.addEventListener('click', cursorEv); ta.addEventListener('keyup', e => { if (/^(Arrow|Home|End|Page)/.test(e.key) || e.shiftKey) cursorEv(); else status(); });
        ta.addEventListener('select', status);
        paint(); status(); relint();
        const api = {
            el, ta,
            get value() { return ta.value; },
            set value(v) { if (v === ta.value) return; const st = ta.scrollTop, sl = ta.scrollLeft, p = ta.selectionStart; ta.value = v; ta.scrollTop = st; ta.scrollLeft = sl; try { ta.setSelectionRange(Math.min(p, v.length), Math.min(p, v.length)); } catch (_) {} paint(); relint(); if (!findEl.hidden) runFind(); },
            setLang(l) { lang = l; el.dataset.lang = l; closePop(); paint(); relint(); },
            openFind, gotoLine, format: doFormat, comment: doComment,
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
        return api;
    }

    const API = {expandAbbr, expandCss, highlight, completions, abbrBefore, create, cssScan, cssGetDecls, cssSetDecl, toggleComment, findAll, matchBracket, formatCode, lintCode, KEYS_HELP, TAGS, VOID, CSS_PROPS, ATTRS};
    if (typeof module === 'object' && module.exports) module.exports = API;
    else { root.LCNDA_EXT = root.LCNDA_EXT || {}; root.LCNDA_EXT.siteCode = API; }
})(typeof window !== 'undefined' ? window : globalThis);
