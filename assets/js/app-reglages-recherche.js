/* LCNDA — L6 « Chercher dans une page des Réglages » (harmonisation L validée, docs/design/harmonisation-L.html).
 * Mode d'emploi : docs/UI.md, « L6 Chercher dans une page des Réglages ».
 *
 * Un seul code, accroché tout seul à toutes les pages des Réglages (module interne « maintenance ») : une page de plus
 * de ~20 lignes ou de 4 cadres reçoit la case C1 sous l'en-tête K5, collée en haut quand on fait défiler.
 *   « / » y va, Échap et × la vident ; elle filtre la page elle-même : lignes (tableaux, réglages, cases, listes),
 *   titres de cadres, textes d'aide et touches (« ⌘P », « ctrl p »). Les rubriques gardent leur titre avec « 2 sur 22 » ;
 *   les cadres qui contiennent un résultat s'ouvrent, les autres se replient en une ligne grise ; lettres surlignées ;
 *   « N lignes · N cachées · Tout montrer » ; rien trouvé : la petite ligne K10 avec « 🔍 Chercher dans tous les Réglages »
 *   (qui met le mot dans la case de la colonne). La recherche est vidée en quittant la page.
 * Rien à appeler. Une page qui n'en veut pas : data-l6-off sur son <section class="page">.
 * LCNDA_UI.settingsSearch : {apply(q), clear(), state()} (tests).
 */
