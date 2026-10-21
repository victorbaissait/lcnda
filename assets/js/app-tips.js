/* LCNDA — K12 💬 Les bulles au survol et les raccourcis écrits pareil partout (maquette harmonisation K12, validée).
 * 1. Une seule fonction pour écrire une touche : LCNDA_APP.keys (aussi LCNDA_UI.keys)
 *      keys.parts('⇧⌘S') → ['⇧', '⌘', 'S'] sur Mac, ['Ctrl', 'Maj', 'S'] ailleurs ; accepte « Mod+Shift+S », « Ctrl+Z »,
 *      « ⌘V / Ctrl+V » (garde celle de l'ordinateur), « Échap », « Entrée »…
 *      keys.html(s) → les petites touches grises dessinées ; keys.text(s) → « ⇧⌘S » sur Mac, « Ctrl+Maj+S » ailleurs.
 *      keys.setKbd(kbd, s) : écrit une touche dans un <kbd> (menus des éditeurs).
 * 2. La bulle de l'app au lieu de celle du navigateur : fond noir, texte blanc, après 0,4 s, au-dessus (ou au-dessous) ;
 *    reprend title (ou aria-label d'un bouton icône) et data-shortcut ; le raccourci en petites touches.
 *    Le title est retiré seulement pendant le survol (remis après) : le code qui le lit ou le change ne voit rien.
 * 3. Les touches écrites dans les textes (« colle-la (⌘V) », menus « Ctrl+Z ») sont redessinées pour l'ordinateur
 *    de la personne. data-k-off sur un élément ou un parent l'exclut.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const IS_MAC = A().shortcutKit?.IS_MAC ?? /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

    /* ═════ 1. Écrire une touche ═════ */
    const MOD_WORD = {mod: 'MOD', cmd: 'MOD', command: 'MOD', '⌘': 'MOD', ctrl: 'CTRL', control: 'CTRL', ctl: 'CTRL', '⌃': 'CTRL', strg: 'CTRL',
        alt: 'ALT', option: 'ALT', opt: 'ALT', '⌥': 'ALT', shift: 'SHIFT', maj: 'SHIFT', '⇧': 'SHIFT', win: 'META', meta: 'META', super: 'META'};
    const KEY_WORD = {arrowup: '↑', '↑': '↑', arrowdown: '↓', '↓': '↓', arrowleft: '←', '←': '←', arrowright: '→', '→': '→',
        enter: 'ENTER', return: 'ENTER', entrée: 'ENTER', entree: 'ENTER', '↩': 'ENTER', '↩︎': 'ENTER', '⏎': 'ENTER', '↵': 'ENTER',
        escape: 'ESC', esc: 'ESC', échap: 'ESC', echap: 'ESC', '⎋': 'ESC', space: 'SPACE', espace: 'SPACE', '␣': 'SPACE',
        backspace: 'BACK', '⌫': 'BACK', 'retour arrière': 'BACK', delete: 'DEL', del: 'DEL', suppr: 'DEL', '⌦': 'DEL', tab: 'TAB', '⇥': 'TAB',
        pageup: 'PGUP', 'pg↑': 'PGUP', 'page↑': 'PGUP', pagedown: 'PGDN', 'pg↓': 'PGDN', 'page↓': 'PGDN', home: 'HOME', début: 'HOME', end: 'END', fin: 'END'};
    const SHOW = IS_MAC
        ? {MOD: '⌘', CTRL: '⌃', ALT: '⌥', SHIFT: '⇧', META: '⌘', ENTER: '↩', ESC: 'Échap', SPACE: 'Espace', BACK: '⌫', DEL: 'Suppr', TAB: 'Tab', PGUP: 'Page↑', PGDN: 'Page↓', HOME: 'Début', END: 'Fin'}
        : {MOD: 'Ctrl', CTRL: 'Ctrl', ALT: 'Alt', SHIFT: 'Maj', META: 'Win', ENTER: 'Entrée', ESC: 'Échap', SPACE: 'Espace', BACK: '⌫', DEL: 'Suppr', TAB: 'Tab', PGUP: 'Page↑', PGDN: 'Page↓', HOME: 'Début', END: 'Fin'};
    const ORDER = IS_MAC ? ['CTRL', 'ALT', 'SHIFT', 'MOD', 'META'] : ['MOD', 'CTRL', 'META', 'ALT', 'SHIFT'];
    /** « ⌘V / Ctrl+V », « ⌘ ou Ctrl » : on garde l'écriture de cet ordinateur */
    function pickAlt(s) {
        const alts = String(s).split(/\s+(?:\/|ou)\s+|(?<=⌘)\/(?=Ctrl)|(?<=Ctrl)\/(?=⌘)/);
        if (alts.length < 2) return s;
        const mac = alts.find(a => /[⌘⌥⌃]|Cmd/.test(a)), pc = alts.find(a => /Ctrl|Win|Alt/.test(a) && !/⌘/.test(a));
        return (IS_MAC ? mac || alts[0] : pc || alts[alts.length - 1]).trim();
    }
    /** les morceaux d'un raccourci (codes MOD, SHIFT… et la touche), ou null si ce n'est pas un raccourci lisible */
    function codes(raw) {
        let s = pickAlt(String(raw ?? '').trim()); if (!s || s.length > 40) return null;
        const mods = new Set(); let key = '';
        if (/\+/.test(s) && s.length > 1) { // « Mod+Shift+S », « Ctrl + Maj + D », « Ctrl++ »
            const raw2 = s === '+' ? ['+'] : s.endsWith('++') ? [...s.slice(0, -2).split('+'), '+'] : s.split('+');
            const toks = raw2.map(t => t.trim()).filter(Boolean); if (!toks.length) return null;
            const hasMod = toks.some(t => /^(mod|cmd|command|⌘)$/i.test(t));
            for (let i = 0; i < toks.length; i++) {
                const t = toks[i], m = MOD_WORD[t.toLowerCase()];
                if (i < toks.length - 1) {
                    if (/^[⌘⌃⌥⇧]+$/.test(t)) { [...t].forEach(g => mods.add(MOD_WORD[g])); continue; }
                    if (!m) return null;
                    mods.add(m === 'CTRL' && !hasMod ? 'MOD' : m); // « Ctrl+Z » écrit à la main = la touche ⌘/Ctrl
                } else key = t;
            }
        } else { // « ⇧⌘S », « ⌘ ↩ », « Échap », « S »
            const m = s.match(/^([⌃⌥⇧⌘]*)\s*(.*)$/u); [...m[1]].forEach(g => mods.add(MOD_WORD[g])); key = m[2].trim();
            const lone = MOD_WORD[key.toLowerCase()]; if (lone && !/^[a-z]$/i.test(key)) { mods.add(lone === 'CTRL' ? 'MOD' : lone); key = ''; } // « Ctrl » tout seul
            if (!key && mods.size) return {mods: [...mods], key: ''}; // « ⌘ » tout seul (⌘ en glissant)
        }
        const kl = key.toLowerCase(); let k = KEY_WORD[kl] || KEY_WORD[key] || key;
        if (/^[a-zà-ÿ]$/i.test(k)) k = k.toUpperCase();
        if (!k || (k.length > 2 && !SHOW[k] && !/^F\d{1,2}$/.test(k) && !/^(clic|molette)$/i.test(k))) return null;
        return {mods: ORDER.filter(x => mods.has(x)), key: k};
    }
    /** ['⇧', '⌘', 'S'] sur Mac, ['Ctrl', 'Maj', 'S'] ailleurs ([] si ce n'est pas un raccourci) */
    const parts = raw => { const c = codes(raw); if (!c) return []; const m = [...new Set(c.mods.map(x => SHOW[x]))]; return c.key ? [...m, SHOW[c.key] || c.key] : m; };
    const text = raw => { const p = parts(raw); return p.length ? p.join(IS_MAC ? '' : '+') : String(raw ?? ''); };
    const capsHtml = p => p.map(x => `<kbd class="k-cap">${esc(x)}</kbd>`).join('');
    const html = raw => { const p = parts(raw); return p.length ? `<kbd class="k-keys" data-k="${esc(raw)}" aria-label="${esc(p.join('+'))}">${capsHtml(p)}</kbd>` : esc(raw); };
    /** écrit le raccourci dans un <kbd> (menus) : petites touches, la valeur d'origine gardée dans data-k */
    function setKbd(kb, raw) {
        if (!kb) return; raw = String(raw ?? '');
        if (kb.dataset.k === raw && kb.querySelector('.k-cap')) return;
        const p = parts(raw); kb.dataset.k = raw;
        if (!p.length) { kb.textContent = raw; kb.classList.remove('k-keys'); return; }
        kb.classList.add('k-keys'); kb.setAttribute('aria-label', p.join('+')); kb.innerHTML = capsHtml(p);
    }
    // un raccourci écrit dans un texte : « ⌘V / Ctrl+V », « ⇧⌘Z », « ⌘ ou Ctrl », « ⌘/Ctrl » (un ⌘ seul aussi)
    const KEYTAIL = '(?:[A-Z0-9]|F\\d{1,2}|[\\[\\]\\\\,.;+=\\-−/`]|↩︎?|⏎|⌫|⌦|↑|↓|←|→|Entrée|Échap|Espace|Suppr|Tab)';
    const GLYPH = `[⌃⌥⇧⌘]+(?:\\s?\\+\\s?${KEYTAIL}(?!\\p{L})|\\s?${KEYTAIL}(?!\\p{L}))?`, PCK = `(?:Ctrl|Alt|Maj|Win)(?:\\s?\\+\\s?(?:Ctrl|Alt|Maj|Shift|Win))*(?:\\s?\\+\\s?${KEYTAIL})?`;
    const PCFULL = `(?:Ctrl|Alt|Maj|Win)(?:\\s?\\+\\s?(?:Ctrl|Alt|Maj|Shift|Win))*\\s?\\+\\s?${KEYTAIL}(?!\\p{L})`;
    const TEXT_RX = new RegExp(`(${GLYPH})(?:\\s?(?:/|ou)\\s?(${PCK}))?|(${PCK})\\s?(?:/|ou)\\s?(${GLYPH})|(${PCFULL})`, 'gu');
    /** un texte → HTML avec les raccourcis en petites touches (le reste échappé) */
    function textHtml(s) {
        s = String(s ?? ''); let out = '', last = 0;
        s.replace(TEXT_RX, (m, g1, p1, p2, g2, p3, at) => {
            const mac = g1 || g2 || p3, pc = p1 || p2 || p3, pick = IS_MAC ? mac : (pc || mac);
            out += esc(s.slice(last, at)) + (parts(pick).length ? html(pick) : esc(m)); last = at + m.length; return m;
        });
        return out + esc(s.slice(last));
    }
    const keys = {isMac: IS_MAC, parts, text, html, textHtml, setKbd, mod: IS_MAC ? '⌘' : 'Ctrl'};
    const app = window.LCNDA_APP = window.LCNDA_APP || {}; app.keys = keys;
    const UI = window.LCNDA_UI = window.LCNDA_UI || {}; UI.keys = keys;

    /* ═════ 2. La bulle ═════ */
    const CAN_POP = 'popover' in HTMLElement.prototype;
    let tip = null, cur = null, timer = 0, check = 0;
    const stash = new WeakMap(); // élément → son title pendant le survol
    const off = el => !!el.closest?.('[data-k-off], [data-tip-off]');
    const isIconish = el => { const t = (el.textContent || '').trim(); return !t || t.length <= 2 || !/\p{L}{3}/u.test(t); };
    /** l'élément qui a une bulle sous la souris (title, data-shortcut, ou aria-label d'un bouton icône) */
    function owner(t) {
        for (let el = t; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
            if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;
            if (el.matches('iframe, option, [contenteditable="true"]')) return null;
            if (el.hasAttribute('title') && el.getAttribute('title').trim()) return el;
            if (stash.has(el)) return el;
            if (el.matches('button, a, [role="button"], label.button, summary') && (el.dataset.shortcut || (el.getAttribute('aria-label') && isIconish(el)))) return el;
        }
        return null;
    }
    const titleOf = el => (el.hasAttribute('title') ? el.getAttribute('title') : stash.get(el)) || '';
    /** le contenu de la bulle : le texte (touches écrites en petites touches) + le raccourci du bouton */
    function content(el) {
        let t = String(titleOf(el) || (el.dataset.shortcut ? (el.getAttribute('aria-label') || el.dataset.tbLabel || el.textContent || '') : el.getAttribute('aria-label') || '')).trim().replace(/\s+\n/g, '\n');
        const sc = el.dataset.shortcut || '';
        // « Enregistrer (⌘S) », « (Ctrl+S) », « — ⌘S » à la fin : le raccourci va dans les touches
        t = t.replace(/\s*[(（]\s*([^()]{1,24})\s*[)）]\s*$/u, (m, k) => (parts(k).length && /[⌘⌥⌃⇧]|Ctrl|Maj|Alt|^[A-Z0-9]$|^F\d|Échap|Entrée|Suppr|Espace/.test(k) ? (sc ? '' : `\u0000${k}`) : m));
        let keysPart = '';
        if (t.includes('\u0000')) { const [a, b] = t.split('\u0000'); t = a.trim(); keysPart = html(b); }
        if (sc && parts(sc).length) keysPart = html(sc);
        if (!t && !keysPart) return '';
        return `<span class="k-tip-t">${textHtml(t)}</span>${keysPart ? `<span class="k-tip-k">${keysPart}</span>` : ''}`;
    }
    function ensureTip() {
        if (tip && tip.isConnected) return tip;
        tip = document.createElement('div'); tip.className = 'k-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'k-tip';
        if (CAN_POP) tip.setAttribute('popover', 'manual');
        return tip;
    }
    function place(el) {
        const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
        let top = r.top - h - 8, below = false;
        if (top < 6) { top = r.bottom + 8; below = true; }
        if (top + h > vh - 6) top = Math.max(6, vh - h - 6);
        const cx = r.left + r.width / 2, left = Math.min(Math.max(6, cx - w / 2), vw - w - 6);
        tip.style.left = `${Math.round(left)}px`; tip.style.top = `${Math.round(top)}px`;
        tip.classList.toggle('is-below', below); tip.style.setProperty('--k-arrow', `${Math.round(Math.min(Math.max(10, cx - left), w - 10))}px`);
    }
    function show(el) {
        if (!el.isConnected || off(el)) return;
        const c = content(el); if (!c) return;
        ensureTip(); tip.innerHTML = c;
        const host = el.closest('dialog[open]') || document.body;
        if (tip.parentNode !== host) host.appendChild(tip);
        if (CAN_POP) { try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch (_) {} }
        tip.classList.add('is-on'); place(el);
        clearInterval(check); check = setInterval(() => { if (!cur || !cur.isConnected) hide(); }, 300);
    }
    function hide() {
        clearTimeout(timer); clearInterval(check);
        if (tip) { tip.classList.remove('is-on'); if (CAN_POP) { try { tip.hidePopover(); } catch (_) {} } }
    }
    /** on quitte l'élément : son title revient (sauf si le code en a mis un autre entre-temps) */
    function leave() {
        hide(); const el = cur; cur = null; if (!el) return;
        if (stash.has(el)) { if (!el.hasAttribute('title')) el.setAttribute('title', stash.get(el)); stash.delete(el); }
    }
    function enter(el, delay = 400) {
        if (cur === el) return; leave(); cur = el;
        if (el.hasAttribute('title')) { stash.set(el, el.getAttribute('title')); el.removeAttribute('title'); }
        if (!el.getAttribute('aria-label') && isIconish(el) && stash.get(el)) el.setAttribute('aria-label', stash.get(el).replace(/\s*\([^()]*\)\s*$/, ''));
        clearTimeout(timer); timer = setTimeout(() => { if (cur === el) show(el); }, delay);
    }
    document.addEventListener('pointerover', e => {
        if (e.pointerType === 'touch') return;
        const el = owner(e.target);
        if (!el) { if (cur && !cur.contains(e.target)) leave(); return; }
        if (off(el)) return;
        enter(el);
    }, true);
    document.addEventListener('pointerout', e => { if (cur && (!e.relatedTarget || !cur.contains(e.relatedTarget)) && !(e.relatedTarget && owner(e.relatedTarget) === cur)) leave(); }, true);
    // au clavier : la bulle aussi quand on arrive sur un bouton avec Tab
    document.addEventListener('focusin', e => { const el = e.target; if (!el?.matches?.(':focus-visible') || el.matches('input, textarea, select')) return; const o = owner(el); if (o === el && !off(el)) enter(el, 500); }, true);
    document.addEventListener('focusout', e => { if (cur && cur === e.target) leave(); }, true);
    ['pointerdown', 'wheel', 'keydown'].forEach(t => document.addEventListener(t, e => { if (t === 'keydown' && ['Shift', 'Meta', 'Control', 'Alt', 'Tab'].includes(e.key)) return; hide(); }, {capture: true, passive: true}));
    addEventListener('scroll', hide, {capture: true, passive: true}); addEventListener('blur', leave);

    /* ═════ 3. Les touches écrites dans les textes et les menus ═════ */
    const SKIP = 'script, style, textarea, input, select, option, code, pre, svg, [contenteditable], [data-k-off], .k-keys, .k-tip';
    const MAYBE = /[⌘⌥⌃⇧]|Ctrl\s?(?:\+|\/|ou)/;
    function paintKbd(kb) {
        if (kb.classList.contains('k-keys') || kb.closest('[data-k-off]')) return;
        const raw = kb.textContent.trim(); if (!raw || raw.length > 24 || !parts(raw).length) return;
        if (!MAYBE.test(raw) && !kb.closest('.ui-actmenu, details, [role="menu"], .h-rt-menulist, .vx-menu-list, .ly-menu-list, .shortcut-kbd') && !kb.matches('.shortcut-kbd')) return;
        setKbd(kb, raw);
    }
    function paint(root) {
        if (!root || root.nodeType !== 1 || root.closest?.(SKIP)) return;
        (root.matches('kbd') ? [root] : [...root.querySelectorAll('kbd:not(.k-keys):not(.k-cap)')]).forEach(paintKbd);
        if (!MAYBE.test(root.textContent || '')) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => (MAYBE.test(n.nodeValue) && !n.parentElement?.closest(SKIP) && !n.parentElement?.closest('kbd') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)});
        const list = []; while (w.nextNode()) list.push(w.currentNode);
        list.forEach(n => {
            const v = n.nodeValue; TEXT_RX.lastIndex = 0; if (!TEXT_RX.test(v)) return; TEXT_RX.lastIndex = 0;
            const out = textHtml(v); if (out === esc(v)) return;
            const span = document.createElement('span'); span.innerHTML = out;
            n.replaceWith(...span.childNodes);
        });
    }
    keys.paint = paint;
    let queued = new Set(), t2 = 0;
    new MutationObserver(list => {
        list.forEach(m => { if (m.type === 'characterData') { const p = m.target.parentElement; if (p) queued.add(p); } else m.addedNodes.forEach(n => { if (n.nodeType === 1) queued.add(n); else if (n.nodeType === 3 && n.parentElement) queued.add(n.parentElement); }); });
        clearTimeout(t2); t2 = setTimeout(() => { const nodes = [...queued].filter(n => n.isConnected); queued = new Set(); nodes.forEach(n => { try { paint(n); } catch (_) {} }); }, 30);
    }).observe(document.documentElement, {childList: true, subtree: true, characterData: true});
    const first = () => paint(document.body);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first); else first();
})();
