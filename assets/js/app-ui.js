/* LCNDA — 🧩 Les composants communs validés (docs/REGLES-INTERFACE.md, C1 à C8 et E1 à E5 ; mode d'emploi : docs/UI.md).
 * Maquettes : docs/design/champs-communs.html et docs/design/editeurs.html. Styles : assets/css/ui.css.
 * API : window.LCNDA_UI (et window.LCNDA_APP.ui). Les cases de recherche, couleurs et curseurs déjà présents
 * reçoivent l'habillage tout seuls (même élément, mêmes écouteurs) ; data-ui-off sur un élément ou un parent l'exclut.
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const store = {
        get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    };
    const fire = (el, type) => el.dispatchEvent(new Event(type, {bubbles: true}));
    const isOff = el => !!el.closest?.('[data-ui-off]');
    const shown = el => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${(Number(n) || 0).toLocaleString('fr-FR')} ${Math.abs(Number(n) || 0) < 2 ? one : (many || one + 's')}`);
    const toast = (m, k) => (A().toast ? A().toast(m, k) : console.info(m));

    /* la valeur d'un champ changée par le code (champ.value = …) met aussi l'habillage à jour */
    const VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const rawSet = (inp, v) => VALUE.set.call(inp, v);
    const rawGet = inp => VALUE.get.call(inp);
    function watchValue(inp, cb) {
        if (!inp._uiWatch) {
            inp._uiWatch = [];
            Object.defineProperty(inp, 'value', {configurable: true, get() { return rawGet(this); }, set(v) { rawSet(this, v); this._uiWatch.forEach(f => { try { f(); } catch (_) {} }); }});
            inp.form?.addEventListener('reset', () => setTimeout(() => inp._uiWatch.forEach(f => f())));
        }
        inp._uiWatch.push(cb);
    }

    /* petite fenêtre posée sous un élément (couleurs, aide) : au-dessus de tout, même d'une fenêtre ouverte */
    const CAN_POP = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
    let openPop = null;
    function popup(anchor, el, {onClose, align = 'left'} = {}) {
        closePop();
        el.classList.add('ui-pop');
        const host = anchor.closest('dialog') || document.body;
        if (CAN_POP) el.setAttribute('popover', 'manual');
        host.appendChild(el);
        if (CAN_POP) { try { el.showPopover(); } catch (_) {} }
        const place = () => {
            const r = anchor.getBoundingClientRect(), w = el.offsetWidth, ht = el.offsetHeight, vw = innerWidth, vh = innerHeight;
            let left = Math.min(Math.max(8, align === 'right' ? r.right - w : r.left), vw - w - 8), top = r.bottom + 6;
            if (top + ht > vh - 8 && r.top - ht - 6 > 8) top = r.top - ht - 6;
            el.style.left = `${Math.max(8, left)}px`; el.style.top = `${Math.max(8, Math.min(top, vh - ht - 8))}px`;
        };
        place();
        // la fenêtre change de taille (contenu ajouté, onglet changé) : elle se replace pour rester dans l'écran
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null; ro?.observe(el);
        const outside = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
        const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus?.(); } };
        const close = () => {
            if (openPop?.el !== el) return; openPop = null;
            document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); removeEventListener('resize', place); ro?.disconnect();
            try { if (CAN_POP) el.hidePopover(); } catch (_) {}
            el.remove(); onClose?.();
        };
        setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true); addEventListener('resize', place); });
        openPop = {el, close, place};
        return openPop;
    }
    function closePop() { openPop?.close(); }

    /* ═════ C1 Cases de recherche ═════ */
    const SEARCH_SEL = 'input[type=search], input[data-ui-search], .search-row > input';
    const fixPlaceholder = inp => { const p = inp.getAttribute('placeholder'); if (p && /^\s*(rechercher|filtrer)\b/i.test(p)) inp.setAttribute('placeholder', p.replace(/^\s*(rechercher|filtrer)\b/i, 'Chercher')); };
    function buildSearch(inp, {sizing = true} = {}) {
        inp.dataset.uiDone = '1';
        fixPlaceholder(inp);
        const had = document.activeElement === inp, sel = had ? [inp.selectionStart, inp.selectionEnd] : null;
        const w = h('span', 'ui-search');
        if (sizing) {
            const cs = getComputedStyle(inp), par = inp.parentElement, pcs = par ? getComputedStyle(par) : null;
            const flexPar = pcs && /flex/.test(pcs.display), gridPar = pcs && /grid/.test(pcs.display);
            const pw = par ? par.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) : 0;
            const ws = w.style;
            if (par?.matches('.search-row')) ws.flex = '1 1 auto';
            else if (inp.style.width) { ws.width = inp.style.width; inp.style.removeProperty('width'); }
            else if (flexPar && parseFloat(cs.flexGrow) > 0) ws.flex = cs.flex;
            else if (gridPar || inp.offsetWidth >= pw - 4) ws.width = '100%';
            else ws.width = `${inp.offsetWidth}px`;
            if (flexPar && !ws.flex) ws.flex = `0 1 ${ws.width || 'auto'}`;
            if (cs.maxWidth !== 'none') ws.maxWidth = cs.maxWidth;
            if (parseFloat(cs.minWidth) > 0) ws.minWidth = cs.minWidth;
            ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'alignSelf', 'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd'].forEach(k => { const v = cs[k]; if (v && v !== 'auto' && v !== '0px' && v !== 'normal') ws[k] = v; });
            const hh = inp.offsetHeight; w.style.setProperty('--ui-h', `${hh && hh < 40 ? Math.max(28, hh) : 44}px`);
            if (inp.offsetWidth < 180) w.classList.add('is-narrow');
            // une loupe déjà dessinée à côté (🔎 dans une étiquette) ou le vieux bouton ⌕ : cachés
            if (par) [...par.children].forEach(s => { if (s !== inp && !s.children.length && /^[🔍🔎⌕]️?$/u.test(s.textContent.trim())) { if (s.matches('button') && s.parentElement.matches('.search-row')) { s.hidden = true; par.classList.add('ui-search-row'); } else if (!s.matches('button')) s.classList.add('ui-hide'); } });
        }
        inp.classList.add('ui-search-input');
        inp.parentNode?.insertBefore(w, inp);
        const ico = h('span', 'ui-search-ico', '🔍'); ico.setAttribute('aria-hidden', 'true');
        const clear = h('button', 'ui-search-clear', '×'); clear.type = 'button'; clear.title = 'Vider la case (Échap)'; clear.setAttribute('aria-label', 'Vider la case'); clear.tabIndex = -1;
        const kbd = h('kbd', 'ui-search-kbd', '/'); kbd.title = 'Touche « / » : aller dans la case de recherche';
        w.append(ico, inp, clear, kbd);
        const sync = () => w.classList.toggle('has-value', !!rawGet(inp));
        const empty = () => { if (!rawGet(inp)) return false; rawSet(inp, ''); sync(); fire(inp, 'input'); fire(inp, 'change'); inp.dispatchEvent(new Event('search', {bubbles: true})); return true; };
        clear.addEventListener('mousedown', e => e.preventDefault());
        clear.addEventListener('click', () => { empty(); inp.focus(); });
        w.addEventListener('mousedown', e => { if (e.target === w || e.target === ico || e.target === kbd) { e.preventDefault(); inp.focus(); } });
        inp.addEventListener('input', sync);
        inp.addEventListener('keydown', e => { if (e.key === 'Escape' && rawGet(inp)) { e.preventDefault(); e.stopPropagation(); empty(); } });
        watchValue(inp, sync); sync();
        if (had) { inp.focus(); try { inp.setSelectionRange(...sel); } catch (_) {} }
        return w;
    }
    /** C1 — searchField({placeholder, value, name, onInput, delay}) → l'élément (.input = la case) */
    UI.searchField = ({placeholder = 'Chercher…', value = '', name = '', onInput = null, delay = 200, label = ''} = {}) => {
        const inp = document.createElement('input'); inp.type = 'search'; inp.autocomplete = 'off'; inp.spellcheck = false;
        inp.placeholder = placeholder; if (name) inp.name = name; rawSet(inp, value); inp.setAttribute('aria-label', label || placeholder);
        const holder = h('span'); holder.appendChild(inp); const w = buildSearch(inp, {sizing: false}); w.remove();
        w.input = inp; w.classList.add('is-block');
        if (onInput) { let t = 0; inp.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => onInput(inp.value, e), delay); }); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(t); onInput(inp.value, e); } }); }
        return w;
    };
    // « / » met le curseur dans la première case de recherche visible (de la fenêtre du dessus s'il y en a une)
    const editable = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    function topLayer() { const ds = [...document.querySelectorAll('dialog[open]')]; const modal = ds.filter(d => { try { return d.matches(':modal'); } catch (_) { return true; } }); return modal.at(-1) || ds.at(-1) || document; }
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || editable(e.target) || editable(document.activeElement)) return;
        const root = topLayer(), list = [...root.querySelectorAll('.ui-search-input, input[type=search], .pk-input, input[data-ui-search]')].filter(x => shown(x) && !x.disabled && !x.closest('[inert]'));
        if (!list.length) return;
        e.preventDefault(); list[0].focus(); list[0].select?.();
    });

    /* ═════ C2 Couleur ═════ */
    const APP_COLORS = [['#111111', 'Noir'], ['#ffffff', 'Blanc'], ['#055dff', 'Bleu'], ['#7a2a2a', 'Bordeaux'], ['#a88a4a', 'Or vieilli'], ['#2f6b3a', 'Vert sapin'], ['#d9488f', 'Rose'],
        ['#3c78d8', 'Bleu clair'], ['#d0182f', 'Rouge'], ['#e9a23b', 'Orange'], ['#e1a500', 'Jaune d’or'], ['#1aa34a', 'Vert'], ['#c9a25a', 'Sépia'], ['#e8dcc4', 'Parchemin'], ['#8a8f99', 'Gris'], ['#5b3a29', 'Brun']];
    UI.APP_COLORS = APP_COLORS;
    const RECENT_C = 'genealogie-recent-colors';
    const hex6 = v => { let s = String(v || '').trim().toLowerCase(); if (!s) return ''; if (!s.startsWith('#')) s = `#${s}`; if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`; return /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s) ? s : null; };
    const colorName = c => APP_COLORS.find(([x]) => x === String(c).slice(0, 7).toLowerCase())?.[1] || '';
    const recentColors = () => { const a = store.get(RECENT_C, []); return Array.isArray(a) ? a.map(hex6).filter(Boolean).slice(0, 12) : []; };
    const rememberColor = c => { c = hex6(c); if (!c) return; c = c.slice(0, 7); store.set(RECENT_C, [c, ...recentColors().filter(x => x !== c)].slice(0, 12)); };
    UI.rememberColor = rememberColor; UI.recentColors = recentColors;
    const swatch = (c, extra = '') => `<span class="ui-sw${c ? '' : ' is-none'}${extra}"${c ? ` style="--c:${esc(c)}"` : ''}></span>`;
    // m : {get, set(v, final), allowNone, alpha} — commun au champ fabriqué et à l'input couleur amélioré
    function colorButton(w, m) {
        const btn = h('button', 'ui-color-btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog');
        const paint = () => {
            const v = m.get(), c = hex6(v) || '', name = c ? colorName(c) : (m.allowNone ? 'Aucune' : '');
            const a = c.length === 9 ? Math.round(parseInt(c.slice(7), 16) / 2.55) : 100;
            btn.innerHTML = `${swatch(c)}${w.classList.contains('is-compact') ? '' : `<span class="ui-color-txt">${name ? `<b>${esc(name)}</b> ` : ''}${c ? `<small>${esc(c.slice(0, 7).toUpperCase())}${a < 100 ? ` · ${a} %` : ''}</small>` : ''}</span>`}<span class="ui-caret" aria-hidden="true">▾</span>`;
            btn.title = `Couleur : ${name || ''} ${c ? c.toUpperCase() : ''}`.trim(); btn.setAttribute('aria-label', btn.title);
            btn.disabled = !!m.disabled?.();
        };
        btn.addEventListener('click', () => openColorBox(btn, m, paint));
        w.prepend(btn); paint();
        return paint;
    }
    /* Le sélecteur de couleur (standard de l'app, comme Photoshop) : Nuances (carré clair/foncé × terne/vif + barre des teintes),
       TLS (teinte, lumière, saturation), RVB (rouge, vert, bleu), CMJN (cyan, magenta, jaune, noir : les encres de l'imprimerie) */
    const CB_TAB = 'genealogie-color-tab';
    const cbHex = ({r, g, b}) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const cbRgb = hx => { const n = parseInt(String(hx).slice(1, 7), 16); return {r: n >> 16, g: n >> 8 & 255, b: n & 255}; };
    function cbToHsv({r, g, b}) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return {h, s: mx ? d / mx : 0, v: mx}; }
    const cbFromHsv = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return {r: f(5) * 255, g: f(3) * 255, b: f(1) * 255}; };
    function cbToHsl(c) { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return {h: cbToHsv(c).h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l}; }
    const cbFromHsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return {r: f(0) * 255, g: f(8) * 255, b: f(4) * 255}; };
    const cbToCmyk = ({r, g, b}) => { const k = 1 - Math.max(r, g, b) / 255; return k >= 1 ? {c: 0, m: 0, y: 0, k: 1} : {c: (1 - r / 255 - k) / (1 - k), m: (1 - g / 255 - k) / (1 - k), y: (1 - b / 255 - k) / (1 - k), k}; };
    const cbFromCmyk = (C, M, Y, K) => ({r: 255 * (1 - C) * (1 - K), g: 255 * (1 - M) * (1 - K), b: 255 * (1 - Y) * (1 - K)});
    const CB_SL = {hsl: [['h', 'T', 'Teinte', 360, '°'], ['l', 'L', 'Lumière', 100, ' %'], ['s', 'S', 'Saturation', 100, ' %']], rgb: [['r', 'R', 'Rouge', 255, ''], ['g', 'V', 'Vert', 255, ''], ['b', 'B', 'Bleu', 255, '']],
        cmyk: [['c', 'C', 'Cyan', 100, ' %'], ['m', 'M', 'Magenta', 100, ' %'], ['y', 'J', 'Jaune', 100, ' %'], ['k', 'N', 'Noir', 100, ' %']]};
    UI.colorConvert = {hex: cbHex, rgb: cbRgb, toHsv: cbToHsv, fromHsv: cbFromHsv, toHsl: cbToHsl, fromHsl: cbFromHsl, toCmyk: cbToCmyk, fromCmyk: cbFromCmyk}; // aussi pour les essais
    /** le sélecteur dans un élément : start (#rrggbb), onInput(hex) pendant qu'on cherche ; rend {get, set} */
    function colorPicker(root, start, onInput) {
        let c = cbRgb(hex6(start) || '#000000'), hsv = cbToHsv(c), tab = 'sv';
        try { tab = localStorage.getItem(CB_TAB) || 'sv'; } catch (_) {}
        if (!['sv', 'hsl', 'rgb', 'cmyk'].includes(tab)) tab = 'sv';
        const sl = k => CB_SL[k].map(([key, l, t, max, u]) => `<label class="ui-cb-sl" title="${t}"><span>${l}</span><input type="range" min="0" max="${max}" step="1" data-cb="${key}" data-ui-off="1" aria-label="${t}"><output data-cbo="${key}"></output></label>`).join('');
        root.innerHTML = `<div class="ui-cb-duo"><span data-cb-new>nouvelle</span><span data-cb-old style="--c:${esc(cbHex(c))}">actuelle</span></div>
            <div class="ui-cb-tabs" role="tablist">${[['sv', 'Nuances'], ['hsl', 'TLS'], ['rgb', 'RVB'], ['cmyk', 'CMJN']].map(([k, l]) => `<button type="button" role="tab" data-cb-tab="${k}" title="${({sv: 'Clair / foncé, terne / vif, et la teinte', hsl: 'Teinte, Lumière, Saturation', rgb: 'Rouge, Vert, Bleu (l’écran)', cmyk: 'Cyan, Magenta, Jaune, Noir (l’imprimerie)'})[k]}">${l}</button>`).join('')}</div>
            <div data-cb-pane="sv"><div class="ui-cb-sv" data-cb-sv><i></i></div><input type="range" class="ui-cb-hue" min="0" max="360" step="1" data-cb-hue data-ui-off="1" aria-label="Teinte"></div>
            <div data-cb-pane="hsl">${sl('hsl')}</div><div data-cb-pane="rgb">${sl('rgb')}</div><div data-cb-pane="cmyk">${sl('cmyk')}</div>`;
        const q = s => root.querySelector(s), qa = s => [...root.querySelectorAll(s)];
        const showTab = t => { tab = t; qa('[data-cb-tab]').forEach(b => { b.classList.toggle('is-on', b.dataset.cbTab === t); b.setAttribute('aria-selected', b.dataset.cbTab === t ? 'true' : 'false'); }); qa('[data-cb-pane]').forEach(p => { p.hidden = p.dataset.cbPane !== t; }); try { localStorage.setItem(CB_TAB, t); } catch (_) {} };
        const draw = (from = '') => {
            const hx = cbHex(c); q('[data-cb-new]').style.setProperty('--c', hx); q('[data-cb-new]').classList.toggle('is-light', c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 150);
            if (from !== 'sv') { const n = cbToHsv(c); if (n.s > 0.001 && n.v > 0.001) hsv = n; else hsv = {...n, h: hsv.h}; }
            const sv = q('[data-cb-sv]'); sv.style.setProperty('--h', hsv.h); sv.firstElementChild.style.left = hsv.s * 100 + '%'; sv.firstElementChild.style.top = (1 - hsv.v) * 100 + '%';
            if (from !== 'hue') q('[data-cb-hue]').value = Math.round(hsv.h);
            const L = cbToHsl(c), K = cbToCmyk(c), vals = {h: [Math.round(hsv.h), Math.round(hsv.h) + '°'], l: [Math.round(L.l * 100)], s: [Math.round(L.s * 100)], r: [Math.round(c.r)], g: [Math.round(c.g)], b: [Math.round(c.b)], c: [Math.round(K.c * 100)], m: [Math.round(K.m * 100)], y: [Math.round(K.y * 100)], k: [Math.round(K.k * 100)]};
            const grad = {h: ['red', '#ff0', 'lime', 'cyan', 'blue', '#f0f', 'red'], l: ['#000', `hsl(${hsv.h},${Math.round(L.s * 100)}%,50%)`, '#fff'], s: [`hsl(${hsv.h},0%,${Math.round(L.l * 100)}%)`, `hsl(${hsv.h},100%,${Math.round(L.l * 100)}%)`],
                r: [cbHex({...c, r: 0}), cbHex({...c, r: 255})], g: [cbHex({...c, g: 0}), cbHex({...c, g: 255})], b: [cbHex({...c, b: 0}), cbHex({...c, b: 255})],
                c: [cbHex(cbFromCmyk(0, K.m, K.y, K.k)), cbHex(cbFromCmyk(1, K.m, K.y, K.k))], m: [cbHex(cbFromCmyk(K.c, 0, K.y, K.k)), cbHex(cbFromCmyk(K.c, 1, K.y, K.k))], y: [cbHex(cbFromCmyk(K.c, K.m, 0, K.k)), cbHex(cbFromCmyk(K.c, K.m, 1, K.k))], k: [cbHex(cbFromCmyk(K.c, K.m, K.y, 0)), '#000']};
            qa('[data-cb]').forEach(i => { const k = i.dataset.cb, [v, t] = vals[k]; if (document.activeElement !== i) i.value = v; i.style.background = `linear-gradient(to right,${grad[k].join(',')})`; root.querySelector(`[data-cbo="${k}"]`).textContent = t ?? (v + ((CB_SL.hsl.concat(CB_SL.cmyk).find(x => x[0] === k) || [])[4] || '')); });
        };
        const changed = from => { draw(from); onInput(cbHex(c)); };
        qa('[data-cb-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.cbTab)));
        const sv = q('[data-cb-sv]'), move = e => { const r = sv.getBoundingClientRect(); hsv = {h: hsv.h, s: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), v: 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))}; c = cbFromHsv(hsv.h, hsv.s, hsv.v); changed('sv'); };
        sv.addEventListener('pointerdown', e => { e.preventDefault(); sv.setPointerCapture(e.pointerId); move(e); sv.onpointermove = move; });
        sv.addEventListener('pointerup', () => { sv.onpointermove = null; }); sv.addEventListener('pointercancel', () => { sv.onpointermove = null; });
        q('[data-cb-hue]').addEventListener('input', e => { hsv = {...hsv, h: Number(e.target.value)}; c = cbFromHsv(hsv.h, hsv.s, hsv.v); changed('hue'); });
        qa('[data-cb]').forEach(i => i.addEventListener('input', () => { const v = k => Number(root.querySelector(`[data-cb="${k}"]`).value), k = i.dataset.cb;
            if ('hls'.includes(k)) { c = cbFromHsl(v('h'), v('s') / 100, v('l') / 100); if (k === 'h') hsv = {...hsv, h: v('h')}; }
            else if ('rgb'.includes(k)) c = {r: v('r'), g: v('g'), b: v('b')}; else c = cbFromCmyk(v('c') / 100, v('m') / 100, v('y') / 100, v('k') / 100);
            changed('sl'); }));
        showTab(tab); draw();
        return {get: () => cbHex(c), set: hx => { const x = hex6(hx); if (x) { c = cbRgb(x); draw(); } }};
    }
    function openColorBox(btn, m, paint) {
        if (openPop && openPop.el._uiFor === btn) { closePop(); return; }
        const cur = hex6(m.get()) || '', base = cur.slice(0, 7);
        const box = h('div', 'ui-colorbox'); box._uiFor = btn; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Choisir une couleur');
        const sw = (c, title) => `<button type="button" class="ui-sw-btn${base === c ? ' is-on' : ''}" data-c="${esc(c)}" title="${esc(title || c.toUpperCase())}" aria-label="${esc(title || c.toUpperCase())}">${swatch(c)}</button>`;
        const rec = recentColors();
        box.innerHTML = `<small>Couleurs de l’app</small><div class="ui-sw-row">${APP_COLORS.map(([c, n]) => sw(c, n)).join('')}${m.allowNone ? `<button type="button" class="ui-sw-btn${cur ? '' : ' is-on'}" data-c="" title="Aucune" aria-label="Aucune">${swatch('')}</button>` : ''}</div>
            ${rec.length ? `<small>Récentes</small><div class="ui-sw-row">${rec.map(c => sw(c)).join('')}</div>` : ''}
            <small>Choisir une autre couleur</small><div data-ui-picker></div>
            <div class="ui-colorbox-tools">${window.EyeDropper ? '<button type="button" class="button small secondary" data-ui-eye title="Prendre une couleur n’importe où dans la fenêtre">💧 Pipette</button>' : ''}<span class="ui-num ui-hex"><input type="text" class="ui-num-input" data-ui-hex maxlength="9" spellcheck="false" aria-label="Code de la couleur" value="${esc(base.toUpperCase())}" placeholder="#RRGGBB"></span></div>
            ${m.alpha ? '<div data-ui-alpha></div>' : ''}
            <div class="ui-colorbox-acts"><button type="button" class="button small secondary" data-ui-cancel title="Remettre la couleur d’avant">Annuler</button><button type="button" class="button small" data-ui-ok>OK</button></div>`;
        const pop = popup(btn, box);
        const alphaOf = () => { const c = hex6(m.get()) || ''; return c.length === 9 ? Math.round(parseInt(c.slice(7), 16) / 2.55) : 100; };
        let alphaR = null;
        const withAlpha = c => { if (!c || !m.alpha) return c; const a = alphaR ? Number(alphaR.input.value) : alphaOf(); return a >= 100 ? c.slice(0, 7) : c.slice(0, 7) + Math.round(a * 2.55).toString(16).padStart(2, '0'); };
        const apply = (c, final = true) => { m.set(withAlpha(c), final); if (final && c) rememberColor(c); paint(); box.querySelectorAll('.ui-sw-btn').forEach(b => b.classList.toggle('is-on', b.dataset.c === (c || '').slice(0, 7))); const hx = box.querySelector('[data-ui-hex]'); if (hx && document.activeElement !== hx) hx.value = (c || '').slice(0, 7).toUpperCase(); };
        const picker = colorPicker(box.querySelector('[data-ui-picker]'), base || '#000000', hx => apply(hx, false));
        if (m.alpha) { alphaR = UI.rangeField({label: 'Transparence', min: 0, max: 100, step: 1, value: alphaOf(), unit: '%', default: 100}); box.querySelector('[data-ui-alpha]').appendChild(alphaR); alphaR.input.addEventListener('input', () => { const c = hex6(m.get()); if (c) { m.set(withAlpha(c), false); paint(); } }); alphaR.input.addEventListener('change', () => { const c = hex6(m.get()); if (c) m.set(withAlpha(c), true); }); }
        box.addEventListener('click', async e => {
            const s = e.target.closest('.ui-sw-btn'); if (s) { apply(s.dataset.c); if (s.dataset.c) picker.set(s.dataset.c); if (!m.alpha) { pop.close(); btn.focus(); } return; }
            if (e.target.closest('[data-ui-eye]')) { try { const r = await new window.EyeDropper().open(); if (r?.sRGBHex) { const c = hex6(r.sRGBHex) || r.sRGBHex; apply(c); picker.set(c); } } catch (_) {} return; }
            if (e.target.closest('[data-ui-ok]')) { apply(picker.get()); pop.close(); btn.focus(); return; }
            if (e.target.closest('[data-ui-cancel]')) { m.set(cur, true); paint(); pop.close(); btn.focus(); return; }
        });
        const hx = box.querySelector('[data-ui-hex]');
        hx.addEventListener('input', () => { const c = hex6(hx.value); if (c) { apply(c.slice(0, 7), false); picker.set(c.slice(0, 7)); } });
        hx.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const c = hex6(hx.value); if (c) { apply(c.slice(0, 7)); pop.close(); btn.focus(); } } });
        hx.addEventListener('change', () => { const c = hex6(hx.value); if (c) apply(c.slice(0, 7)); });
        box.querySelector('.ui-sw-btn.is-on, .ui-sw-btn')?.focus();
    }
    /** C2 — openColorBox(élément, {get, set(v, final)}) : le cadre des couleurs posé sous n'importe quel élément (les deux carrés de la retouche…) */
    /** Un menu d'actions sous un bouton (⋯) : il s'ouvre au clic et reste ouvert tant qu'on n'a rien choisi (on peut y promener la souris) ;
        Échap ou un clic ailleurs le ferme. items : [{icon, label, help, danger, run}] ; title : petit titre en haut */
    UI.menuAt = (anchor, items, {title = '', onClose = null} = {}) => {
        if (openPop && openPop.el._uiFor === anchor) { closePop(); return null; }
        const m = h('div', 'ui-actmenu'); m._uiFor = anchor; m.setAttribute('role', 'menu');
        m.innerHTML = (title ? `<div class="ui-actmenu-t">${esc(title)}</div>` : '') + items.map((it, i) => `<button type="button" role="menuitem" class="ui-actmenu-i${it.danger ? ' is-danger' : ''}" data-i="${i}"><span class="ui-actmenu-ico" aria-hidden="true">${esc(it.icon || '')}</span><b>${esc(it.label)}</b>${it.help ? `<small>${esc(it.help)}</small>` : ''}</button>`).join('');
        anchor.classList.add('is-open'); anchor.setAttribute('aria-expanded', 'true');
        const pop = popup(anchor, m, {align: 'right', onClose: () => { anchor.classList.remove('is-open'); anchor.setAttribute('aria-expanded', 'false'); onClose?.(); }});
        m.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items[Number(b.dataset.i)]; pop.close(); it?.run?.(); });
        m.querySelector('button')?.focus({preventScroll: true});
        m.addEventListener('keydown', e => { const bs = [...m.querySelectorAll('button')], k = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(k + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus(); } });
        return pop;
    };
    UI.openColorBox = (anchor, {get, set, alpha = false, allowNone = false} = {}) => openColorBox(anchor, {get, set, alpha, allowNone}, () => {});
    /** C2 — colorField({name, value, allowNone, alpha, compact}) → l'élément (.input = l'input caché qui reçoit input/change) */
    UI.colorField = ({name = '', value = '#111111', allowNone = false, alpha = false, compact = false} = {}) => {
        const w = h('span', `ui-color${compact ? ' is-compact' : ''}`);
        const inp = document.createElement('input'); inp.type = 'hidden'; if (name) inp.name = name; rawSet(inp, hex6(value) || (allowNone ? '' : '#111111'));
        w.appendChild(inp); w.input = inp;
        const paint = colorButton(w, {get: () => rawGet(inp), set: (v, final) => { rawSet(inp, v || ''); fire(inp, 'input'); if (final) fire(inp, 'change'); }, allowNone, alpha});
        watchValue(inp, paint);
        Object.defineProperty(w, 'value', {get: () => rawGet(inp), set: v => { inp.value = v; }});
        return w;
    };
    // les input type=color déjà là : la pastille se pose dessus, l'input reste (valeur et événements inchangés)
    const COMPACT_IN = '[class*=toolbar], [class*=-tools], [class*=tbar], [class*=-sw], [class*=swatch], .h-rt-fg, .vx-fs, .h-bd-sws, [class*=colors]';
    function enhanceColor(inp) {
        if (inp.dataset.uiDone) return true;
        if (isOff(inp) || inp.closest('.ui-color, .ui-pop')) { inp.dataset.uiDone = 'off'; return true; }
        if (!shown(inp)) return false;
        if (Number(getComputedStyle(inp).opacity) < 0.1) { inp.dataset.uiDone = 'custom'; return true; } // input transparent posé sur un dessin de l'outil (🎨) : déjà habillé
        inp.dataset.uiDone = '1';
        const compact = inp.hasAttribute('data-ui-compact') || inp.offsetWidth < 40 || (inp.offsetWidth < 100 && inp.parentElement?.offsetWidth < 110) || !!inp.closest(COMPACT_IN) || /autre couleur/i.test(inp.title || '');
        const w = h('span', `ui-color is-native${compact ? ' is-compact' : ''}${!compact && inp.offsetWidth < 140 && inp.parentElement?.offsetWidth < 160 ? ' is-tight' : ''}`);
        const cs = getComputedStyle(inp); if (cs.marginLeft !== '0px') w.style.marginLeft = cs.marginLeft; if (cs.marginRight !== '0px') w.style.marginRight = cs.marginRight;
        if (cs.gridColumnStart !== 'auto') w.style.gridColumn = `${cs.gridColumnStart} / ${cs.gridColumnEnd}`;
        if (inp.style.width === '100%' || (inp.parentElement && /grid/.test(getComputedStyle(inp.parentElement).display) && !compact)) w.classList.add('is-wide');
        if (!compact && inp.offsetHeight >= 30) w.style.setProperty('--ui-ch', `${Math.min(46, inp.offsetHeight)}px`);
        inp.parentNode.insertBefore(w, inp); w.appendChild(inp); inp.classList.add('ui-color-native'); inp.tabIndex = -1;
        let picking = false;
        const paint = colorButton(w, {get: () => rawGet(inp), set: (v, final) => { rawSet(inp, (v || '#000000').slice(0, 7)); fire(inp, 'input'); if (final) fire(inp, 'change'); },
            disabled: () => inp.disabled, other: cb => { picking = true; try { inp.showPicker ? inp.showPicker() : inp.click(); } catch (_) { inp.click(); } setTimeout(() => { picking = false; }, 400); }});
        // un clic sur l'étiquette ouvre notre fenêtre plutôt que celle du système
        inp.addEventListener('click', e => { if (picking) return; e.preventDefault(); w.querySelector('.ui-color-btn')?.click(); });
        inp.addEventListener('input', paint); inp.addEventListener('change', () => { rememberColor(rawGet(inp)); paint(); });
        watchValue(inp, paint);
        new MutationObserver(paint).observe(inp, {attributes: true, attributeFilter: ['disabled']});
        return true;
    }

    /* ═════ C3 Curseurs ═════ */
    const NUM_RE = /^([-−+]?\d+(?:[.,]\d+)?)\s*(%|°|px|mm|cm|pt|ppp|dpi|ms|s|x|×)?$/i;
    const UNIT_WORDS = [[/\bppp\b|\bdpi\b/i, 'ppp'], [/\(\s*%\s*\)|\ben %|opacit|transparen|%/i, '%'], [/°|\bdegr|rotation|angle|inclinaison/i, '°'], [/\bmm\b|millim/i, 'mm'], [/\bpx\b|pixel/i, 'px']];
    const decimalsOf = s => { const t = String(s); return t.includes('.') ? Math.min(3, t.split('.')[1].length) : 0; };
    const numText = (v, d) => (Number.isFinite(v) ? v.toFixed(d).replace(/\.?0+$/, m => (d ? '' : m)).replace('.', ',') : '');
    function guessUnit(r, oldOut) {
        if (r.dataset.unit != null) return r.dataset.unit;
        const m = oldOut && oldOut.textContent.trim().match(NUM_RE); if (m && m[2]) return m[2] === 'dpi' ? 'ppp' : m[2];
        const lab = r.closest('label')?.textContent || (r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent) || r.getAttribute('aria-label') || r.title || r.previousElementSibling?.textContent || '';
        const hit = UNIT_WORDS.find(([re]) => re.test(lab)); if (hit && !(hit[1] === '%' && Number(r.max || 100) > 100 && !/%/.test(lab))) return hit[1];
        return '';
    }
    function findOldOut(r) {
        const c = []; let n = r.nextElementSibling; for (let i = 0; i < 3 && n; i++, n = n.nextElementSibling) c.push(n);
        const lab = r.closest('label'); if (lab) c.push(...lab.querySelectorAll('output'));
        if (r.parentElement && r.parentElement.children.length <= 2) { const s = r.parentElement.nextElementSibling; if (s) c.push(s); }
        return c.find(el => el !== r && !el.matches('input, select, textarea, button, label, details, div') && !el.querySelector('input, select, button') && (el.matches('output') || NUM_RE.test(el.textContent.trim().replace(/ /g, ' ')))) || null;
    }
    function bindRange(r, box, {factor = 1, unit = '', def} = {}) {
        const field = box.querySelector('input'), d = decimalsOf(Number(r.step) > 0 ? Number(r.step) * factor : 0.01);
        box.querySelector('.ui-num-unit').textContent = unit;
        const show = () => { if (document.activeElement !== field) field.value = numText(Number(rawGet(r)) * factor, d); };
        const commit = (val, final = true) => {
            const v = Number(String(val).replace(',', '.').replace('−', '-').replace(/[^\d.+-]/g, '')) / factor; if (!Number.isFinite(v)) { show(); return; }
            rawSet(r, String(Math.min(Number(r.max || 100), Math.max(Number(r.min || 0), v)))); fire(r, 'input'); if (final) fire(r, 'change');
            field.value = numText(Number(rawGet(r)) * factor, d);
        };
        ['input', 'change'].forEach(t => field.addEventListener(t, e => e.stopPropagation())); // la case ne parle qu'à son curseur
        field.addEventListener('change', () => commit(field.value));
        field.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commit(field.value); field.select(); }
            else if (e.key === 'Escape') { field.blur(); show(); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const st = (Number(r.step) > 0 ? Number(r.step) : 1) * (e.shiftKey ? 10 : 1); commit(Number(rawGet(r)) * factor + (e.key === 'ArrowUp' ? st : -st) * factor); field.select(); }
        });
        field.addEventListener('focus', () => field.select());
        field.addEventListener('blur', show);
        r.addEventListener('input', show); r.addEventListener('change', show);
        const start = def ?? r.dataset.default ?? r.getAttribute('value');
        if (start != null && start !== '') { r.addEventListener('dblclick', () => { rawSet(r, String(start)); fire(r, 'input'); fire(r, 'change'); show(); }); if (!r.title) r.title = 'Double-clic : revenir à la valeur de départ'; }
        watchValue(r, show);
        new MutationObserver(() => { field.disabled = r.disabled; }).observe(r, {attributes: true, attributeFilter: ['disabled']}); field.disabled = r.disabled;
        show();
    }
    const numBox = label => { const b = h('span', 'ui-num', `<input type="text" class="ui-num-input" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="${esc(label || 'Valeur')}"><span class="ui-num-unit"></span>`); return b; };
    function enhanceRange(r) {
        if (r.dataset.uiDone) return true;
        if (isOff(r)) { r.dataset.uiDone = 'off'; return true; }
        if (!shown(r)) return false;
        r.dataset.uiDone = '1';
        const sib = [r.previousElementSibling, r.nextElementSibling, r.nextElementSibling?.nextElementSibling];
        if (sib.some(s => s?.matches?.('input[type=number], .ui-num, input[type=text][inputmode=decimal]'))) { r.dataset.uiDone = 'has-number'; return true; } // l'outil a déjà sa case
        const old = findOldOut(r);
        let unit = guessUnit(r, old), factor = unit === '%' && Number(r.max || 100) <= 1 ? 100 : 1;
        const val = Number(rawGet(r));
        if (old && old.textContent.trim()) {
            const m = old.textContent.trim().replace(/ /g, ' ').match(NUM_RE), n = m ? Number(m[1].replace(',', '.').replace('−', '-')) : NaN;
            const tol = x => Math.max(Math.abs(Number(r.step) || 1) * x, Math.abs(val * x) * 0.02) + 1e-9;
            const f = Number.isFinite(n) ? [factor, 1, 100, 10, 0.1, 0.01].find(x => Math.abs(n - val * x) <= tol(x)) : undefined;
            if (f === undefined) { r.dataset.uiDone = 'other-scale'; return true; } // valeur affichée autrement : on n'y touche pas
            factor = f;
            if (m && !m[2] && unit === '%' && factor === 1 && Number(r.max || 100) <= 1) factor = 100; // 0 à 1 affiché brut → en %
        }
        const box = numBox(r.getAttribute('aria-label') || r.title || unit);
        if (old) { old.classList.add('ui-hide'); old.after(box); }
        else if (r.parentElement && !r.parentElement.matches('.ui-range') && /grid/.test(getComputedStyle(r.parentElement).display)) { const pair = h('span', 'ui-range-pair'); r.before(pair); pair.append(r, box); }
        else r.after(box);
        box.classList.add('is-auto');
        bindRange(r, box, {factor, unit});
        return true;
    }
    /** C3 — rangeField({label, min, max, step, value, unit, name, default}) → l'élément (.input = le curseur) */
    UI.rangeField = ({label = '', min = 0, max = 100, step = 1, value, unit = '', name = '', default: def} = {}) => {
        const w = h('label', 'ui-range');
        w.innerHTML = `${label ? `<span class="ui-range-lab">${esc(label)}</span>` : ''}<input type="range" min="${esc(min)}" max="${esc(max)}" step="${esc(step)}" value="${esc(value ?? def ?? min)}"${name ? ` name="${esc(name)}"` : ''} data-ui-done="1">`;
        const r = w.querySelector('input'), box = numBox(label); w.appendChild(box); w.input = r;
        bindRange(r, box, {factor: 1, unit, def: def ?? value});
        return w;
    };

    /* ═════ C4 Dates (texte libre, comme dans un acte) ═════ */
    const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const MONTH_KEYS = [['janv', 1], ['jan', 1], ['fevr', 2], ['fev', 2], ['mars', 3], ['mar', 3], ['avr', 4], ['mai', 5], ['juin', 6], ['juil', 7], ['aout', 8], ['sept', 9], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12], ['7bre', 9], ['8bre', 10], ['9bre', 11], ['xbre', 12], ['10bre', 12]];
    const REP = ['vendemiaire', 'brumaire', 'frimaire', 'nivose', 'pluviose', 'ventose', 'germinal', 'floreal', 'prairial', 'messidor', 'thermidor', 'fructidor', 'sansculottide'];
    const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const monthOf = w => { w = fold(w).replace(/\.$/, ''); if (/^\d{1,2}$/.test(w)) return Number(w); const k = MONTH_KEYS.find(([p]) => w.startsWith(p)); return k ? k[1] : 0; };
    const roman = s => { const m = String(s).toUpperCase(); if (/^\d+$/.test(m)) return Number(m); if (!/^[IVX]+$/.test(m)) return 0; const v = {I: 1, V: 5, X: 10}; let t = 0; for (let i = 0; i < m.length; i++) t += v[m[i]] < (v[m[i + 1]] || 0) ? -v[m[i]] : v[m[i]]; return t; };
    const toRoman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'][n] || String(n);
    // jours dans le mois ; avant 1583, calendrier julien : une année sur quatre est bissextile (29 février 1500 existe)
    const dim = (m, y) => m === 2 && y < 1583 ? (y % 4 === 0 ? 29 : 28) : new Date(Date.UTC(y, m, 0)).getUTCDate();
    const MIN_YEAR = 1; // la base range l'année des dates de l'an 1 à 2099 (api.php, event_year_and_converted)
    const NOW_Y = new Date().getFullYear();
    function oneDate(s) {
        s = s.trim().replace(/^le\s+/, ''); let m;
        const day = (d, mo, y) => {
            if (mo < 1 || mo > 12) return {error: `mois impossible : ${mo}`};
            if (d < 1 || d > dim(mo, y)) return {error: `date impossible : ${d} ${MONTHS[mo - 1]}${d <= 31 ? '' : ''}${mo === 2 && d === 29 ? ` ${y} (année non bissextile)` : ''}`};
            const wd = y >= 1583 ? ` (${DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]})` : '';
            return {label: `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`, extra: wd, y, k: y * 10000 + mo * 100 + d};
        };
        // calendrier républicain : « 12 thermidor an II », « an II »
        if ((m = s.match(/^(?:(\d{1,2}|1er)\s+([a-z]+)\s+)?(?:de\s+l')?an\s+([ivx]+|\d{1,2})$/))) {
            const y = roman(m[3]); if (!y || y > 14) return {error: `an ${m[3].toUpperCase()} : le calendrier républicain va de l’an I à l’an XIV`};
            if (!m[2]) return {label: `an ${toRoman(y)}`, extra: ` (calendrier républicain : de sept. ${1791 + y} à sept. ${1792 + y})`, y: 1792 + y, k: (1792 + y) * 10000};
            const mi = REP.findIndex(x => x.startsWith(fold(m[2]).slice(0, 4))), d = m[1] === '1er' ? 1 : Number(m[1]);
            if (mi < 0) return null;
            // jours complémentaires (sans-culottides) : 5, ou 6 les années sextiles (III, VII, XI)
            if (mi === 12 && d === 6 && ![3, 7, 11].includes(y)) return {error: `date impossible : 6e jour complémentaire de l’an ${toRoman(y)} (seules les années III, VII et XI en ont un 6e)`};
            if (d < 1 || d > (mi === 12 ? 6 : 30)) return {error: `date impossible : ${d} ${REP[mi]}`};
            const app = A(); let g = '';
            if (app.republicanToJdn && app.jdnToGregorian) { const gd = app.jdnToGregorian(app.republicanToJdn(y, mi + 1, d)); g = ` (${gd.day === 1 ? '1er' : gd.day} ${MONTHS[gd.month - 1]} ${gd.year})`; }
            return {label: `${d === 1 ? '1er' : d} ${(app.republicanMonths?.[mi] || REP[mi]).toLowerCase()} an ${toRoman(y)}`, extra: g, y: 1792 + y, k: (1792 + y) * 10000 + mi * 100 + d};
        }
        if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{3,4})$/))) return day(+m[1], +m[2], +m[3]);
        if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return day(+m[3], +m[2], +m[1]);
        if ((m = s.match(/^(\d{1,2})[\/.-](\d{4})$/))) { const mo = +m[1]; if (mo < 1 || mo > 12) return {error: `mois impossible : ${mo}`}; return {label: `${MONTHS[mo - 1]} ${m[2]}`, y: +m[2], k: +m[2] * 10000 + mo * 100}; }
        if ((m = s.match(/^(1er|\d{1,2})\s+([a-z0-9]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[2]); if (!mo) return null; return day(m[1] === '1er' ? 1 : +m[1], mo, +m[3]); }
        if ((m = s.match(/^([a-z0-9]+\.?)\s+(\d{3,4})$/))) { const mo = monthOf(m[1]); if (!mo || /^\d+$/.test(m[1])) return null; return {label: `${MONTHS[mo - 1]} ${m[2]}`, y: +m[2], k: +m[2] * 10000 + mo * 100}; }
        if ((m = s.match(/^(\d{3,4})$/))) return {label: m[1], extra: ' (l’année seulement)', y: +m[1], k: +m[1] * 10000};
        return null;
    }
    /** C4 — interprète une date écrite librement → {ok:true, html} | {ok:false, html} | null (vide) */
    UI.readDate = raw => {
        const s = fold(raw).trim().replace(/\s+/g, ' ').replace(/,/g, '');
        if (!s) return null;
        let low = 0; // une année avant l'an 1000 : comprise, mais la base ne la range pas encore
        const bad = t => ({ok: false, text: t}), good = (label, extra = '') => ({ok: true, label, extra, ...(low ? {warn: `année ${low} : l’app ne range pas encore les dates d’avant l’an ${MIN_YEAR} (le texte est gardé tel quel, mais il ne sert ni au tri, ni aux âges, ni aux frises)`} : {})});
        const check = d => { if (!d) return null; if (d.error) return d; if (d.y === 0 || d.y !== undefined && d.y !== null && Number(d.y) === 0) return {error: 'date impossible : l’an 0 n’existe pas (on passe de l’an 1 avant J.-C. à l’an 1)'}; if (d.y > NOW_Y) return {error: `date dans le futur : ${d.label}`}; if (d.y && d.y < MIN_YEAR) low = d.y; return d; };
        let m;
        // une heure après un jour précis : « 7 mai 1925 à 14 h 30 », « 12/08/2019 18:42:07 » (cartes de photos, frise)
        if (!/^(?:entre|de|du|vers|environ|avant|apres)\s/.test(s) && (m = s.match(/^(.+?)(?:\s+a|\s*t|\s)\s*(\d{1,2})\s*(?:h|:)\s*(?:(\d{1,2})\s*(?:min|mn|m|:)?\s*(?:(\d{1,2})\s*s?)?)?\s*$/))) {
            const d = check(oneDate(m[1]));
            if (d && !d.error && d.k % 100) {
                const hh = +m[2], mm = +(m[3] || 0), ss = +(m[4] || 0);
                if (hh > 23 || mm > 59 || ss > 59) return bad(`heure impossible : ${m[2]} h ${m[3] || '00'}${m[4] ? ` ${m[4]} s` : ''}`);
                return good(`${d.label} à ${hh} h ${String(mm).padStart(2, '0')}${ss ? ` ${String(ss).padStart(2, '0')} s` : ''}`, d.extra || '');
            }
            if (d?.error) return bad(d.error);
        }
        if ((m = s.match(/^(?:entre|de|du)\s+(.+?)\s+(?:et|a|au|-)\s+(.+)$/))) {
            const a = check(oneDate(m[1])), b = check(oneDate(m[2]));
            if (a?.error) return bad(a.error); if (b?.error) return bad(b.error);
            if (a && b) return a.k > b.k ? bad(`la première date est après la seconde (${a.label} / ${b.label})`) : good(`entre ${a.label} et ${b.label}`);
        }
        if ((m = s.match(/^(vers|environ|env\.?|circa|ca\.?|c\.|~)\s*(.+)$/))) { const d = check(oneDate(m[2])); if (d?.error) return bad(d.error); if (d) return good(`vers ${d.label}`, ` (environ, ± ${/^(\d{1,2}|1er)\s/.test(d.label) ? 'quelques jours' : /^[a-zéû]+\s\d/.test(d.label) ? 'quelques semaines' : '1 an'})`); }
        if ((m = s.match(/^(avant|av\.?)\s+(.+)$/))) { const d = check(oneDate(m[2])); if (d?.error) return bad(d.error); if (d) return good(`avant ${d.label}`); }
        if ((m = s.match(/^(apres|ap\.?|depuis)\s+(.+)$/))) { const d = check(oneDate(m[2])); if (d?.error) return bad(d.error); if (d) return good(`après ${d.label}`); }
        const d = check(oneDate(s)); if (d?.error) return bad(d.error); if (d) return good(d.label, d.extra || '');
        const p = A().parsedGenealogyDate?.(raw); if (p?.year) return bad(`je ne comprends que l’année : ${p.year}`);
        return bad('je ne comprends pas cette date (exemples : 7 mai 1925, 08/12/1960, vers 1784, entre 1880 et 1885, an II)');
    };
    const dateHelpHtml = r => (!r ? '' : r.ok ? `✓ Compris : <b>${esc(r.label)}</b>${esc(r.extra || '')}${r.warn ? `<br>⚠️ ${esc(r.warn.charAt(0).toUpperCase() + r.warn.slice(1))}` : ''}` : `⚠️ ${esc(r.text.charAt(0).toUpperCase() + r.text.slice(1))}`);
    function buildDate(inp, {calendar = true} = {}) {
        inp.dataset.uiDone = '1';
        const w = h('span', 'ui-date'), box = h('span', 'ui-date-box'), help = h('span', 'ui-date-help');
        help.setAttribute('aria-live', 'polite');
        inp.parentNode?.insertBefore(w, inp); box.appendChild(inp); w.append(box, help); inp.classList.add('ui-date-input');
        if (!inp.placeholder) inp.placeholder = '7 mai 1925, vers 1784, entre 1880 et 1885…';
        const upd = () => { const r = UI.readDate(rawGet(inp)); help.innerHTML = dateHelpHtml(r); help.className = `ui-date-help${r ? (r.ok && !r.warn ? ' is-ok' : ' is-warn') : ''}`; };
        if (calendar) {
            const b = h('button', 'ui-date-cal', '📅'); b.type = 'button'; b.title = 'Choisir sur un calendrier'; b.setAttribute('aria-label', b.title); b.tabIndex = -1;
            const cal = document.createElement('input'); cal.type = 'date'; cal.className = 'ui-native-date'; cal.tabIndex = -1; cal.setAttribute('aria-hidden', 'true'); cal.dataset.uiOff = '1';
            box.append(b, cal);
            b.addEventListener('click', () => { try { cal.showPicker ? cal.showPicker() : cal.click(); } catch (_) { cal.click(); } });
            cal.addEventListener('change', () => { const [y, mo, d] = (cal.value || '').split('-').map(Number); if (!y) return; rawSet(inp, `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`); upd(); fire(inp, 'input'); fire(inp, 'change'); });
            cal.addEventListener('input', e => e.stopPropagation());
        }
        inp.addEventListener('input', upd); watchValue(inp, upd); upd();
        return w;
    }
    /** C4 — dateField({name, value, placeholder, calendar}) → l'élément (.input = la case texte) */
    UI.dateField = ({name = '', value = '', placeholder = '', calendar = true} = {}) => {
        const inp = document.createElement('input'); inp.type = 'text'; inp.autocomplete = 'off'; if (name) inp.name = name; if (placeholder) inp.placeholder = placeholder; rawSet(inp, value);
        const holder = h('span'); holder.appendChild(inp); const w = buildDate(inp, {calendar}); w.remove(); w.input = inp; return w;
    };

    /* ═════ C6 Trier et voir la suite ═════ */
    const SORTS = [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']];
    /** C6 — sortBar({count, label, many, options, value, onChange, feminine, view}) → l'élément (.setCount(n), .select, .view)
     *  view : {key, value, onChange, what} ajoute « Liste | Fiches » juste avant « Trier » (H10). */
    UI.sortBar = ({count = 0, label = 'élément', many = '', options = null, extra = [], value = 'recent', onChange = null, feminine = false, view = null} = {}) => {
        const opts = (options || [...SORTS.map(([v, l]) => [v, feminine ? l.replace('récents', 'récentes').replace('anciens', 'anciennes') : l]), ...extra]).map(o => (Array.isArray(o) ? o : [o.value, o.label]));
        const w = h('div', 'ui-sortbar', `<span class="ui-sortbar-count"></span><label class="ui-sortbar-sort">Trier : <select>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`);
        w.select = w.querySelector('select');
        w.setCount = n => { w.querySelector('.ui-sortbar-count').textContent = plural(n, label, many); };
        w.setCount(count);
        w.select.addEventListener('change', () => onChange?.(w.select.value));
        if (view) { w.view = view.nodeType ? view : UI.viewToggle(view); UI.putViewToggle(w, w.view); }
        return w;
    };

    /* ═════ Liste | Fiches : l'affichage d'une liste, retenu pour chaque liste (H10) ═════
     * « Liste » = lignes compactes ou tableau (vignette, nom, ligne grise, date) ; « Fiches » = cartes avec une grande vignette. */
    const VIEW_PREFIX = 'lcnda-view:';
    /** viewOf(key, dflt) → 'list' | 'cards' (ce que cette liste montrait la dernière fois) */
    UI.viewOf = (key, dflt = 'list') => { try { const v = localStorage.getItem(VIEW_PREFIX + key); return v === 'cards' || v === 'list' ? v : dflt; } catch (_) { return dflt; } };
    UI.setView = (key, v) => { try { localStorage.setItem(VIEW_PREFIX + key, v === 'cards' ? 'cards' : 'list'); } catch (_) {} };
    /** viewToggle({key, value, onChange, what}) → le choix segmenté « Liste | Fiches » (.value, .set(v)).
     *  Avec key, le choix est retenu (localStorage « lcnda-view:<key> ») ; sans key, c'est à l'appelant de le retenir. */
    UI.viewToggle = ({key = '', value = null, onChange = null, what = 'éléments', dflt = 'list'} = {}) => {
        let cur = value === 'cards' || value === 'list' ? value : (key ? UI.viewOf(key, dflt) : dflt);
        const w = h('span', 'segmented ui-viewtoggle');
        w.setAttribute('role', 'group'); w.setAttribute('aria-label', `Affichage des ${what}`);
        w.innerHTML = `<button type="button" data-view="list" title="En liste : une ligne par élément (vignette, nom, détails, date)">Liste</button><button type="button" data-view="cards" title="En fiches : une carte par élément, avec une grande vignette">Fiches</button>`;
        const paint = () => w.querySelectorAll('button').forEach(b => { const on = b.dataset.view === cur; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        w.set = (v, silent = false) => { const nv = v === 'cards' ? 'cards' : 'list'; if (nv === cur) return; cur = nv; if (key) UI.setView(key, cur); paint(); if (!silent) onChange?.(cur); };
        Object.defineProperty(w, 'value', {get: () => cur});
        w.addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) { e.preventDefault(); e.stopPropagation(); w.set(b.dataset.view); } });
        paint();
        return w;
    };
    /** putViewToggle(bar, toggle) : pose « Liste | Fiches » juste avant « Trier » dans une barre C6 */
    UI.putViewToggle = (bar, toggle) => {
        if (!bar || !toggle) return toggle;
        const lab = bar.querySelector('.ui-sortbar-sort');
        bar.classList.add('has-view');
        if (lab) lab.before(toggle); else bar.appendChild(toggle);
        return toggle;
    };
    /* une carte ou une ligne commune : {thumb (html), name (texte), nameHtml, open (attributs du clic, ex. 'data-x="3"'), lines: [texte | {html}], date, actions (html), disabled, cls} */
    const itemLine = l => (l && typeof l === 'object' ? l.html : esc(l));
    const itemOpen = (it, cls, inner, tag = 'button') => (it.open ? `<button type="button" class="${cls}" ${it.open}${it.disabled ? ' disabled' : ''} title="Ouvrir « ${esc(it.name || '')} »">${inner}</button>` : `<${tag === 'button' ? 'span' : tag} class="${cls}">${inner}</${tag === 'button' ? 'span' : tag}>`);
    const itemName = (it, cls) => (it.nameHtml ? `<span class="${cls}">${it.nameHtml}</span>` : it.open ? `<button type="button" class="table-link ${cls}" ${it.open}${it.disabled ? ' disabled' : ''}>${esc(it.name || 'Sans titre')}</button>` : `<strong class="${cls}">${esc(it.name || 'Sans titre')}</strong>`);
    /** cardsHtml(items) → les fiches (grande vignette, nom, lignes grises, date, boutons) */
    UI.cardsHtml = (items = []) => `<div class="ui-cards">${items.map(it => `<article class="ui-card${it.disabled ? ' is-disabled' : ''}${it.cls ? ' ' + it.cls : ''}"${it.attrs ? ' ' + it.attrs : ''}>${itemOpen(it, 'ui-card-thumb', it.thumb || '<span class="ui-card-ico">•</span>')}<div class="ui-card-body">${itemName(it, 'ui-card-name')}${(it.lines || []).filter(l => l && (typeof l !== 'object' || l.html)).map(l => `<small class="muted">${itemLine(l)}</small>`).join('')}${it.date ? `<small class="muted ui-card-date">${esc(it.date)}</small>` : ''}</div>${it.actions ? `<div class="ui-card-act">${it.actions}</div>` : ''}</article>`).join('')}</div>`;
    /** rowsHtml(items) → la liste compacte (petite vignette, nom, ligne grise, date, boutons) */
    UI.rowsHtml = (items = []) => `<div class="ui-rows">${items.map(it => `<div class="ui-row${it.disabled ? ' is-disabled' : ''}${it.cls ? ' ' + it.cls : ''}"${it.attrs ? ' ' + it.attrs : ''}>${itemOpen(it, 'ui-row-thumb', it.thumb || '<span class="ui-card-ico">•</span>')}<div class="ui-row-main">${itemName(it, 'ui-row-name')}${(it.lines || []).filter(l => l && (typeof l !== 'object' || l.html)).length ? `<small class="muted">${(it.lines || []).filter(l => l && (typeof l !== 'object' || l.html)).map(itemLine).join(' · ')}</small>` : ''}</div>${it.date ? `<small class="muted ui-row-date">${esc(it.date)}</small>` : '<span></span>'}${it.actions ? `<div class="ui-row-act">${it.actions}</div>` : '<span></span>'}</div>`).join('')}</div>`;
    /** le tri d'une liste, retenu pour chaque liste (« lcnda-sort:<key> ») */
    UI.sortOf = (key, dflt = 'recent') => { try { return localStorage.getItem('lcnda-sort:' + key) || dflt; } catch (_) { return dflt; } };
    UI.setSort = (key, v) => { try { localStorage.setItem('lcnda-sort:' + key, v); } catch (_) {} };
    /** sortItems(rows, sort, {name, date}) → copie rangée : recent / old (date) ; az / za (nom) */
    UI.sortItems = (rows, sort, {name = r => r.name || r.title || '', date = r => r.updated_at || r.created_at || ''} = {}) => {
        const by = {recent: (a, b) => String(date(b) || '').localeCompare(String(date(a) || '')), old: (a, b) => String(date(a) || '').localeCompare(String(date(b) || '')),
            az: (a, b) => String(name(a) || '').localeCompare(String(name(b) || ''), 'fr', {sensitivity: 'base', numeric: true}), za: (a, b) => String(name(b) || '').localeCompare(String(name(a) || ''), 'fr', {sensitivity: 'base', numeric: true})}[sort];
        return by ? [...rows].sort(by) : [...rows];
    };
    /** itemsHtml(view, items) → l'un ou l'autre */
    UI.itemsHtml = (view, items) => (view === 'cards' ? UI.cardsHtml(items) : UI.rowsHtml(items));
    /** C6 — moreButton({remaining, step, onClick, feminine}) → le bouton « Voir les N suivants ↓ » (.update(remaining)) */
    UI.moreButton = ({remaining = 0, step = 20, onClick = null, feminine = false} = {}) => {
        const b = h('button', 'ui-more'); b.type = 'button';
        b.update = rest => { const n = Math.min(step, Math.max(0, rest)); b.hidden = n <= 0; b.textContent = n === 1 ? `Voir ${feminine ? 'la suivante' : 'le suivant'} ↓` : `Voir les ${n.toLocaleString('fr-FR')} ${feminine ? 'suivantes' : 'suivants'} ↓`; };
        b.update(remaining);
        b.addEventListener('click', () => onClick?.(b));
        return b;
    };

    /* ═════ H10 La barre commune des listes : 🔍 Chercher · Filtrer ▾ · Liste | Fiches · Trier : … ▾ ═════
     * Maquette : docs/design/messages-et-listes.html. Sous la barre : les filtres actifs en pastilles bleues « Femmes × » + « Tout effacer ».
     * Tout est retenu pour chaque liste (localStorage « lcnda-listbar:<key> »). Mode d'emploi : docs/UI.md. */
    const LB_PREFIX = 'lcnda-listbar:';
    let lbFocus = null;
    const lbEmpty = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
    const optList = f => (f.options || []).map(o => (Array.isArray(o) ? {value: String(o[0]), label: o[1], chip: o[2]} : {value: String(o.value), label: o.label, chip: o.chip}));
    const placeTitle = v => (v && typeof v === 'object' ? (v.title || v.name || '') : String(v || '').replace(/^txt:/, ''));
    /** listBar({key, search, filters, view, sort, count, onChange}) → l'élément (.state, .setCount(n), .adoptSort(barreC6), .setFilter(id, v), .clear(), .input) */
    UI.listBar = ({key = '', search = {}, filters = [], view = null, sort = null, count = null, onChange = null, remember = true} = {}) => {
        const saved = key && remember === true ? store.get(LB_PREFIX + key, null) : null; // remember: 'given' = les valeurs données gagnent (la liste range déjà ses réglages), mais la barre les écrit aussi
        const st = {q: '', filters: {}, view: 'list', sort: ''};
        filters.forEach(f => {
            let v = f.value ?? (f.type === 'check' && f.options ? [] : f.type === 'check' ? false : '');
            if (saved?.f && Object.prototype.hasOwnProperty.call(saved.f, f.id)) v = saved.f[f.id];
            if (f.type === 'check' && f.options && !Array.isArray(v)) v = lbEmpty(v) ? [] : [String(v)];
            if ((f.type === 'radio' || f.type === 'select') && f.options && v !== '' && !optList(f).some(o => o.value === String(v))) v = f.dflt ?? '';
            st.filters[f.id] = v;
        });
        if (search) st.q = saved?.q ?? search.value ?? '';
        if (sort && !sort.nodeType) { const opts = sort.options || []; st.sort = String(saved?.sort ?? sort.value ?? ''); if (opts.length && !opts.some(o => String(Array.isArray(o) ? o[0] : o.value) === st.sort)) st.sort = String(sort.value ?? (Array.isArray(opts[0]) ? opts[0][0] : opts[0].value)); }
        const w = h('div', 'ui-listbar');
        w.innerHTML = `<div class="ui-listbar-row"><span class="ui-listbar-search"></span><span class="ui-listbar-filter"></span><span class="ui-listbar-view"></span><span class="ui-listbar-sort"></span></div><div class="ui-listbar-active" hidden></div>`;
        const $ = s => w.querySelector(s);
        const save = () => { if (key && remember) store.set(LB_PREFIX + key, {q: st.q, f: st.filters, sort: st.sort, view: st.view}); };
        const emit = what => { save(); try { onChange?.(w.state, {what}); } catch (e) { console.error(e); } };
        Object.defineProperty(w, 'state', {get: () => ({q: st.q, filters: {...st.filters}, view: st.view, sort: st.sort})});
        /* 🔍 Chercher (C1) */
        if (search) {
            const sf = UI.searchField({placeholder: search.placeholder || 'Chercher…', value: st.q, delay: search.delay ?? 250, label: search.label || '', onInput: v => { if (v === st.q) return; st.q = v; lbFocus = {key, at: Date.now(), caret: sf.input.selectionStart}; paintActive(); emit('q'); }});
            sf.classList.add('ui-listbar-q'); $('.ui-listbar-search').appendChild(sf); w.input = sf.input;
        } else $('.ui-listbar-search').remove();
        /* Filtrer ▾ */
        const isActive = f => { const v = st.filters[f.id]; if (lbEmpty(v)) return false; if ((f.type === 'radio' || f.type === 'select') && String(v) === String(f.dflt ?? '')) return false; return true; };
        const chipsOf = f => {
            const v = st.filters[f.id]; if (!isActive(f)) return [];
            if (f.chip) { const c = f.chip(v); return (Array.isArray(c) ? c : [c]).filter(Boolean).map((t, i) => ({t, rm: () => (f.type === 'check' && f.options ? st.filters[f.id] = (st.filters[f.id] || []).filter((_, j) => j !== i) : st.filters[f.id] = f.type === 'check' && f.options ? [] : f.type === 'check' ? false : (f.dflt ?? ''))})); }
            if (f.type === 'check' && f.options) return (v || []).map(x => { const o = optList(f).find(o2 => o2.value === String(x)); return {t: o?.chip || o?.label || x, rm: () => { st.filters[f.id] = st.filters[f.id].filter(y => String(y) !== String(x)); }}; });
            if (f.type === 'check') return [{t: f.chipLabel || f.label, rm: () => { st.filters[f.id] = false; }}];
            if (f.type === 'radio' || f.type === 'select') { const o = optList(f).find(o2 => o2.value === String(v)); return [{t: o?.chip || `${f.label} : ${o?.label || v}`, rm: () => { st.filters[f.id] = f.dflt ?? ''; }}]; }
            if (f.type === 'place' || f.type === 'person' || f.kind) return [{t: `${f.chipPrefix ?? `${f.label} :`} ${placeTitle(v)}`.trim(), rm: () => { st.filters[f.id] = ''; }}];
            const dt = f.type !== 'date' ? v : /^\d{4}-\d\d-\d\d$/.test(String(v)) ? new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}) : (UI.readDate?.(String(v))?.label || v);
            return [{t: `${f.chipPrefix ?? `${f.label} :`} ${dt}`.trim(), rm: () => { st.filters[f.id] = ''; }}];
        };
        let fbtn = null;
        if (filters.length) {
            fbtn = h('button', 'ui-listbar-btn ui-listbar-fbtn'); fbtn.type = 'button'; fbtn.setAttribute('aria-haspopup', 'true');
            $('.ui-listbar-filter').appendChild(fbtn);
            fbtn.addEventListener('click', () => (openPop?.anchor === fbtn ? closePop() : openMenu()));
        } else $('.ui-listbar-filter').remove();
        const paintBtn = () => { if (!fbtn) return; const n = filters.filter(isActive).length; fbtn.innerHTML = `Filtrer ▾${n ? ` <b class="ui-listbar-n" aria-label="${n} actif${n > 1 ? 's' : ''}">${n}</b>` : ''}`; fbtn.classList.toggle('has-active', n > 0); fbtn.setAttribute('aria-expanded', String(openPop?.anchor === fbtn)); };
        const changed = (f, what = 'filter') => { paintActive(); emit(what); };
        function menuRow(f) {
            const v = st.filters[f.id], nm = `lb-${key || 'x'}-${f.id}`.replace(/[^\w-]/g, '_');
            if (f.type === 'check' && f.options) return optList(f).map(o => `<label class="checkbox-line ui-listbar-opt"><input type="checkbox" data-lb-f="${esc(f.id)}" value="${esc(o.value)}"${(v || []).map(String).includes(o.value) ? ' checked' : ''}> ${esc(o.label)}</label>`).join('');
            if (f.type === 'check') return `<label class="checkbox-line ui-listbar-opt"><input type="checkbox" data-lb-f="${esc(f.id)}"${v ? ' checked' : ''}${f.disabled?.(st.filters) ? ' disabled' : ''}> ${esc(f.text || f.label)}</label>`;
            if (f.type === 'radio') return optList(f).map(o => `<label class="checkbox-line ui-listbar-opt"><input type="radio" name="${nm}" data-lb-f="${esc(f.id)}" value="${esc(o.value)}"${String(v) === o.value ? ' checked' : ''}> ${esc(o.label)}</label>`).join('');
            if (f.type === 'select') return `<select class="ui-listbar-sel" data-lb-f="${esc(f.id)}" aria-label="${esc(f.label)}">${optList(f).map(o => `<option value="${esc(o.value)}"${String(v) === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
            if (f.type === 'place' || f.type === 'person' || f.kind) {
                const P = window.LCNDA_PICKER, kind = f.kind || f.type;
                if (!P?.pickerField) return `<input data-lb-f="${esc(f.id)}" value="${esc(placeTitle(v))}" placeholder="${esc(f.placeholder || '')}">`;
                const val = v && typeof v === 'object' && v.id ? {id: Number(v.id), title: v.title || '', kind} : v ? (typeof v === 'object' ? `txt:${placeTitle(v)}` : String(v).startsWith('txt:') || /^\d+$/.test(String(v)) ? String(v) : `txt:${v}`) : null;
                return `<div class="ui-listbar-pk" data-lb-pk="${esc(f.id)}">${P.pickerField({name: nm, hiddenName: false, kind, inline: true, allowFree: f.allowFree !== false, allowCreate: false, value: val, ...(f.picker || {})})}</div>`;
            }
            if (f.type === 'date') return `<input class="ui-listbar-in" data-lb-f="${esc(f.id)}" type="${f.native ? 'date' : 'text'}" value="${esc(v || '')}" placeholder="${esc(f.placeholder || '')}"${f.native ? '' : ' data-ui-date="nocal"'}>`;
            return `<input class="ui-listbar-in" data-lb-f="${esc(f.id)}" value="${esc(v || '')}" placeholder="${esc(f.placeholder || '')}">`;
        }
        function openMenu() {
            const box = h('div', 'ui-listbar-menu');
            box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Filtrer');
            const groups = []; filters.forEach(f => { const g = f.group || f.label; let gr = groups.find(x => x.g === g); if (!gr) groups.push(gr = {g, fs: []}); gr.fs.push(f); });
            box.innerHTML = groups.map(gr => `<div class="ui-listbar-group"><b>${esc(gr.g)}</b>${gr.fs.map(f => `<div class="ui-listbar-f" data-lb-row="${esc(f.id)}">${f.group && f.group !== f.label && f.type !== 'check' ? `<small>${esc(f.label)}</small>` : ''}${menuRow(f)}</div>`).join('')}</div>`).join('') + `<div class="ui-listbar-menu-foot"><button type="button" class="ui-listbar-clear" data-lb-clear>Tout effacer</button><button type="button" class="button small" data-lb-done>Fermer</button></div>`;
            const find = id => filters.find(f => f.id === id);
            const refreshDisabled = () => filters.forEach(f => { if (!f.disabled) return; const i = box.querySelector(`[data-lb-f="${CSS.escape(f.id)}"]`); if (i) { i.disabled = !!f.disabled(st.filters); if (i.disabled && st.filters[f.id]) { st.filters[f.id] = false; i.checked = false; } } });
            box.addEventListener('change', e => {
                const t = e.target, f = find(t.dataset?.lbF); if (!f) return;
                if (f.type === 'check' && f.options) st.filters[f.id] = [...box.querySelectorAll(`[data-lb-f="${CSS.escape(f.id)}"]:checked`)].map(i => i.value);
                else if (f.type === 'check') st.filters[f.id] = t.checked;
                else st.filters[f.id] = t.value.trim();
                refreshDisabled(); changed(f);
            });
            box.addEventListener('picker-change', e => {
                const host = e.target.closest?.('[data-lb-pk]'); const f = host && find(host.dataset.lbPk); if (!f) return;
                const it = e.detail.item; st.filters[f.id] = it ? (it.free ? `txt:${it.title}` : {id: Number(it.id), title: it.title || it.name || ''}) : '';
                changed(f);
            });
            box.addEventListener('click', e => {
                if (e.target.closest('[data-lb-done]')) { closePop(); fbtn.focus(); return; }
                if (e.target.closest('[data-lb-clear]')) { w.clear(); closePop(); fbtn.focus(); }
            });
            const pop = popup(fbtn, box, {onClose: paintBtn});
            pop.anchor = fbtn; pop.lbKey = key || null; paintBtn();
            setTimeout(() => box.querySelector('input, select, button')?.focus());
        }
        /* Liste | Fiches */
        if (view) {
            const vo = view.nodeType ? null : (view === true ? {} : view);
            const vt = view.nodeType ? view : UI.viewToggle({key: vo.key ?? key, value: vo.value ?? (saved?.view || null), dflt: vo.dflt || 'list', what: vo.what || 'éléments', onChange: v => { st.view = v; vo.onChange?.(v); emit('view'); }});
            st.view = vt.value; w.view = vt; $('.ui-listbar-view').appendChild(vt);
        } else $('.ui-listbar-view').remove();
        /* Trier : … ▾ */
        const sortSlot = $('.ui-listbar-sort');
        if (sort && !sort.nodeType) {
            const opts = (sort.options || []).map(o => (Array.isArray(o) ? o : [o.value, o.label]));
            sortSlot.innerHTML = `<label class="ui-sortbar-sort">Trier : <select>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === st.sort ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
            w.select = sortSlot.querySelector('select');
            w.select.addEventListener('change', () => { st.sort = w.select.value; sort.onChange?.(st.sort); emit('sort'); });
        }
        /** adoptSort(barreC6) : reprend « Trier » (et « Liste | Fiches ») d'une barre C6 déjà faite (ex. table._sortBar) ; elle se cache */
        w.adoptSort = bar => {
            if (!bar) { if (w._adopted) { sortSlot.replaceChildren(); sortSlot.remove(); w._adopted = false; w.select = null; } return w; }
            if (bar === w) return w;
            const lab = bar.querySelector('.ui-sortbar-sort'), vt = bar.querySelector('.ui-viewtoggle');
            if (lab) {
                sortSlot.replaceChildren(lab); w.select = lab.querySelector('select'); w._adopted = true; if (!sortSlot.parentNode) w.querySelector('.ui-listbar-row').appendChild(sortSlot);
                // le tri de la barre reprise est retenu aussi pour cette liste (et remis au prochain affichage)
                const sel = w.select;
                if (sel) {
                    if (!sel._lbHooked) { sel._lbHooked = true; sel.addEventListener('change', () => { st.sort = sel.value; w._sortKnown = true; save(); }); }
                    const want = w._sortKnown ? st.sort : String(saved?.sort ?? '');
                    w._sortKnown = true;
                    if (want && sel.value !== want && [...sel.options].some(o => o.value === want)) { sel.value = want; sel.dispatchEvent(new Event('change')); } else st.sort = sel.value;
                }
            }
            if (vt && !w.view) { let slot = $('.ui-listbar-view'); if (!slot) { slot = h('span', 'ui-listbar-view'); sortSlot.before(slot); } slot.replaceChildren(vt); w.view = vt; }
            const cnt = bar.querySelector('.ui-sortbar-count')?.textContent; if (cnt && !w._countSet) setCountText(cnt);
            bar.hidden = true; bar.classList.add('ui-listbar-adopted');
            const old = bar.setCount; bar.setCount = n => { old?.(n); setCountText(bar.querySelector('.ui-sortbar-count')?.textContent || ''); };
            return w;
        };
        /* pastilles des filtres actifs + « Tout effacer » */
        const act = $('.ui-listbar-active');
        const countEl = h('span', 'ui-listbar-count');
        const setCountText = t => { countEl.textContent = count === false ? '' : (t || ''); paintActive(); };
        w.setCount = (n, label = count?.label || 'élément', many = count?.many || '') => { w._countSet = true; setCountText(typeof n === 'number' ? plural(n, label, many) : String(n ?? '')); };
        function paintActive() {
            const chips = []; filters.forEach(f => chipsOf(f).forEach(c => chips.push({...c, f})));
            act.replaceChildren();
            if (countEl.textContent) act.appendChild(countEl);
            chips.forEach(c => { const b = h('button', 'ui-listbar-chip'); b.type = 'button'; b.title = 'Retirer ce filtre'; b.innerHTML = `${esc(c.t)} <span aria-hidden="true">×</span>`; b.addEventListener('click', () => { c.rm(); changed(c.f); const next = act.querySelector('.ui-listbar-chip'); (next || fbtn)?.focus(); }); act.appendChild(b); });
            if (chips.length > 1 || (chips.length && st.q)) { const b = h('button', 'ui-listbar-clearall'); b.type = 'button'; b.textContent = 'Tout effacer'; b.addEventListener('click', () => { w.clear(true); fbtn?.focus(); }); act.appendChild(b); }
            act.hidden = !act.childNodes.length;
            paintBtn();
        }
        /** setFilter(id, valeur, silent) ; clear(withSearch) remet tous les filtres (et la recherche si withSearch) */
        w.setFilter = (id, v, silent = false) => { if (!(id in st.filters)) return; st.filters[id] = v; paintActive(); if (silent) save(); else emit('filter'); };
        w.clear = (withSearch = false) => {
            filters.forEach(f => { st.filters[f.id] = f.type === 'check' && f.options ? [] : f.type === 'check' ? false : (f.dflt ?? ''); });
            if (withSearch && w.input && st.q) { st.q = ''; w.input.value = ''; }
            paintActive(); emit('clear');
        };
        if (sort && sort.nodeType) w.adoptSort(sort);
        if (!sortSlot.childNodes.length) sortSlot.remove();
        if (count && typeof count === 'object') w.setCount(count.n ?? count.count ?? 0, count.label, count.many);
        paintActive(); save();
        // une liste qui se redessine en entier : la barre neuve reprend le curseur dans « Chercher » et le menu Filtrer ouvert
        if (key && lbFocus?.key === key && Date.now() - lbFocus.at < 3000 && w.input) { const c = lbFocus.caret; setTimeout(() => { if (!w.isConnected || editable(document.activeElement)) return; w.input.focus(); try { w.input.setSelectionRange(c, c); } catch (_) {} }); }
        if (key && openPop?.lbKey === key && !openPop.anchor?.isConnected && fbtn) { closePop(); setTimeout(() => { if (w.isConnected && !openPop) openMenu(); }); }
        return w;
    };
    /** listBarState(key) → ce que la barre de cette liste retient ({q, f, sort, view}) ou null */
    UI.listBarState = key => store.get(LB_PREFIX + key, null);

    /* ═════ C7 Chargement et messages (HTML à insérer) ═════ */
    UI.spinner = (text = 'Chargement…') => `<div class="ui-spinner" role="status"><span class="ui-spin" aria-hidden="true"></span><span>${esc(text)}</span></div>`;
    UI.skeleton = (lines = 3) => `<div class="ui-skeleton" aria-hidden="true">${Array.from({length: Math.max(1, lines)}, (_, i) => `<div class="ui-skel" style="width:${[82, 65, 74, 58, 90, 70][i % 6]}%"></div>`).join('')}</div>`;
    const NOTICE = {info: 'ℹ️', warn: '⚠️', error: '⛔', ok: '✓'};
    UI.notice = (kind = 'info', text = '') => { const k = NOTICE[kind] ? kind : 'info'; return `<div class="ui-notice ui-notice-${k}" role="${k === 'error' ? 'alert' : 'status'}"><span class="ui-notice-ico" aria-hidden="true">${NOTICE[k]}</span><span>${esc(text)}</span></div>`; };

    /* ═════ C8 Aide « ? » ═════ */
    async function openFaq(question) {
        const app = A(); if (!app.state || !app.setModule) return;
        app.state.maintenanceTab = 'faq'; await app.setModule('maintenance');
        for (let i = 0; i < 30; i++) { const q = document.querySelector('[data-faq-q]'); if (q) { q.value = question ?? ''; fire(q, 'input'); q.scrollIntoView({block: 'center'}); return; } await new Promise(r => setTimeout(r, 100)); }
    }
    UI.openFaq = openFaq;
    function showHelp(btn) {
        if (openPop && openPop.el._uiFor === btn) { closePop(); return; }
        const text = btn.dataset.text || '', faq = btn.dataset.faq || '';
        const bub = h('div', 'ui-bubble', `<p>${esc(text)}</p>${faq ? '<a href="#" class="ui-bubble-more" data-ui-faq>En savoir plus (FAQ) →</a>' : ''}`); bub._uiFor = btn; bub.setAttribute('role', 'tooltip');
        const pop = popup(btn, bub);
        bub.querySelector('[data-ui-faq]')?.addEventListener('click', e => {
            e.preventDefault();
            if (btn.closest('dialog')) { // dans une fenêtre : la réponse s'affiche ici, sans perdre le travail en cours
                const hit = window.LCNDA_EXT?.faqSearch?.(faq)?.[0];
                if (hit) { e.target.replaceWith(Object.assign(h('div', 'ui-bubble-faq', `<b>${esc(hit.q)}</b><p>${esc(hit.a)}</p>`))); pop.place(); return; }
            }
            pop.close(); openFaq(faq);
        });
    }
    /** C8 — helpTip(text, faqQuestion) → le petit bouton « ? » */
    UI.helpTip = (text = '', faqQuestion = '') => {
        const b = h('button', 'ui-help', '?'); b.type = 'button'; b.dataset.text = text; if (faqQuestion) b.dataset.faq = faqQuestion;
        b.title = 'Aide'; b.setAttribute('aria-label', `Aide : ${text}`);
        b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); showHelp(b); });
        return b;
    };
    function enhanceHelp(el) {
        if (el.dataset.uiHelpDone || isOff(el)) return; el.dataset.uiHelpDone = '1';
        const b = UI.helpTip(el.dataset.help, el.dataset.helpFaq || '');
        if (/^(INPUT|SELECT|TEXTAREA|IMG|BUTTON)$/.test(el.tagName)) el.after(b); else el.appendChild(b);
    }

    /* ═════ E1 Barre du haut des éditeurs ═════ */
    const btnSpec = (v, def) => (v === true ? def : typeof v === 'string' ? {...def, attrs: v} : v ? {...def, ...v} : null);
    /** E1 — editorTopbar({icon, name, nameAttrs, menus, undo, status, buttons:{customize, export, save, full, close}}) → HTML */
    UI.editorTopbar = ({icon = '', name = '', nameAttrs = '', menus = [], undo = true, status = 'saved', extra = '', buttons = {}} = {}) => {
        const b = buttons, B = (s, cls, txt, title) => (s ? `<button type="button" class="${cls}" ${s.attrs || ''} title="${esc(s.title || title)}"${s.shortcut ? ` data-shortcut="${esc(s.shortcut)}"` : ''}>${s.html || esc(s.label || txt)}</button>` : '');
        const cz = btnSpec(b.customize, {attrs: 'data-ui-cmd="customize"'}), ex = btnSpec(b.export, {attrs: 'data-ui-cmd="export"'}), sv = btnSpec(b.save, {attrs: 'data-ui-cmd="save"', shortcut: '⌘S'}), fu = btnSpec(b.full, {attrs: 'data-ui-cmd="full"'}), cl = btnSpec(b.close, {attrs: 'data-ui-cmd="close"'});
        return `<header class="ui-topbar">${icon ? `<span class="ui-topbar-icon" aria-hidden="true">${esc(icon)}</span>` : ''}<input class="ui-topbar-name" value="${esc(name)}" maxlength="200" aria-label="Nom" ${nameAttrs}>
            ${menus.length ? `<nav class="ui-topbar-menus">${menus.map(m => (typeof m === 'string' ? `<button type="button" class="ui-topbar-menu" data-ui-menu="${esc(m)}">${esc(m)}</button>` : m.html || `<button type="button" class="ui-topbar-menu" ${m.attrs || ''}>${esc(m.label)}</button>`)).join('')}</nav>` : ''}
            ${undo ? '<span class="ui-topbar-hist"><button type="button" class="icon-button small" data-ui-cmd="undo" title="Annuler" data-shortcut="⌘Z">↶</button><button type="button" class="icon-button small" data-ui-cmd="redo" title="Rétablir" data-shortcut="⇧⌘Z">↷</button></span>' : ''}
            ${extra}<span class="ui-topbar-spacer"></span><span class="ui-status" data-ui-status>${status ? statusHtml(status) : ''}</span>
            ${B(cz, 'button small secondary', '⚙️ Personnaliser', 'Ranger, montrer ou cacher les boutons')}${B(ex, 'button small secondary', '⤓ Exporter ▾', 'Exporter (PDF, image, impression…)')}${B(sv, 'button small', '💾 Enregistrer', 'Enregistrer')}${B(fu, 'icon-button', '⛶', 'Plein écran')}${B(cl, 'icon-button', '×', 'Fermer')}</header>`;
    };
    const STATUS = {saved: ['is-saved', '✓ Enregistré'], dirty: ['is-dirty', '• modifié'], saving: ['is-saving', 'Enregistrement…'], error: ['is-error', '⚠️ Pas enregistré']};
    const statusHtml = st => { const s = STATUS[st] || [`is-${st}`, st]; return `<span class="ui-status-txt ${s[0]}">${st === 'saving' ? '<span class="ui-spin" aria-hidden="true"></span>' : ''}${esc(s[1])}</span>`; };
    /** E1 — savedStatus(el, 'saved'|'dirty'|'saving'|'error') : « ✓ Enregistré » toujours au même endroit, sans toast */
    UI.savedStatus = (el, st = 'saved') => { const t = el?.matches?.('[data-ui-status]') ? el : el?.querySelector?.('[data-ui-status]') || el; if (t) { t.classList.add('ui-status'); t.innerHTML = statusHtml(st); } };
    /** E1 — harmonizeTopbar(bar) : remet dans l'ordre validé ✓ Enregistré · ⚙️ · ⤓ Exporter · 💾 Enregistrer · ⛶ · × (les boutons gardent leurs écouteurs) */
    UI.harmonizeTopbar = bar => {
        if (!bar || isOff(bar)) return [];
        // les boutons rangés dans un menu (Fichier…, ⤓ Exporter ▾) ne comptent pas : seulement ceux posés dans la barre
        const inMenu = e => !!e.parentElement?.closest('nav, [role=menu], [class*=-menu], [class*=menus], details');
        const all = [...bar.querySelectorAll('*')].filter(e => (e.matches('details') ? !e.parentElement?.closest('details') : !inMenu(e)));
        const txt = e => (e.textContent || '').trim(), at = e => [...e.attributes].map(a => `${a.name}=${a.value}`).join(' ');
        const find = test => all.find(e => test(e, txt(e), at(e)));
        const status = find((e, t, a) => !e.matches('button, details, summary, input') && (e.matches('[data-ui-status]') || /status/i.test(a)));
        const custom = find((e, t, a) => e.matches('button') && (/data-tb-config|data-ui-cmd=customize/.test(a) || /^⚙️?\s*Personnaliser/.test(t)));
        const exp = find((e, t, a) => (e.matches('details') && /^\s*(⤓|⬇️?|📤)\s*Export/i.test(e.querySelector('summary')?.textContent || '')) || (e.matches('button') && (/data-ui-cmd=export/.test(a) || /^(⤓|⬇️?|📤)\s*Export/i.test(t))));
        const save = find((e, t, a) => e.matches('button') && (/=save\b|data-ui-cmd=save/.test(a) || /^💾\s*Enregistrer$/.test(t)));
        const full = find((e, t, a) => e.matches('button') && (/data-full-toggle|data-ui-cmd=full/.test(a) || t === '⛶'));
        const close = find((e, t, a) => e.matches('button') && (/=close\b|data-ui-cmd=close|data-close/.test(a) || t === '×' || t === '✕'));
        const order = [status, custom, exp, save, full, close].filter(Boolean);
        if (!order.length) return [];
        let sp = bar.querySelector(':scope > .ui-topbar-spacer, :scope > .spacer, :scope > [class$=-spacer]');
        if (!sp) { sp = h('span', 'ui-topbar-spacer'); bar.appendChild(sp); }
        bar.appendChild(sp);
        order.forEach(e => { bar.appendChild(e); });
        bar.classList.add('ui-topbar-harmonized');
        if (exp) { const ex = exp.matches('details') ? exp.querySelector('summary') : exp; if (ex && !/▾/.test(ex.textContent)) ex.append(' ▾'); }
        return order;
    };

    /* ═════ E2 Sections repliables du panneau de droite ═════ */
    const SEC_KEY = 'genealogie-ui-sections';
    /** E2 — panelSection({title, open, key, body}) → HTML ; l'outil retient les sections ouvertes (par clé) */
    UI.panelSection = ({title = '', open = true, key = '', body = ''} = {}) => {
        const saved = key ? store.get(SEC_KEY, {})?.[key] : undefined, isOpen = saved === undefined ? open : !!saved;
        return `<details class="ui-section"${key ? ` data-ui-section="${esc(key)}"` : ''}${isOpen ? ' open' : ''}><summary>${esc(title)}</summary><div class="ui-section-body">${body}</div></details>`;
    };
    document.addEventListener('toggle', e => { const d = e.target; if (!d?.matches?.('details[data-ui-section]')) return; const all = store.get(SEC_KEY, {}) || {}; all[d.dataset.uiSection] = d.open; store.set(SEC_KEY, all); }, true);

    /* ═════ E3 La fenêtre d'export unique ═════ */
    const FORMATS = {pdf: ['📄 PDF', 'imprimer, envoyer', 'pdf'], png: ['🖼 PNG', 'transparent', 'png'], jpg: ['📷 JPG', 'léger', 'jpg'], svg: ['✒ SVG', 'dessin', 'svg'], print: ['🖨 Imprimer', 'tout de suite', ''], file: ['💾 Fichier', 'de l’outil', 'json']};
    /** E3 — openExportDialog({title, formats:[{id, label, hint, ext, run}], defaultName, preview, info, bleed, quality, saveCopy, copyChecked}) → Promise<{format,…}|null>
     *  saveCopy : montre la case « Ranger aussi une copie dans les médias » ; décochée sauf copyChecked (l'export est lié à une fiche ou un média) */
    UI.openExportDialog = ({title = 'Exporter', formats = [], defaultName = '', preview = null, info = '', bleed = false, quality = true, saveCopy = false, copyChecked = false, value = ''} = {}) => new Promise(resolve => {
        const fm = formats.map(f => { const d = FORMATS[f.id] || [f.label || f.id, '', f.ext || '']; return {...f, label: f.label || d[0], hint: f.hint ?? d[1], ext: f.ext ?? d[2]}; });
        if (!fm.length) { resolve(null); return; }
        const safe = n => (A().safeExportFilename ? A().safeExportFilename(n, 'export') : String(n || 'export').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export');
        let cur = fm.find(f => f.id === value) || fm[0], base = safe(defaultName || title);
        const dlg = h('dialog', 'modal ui-export');
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">EXPORTER</span><h2>⤓ ${esc(title)}</h2></div><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="ui-export-body"><div class="ui-export-main"><div class="ui-export-formats" role="radiogroup" aria-label="Format">${fm.map(f => `<button type="button" role="radio" class="ui-export-fmt" data-fmt="${esc(f.id)}">${esc(f.label)}<small>${esc(f.hint)}</small></button>`).join('')}</div>
            <div data-ui-q></div>
            ${bleed ? '<label class="checkbox-line ui-export-check" data-ui-bleedrow><input type="checkbox" data-ui-bleed> <span data-help="La marge de 3 à 5 mm qui sera coupée par l’imprimeur, pour que les images aillent jusqu’au bord." data-help-faq="fond perdu">Fond perdu et traits de coupe (imprimeur)</span></label>' : ''}
            <div data-ui-namerow><span class="ui-export-lab">Nom du fichier</span><span class="ui-export-name"><input type="text" class="ui-export-name-input" data-ui-name spellcheck="false" aria-label="Nom du fichier"><span data-ui-ext></span></span></div>
            ${saveCopy ? `<label class="checkbox-line ui-export-check"><input type="checkbox" data-ui-copy${copyChecked ? ' checked' : ''}> Ranger aussi une copie dans les médias</label>` : ''}
            <div data-ui-err></div></div>
            <div class="ui-export-side">${preview ? `<div class="ui-export-prev" data-ui-prev>${UI.spinner('Aperçu…')}</div>` : ''}${info ? `<small class="ui-export-info">${esc(info)}</small>` : ''}</div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-ui-x>Annuler</button><button type="submit" class="button" data-ui-go></button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), nameIn = $('[data-ui-name]');
        nameIn.value = base;
        let q = null;
        if (quality) { q = UI.rangeField({label: 'Qualité', min: 72, max: 600, step: 1, value: typeof quality === 'number' ? quality : 300, unit: 'ppp', default: 300}); $('[data-ui-q]').appendChild(q); }
        const pick = id => {
            cur = fm.find(f => f.id === id) || cur;
            dlg.querySelectorAll('.ui-export-fmt').forEach(b => { const on = b.dataset.fmt === cur.id; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
            $('[data-ui-ext]').textContent = cur.ext ? `.${cur.ext}` : '';
            $('[data-ui-namerow]').hidden = !cur.ext;
            if (q) q.hidden = ['svg', 'file'].includes(cur.id) || cur.quality === false;
            const br = $('[data-ui-bleedrow]'); if (br) br.hidden = ['svg', 'file'].includes(cur.id);
            $('[data-ui-go]').textContent = cur.id === 'print' ? '🖨 Imprimer' : `⤓ Exporter en ${cur.label.replace(/^\S+\s/, '')}`;
        };
        pick(cur.id);
        dlg.addEventListener('click', e => { const f = e.target.closest('.ui-export-fmt'); if (f) pick(f.dataset.fmt); if (e.target.closest('[data-ui-x]')) dlg.close(); });
        let result = null;
        $('form').addEventListener('submit', async e => {
            e.preventDefault();
            const go = $('[data-ui-go]'), err = $('[data-ui-err]'), label = go.textContent;
            const opts = {format: cur.id, quality: q ? Number(q.input.value) : null, bleed: !!$('[data-ui-bleed]')?.checked, saveCopy: !!$('[data-ui-copy]')?.checked, filename: cur.ext ? `${safe(nameIn.value || base)}.${cur.ext}` : ''};
            go.disabled = true; go.innerHTML = `<span class="ui-spin" aria-hidden="true"></span>${esc(label)}`; err.innerHTML = '';
            try { await cur.run?.(opts); result = opts; dlg.close(); }
            catch (x) { err.innerHTML = UI.notice('error', `Impossible d’exporter : ${x?.message || x}`); go.disabled = false; go.textContent = label; }
        });
        dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
        dlg.showModal();
        $('.ui-export-fmt.is-active')?.focus();
        if (preview) Promise.resolve().then(preview).then(p => { const box = $('[data-ui-prev]'); if (!box) return; box.innerHTML = ''; if (p instanceof HTMLElement) box.appendChild(p); else if (p) box.innerHTML = `<img alt="Aperçu" src="${esc(p)}">`; else box.textContent = 'aperçu'; }).catch(() => { const box = $('[data-ui-prev]'); if (box) box.textContent = 'Pas d’aperçu'; });
    });

    /* ═════ E4 Déposer un fichier ═════ */
    const accepts = (f, accept) => {
        if (!accept) return true;
        return accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).some(a => (a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? (f.type || '').startsWith(a.slice(0, -1)) : f.type === a));
    };
    /** E4 — bindFileDrop(el, onFiles, {accept, paste}) : la zone s'allume en bleu au survol d'un fichier ; ⌘V colle un fichier */
    /** 🤏 bindPinch(el, onZoom(facteur, x, y)) : zoom à deux doigts dans un outil (téléphone, tablette). La page, elle, ne
     *  s'agrandit plus (touch-action:none). Pendant le pincement, les mouvements ne vont pas à l'outil (pas de trait parasite). */
    UI.bindPinch = (el, onZoom, {touchAction = 'none'} = {}) => {
        if (!el || el._uiPinch) return el; el._uiPinch = true; if (touchAction) el.style.touchAction = touchAction;
        const pts = new Map(); let last = 0;
        const gap = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
        const mid = () => { const [a, b] = [...pts.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; };
        el.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); if (pts.size === 2) { last = gap(); e.stopImmediatePropagation(); } }, true);
        el.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
            if (pts.size < 2) return; e.stopImmediatePropagation(); e.preventDefault();
            const g = gap(); if (last > 0 && g > 0 && Math.abs(g - last) > 1) { const m = mid(); try { onZoom(g / last, m.x, m.y); } catch (err) { console.error(err); } last = g; }
        }, true);
        const up = e => { if (!pts.has(e.pointerId)) return; const pinching = pts.size >= 2; pts.delete(e.pointerId); if (pts.size < 2) last = 0; if (pinching) e.stopImmediatePropagation(); };
        el.addEventListener('pointerup', up, true); el.addEventListener('pointercancel', up, true);
        return el;
    };
    /** pour les outils qui zooment déjà à la molette (ctrl + molette = zoom) : le pincement passe par là */
    UI.pinchAsWheel = (el, k = 0.002) => UI.bindPinch(el, (f, x, y) => { el.dispatchEvent(new WheelEvent('wheel', {deltaY: -Math.log(f) / k, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true})); });
    /* les écoutes « coller » posées sur le document pour une zone de dépôt : retirées dès que la zone a quitté la page
     * (éditeur fermé), sinon elles gardaient en mémoire tout l'éditeur fermé (un de plus à chaque ouverture) */
    const pasteZones = new Set(); let pasteSweepT = 0, pasteObs = null;
    const sweepPaste = () => { pasteSweepT = 0; pasteZones.forEach(z => { if (z.el.isConnected) { z.seen = true; return; } if (z.seen) { document.removeEventListener('paste', z.fn); pasteZones.delete(z); } }); if (!pasteZones.size && pasteObs) { pasteObs.disconnect(); pasteObs = null; } };
    const watchPaste = z => { pasteZones.add(z); z.seen = z.el.isConnected; if (!z.seen) setTimeout(() => { if (z.el.isConnected) z.seen = true; }, 0); if (!pasteObs) { pasteObs = new MutationObserver(() => { if (!pasteSweepT) pasteSweepT = setTimeout(sweepPaste, 300); }); pasteObs.observe(document.documentElement, {childList: true, subtree: true}); } };
    UI.bindFileDrop = (el, onFiles, {accept = '', paste = true, signal = null} = {}) => {
        if (!el || el._uiDrop) return el; el._uiDrop = true;
        const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
        let depth = 0;
        const send = list => { const files = [...(list || [])].filter(f => accepts(f, accept)); if (files.length) onFiles(files); else if (list?.length) toast('Ce type de fichier n’est pas accepté ici.', 'error'); };
        el.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.classList.add('is-drag-over'); });
        el.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        el.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.classList.remove('is-drag-over'); });
        el.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove('is-drag-over'); send(e.dataTransfer.files); });
        if (paste) {
            const onPaste = e => {
                if (!el.isConnected) { document.removeEventListener('paste', onPaste); pasteZones.forEach(z => { if (z.fn === onPaste) pasteZones.delete(z); }); return; }
                if (!shown(el) || editable(e.target) && !el.contains(e.target)) return;
                const top = topLayer(); if (top !== document && !top.contains(el)) return; // seulement la fenêtre du dessus
                const files = [...(e.clipboardData?.files || [])]; if (!files.length) return;
                e.preventDefault(); send(files);
            };
            document.addEventListener('paste', onPaste, signal ? {signal} : undefined);
            watchPaste({el, fn: onPaste});
        }
        return el;
    };
    /** E4 — dropZone({accept, multiple, text, hint, onFiles}) → la zone « 📁 Glisse ici… » (clic = choisir sur l'ordinateur) */
    UI.dropZone = ({accept = '', multiple = true, text = '', hint = 'Il entre dans les médias de l’app et se place dans l’outil.', onFiles = () => {}} = {}) => {
        const z = h('label', 'ui-drop');
        z.innerHTML = `<input type="file" hidden${accept ? ` accept="${esc(accept)}"` : ''}${multiple ? ' multiple' : ''}><span class="ui-drop-txt">${text ? esc(text) : '📁 <b>Glisse ici</b> une photo, un son ou un document, <b>colle-le</b> (⌘V) ou <b>choisis-le</b> sur l’ordinateur'}</span>${hint ? `<small>${esc(hint)}</small>` : ''}`;
        z.tabIndex = 0;
        const inp = z.querySelector('input');
        inp.addEventListener('change', () => { const f = [...inp.files]; if (f.length) onFiles(f); inp.value = ''; });
        z.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
        UI.bindFileDrop(z, onFiles, {accept});
        return z;
    };

    /* ═════ E5 Choisir une police ═════ */
    const RECENT_F = 'genealogie-recent-fonts';
    const APP_FONTS = ['Georgia', 'Times New Roman', 'Garamond', 'Palatino Linotype', 'Baskerville', 'Didot', 'Book Antiqua', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Gill Sans', 'Futura', 'Optima', 'Avenir', 'Courier New', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', 'Lucida Calligraphy', 'serif', 'sans-serif', 'cursive', 'monospace'];
    const COMMON_FONTS = ['Academy Engraved LET', 'American Typewriter', 'Andale Mono', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Avenir Next', 'Baskerville Old Face', 'Big Caslon', 'Bodoni 72', 'Bodoni MT', 'Bookman Old Style', 'Bradley Hand', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Chalkboard', 'Chalkduster', 'Charter', 'Cochin', 'Comic Sans MS', 'Consolas', 'Constantia', 'Copperplate', 'Corbel', 'DejaVu Sans', 'DejaVu Serif', 'Didot', 'EB Garamond', 'Franklin Gothic Medium', 'Geneva', 'Gill Sans MT', 'Hoefler Text', 'Impact', 'Iowan Old Style', 'Lato', 'Liberation Sans', 'Liberation Serif', 'Lucida Grande', 'Lucida Handwriting', 'Lucida Sans', 'Marker Felt', 'Menlo', 'Monaco', 'Noteworthy', 'Noto Sans', 'Noto Serif', 'Old English Text MT', 'Open Sans', 'Papyrus', 'Perpetua', 'Roboto', 'Rockwell', 'Savoye LET', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Seravek', 'Skia', 'Tahoma', 'Ubuntu', 'Zapfino'];
    let fontCache = null;
    function fontExists(name) {
        const c = fontExists.c || (fontExists.c = document.createElement('canvas').getContext('2d')), t = 'mmmmmmmmmwwwwwwwlli1ÉgQ';
        return ['monospace', 'serif', 'sans-serif'].some(base => { c.font = `72px ${base}`; const w0 = c.measureText(t).width; c.font = `72px "${name}", ${base}`; return c.measureText(t).width !== w0; });
    }
    // Les polices de l'ordinateur : API queryLocalFonts (Chrome, Edge, l'app Electron) si elle est là et permise ;
    // sinon (ou en plus) les polices courantes réellement installées (test de largeur). Une ligne par famille.
    async function computerFonts(ask = false) {
        if (fontCache?.full) return fontCache; // liste complète déjà lue ; sinon on relit (la permission a pu changer)
        let local = [], state = typeof window.queryLocalFonts === 'function' ? 'prompt' : 'none';
        if (state !== 'none') {
            let ok = ask;
            if (!ok) { try { const st = (await navigator.permissions?.query({name: 'local-fonts'}))?.state; if (st) state = st; ok = st === 'granted'; } catch (_) {} }
            // demandé sur un clic : queryLocalFonts est appelé tout de suite (avant tout « await »), sinon le navigateur refuse
            if (ok) { try { const seen = new Map(); for (const f of await window.queryLocalFonts()) { const fam = cleanFont(String(f?.family || '')); if (fam && !seen.has(fam.toLowerCase())) seen.set(fam.toLowerCase(), fam); } local = [...seen.values()]; state = 'granted'; } catch (e) { state = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'error'; } }
        }
        const appLow = new Set(APP_FONTS.map(f => f.toLowerCase())), all = new Map();
        for (const f of [...local, ...COMMON_FONTS.filter(f => !local.length && fontExists(f))]) if (!appLow.has(f.toLowerCase()) && !all.has(f.toLowerCase())) all.set(f.toLowerCase(), f);
        fontCache = [...all.values()].sort((a, b) => a.localeCompare(b, 'fr'));
        fontCache.full = local.length > 0; fontCache.state = state;
        return fontCache;
    }
    /** un nom de police sûr partout (attribut, style font-family) : ni guillemets, ni \, ni ; { }, ni retour à la ligne */
    const cleanFont = f => (typeof f === 'string' ? f.replace(/["'<>\\;{}\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '');
    UI.rememberFont = f => { f = cleanFont(f); if (!f) return; const r = store.get(RECENT_F, []); store.set(RECENT_F, [f, ...(Array.isArray(r) ? r : []).filter(x => x !== f)].slice(0, 8)); };
    /** E5 — openFontPicker({value, sample}) → Promise<nom de la police | null> */
    UI.openFontPicker = ({value = '', sample = 'Louise Borie', title = 'Choisir une police'} = {}) => new Promise(resolve => {
        const dlg = h('dialog', 'modal small-modal ui-fontpick');
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">POLICE</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-ui-x aria-label="Fermer">×</button></div>
            <div class="ui-fontpick-body"><div data-ui-fq></div><div class="ui-fontpick-list" role="listbox" tabindex="-1" data-ui-fl>${UI.spinner('Les polices de l’ordinateur…')}</div><div class="ui-fontpick-more" data-ui-fmore></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-ui-x>Annuler</button><button type="submit" class="button" data-ui-ok>Choisir</button></div></form>`;
        document.body.appendChild(dlg);
        const $ = s => dlg.querySelector(s), list = $('[data-ui-fl]');
        const sf = UI.searchField({placeholder: 'Chercher une police…', delay: 60, onInput: () => draw()}); $('[data-ui-fq]').appendChild(sf);
        let chosen = value, comp = [], answer = null;
        const row = (f, tag) => `<div class="ui-font${f === chosen ? ' on' : ''}" role="option" data-f="${esc(f)}" aria-selected="${f === chosen}"><span style="font-family:'${esc(cleanFont(f))}', ${/script|hand|chancery|roundhand|zapfino|calligraph|brush/i.test(f) ? 'cursive' : 'serif'}">${esc(f)} — ${esc(sample)}</span><small>${tag}</small></div>`;
        // affichage progressif : 60 lignes, puis la suite en descendant (chaque ligne charge sa police : 500 d'un coup figeraient la fenêtre)
        let rows = [], shown = 0, more0 = null;
        const STEP = 60;
        const io = 'IntersectionObserver' in window ? new IntersectionObserver(en => { if (en.some(x => x.isIntersecting)) grow(); }, {root: list, rootMargin: '200px'}) : null;
        function grow() {
            if (!dlg.isConnected) return io?.disconnect();
            more0?.remove(); more0 = null;
            const next = rows.slice(shown, shown + STEP); shown += next.length;
            list.insertAdjacentHTML('beforeend', next.map(([f, tag]) => row(f, tag)).join(''));
            if (shown < rows.length) { more0 = h('div', 'ui-font-more'); more0.textContent = `… encore ${rows.length - shown}`; list.appendChild(more0); if (io) io.observe(more0); else more0.addEventListener('click', grow); }
        }
        function draw() {
            const q = fold(sf.input.value).trim(), m = f => !q || fold(f).includes(q), seen = new Set();
            const r0 = store.get(RECENT_F, []), rec = (Array.isArray(r0) ? r0 : []).map(cleanFont).filter(Boolean).filter(m), app = APP_FONTS.filter(m), pc = comp.filter(m);
            const part = (arr, tag) => arr.filter(f => !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase())).map(f => [f, tag]);
            rows = [...part(rec, 'RÉCENTE'), ...part(app, 'DE L’APP'), ...part(pc, 'ORDINATEUR')];
            if (q && !rows.some(([f]) => fold(f) === q)) { const typed = cleanFont(sf.input.value); if (typed) rows.push([typed, 'TAPÉE']); }
            if (chosen && !q) { const i = rows.findIndex(([f]) => f === chosen); if (i >= STEP) rows.unshift(rows.splice(i, 1)[0]); } // la police en cours, visible tout de suite
            shown = 0; more0 = null; io?.disconnect(); list.innerHTML = '';
            if (!rows.length) { list.innerHTML = `<div class="ui-font-empty">Aucune police pour « ${esc(sf.input.value)} ».</div>`; return; }
            grow();
        }
        const mark = el => { if (!el) return; list.querySelectorAll('.ui-font.on').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); }); el.classList.add('on'); el.setAttribute('aria-selected', 'true'); chosen = el.dataset.f; el.scrollIntoView({block: 'nearest'}); };
        list.addEventListener('click', e => { const r = e.target.closest('.ui-font'); if (r) mark(r); });
        list.addEventListener('dblclick', e => { if (e.target.closest('.ui-font')) $('form').requestSubmit(); });
        sf.input.addEventListener('keydown', e => {
            const els = [...list.querySelectorAll('.ui-font')], i = els.findIndex(r => r.classList.contains('on'));
            if (e.key === 'ArrowDown' && i >= els.length - 2 && shown < rows.length) grow();
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const all = [...list.querySelectorAll('.ui-font')]; mark(all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] || all[0]); }
            else if (e.key === 'Enter') { e.preventDefault(); if (i < 0 && els[0]) mark(els[0]); $('form').requestSubmit(); }
        });
        const more = () => {
            const box = $('[data-ui-fmore]');
            const st = comp.state, n = comp.length;
            box.innerHTML = comp.full ? `<small class="muted">✓ ${esc(plural(n, 'police'))} de l’ordinateur.</small>`
                : st === 'denied' ? UI.notice('warn', 'L’accès à la liste des polices est refusé pour cette page. Pour le permettre : réglages du site dans le navigateur (cadenas à gauche de l’adresse) → « Polices » → Autoriser, puis rouvre cette fenêtre. Tu peux aussi taper le nom exact d’une police.')
                : st === 'none' ? UI.notice('info', 'Ce navigateur ne donne pas la liste des polices : voici les polices courantes trouvées sur l’ordinateur. Pour une autre, tape son nom exact.')
                : `${st === 'error' ? UI.notice('warn', 'La liste des polices n’a pas pu être lue. Réessaie.') : ''}<button type="button" class="button small secondary" data-ui-fall>🔓 Voir toutes les polices de l’ordinateur</button> <small class="muted">Le navigateur te demandera la permission.</small>`;
            box.querySelector('[data-ui-fall]')?.addEventListener('click', async e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Lecture des polices…'; comp = await computerFonts(true); draw(); more(); });
        };
        computerFonts().then(c => { comp = c; draw(); more(); list.querySelector('.ui-font.on')?.scrollIntoView({block: 'nearest'}); });
        draw();
        dlg.addEventListener('click', e => { if (e.target.closest('[data-ui-x]')) dlg.close(); });
        $('form').addEventListener('submit', e => { e.preventDefault(); if (chosen) { answer = chosen; UI.rememberFont(chosen); } dlg.close(); });
        dlg.addEventListener('close', () => { dlg.remove(); resolve(answer); });
        dlg.showModal(); sf.input.focus();
    });

    /* ═════ Amélioration automatique (comme app-harmony.js) ═════ */
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(list => list.forEach(en => { if (!en.isIntersecting && !en.boundingClientRect.width) return; const el = en.target; if (enhanceOne(el)) io.unobserve(el); }), {rootMargin: '600px'}) : null;
    function enhanceOne(el) {
        if (!el.isConnected) return true;
        if (el.matches('input[type=color]')) return enhanceColor(el);
        if (el.matches('input[type=range]')) return enhanceRange(el);
        if (el.matches(SEARCH_SEL)) {
            if (el.dataset.uiDone) return true;
            if (isOff(el) || el.closest('.pk, .ui-search, .ui-pop') || el.type === 'hidden') { el.dataset.uiDone = 'off'; return true; }
            if (!shown(el)) return false;
            buildSearch(el); return true;
        }
        return true;
    }
    const WANT = `${SEARCH_SEL}, input[type=color], input[type=range]`;
    function scan(root) {
        if (!root.querySelectorAll) return;
        const els = root.matches?.(WANT) ? [root] : [];
        els.push(...root.querySelectorAll(WANT));
        els.forEach(el => { if (el.dataset.uiDone || el._uiSeen) return; el._uiSeen = true; if (!enhanceOne(el)) { if (io) io.observe(el); else el._uiSeen = false; } });
        (root.matches?.('[data-help]') ? [root] : []).concat([...root.querySelectorAll('[data-help]')]).forEach(enhanceHelp);
        (root.matches?.('input[data-ui-date]') ? [root] : []).concat([...root.querySelectorAll('input[data-ui-date]')]).forEach(inp => { if (!inp.dataset.uiDone && !isOff(inp)) buildDate(inp, {calendar: inp.dataset.uiDate !== 'nocal'}); });
    }
    UI.scan = (root = document) => scan(root);
    UI.enhance = el => enhanceOne(el);
    let queued = new Set(), timer = 0;
    new MutationObserver(list => {
        list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList?.contains('ui-pop')) queued.add(n); }));
        if (!queued.size) return;
        clearTimeout(timer);
        timer = setTimeout(() => { const nodes = [...queued]; queued = new Set(); nodes.forEach(n => { if (n.isConnected) scan(n); }); }, 30);
    }).observe(document.documentElement, {childList: true, subtree: true});
    const attach = () => { const app = window.LCNDA_APP; if (app && app.ui !== UI) app.ui = UI; if (app && !app.viewToggle) app.viewToggle = UI.viewToggle; if (app && !app.listBar) app.listBar = UI.listBar; };
    attach();
    document.addEventListener('DOMContentLoaded', () => { attach(); scan(document); });
    addEventListener('load', attach);
    if (document.readyState !== 'loading') scan(document);
})();
