/* LCNDA — 📎 « Insérer une info » : une info précise (une date, un lieu, une ligne de liste, une donnée…) posée À L'ENDROIT DU CURSEUR,
 * dans n'importe quel champ de texte libre (notes de fiche, d'événement, de source, journal, pistes et conclusions d'enquête, Atelier,
 * Livre de famille, documents, site, rapports, rappels, courriers…), sans quitter l'écran.
 *
 *  Ouvrir : « / » en début de ligne (réglable : Réglages → 🧺 Panier et connexions), le petit 📎 qui apparaît sur le champ, ou ⌥⌘K (Ctrl+Alt+K).
 *  Un seul champ cherche TOUT : la base (fiches, événements, actes, sources, lieux, médias, notes), le panier, les listes de données installées
 *  (serveur : GET cx_search, lib/connexions.php ; listes du navigateur : moteur des Listes), et propose aussi les LISTES (« 📋 Liste : Gares… »)
 *  et les CATÉGORIES (« 📁 Le lieu », « Ma base › Actes ») à parcourir : → ou Tab pour entrer, ← ou Retour arrière (champ vide) pour revenir.
 *  Sur un élément : ← → choisissent quoi insérer (« Ouverture » seulement, la ligne entière, en lien). Dans une liste : Espace coche des lignes,
 *  « ▦ L'ensemble » s'insère en tableau, en liste à puces ou en lien. Entrée insère ; Échap ferme. ↶ Annuler défait tout.
 *  La source : rangée là où le champ sait la garder (une piste d'enquête : ses pièces), sinon « [↗ source] » dans le texte.
 *
 *  API : LCNDA_EXT.insertInfo = {attach(el, {context}), open(el), hosts: [{match(el) → bool, context(el) → {}, cite(el, items) → undo}], settings()}
 *  Essais : tests/test-inserer.js, tests/test-prendre-depuis-usage.js (G4). */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const hu = u => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : ''); // 🔒 un lien inséré : http(s) seulement (un panier importé peut porter n'importe quoi)
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const api = (a, q) => A().api(a, q);
    const CX = () => ext.connexions || {};
    const K = () => CX().kit || {};
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const KEY = 'genealogie-inserer', REC = 'genealogie-inserer-recents';
    const settings = () => ({on: true, trigger: '/', button: true, ...(readJ(KEY, {}) || {})});
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const live = () => settings().on !== false && CX().enabled?.() !== false && !kiosk();

    /* ═════════ les champs ═════════ */
    const isField = el => !!el && ((el.matches?.('textarea') && !el.readOnly && !el.disabled) || el.isContentEditable) && !el.closest('.cx-qi, [data-no-insert], .cm-editor, .CodeMirror, [data-ui-code]');
    const hosts = [];
    /** ce que le champ sait de son contexte (une fiche, une enquête…) : pour classer les réponses et garder la source */
    function ctxOf(el) {
        for (const h of hosts) { try { if (h.match(el)) return {host: h, ...(h.context?.(el) || {})}; } catch (_) {} }
        const st = A().state || {}, d = el.closest?.('[data-insert-context]')?.dataset.insertContext;
        let o = {}; try { o = d ? JSON.parse(d) : {}; } catch (_) {}
        if (!o.person_id && st.module === 'personnes' && st.currentPerson?.person?.id) o.person_id = Number(st.currentPerson.person.id);
        return o;
    }
    // 🕵️ une piste d'enquête (fenêtre « Ajouter une piste ») : la source va dans les pièces de la piste
    hosts.push({id: 'piste', match: el => !!el.closest?.('#investigation-item-form'), context: el => { const f = el.closest('form'); return {investigation_id: Number(f.elements.investigation_id?.value) || 0, item_id: Number(f.dataset.editItemId) || 0}; },
        cite: async (el, items, c) => { if (!c.investigation_id || !c.item_id) return null; const p = b => A().api('cx_write', {}, {method: 'POST', body: b}).then(r => r?.result ?? r);
            const r = await p({op: 'inv_receive', investigation_id: c.investigation_id, item_id: c.item_id, items}); return async () => { await p({op: 'inv_receive_undo', ...r}); }; }});
    // 📝 une note sur une fiche : classer d'abord ce qui touche cette personne
    hosts.push({id: 'note', match: el => !!el.closest?.('#note-form'), context: el => ({person_id: Number(el.closest('form').elements.person_id?.value) || 0})});

    /* ═════════ « / » en début de ligne, le 📎 du champ, le raccourci ═════════ */
    let pop = null, btn = null;
    document.addEventListener('input', e => {
        const el = e.target; if (!live() || pop || !isField(el) || e.inputType?.startsWith('delete')) return;
        const trig = settings().trigger || '/'; if (!trig) return;
        if (el.matches('textarea')) {
            const pos = el.selectionStart, v = el.value;
            if (v.slice(pos - trig.length, pos) === trig && (pos === trig.length || v[pos - trig.length - 1] === '\n')) open(el, {trigger: {start: pos - trig.length, len: trig.length}});
        } else {
            const sel = getSelection(); if (!sel.rangeCount) return; const r = sel.getRangeAt(0), n = r.startContainer;
            if (n.nodeType === 3 && n.data.slice(r.startOffset - trig.length, r.startOffset) === trig && (r.startOffset === trig.length || /\n/.test(n.data[r.startOffset - trig.length - 1] || '\n'))) open(el, {trigger: {node: n, start: r.startOffset - trig.length, len: trig.length}});
        }
    }, true);
    document.addEventListener('focusin', e => { const el = e.target; if (!live() || !settings().button || !isField(el)) return; showBtn(el); });
    document.addEventListener('focusout', e => { if (btn && e.target === btn.field) setTimeout(() => { if (btn && document.activeElement !== btn.field && document.activeElement !== btn) hideBtn(); }, 150); });
    function showBtn(el) {
        hideBtn(); const r = el.getBoundingClientRect(); if (r.width < 160 || r.height < 30) return;
        btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cx-qi-btn'; btn.textContent = '📎'; btn.field = el;
        btn.title = T('Insérer une info ici (« / » en début de ligne, ou {k})', {k: keyHint()}); btn.setAttribute('aria-label', T('Insérer une info ici'));
        (el.closest('dialog[open]') || document.body).appendChild(btn);
        btn.style.top = `${Math.round(r.top + 6)}px`; btn.style.left = `${Math.round(r.right - 34)}px`;
        btn.addEventListener('mousedown', ev => ev.preventDefault()); btn.addEventListener('click', () => open(el));
    }
    const hideBtn = () => { btn?.remove(); btn = null; };
    const keyHint = () => { try { return A().shortcutKit?.hint?.('insert_info') || '⌥⌘K'; } catch (_) { return '⌥⌘K'; } };
    /** le raccourci (Réglages → Raccourcis clavier, « insert_info ») : le champ qui a le curseur, sinon le dernier */
    let lastField = null;
    document.addEventListener('focusin', e => { if (isField(e.target)) lastField = e.target; });
    const openHere = () => { const el = isField(document.activeElement) ? document.activeElement : lastField?.isConnected ? lastField : null; if (!el) { A().toast?.(T('Mets d’abord le curseur dans un texte (une note, une piste…).')); return; } el.focus(); open(el); };

    /* ═════════ la petite fenêtre ═════════ */
    const CATS = () => {
        const lists = (K().listsAll?.() || []), groups = [...new Set(lists.map(d => d.group || 'Autres'))];
        return [{id: 'recent', icon: '🕘', label: T('Récents')}, {id: 'basket', icon: '🧺', label: T('Panier')},
            {id: 'base', icon: '🗂', label: T('Ma base'), kids: [['person', '👤', 'Fiches'], ['event', '📅', 'Événements'], ['act', '📜', 'Actes'], ['source', '🔖', 'Sources'], ['place', '📍', 'Lieux'], ['media', '🖼', 'Médias'], ['note', '📝', 'Notes']].map(([k, i, l]) => ({id: `kind:${k}`, icon: i, label: T(l), kind: k}))},
            ...groups.map(g => ({id: `group:${g}`, icon: '📁', label: T(g), kids: lists.filter(d => (d.group || 'Autres') === g).map(d => ({id: `list:${d.id}`, icon: d.icon || '📋', label: T(d.label), list: d}))}))];
    };
    const findCat = id => { for (const c of CATS()) { if (c.id === id) return c; for (const k of c.kids || []) if (k.id === id) return k; } return null; };
    function caretRect(el) {
        if (!isField(el)) return el.getBoundingClientRect();
        if (!el.matches('textarea')) { const s = getSelection(); if (s.rangeCount) { const r = s.getRangeAt(0).getBoundingClientRect(); if (r.width || r.height) return r; } return el.getBoundingClientRect(); }
        const cs = getComputedStyle(el), m = document.createElement('div');
        ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap', 'width'].forEach(p => { m.style[p] = cs[p]; });
        Object.assign(m.style, {position: 'fixed', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '0'});
        m.textContent = el.value.slice(0, el.selectionStart); const s = document.createElement('span'); s.textContent = '​'; m.appendChild(s); document.body.appendChild(m);
        const r = el.getBoundingClientRect(), sr = s.getBoundingClientRect(); m.remove();
        return {left: r.left + sr.left - el.scrollLeft, top: r.top + sr.top - el.scrollTop, bottom: r.top + sr.bottom - el.scrollTop, height: sr.height};
    }
    function open(el, {trigger = null, onPick = null} = {}) {
        if (!live() && !onPick) return; close();
        const saved = el.matches('textarea') ? {start: el.selectionStart, end: el.selectionEnd} : (() => { const s = getSelection(); return s.rangeCount ? {range: s.getRangeAt(0).cloneRange()} : {}; })();
        const ctx = ctxOf(el);
        pop = {el, trigger, saved, ctx, onPick, path: [], q: '', results: [], i: 0, ticked: new Map(), seq: 0, bk: null, basket: 0, added: new Set()};
        const box = pop.box = document.createElement('div'); box.className = 'cx-qi'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T('Insérer une info'));
        box.innerHTML = `<div class="cx-qi-top"><span class="cx-qi-crumb" data-qi-crumb></span></div>
            <div class="cx-qi-bk" data-qi-bk></div>
            <div class="cx-qi-srch"><input type="text" data-qi-q role="combobox" aria-expanded="true" aria-controls="cx-qi-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(T('Une personne, une date, une gare, une comète, une liste…'))}"></div>
            <div class="cx-qi-list" id="cx-qi-list" role="listbox" data-qi-list></div>
            <div class="cx-qi-foot">${esc(T('↑↓ choisir · → entrer ou quoi insérer · ← revenir · Espace cocher · Entrée insérer · Échap'))}</div>`;
        (el.closest('dialog[open]') || document.body).appendChild(box);
        const r = caretRect(el), W = Math.min(440, innerWidth - 24);
        box.style.width = `${W}px`; box.style.left = `${Math.max(12, Math.min(innerWidth - W - 12, r.left))}px`;
        const below = (r.bottom || r.top + 18) + 6; box.style.top = `${below + 320 > innerHeight && r.top > 340 ? Math.max(12, r.top - 330) : Math.min(below, innerHeight - 200)}px`;
        const q = box.querySelector('[data-qi-q]');
        loadBaskets().then(paintBk);
        box.querySelector('[data-qi-bk]').addEventListener('click', e => { if (e.target.closest('[data-qi-bsel]')) return pickBasket(e.target.closest('[data-qi-bsel]')); if (e.target.closest('[data-qi-bnew]')) return newBasketInline(); if (e.target.closest('[data-qi-ball]')) return toBasket(); });
        q.addEventListener('input', () => { pop.q = q.value; schedule(); });
        q.addEventListener('keydown', onKey);
        box.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
        box.addEventListener('click', e => { const it = e.target.closest('[data-qi-i]'); const ch = e.target.closest('[data-qi-c]'); const back = e.target.closest('[data-qi-back]');
            if (back) return goBack(); if (!it) return; pop.i = Number(it.dataset.qiI); const res = pop.results[pop.i]; if (ch) res.c = Number(ch.dataset.qiC); if (e.target.closest('[data-qi-tick]')) return tick(); paint(); act(); });
        setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
        hideBtn(); q.focus(); draw();
        return pop;
    }
    const outside = e => { if (pop && !pop.box.contains(e.target)) close(); };
    function close() { if (!pop) return; document.removeEventListener('mousedown', outside, true); pop.box.remove(); const el = pop.el; pop = null; try { el.focus({preventScroll: true}); } catch (_) {} }
    let tm = 0; const schedule = () => { clearTimeout(tm); tm = setTimeout(draw, 110); };
    function onKey(e) {
        if (!pop) return; const res = pop.results[pop.i];
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (pop.results.length) pop.i = (pop.i + (e.key === 'ArrowDown' ? 1 : -1) + pop.results.length) % pop.results.length; return paint(); }
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) { if (!res) return; e.preventDefault(); if (res.enter) return enter(res); if (res.choices?.length > 1) { res.c = ((res.c || 0) + 1) % res.choices.length; paint(); } return; }
        if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) { if (res?.choices?.length > 1 && (res.c || 0) > 0) { e.preventDefault(); res.c--; return paint(); } if (pop.path.length && (e.key === 'Tab' || e.target.selectionStart === 0)) { e.preventDefault(); return goBack(); } return; }
        if (e.key === 'Backspace' && !e.target.value && pop.path.length) { e.preventDefault(); return goBack(); }
        if (e.key === ' ' && res?.item && (e.ctrlKey || e.metaKey || !e.target.value || e.altKey || res.row)) { if (res.row || e.ctrlKey || e.metaKey || e.altKey || !e.target.value) { e.preventDefault(); return tick(); } }
        if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); return toBasket(); } // 🧺 au panier au lieu d'insérer (on reste ici)
        if (e.key === 'Enter') { e.preventDefault(); if (res) act(); }
    }
    function enter(res) { const c = findCat(res.enter); pop.path.push({id: res.enter, label: c?.label || res.label, icon: c?.icon || res.icon, q: pop.q}); pop.q = ''; pop.box.querySelector('[data-qi-q]').value = ''; pop.i = 0; draw(); }
    function goBack() { const p = pop.path.pop(); pop.q = p?.q || ''; pop.box.querySelector('[data-qi-q]').value = pop.q; pop.i = 0; draw(); }
    function tick() { const res = pop.results[pop.i]; if (!res?.item) return; const k = K().pickKey(res.item); if (pop.ticked.has(k)) pop.ticked.delete(k); else pop.ticked.set(k, res); paintBk(); draw(); }

    /* ═════════ chercher : tout à la fois (racine), dans une catégorie, dans une liste ═════════ */
    const recents = () => readJ(REC, []) || [];
    const lead = it => { const f = it._v?.fields || []; return it.kind === 'row' && f[0]?.[0] ? `${f[0][0]} ${it.title}` : it.title; };
    /** ce qu'on peut insérer d'un élément : chaque info, la ligne entière, en lien */
    function choicesOf(it) {
        const f = (it._v?.fields || []).filter(([h, v]) => h && v && String(v) !== String(it.title)).slice(0, 4);
        const parts = (it.kind === 'row' ? f.slice(it._v.fields[0]?.[1] === it.title ? 0 : 0) : f).filter(([h]) => it.kind !== 'row' || h !== it._v.fields[0][0]).map(([h, v]) => ({kind: 'part', label: T('« {h} » seulement', {h}), h, v: String(v)}));
        const dated = parts.findIndex(p => /\b\d{3,4}\b/.test(p.v)); if (dated > 0) parts.unshift(...parts.splice(dated, 1)); // une date d'abord (« la date d'ouverture seule »)
        return [...parts, {kind: 'whole', label: it.kind === 'row' ? T('la ligne entière') : T('tout')}, {kind: 'link', label: T('en lien')}];
    }
    const asRes = (it, extra = {}) => ({item: it, icon: it._v?.ico || K().icon?.(it) || '•', label: it.title, sub: [it._v?.who, it._v?.date, it._v?.place].filter(Boolean).join(' · ') || (it.kind === 'row' ? (it._v?.fields || []).slice(1, 3).map(([h, v]) => `${h} : ${v}`).join(' · ') : String(it.value || '').slice(0, 90)), choices: choicesOf(it), c: 0, ...extra});
    const PICK_KINDS = ['person', 'event', 'act', 'source', 'place', 'media'];
    async function searchRoot(q, seq) {
        const words = fold(q).split(/[^a-z0-9-]+/).filter(w => w.length > 1), out = [];
        if (!q.trim()) { // 🧺 ce qui a été mis de côté pour ICI d'abord (un par un, ou tout d'un coup), puis parcourir
            await loadBaskets(); const ici = iciItems(); const head = [];
            if (ici.length > 1) head.push({many: ici, icon: '▦', label: T('Insérer les {n}', {n: nf(ici.length)}), sub: T('en liste à puces, chacun avec sa source'), choices: [{kind: 'bullets', label: T('en liste à puces')}], c: 0, group: T('🧺 Mis de côté pour ici')});
            ici.slice(0, 10).forEach(it => head.push({...asRes(it), group: T('🧺 Mis de côté pour ici')}));
            return [...head, ...tickedRes(), ...CATS().map(c => ({enter: c.id, icon: c.icon, label: c.label, sub: c.kids ? T('{n} rubriques', {n: nf(c.kids.length)}) : '', group: T('Parcourir')}))];
        }
        const ctx = pop.ctx, lists = K().listsAll?.() || [];
        const srv = api('cx_search', {q, person_id: ctx.person_id || 0}).catch(() => ({base: [], lists: [], basket: []}));
        // les listes du navigateur (sans serveur) dont le nom ressemble à un mot tapé : on y cherche le mot le plus long
        const longest = [...words].sort((a, b) => b.length - a.length)[0] || '';
        const local = lists.filter(d => !d.query && typeof d.load === 'function' && words.some(w => fold(d.label).split(/[^a-z]+/).some(l => l.length > 3 && (l.startsWith(w.replace(/s$/, '')) || w.startsWith(l.replace(/s$/, '')))))).slice(0, 3);
        const locRes = Promise.all(local.map(async d => { try { const p = await ext.dataListsEngine.fetchPage(d, {q: words.filter(w => !fold(d.label).includes(w.replace(/s$/, ''))).sort((a, b) => b.length - a.length)[0] || '', crit: [], period: null, near: null, sort: '', dir: 'asc'}, 0, 4); return p.rows.map(r => K().ldRowItem(d, {}, r)); } catch (_) { return []; } }));
        // une demande en français (« les gares autour de Fontainebleau ») : un ensemble
        const ask = words.length >= 3 ? CX().parseAsk?.(q, lists).catch?.(() => null) : null;
        const [r, loc, asked] = await Promise.all([srv, locRes, ask]); if (seq !== pop?.seq) return null;
        const rec = recents().filter(x => words.every(w => fold(`${x.title} ${x.value}`).includes(w))).slice(0, 2);
        rec.forEach(x => out.push({...asRes(x), group: T('Récents')}));
        const byKind = new Map();
        (r.base || []).forEach(g => (g.items || []).forEach(x => { const it = g.kind === 'note' ? {kind: 'note', ref_id: Number(x.id), title: x.title || String(x.body || '').slice(0, 80), value: String(x.body || '').slice(0, 300), origin: x.person_name ? {kind: 'person', id: Number(x.entity_id), label: T('Fiche de {n}', {n: x.person_name})} : null} : K().pickItem(g.kind, x); byKind.set(g.kind, [...(byKind.get(g.kind) || []), it]); }));
        // ma base d'abord (ce que la personne de la fiche a de plus proche en tête), puis les listes de données dont un mot correspond
        PICK_KINDS.concat('note').forEach(k => (byKind.get(k) || []).forEach(it => out.push({...asRes(it), group: T(CX().KIND?.[k]?.[1] ? `${CX().KIND[k][1]}s` : k)})));
        const listHit = d => words.some(w => fold(`${d.id} ${d.label}`).includes(w.replace(/s$/, '')));
        const lrows = [];
        (r.lists || []).forEach(g => { const d = lists.find(x => x.id === g.src); if (d) (g.rows || []).forEach(row => lrows.push({...asRes(K().ldRowItem(d, {}, row)), group: `${d.icon || '📋'} ${T(d.label)}`, src: d, hit: listHit(d)})); });
        loc.forEach((rows, k) => rows.forEach(it => lrows.push({...asRes(it), group: `${local[k].icon || '📋'} ${T(local[k].label)}`, src: local[k], hit: true})));
        // une ligne d'une liste nommée dans la demande (« gare vulaines ») passe devant tout
        out.unshift(...lrows.filter(x => x.hit)); out.push(...lrows.filter(x => !x.hit));
        (r.basket || []).forEach(it => out.push({...asRes(it), group: T('Panier')}));
        // des éléments d'abord (8 au plus ; ce qui est mis de côté pour ici en premier), puis l'ensemble demandé, les listes et les catégories
        const iciKeys = new Set(iciItems().map(x => `${x.title}|${x.value}`)); out.sort((a, b) => (iciKeys.has(`${b.item?.title}|${b.item?.value}`) ? 1 : 0) - (iciKeys.has(`${a.item?.title}|${a.item?.value}`) ? 1 : 0));
        const items = [...tickedRes(), ...out.slice(0, 8)];
        if (asked?.id) { const d = lists.find(x => x.id === asked.id); if (d) items.push({set: {d, s: {q: '', crit: [], period: null, near: null, ...asked.preset}}, icon: '▦', label: T('L’ensemble : {l}', {l: [T(d.label), ...(K().ldCrit?.(d, {q: '', crit: [], ...asked.preset}) || [])].join(' — ')}), sub: T('en tableau, en liste à puces ou en lien'), choices: setChoices(), c: 0, group: T('Ensembles')}); }
        lists.filter(d => words.some(w => w.length > 2 && fold(d.label).split(/[^a-z]+/).some(l => l.length > 3 && (l.startsWith(w.replace(/s$/, '')) || w.replace(/s$/, '').startsWith(l.replace(/s$/, '')))))).slice(0, 3)
            .forEach(d => items.push({enter: `list:${d.id}`, icon: '📋', label: T('Liste : {l}', {l: T(d.label)}), sub: T('→ pour l’ouvrir ici'), group: T('Listes')}));
        CATS().flatMap(c => [c, ...(c.kids || [])]).filter(c => !c.list && words.some(w => w.length > 2 && fold(c.label).includes(w))).slice(0, 2)
            .forEach(c => items.push({enter: c.id, icon: '📁', label: T('Catégorie : {l}', {l: c.label}), sub: '', group: T('Catégories')}));
        return items;
    }
    const setChoices = () => [{kind: 'table', label: T('en tableau')}, {kind: 'bullets', label: T('en liste à puces')}, {kind: 'setlink', label: T('en lien')}];
    async function searchIn(id, q, seq) {
        const cat = findCat(id); if (!cat) return [];
        if (cat.kids) return cat.kids.filter(k => !q || fold(k.label).includes(fold(q))).map(k => ({enter: k.id, icon: k.icon, label: k.label, sub: '', group: cat.label}));
        if (id === 'recent') return recents().filter(x => !q || fold(`${x.title} ${x.value}`).includes(fold(q))).slice(0, 30).map(x => ({...asRes(x), group: T('Récents')}));
        if (id === 'basket') { const b = await api('cx_basket', {}); return (b.items || []).filter(x => !q || fold(`${x.title} ${x.value}`).includes(fold(q))).slice(0, 40).map(x => ({...asRes(x), group: T('Panier')})); }
        if (cat.kind) {
            if (cat.kind === 'note') { const r = await api('cx_notes', {q}); return (r.items || []).slice(0, 30).map(n => ({...asRes({kind: 'note', ref_id: Number(n.id), title: n.title || String(n.body || '').slice(0, 80), value: String(n.body || '').slice(0, 300)}), group: cat.label})); }
            const r = await api('picker_search', {kind: cat.kind, q, limit: 30, person_id: pop.ctx.person_id && cat.kind === 'event' && !q ? pop.ctx.person_id : 0});
            return (r.groups || []).flatMap(g => g.items || []).map(x => ({...asRes(K().pickItem(cat.kind, x)), group: cat.label}));
        }
        if (cat.list) {
            const d = cat.list, s = {q, crit: [], period: null, near: null, sort: '', dir: 'asc'};
            const p = await ext.dataListsEngine.fetchPage(d, s, 0, 40); if (seq !== pop?.seq) return null;
            const rows = p.rows.map(r => ({...asRes(K().ldRowItem(d, s, r)), row: true, src: d, group: `${d.icon || '📋'} ${T(d.label)}`}));
            const n = [...pop.ticked.values()].filter(x => x.row).length;
            const head = [{set: {d, s, total: p.total}, icon: '▦', label: T('L’ensemble ({n} lignes)', {n: nf(p.total)}), sub: T('en tableau, en liste à puces ou en lien · une ligne de source'), choices: setChoices(), c: 0, group: T('Ensembles')}];
            if (n) head.unshift({ticked: true, rowsOnly: true, icon: '☑', label: T('Les {n} lignes cochées', {n: nf(n)}), sub: T('en tableau, en liste à puces ou en lien'), choices: setChoices(), c: 1, group: T('Ensembles')});
            return [...head, ...rows];
        }
        return [];
    }
    async function draw() {
        if (!pop) return; const seq = ++pop.seq, q = pop.q, at = pop.path.at(-1);
        const crumb = pop.box.querySelector('[data-qi-crumb]');
        crumb.innerHTML = `${pop.path.length ? `<button type="button" class="cx-qi-back" data-qi-back aria-label="${esc(T('Revenir'))}">←</button>` : ''}<span>📎 ${esc(T('Insérer une info'))}</span>${pop.path.map(p => ` › <span>${esc(`${p.icon || ''} ${p.label}`.trim())}</span>`).join('')}${q ? ` › <i>${esc(q)}</i>` : ''}`;
        const list = pop.box.querySelector('[data-qi-list]'); list.setAttribute('aria-busy', 'true');
        let res; try { res = at ? await searchIn(at.id, q, seq) : await searchRoot(q, seq); } catch (e) { res = []; }
        if (!pop || seq !== pop.seq || res == null) return;
        pop.results = res; pop.i = Math.min(pop.i, Math.max(0, res.length - 1)); list.removeAttribute('aria-busy'); paint();
    }
    function paint() {
        if (!pop) return; const list = pop.box.querySelector('[data-qi-list]'); let g = '';
        list.innerHTML = pop.results.length ? pop.results.map((r, i) => { const head = r.group && r.group !== g ? `<div class="cx-qi-g">${esc((g = r.group))}</div>` : ''; const on = i === pop.i, tk = !!r.item && pop.ticked.has(K().pickKey(r.item));
            return `${head}<div class="cx-qi-r${on ? ' is-on' : ''}" role="option" aria-selected="${on}" id="cx-qi-o${i}" data-qi-i="${i}">${r.row || tk ? `<span class="cx-qi-tk" data-qi-tick aria-hidden="true">${tk ? '☑' : '☐'}</span>` : ''}<span class="cx-qi-ic" aria-hidden="true">${esc(r.icon || '•')}</span>
                <span class="cx-qi-t"><b>${esc(r.label)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}${on && r.choices?.length ? `<span class="cx-qi-ch">${r.choices.map((c, k) => `<button type="button" class="${k === (r.c || 0) ? 'is-on' : ''}" data-qi-c="${k}" tabindex="-1">${esc(c.label)}</button>`).join('')}</span>` : ''}</span>${r.item && pop.added.has(K().pickKey(r.item)) ? '<span class="cx-qi-in" title="🧺">🧺✓</span>' : ''}${r.enter ? '<span class="cx-qi-go" aria-hidden="true">›</span>' : ''}</div>`; }).join('')
            : `<p class="cx-qi-none">${esc(pop.q ? T('Rien pour « {q} ». Essaie un seul mot, ou parcours : ← puis une catégorie.', {q: pop.q}) : T('Tape un nom, une date, une gare, une comète…'))}</p>`;
        pop.box.querySelector('[data-qi-q]').setAttribute('aria-activedescendant', pop.results.length ? `cx-qi-o${pop.i}` : '');
        list.querySelector('.is-on')?.scrollIntoView?.({block: 'nearest'});
    }

    /* ═════════ insérer ═════════ */
    const srcShort = o => { const l = String(o?.label || '').split(' — ').pop().replace(/^Listes · /, ''); return l.length > 70 ? l.slice(0, 68) + '…' : l; };
    async function act() {
        const res = pop?.results[pop.i]; if (!res) return;
        if (res.enter) return enter(res);
        let text = '', items = [], html = '';
        const choice = res.choices?.[res.c || 0] || {kind: 'whole'};
        if (res.many || res.tickedAll) {
            const its = res.many || [...pop.ticked.values()].map(x => x.item);
            const line = it => `${K().itemLine ? K().itemLine(it) : it.title}${it.origin?.label ? ` [↗ ${srcShort(it.origin)}]` : ''}`;
            text = its.map(it => `• ${line(it)}`).join('\n'); html = `<ul>${its.map(it => `<li>${esc(K().itemLine ? K().itemLine(it) : it.title)}${hu(it.origin?.url) ? ` <a href="${esc(hu(it.origin.url))}" target="_blank" rel="noopener" class="cx-qi-src">[↗ ${esc(srcShort(it.origin))}]</a>` : it.origin?.label ? ` [↗ ${esc(srcShort(it.origin))}]` : ''}</li>`).join('')}</ul>`;
            items = its.map(it => K().cleanIt(it));
        } else if (res.set || (res.ticked && !res.tickedAll)) {
            let d, s, rows, title;
            if (res.ticked) { const t = [...pop.ticked.values()].filter(x => x.row); d = t[0].src; s = {}; rows = t.map(x => x.item); title = `${T(d.label)} — ${T('{n} lignes choisies', {n: nf(rows.length)})}`; }
            else { d = res.set.d; s = res.set.s; const raw = await K().ldAll(d, s, 500); rows = raw.map(r => K().ldRowItem(d, s, r)); title = [T(d.label), ...(K().ldCrit?.(d, s) || [])].join(' — '); }
            if (!rows.length) return A().toast?.(T('Aucune ligne trouvée avec ces critères.'));
            const cols = rows[0].data.columns, src = `${T('Source :')} ${d.source || T(d.label)}${d.sourceUrl ? ` ${d.sourceUrl}` : ''}`;
            if (choice.kind === 'table') { text = `${title}\n${cols.join(' | ')}\n${rows.map(r => r.data.row.join(' | ')).join('\n')}\n${src}`; html = `<p><b>${esc(title)}</b></p><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.data.row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table><p><small>${esc(T('Source :'))} ${hu(d.sourceUrl) ? `<a href="${esc(hu(d.sourceUrl))}" target="_blank" rel="noopener">${esc(d.source || T(d.label))}</a>` : esc(d.source || '')}</small></p>`; }
            else if (choice.kind === 'bullets') { text = `${title}\n${rows.map(r => `• ${r.title}${r.value ? ` — ${r.value}` : ''}`).join('\n')}\n${src}`; html = `<p><b>${esc(title)}</b></p><ul>${rows.map(r => `<li>${esc(r.title)}${r.value ? ` — ${esc(r.value)}` : ''}</li>`).join('')}</ul><p><small>${esc(src)}</small></p>`; }
            else { text = `${title} [↗ ${d.source || T(d.label)}]`; html = hu(d.sourceUrl) ? `<a href="${esc(hu(d.sourceUrl))}" target="_blank" rel="noopener" class="cx-qi-chip">▦ ${esc(title)}</a>` : `▦ ${esc(title)}`; }
            items = [K().ldSet ? K().ldSet(d, s, []) : null].filter(Boolean).map(x => ({...x, title, data: {...x.data, columns: cols, rows: rows.map(r => r.data.row)}}));
        } else {
            const it = res.item, o = it.origin || {};
            if (choice.kind === 'part') { text = `${lead(it)} — ${choice.h.toLowerCase()} : ${choice.v}`; items = [{kind: 'datum', title: lead(it).slice(0, 200), value: `${choice.h} : ${choice.v}`, ref_id: 0, origin: o}]; }
            else if (choice.kind === 'link') { text = it.title; items = [K().cleanIt(it)]; }
            else { text = K().itemLine ? K().itemLine(it) : it.title; items = [K().cleanIt(it)]; }
            html = `${esc(text)}`;
            if (o.label || o.url) { text += ` [↗ ${srcShort(o) || T('source')}]`; html += hu(o.url) ? ` <a href="${esc(hu(o.url))}" target="_blank" rel="noopener" class="cx-qi-src">[↗ ${esc(srcShort(o) || T('source'))}]</a>` : ` [↗ ${esc(srcShort(o) || T('source'))}]`; }
            if (choice.kind === 'link' && hu(o.url)) html = `<a href="${esc(hu(o.url))}" target="_blank" rel="noopener" class="cx-qi-chip">${esc(it.title)}</a>`;
            writeJ(REC, [K().cleanIt(it), ...recents().filter(x => `${x.kind}|${x.title}|${x.value}` !== `${it.kind}|${it.title}|${it.value}`)].slice(0, 30));
        }
        const {el, trigger, saved, ctx, onPick} = pop; close();
        if (onPick) return onPick(items, {text}); // « 🔍 Chercher partout » de « Prendre depuis… » : coché, pas inséré
        await insert(el, {text, html, trigger, saved, ctx, items});
    }
    async function insert(el, {text, html, trigger, saved, ctx, items}) {
        let undoText;
        if (el.matches('textarea')) {
            const before = trigger ? el.value.slice(0, trigger.start) + el.value.slice(trigger.start + trigger.len) : el.value; let a = saved.start, b = saved.end;
            if (trigger) { a = trigger.start; b = Math.max(b, trigger.start + trigger.len); }
            const pre = el.value.slice(0, a), post = el.value.slice(b), sep = post && !/^\s/.test(post) ? ' ' : '';
            el.value = pre + text + sep + post; const pos = (pre + text + sep).length; el.focus(); el.setSelectionRange(pos, pos);
            undoText = () => { el.value = before; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); };
        } else {
            const before = el.innerHTML; el.focus();
            const s = getSelection(); s.removeAllRanges(); const r = saved.range || document.createRange(); if (!saved.range) { r.selectNodeContents(el); r.collapse(false); }
            if (trigger?.node?.isConnected) { r.setStart(trigger.node, trigger.start); r.setEnd(trigger.node, Math.min(trigger.node.data.length, trigger.start + trigger.len)); }
            s.addRange(r); r.deleteContents(); const frag = r.createContextualFragment(`${html}&nbsp;`); const last = frag.lastChild; r.insertNode(frag); if (last) { r.setStartAfter(last); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
            undoText = () => { el.innerHTML = before; el.dispatchEvent(new Event('input', {bubbles: true})); };
        }
        el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
        let undoCite = null; try { undoCite = items.length && ctx.host?.cite ? await ctx.host.cite(el, items, ctx) : null; } catch (e) { A().toast?.(e.message, 'error'); }
        const msg = undoCite ? T('📎 Inséré, et la source est gardée dans la piste') : T('📎 Inséré, avec sa source');
        (A().undoToast || ((m) => A().toast?.(m)))(msg, {icon: '📎', undo: async () => { undoText(); await undoCite?.(); }});
    }

    /* ═════════ 🧺 mettre de côté depuis la petite fenêtre (Maj+Entrée), et reprendre ce qui est mis de côté pour ICI ═════════ */
    const post = b => A().api('cx_write', {}, {method: 'POST', body: b}).then(r => r?.result ?? r);
    async function loadBaskets() { if (!pop) return null; try { pop.bk = await api('cx_basket', {all: 1}); } catch (_) { pop.bk = {baskets: [], items: []}; }
        if (!pop.basket) { const ici = iciBaskets(); pop.basket = Number(ici[0]?.id) || Number(readJ('genealogie-connexions-panier', 0)) || Number(pop.bk.basket_id) || 0; } return pop.bk; }
    /** les paniers qui vont d'habitude ICI (cette enquête, cette fiche…) */
    const iciBaskets = () => { const c = pop?.ctx || {}; return (pop?.bk?.baskets || []).filter(b => (b.dests || []).some(d => (c.investigation_id && Number(d.ctx?.investigation_id) === Number(c.investigation_id)) || (c.person_id && Number(d.ctx?.person_id) === Number(c.person_id)))); };
    const iciItems = () => { const ids = new Set(iciBaskets().map(b => Number(b.id))); return (pop?.bk?.items || []).filter(it => ids.has(Number(it.basket_id))); };
    const tickedRes = () => { const its = [...(pop?.ticked.values() || [])].filter(x => !x.row); return its.length ? [{tickedAll: true, icon: '☑', label: T('Les {n} cochés', {n: nf(its.length)}), sub: T('Entrée : les insérer · Maj+Entrée : au panier'), choices: [{kind: 'bullets', label: T('en liste à puces')}], c: 0, group: T('Cochés')}] : []; };
    function paintBk() {
        if (!pop) return; const host = pop.box.querySelector('[data-qi-bk]'), b = (pop.bk?.baskets || []).find(x => Number(x.id) === Number(pop.basket)), n = pop.ticked.size;
        host.innerHTML = `<span class="cx-qi-muted">${esc(T('Maj+Entrée : au panier'))}</span><button type="button" class="cx-qi-chipb" data-qi-bsel title="${esc(T('Dans quel panier'))}">🧺 ${esc(b ? (b.path || [b.name]).join(' › ') : T('Mon panier'))} ▾</button><button type="button" class="cx-qi-chipb" data-qi-bnew>＋ ${esc(T('Nouveau panier'))}</button>${n ? `<button type="button" class="cx-qi-chipb is-pri" data-qi-ball>🧺 ${esc(T('Tout au panier ({n})', {n: nf(n)}))}</button>` : ''}${pop.added.size ? `<span class="cx-qi-ok">✓ ${esc(T('{n} mis de côté', {n: nf(pop.added.size)}))}</span>` : ''}`;
    }
    function pickBasket(anchor) {
        const all = pop.bk?.baskets || [], ici = iciBaskets(), cur = Number(readJ('genealogie-connexions-panier', 0));
        const row = (x, tag) => ({icon: x.icon || '🧺', label: `${(x.path || [x.name]).join(' › ')} (${nf(x.count)})${tag ? ` · ${tag}` : ''}`, run: () => { pop.basket = Number(x.id); paintBk(); }});
        UI().menuAt?.(anchor, [...ici.map(x => row(x, T('ici'))), ...all.filter(x => !ici.includes(x) && Number(x.id) === cur).map(x => row(x, T('récent'))), '-', ...all.filter(x => !ici.includes(x) && Number(x.id) !== cur).map(x => row(x))], {title: T('Dans quel panier ?')});
    }
    /** ＋ Nouveau panier : le nom tapé ici même ; il va d'habitude ICI (cette enquête…) */
    function newBasketInline() {
        const host = pop.box.querySelector('[data-qi-bk]');
        host.innerHTML = `<input type="text" data-qi-bname placeholder="${esc(T('Le nom du panier, puis Entrée'))}" aria-label="${esc(T('Le nom du nouveau panier'))}">`;
        const inp = host.querySelector('input'); inp.focus();
        inp.addEventListener('keydown', async e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); paintBk(); pop.box.querySelector('[data-qi-q]').focus(); return; }
            if (e.key !== 'Enter' || !inp.value.trim()) return; e.preventDefault();
            const c = pop.ctx, dests = c.investigation_id ? [{id: 'investigation', label: T('l’enquête'), ctx: {investigation_id: c.investigation_id, item_id: c.item_id || 0, mode: 'one'}}] : [];
            const r = await post({op: 'basket_new', name: inp.value.trim(), dests}); writeJ('genealogie-connexions-panier', Number(r.id)); pop.basket = Number(r.id); await loadBaskets(); paintBk();
            A().toast?.(T('🧺 Panier « {n} » créé : Maj+Entrée y met ce que tu choisis.', {n: inp.value.trim()})); pop.box.querySelector('[data-qi-q]').focus();
        });
    }
    async function toBasket() {
        if (!pop) return; const res = pop.results[pop.i], its = pop.ticked.size ? [...pop.ticked.values()].map(x => x.item) : res?.item ? [res.item] : [];
        if (!its.length) return;
        const items = its.map(it => K().cleanIt(it)), r = await post({op: 'basket_add', basket_id: pop.basket || 0, items});
        its.forEach(it => pop.added.add(K().pickKey(it))); pop.ticked.clear(); CX().refresh?.();
        A().toast?.(r.ids?.length ? T('🧺 {n} mis de côté', {n: nf(r.ids.length)}) : T('Déjà dans le panier.'));
        await loadBaskets(); paintBk(); paint();
    }

    /* ═════════ réglages (dans 🧺 Panier et connexions) ═════════ */
    function settingsHtml() {
        const s = settings();
        return `<div class="maintenance-panel cx-qi-settings"><h3>📎 ${esc(T('Insérer une info'))}</h3>
            <label class="checkbox-line"><input type="checkbox" data-qi-set="on" ${s.on !== false ? 'checked' : ''}> ${esc(T('Dans les textes libres (notes, pistes, journal, Atelier…), insérer une date, un lieu, une ligne de liste à l’endroit du curseur'))}</label>
            <label class="checkbox-line"><input type="checkbox" data-qi-set="button" ${s.button !== false ? 'checked' : ''}> ${esc(T('Le petit 📎 sur le champ où l’on écrit'))}</label>
            <label>${esc(T('Ce qui ouvre la fenêtre en début de ligne'))} <select data-qi-trig><option value="/" ${s.trigger === '/' ? 'selected' : ''}>/</option><option value="@" ${s.trigger === '@' ? 'selected' : ''}>@</option><option value="" ${!s.trigger ? 'selected' : ''}>${esc(T('rien (seulement 📎 et le raccourci)'))}</option></select></label>
            <p class="muted"><small>${esc(T('Raccourci : {k} (Réglages → Raccourcis clavier).', {k: keyHint()}))}</small></p></div>`;
    }
    function bindSettings(host) {
        host.querySelectorAll('[data-qi-set]').forEach(c => c.addEventListener('change', () => { writeJ(KEY, {...settings(), [c.dataset.qiSet]: c.checked}); A().toast?.(c.checked ? T('Activé') : T('Éteint')); }));
        host.querySelector('[data-qi-trig]')?.addEventListener('change', e => { writeJ(KEY, {...settings(), trigger: e.target.value}); });
    }
    /** un champ d'un écran le dit lui-même : son contexte (une fiche, une enquête…) */
    function attach(el, {context = null} = {}) { if (!el) return; if (context) el.dataset.insertContext = JSON.stringify(context); el.dataset.insertInfo = '1'; }
    /** 📎 depuis une liste (☑ lignes choisies, ou le 📎 d'une ligne) : un bloc déjà prêt {text, html, items, sheet?}. Où le poser :
     *  le dernier texte où l'on écrivait (s'il est encore à l'écran), « Mettre dans… » (une note, une enquête, l'Atelier…),
     *  📒 une fiche (b.sheet : un nouveau bloc « Données » figé, heritage-fiches.js), ou copié. */
    function insertBlock(b, {anchor = null} = {}) {
        if (!live()) { A().toast?.(kiosk() ? T('Mode consultation : rien ne peut être écrit.') : T('« Insérer une info » est éteint (Réglages → 🧺 Panier et connexions).')); return null; }
        const el = lastField?.isConnected && isField(lastField) && lastField.getClientRects().length ? lastField : null;
        const here = el => insert(el, {text: b.text, html: b.html, trigger: null, saved: el.matches('textarea') ? {start: el.selectionStart, end: el.selectionEnd} : {}, ctx: ctxOf(el), items: b.items || []});
        const copy = async () => { try { await navigator.clipboard.writeText(b.text); A().toast?.(T('📎 Copié, avec les sources : colle-le où tu veux.')); } catch (_) { A().toast?.(T('Copie impossible.'), 'error'); } };
        const menu = [el ? {icon: '📎', label: T('À l’endroit du curseur (le dernier texte ouvert)'), run: () => here(el)} : null,
            CX().putInto ? {icon: '📍', label: T('Dans une note, une enquête, l’Atelier…'), run: () => CX().putInto(b.items || [], {anchor})} : null,
            b.sheet && ext.fiches?.addDataSnapshot ? {icon: '📒', label: T('Dans une fiche → nouveau bloc Données (figé)'), run: () => ext.fiches.addDataSnapshot(b.sheet, {anchor})} : null, // heritage-fiches.js
            {icon: '⧉', label: T('Copier le texte (avec les sources)'), run: copy}].filter(Boolean);
        if (!UI().menuAt) return copy();
        return UI().menuAt(anchor || document.body, menu, {title: b.items?.length === 1 && b.items[0].kind !== 'set' ? T('Insérer…') : T('Insérer un bloc ({t})', {t: b.title || ''})});
    }
    ext.insertInfo = {attach, open: (el, o) => open(el || lastField, o || {}), openHere, hosts, settings, settingsHtml, bindSettings, close: () => close(), isOpen: () => !!pop, insertBlock};
})();