(() => {
    'use strict';
    const UI = window.LCNDA_UI = window.LCNDA_UI || {};
    const A = () => window.LCNDA_APP || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const foldCh = c => (c.normalize('NFD')[0] || c).toLowerCase();
    const fold = t => [...String(t || '')].map(foldCh).join('');
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n < 2 ? one : (many || one + 's')}`);

    const FRAME_SEL = '.maintenance-panel, .person-block-config, .create-type-panel, .help-letter, .a11y-sec, fieldset, details, .card, .calendar-tool-card';
    const LINE_SEL = 'tbody > tr, .help-term, li, label, .ui-toggle, .checkbox-line, .label-admin-card, article, .order-row, .side-reorder-row, .calendar-result-card, p';
    const HEAD_SEL = ':scope > h2, :scope > h3, :scope > h4, :scope > summary, :scope > legend, :scope > header, :scope > .card-head';
    const SKIP_TABS = new Set(['controle', 'changes', 'duplicates', 'faq']);
    const NO_TEXT = new Set(['SELECT', 'OPTION', 'SCRIPT', 'STYLE', 'TEXTAREA', 'svg', 'SVG']);

    let ws = null, page = null, bar = null, input = null, info = null, key = '', q = '', idx = null, mo = null, busy = false, opened = [], timer = 0;

    /* ── lecture de la page ── */
    const shown = el => el.isConnected && el.getClientRects().length > 0;
    function hiddenUpTo(el, stop) { for (let e = el; e && e !== stop; e = e.parentElement) { if (e.hidden || e.classList?.contains('ui-l6-hide')) return true; const cs = getComputedStyle(e); if (cs.display === 'none') return true; } return false; }
    function textOf(el) {
        let s = '';
        const walk = n => { for (let c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) s += c.nodeValue; else if (c.nodeType === 1 && !NO_TEXT.has(c.tagName) && !c.classList.contains('ui-l6-count') && !c.classList.contains('ui-l6') && !c.classList.contains('ui-icf-host')) { walk(c); if (/^(TD|TH|DIV|P|LI|DT|DD|BR|LABEL|H\d)$/.test(c.tagName)) s += ' '; } } };
        walk(el);
        return s.replace(/\s+/g, ' ').trim();
    }
    const MODS = {'⌘': 'mod', cmd: 'mod', commande: 'mod', ctrl: 'mod', ctl: 'mod', control: 'mod', controle: 'mod', mod: 'mod', '⌃': 'mod', '⇧': 'shift', maj: 'shift', shift: 'shift', '⌥': 'alt', alt: 'alt', option: 'alt', opt: 'alt'};
    function keySet(s) {
        const parts = fold(s).replace(/([⌘⇧⌥⌃])/g, ' $1 ').split(/[\s+]+/).filter(Boolean);
        if (!parts.length) return null;
        const mods = new Set(), keys = [];
        parts.forEach(p => { if (MODS[p]) mods.add(MODS[p]); else keys.push(p); });
        if (keys.length !== 1) return null;
        if (!mods.size && !/^f\d{1,2}$/.test(keys[0])) return null;
        return [...mods].sort().join('+') + '|' + keys[0];
    }
    function keysOf(el) { return [...el.querySelectorAll('kbd[data-k]')].map(k => keySet(k.dataset.k)).filter(Boolean); }
    const outermost = (els, stop) => els.filter(e => { for (let p = e.parentElement; p && p !== stop; p = p.parentElement) if (p.matches(LINE_SEL)) return false; return true; });
    function headOf(f) {
        if (f.tagName === 'TBODY') { const tr = [...f.rows].find(r => r.querySelector('th') && !r.querySelector('td')); return tr || null; }
        const h = f.querySelector(HEAD_SEL); if (h) return h;
        const first = f.firstElementChild; return first && /^H[2-4]$/.test(first.firstElementChild?.tagName || '') ? first.firstElementChild : null;
    }
    function build() {
        const frames = [], loose = [];
        const cand = [...page.querySelectorAll(FRAME_SEL)].filter(f => !f.closest('.ui-l6') && shown(f));
        // les cadres « feuilles » (sans autre cadre dedans) se filtrent ; les grands cadres qui les entourent se replient s'il n'y reste rien
        const top = cand.filter(f => !cand.some(o => o !== f && f.contains(o)));
        const outers = cand.filter(f => !top.includes(f) && !cand.some(o => o !== f && o.contains(f))).map(f => { const head = headOf(f); return {el: f, head, title: head ? fold(textOf(head)) : ''}; });
        const lineInfo = (el, stop) => ({el, text: fold(textOf(el)), keys: keysOf(el), stop});
        const groupsIn = (root, lines) => [...root.querySelectorAll('tbody')].filter(tb => headOf(tb)).map(tb => ({el: tb, head: headOf(tb), lines: lines.filter(l => tb.contains(l.el))})).filter(g => g.lines.length);
        const linesIn = (root, head) => outermost([...root.querySelectorAll(LINE_SEL)].filter(l => !l.closest('.ui-l6') && !(head && (head === l || head.contains(l) || l.contains(head)))), root)
            .filter(l => !l.matches('tbody > tr') || l.querySelector('td'))
            .filter(l => !hiddenUpTo(l, root)).map(l => lineInfo(l, root)).filter(l => l.text);
        top.forEach(f => { const head = headOf(f); const lines = linesIn(f, head); frames.push({el: f, head, title: head ? fold(textOf(head)) : '', lines, groups: groupsIn(f, lines)}); });
        // les lignes hors cadre (tableau des raccourcis…)
        const free = outermost([...page.querySelectorAll(LINE_SEL)].filter(l => !l.closest('.ui-l6') && !l.closest('.page-header') && !top.some(f => f.contains(l)) && shown(l)), page)
            .filter(l => !l.matches('tbody > tr') || l.querySelector('td')).map(l => lineInfo(l, page)).filter(l => l.text);
        loose.push(...free);
        const nLines = frames.reduce((n, f) => n + f.lines.length, 0) + loose.length;
        return {frames, outers, loose, looseGroups: [...page.querySelectorAll('tbody')].filter(tb => !top.some(f => f.contains(tb)) && headOf(tb)).map(tb => ({el: tb, head: headOf(tb), lines: loose.filter(l => tb.contains(l.el))})).filter(g => g.lines.length), nLines};
    }

    /* ── cacher (en style dans l'élément : passe devant tout « display: … !important » des feuilles) ── */
    function hide(el) { if (el.classList.contains('ui-l6-hide')) return; el.dataset.l6d = `${el.style.getPropertyValue('display')}|${el.style.getPropertyPriority('display')}`; el.style.setProperty('display', 'none', 'important'); el.classList.add('ui-l6-hide'); }
    function unhide(el) { const [v, pr] = String(el.dataset.l6d || '|').split('|'); if (v) el.style.setProperty('display', v, pr); else el.style.removeProperty('display'); if (!el.getAttribute('style')) el.removeAttribute('style'); delete el.dataset.l6d; el.classList.remove('ui-l6-hide'); }
    /* ── surligner / nettoyer ── */
    function highlight(el, words) {
        if (!words.length) return;
        const nodes = [], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {acceptNode: n => (n.parentElement.closest('select, option, script, style, textarea, mark, .ui-l6-count, .ui-icf-host, svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)});
        while (tw.nextNode()) nodes.push(tw.currentNode);
        nodes.forEach(n => {
            const t = n.nodeValue, f = fold(t), spans = [];
            words.forEach(w => { let i = f.indexOf(w); while (i >= 0) { spans.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
            if (!spans.length) return;
            spans.sort((a, b) => a[0] - b[0]);
            const frag = document.createDocumentFragment(); let p = 0;
            spans.forEach(([a, b]) => { if (a < p) return; if (a > p) frag.append(t.slice(p, a)); const m = document.createElement('mark'); m.className = 'ui-l6-mark'; m.textContent = t.slice(a, b); frag.append(m); p = b; });
            if (p < t.length) frag.append(t.slice(p));
            n.replaceWith(frag);
        });
    }
    function clean() {
        if (!page) return;
        page.querySelectorAll('mark.ui-l6-mark').forEach(m => { const p = m.parentNode; m.replaceWith(m.textContent); p?.normalize(); });
        page.querySelectorAll('.ui-l6-hide').forEach(unhide);
        page.querySelectorAll('.ui-l6-hit').forEach(e => e.classList.remove('ui-l6-hit'));
        page.querySelectorAll('.ui-l6-count, .ui-l6-rest, .ui-l6-none').forEach(e => e.remove());
        opened.forEach(d => { if (d.isConnected) d.open = false; }); opened = [];
    }
    const openUp = (el, stop) => { for (let e = el; e && e !== page; e = e.parentElement) { if (e.tagName === 'DETAILS' && !e.open) { e.open = true; opened.push(e); } if (e === stop) break; } };
    const countTag = (head, n, of) => { if (!head || of < 2) return; const s = document.createElement('small'); s.className = 'ui-l6-count'; s.textContent = `${n} sur ${of}`; const into = head.matches('tr') ? head.querySelector('th') : head.matches('header') ? head.querySelector('h2, h3, h4') || head : head; into.appendChild(s); };

    /* ── chercher ── */
    function apply(query) {
        if (!page || !idx || !bar?.isConnected) return;
        busy = true;
        clean();
        q = String(query || '');
        const qq = q.trim(), words = fold(qq).split(/\s+/).filter(Boolean), ks = keySet(qq);
        if (!words.length) { info.innerHTML = ''; done(); return; }
        const whole = fold(qq).replace(/\s+/g, ' ');
        const hit = ks ? (l => l.keys.includes(ks) || l.text.includes(whole)) : (l => words.every(w => l.text.includes(w))); // une touche (« ⌘P », « ctrl p ») : les raccourcis qui l’utilisent
        const hw = ks ? [whole] : words;
        let nHit = 0, nFrames = 0; const shownF = new Set();
        const rest = [];
        const filter = (lines, groups, stop) => {
            const hits = lines.filter(hit);
            lines.forEach(l => { if (!hits.includes(l)) hide(l.el); else { l.el.classList.add('ui-l6-hit'); openUp(l.el, stop); highlight(l.el, hw); } });
            groups.forEach(g => { const n = g.lines.filter(l => hits.includes(l)).length; if (!n) hide(g.el); else countTag(g.head, n, g.lines.length); });
            return hits.length;
        };
        idx.frames.forEach(f => {
            const titleHit = f.title && words.every(w => f.title.includes(w));
            if (titleHit) { shownF.add(f.el); nFrames++; nHit += Math.max(1, f.lines.length); highlight(f.head, hw); if (f.el.tagName === 'DETAILS' && !f.el.open) { f.el.open = true; opened.push(f.el); } return; }
            const n = filter(f.lines, f.groups, f.el);
            if (n) { shownF.add(f.el); nFrames++; nHit += n; if (f.el.tagName === 'DETAILS' && !f.el.open) { f.el.open = true; opened.push(f.el); } if (!f.groups.length) countTag(f.head, n, f.lines.length); }
            else { hide(f.el); rest.push(f); }
        });
        nHit += filter(idx.loose, idx.looseGroups, page);
        idx.outers.forEach(o => {
            if (o.title && words.every(w => o.title.includes(w))) { o.el.querySelectorAll('.ui-l6-hide').forEach(unhide); rest.splice(0, rest.length, ...rest.filter(f => !o.el.contains(f.el))); highlight(o.head, hw); nFrames++; return; }
            if (o.el.querySelector('.ui-l6-hit') || [...shownF].some(e => o.el.contains(e))) return;
            hide(o.el); rest.push(o);
        });
        const restShown = rest.filter(f => !rest.some(o => o !== f && o.el.contains(f.el)));
        const cadres = idx.frames.length >= 2;
        const hitEls = [...page.querySelectorAll('.ui-l6-hit')], asSet = hitEls.filter(e => e.matches('label') || e.querySelector('input:not([type=hidden]), select, textarea')).length;
        const word = hitEls.length && asSet * 2 >= hitEls.length ? 'réglage' : 'ligne'; // « 3 réglages dans 2 cadres » (Apparence), « 3 lignes » (Raccourcis, Glossaire)
        const hidden = Math.max(0, idx.nLines - nHit);
        if (nHit) {
            info.innerHTML = `<b>${esc(plural(nHit, word))}</b>${cadres && nFrames ? ` dans ${esc(plural(nFrames, 'cadre'))}` : ''} · ${esc(plural(hidden, cadres ? 'cachée' : 'cachée'))} · <button type="button" class="link-button" data-l6-all>Tout montrer</button>`;
            if (restShown.length) {
                const names = restShown.map(f => { const h = f.head ? (f.head.matches('h2, h3, h4, summary, legend') ? f.head : f.head.querySelector('h2, h3, h4, b, strong') || f.head) : null; return h ? textOf(h).replace(/[\s↑↓⇄⋯×▸▾⠿]+$/u, '').slice(0, 60) : ''; }).filter(Boolean);
                const b = document.createElement('button'); b.type = 'button'; b.className = 'ui-l6-rest'; b.dataset.l6All = '1';
                b.innerHTML = `<span>▸ ${esc(names.slice(0, 2).join(' · '))}${names.length > 2 ? ` · ${esc(plural(names.length - 2, 'autre cadre', 'autres cadres'))}` : ''}</span><small>rien ici</small>`;
                b.title = 'Tout montrer';
                const last = restShown.at(-1).el; last.after(b);
            }
        } else {
            info.innerHTML = '';
            const p = document.createElement('p'); p.className = 'empty-line ui-l6-none';
            p.innerHTML = `<span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien pour « ${esc(qq)} » dans cette page.</span><button type="button" class="button small secondary" data-l6-global>🔍 Chercher dans tous les Réglages</button>`;
            bar.after(p);
        }
        done();
    }
    function done() { mo?.takeRecords(); busy = false; }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => apply(input.value), 110); };

    /* ── la barre ── */
    function makeBar() {
        bar = document.createElement('div'); bar.className = 'ui-l6'; bar.setAttribute('role', 'search');
        const sf = UI.searchField ? UI.searchField({placeholder: 'Chercher dans cette page… (ex. sosa, imprimer, ⌘P)', label: 'Chercher dans cette page'}) : null;
        if (sf) { input = sf.input; bar.appendChild(sf); } else { input = document.createElement('input'); input.type = 'search'; input.placeholder = 'Chercher dans cette page…'; bar.appendChild(input); }
        input.classList.add('ui-l6-q'); input.dataset.l6 = '1';
        info = document.createElement('small'); info.className = 'ui-l6-info'; info.setAttribute('aria-live', 'polite');
        bar.appendChild(info);
        input.addEventListener('input', schedule);
        input.addEventListener('search', () => apply(input.value));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(input.value); page.querySelector('.ui-l6-hit, .ui-l6-mark')?.scrollIntoView({block: 'center', behavior: 'smooth'}); } });
        page.addEventListener('click', onClick);
    }
    function onClick(e) {
        if (e.target.closest('[data-l6-all]')) { input.value = ''; apply(''); input.focus(); return; }
        if (e.target.closest('[data-l6-global]')) {
            const side = document.querySelector('.mt-search, [data-mt-search]');
            const word = input.value.trim();
            if (side) { side.value = word; side.dispatchEvent(new Event('input', {bubbles: true})); side.focus(); }
            input.value = ''; apply('');
        }
    }
    const tabKey = () => { const st = A().state || {}; const sub = page?.querySelector(':scope > .segmented .is-active, :scope > .ms-pagetabs .is-active, :scope > .h-tabs .is-active'); return `${st.maintenanceTab || ''}|${sub ? sub.textContent.trim() : ''}`; };
    function setup() {
        const st = A().state || {};
        if (st.module !== 'maintenance') { if (key) { key = ''; q = ''; } page = null; return; }
        const p = ws.querySelector(':scope > section.page, :scope > .page') || ws.firstElementChild;
        if (!p || p.hasAttribute('data-l6-off') || SKIP_TABS.has(st.maintenanceTab)) { page = p; idx = null; return; }
        const k = tabKey();
        if (p === page && bar?.isConnected && k === key) { // la même page a changé : on relit et on garde la recherche
            busy = true; const keepQ = input.value; clean(); idx = build(); done(); if (keepQ.trim()) apply(keepQ); return;
        }
        if (k !== key) q = '';
        key = k; page = p; bar?.remove(); bar = null;
        busy = true;
        idx = build();
        const own = [...p.querySelectorAll('input[type=search], .ui-search-input')].some(i => !i.closest('.ui-l6') && ![...idx.frames, ...idx.outers].some(f => f.el.contains(i)) && shown(i));
        if (own || (idx.nLines <= 20 && idx.frames.length <= 4)) { idx = null; done(); return; }
        makeBar();
        const head = p.querySelector(':scope > .page-header');
        let after = head; const nx = head?.nextElementSibling;
        if (nx && nx.matches('.segmented, .ms-pagetabs, .h-tabs')) after = nx;
        if (after) after.after(bar); else p.prepend(bar);
        done();
        if (q) { input.value = q; apply(q); }
    }
    function start() {
        ws = document.getElementById('workspace'); if (!ws) return false;
        mo = new MutationObserver(list => {
            if (busy) return;
            list = list.filter(m => !m.target.closest?.('.ui-l6') && !m.target.classList?.contains('ui-l6-mark'));
            if (!list.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType === 1 && !(n.classList?.contains('ui-l6-mark') || n.classList?.contains('ui-l6-count') || n.classList?.contains('ui-l6-rest') || n.classList?.contains('ui-l6-none'))) || (m.type === 'attributes' && (m.attributeName === 'hidden' || m.target.parentElement === page)))) return; // un onglet de la page qui montre une autre partie
            if (!start.t) start.t = setTimeout(() => { start.t = 0; setup(); }, 180); // pas de remise à zéro : une page qui bouge sans cesse (aperçu vivant) est quand même relue
        });
        mo.observe(ws, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class']});
        setup();
        return true;
    }
    // « / » va dans la case de la page (avant la case de la colonne)
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || !bar?.isConnected || !shown(bar)) return;
        const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault(); e.stopPropagation(); input.focus(); input.select();
    }, true);
    UI.settingsSearch = {apply: v => { if (input) { input.value = v; apply(v); } }, clear: () => { if (input) { input.value = ''; apply(''); } }, state: () => ({key, q: input?.value || '', lines: idx?.nLines || 0, frames: idx?.frames.length || 0, bar: !!bar?.isConnected})};
    const boot = () => { if (!start()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
