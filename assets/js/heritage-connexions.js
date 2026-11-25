/* LCNDA — 🔌 Connexions : 📥 « Prendre depuis… », 🧺 le panier, 📍 « Mettre dans… » (maquette validée docs/design/connexions-besoins.html).
 * Serveur : lib/connexions.php (tables cx_baskets, cx_basket_items, investigation_item_links, cx_links). Essai : tests/test-connexions-panier.js
 *
 * Rien n'est calculé au repos : le nombre d'éléments du panier est lu une fois (GET cx_count, après l'affichage), le panier
 * lui-même seulement quand on l'ouvre ; les fenêtres ne cherchent que quand on les ouvre. Rien n'est rangé tout seul :
 * toujours un clic, avec « ↶ Annuler ». Réglages → « 🧺 Panier et connexions » (clé genealogie-connexions) : tout éteindre,
 * un ou plusieurs paniers, clic droit, glisser. Raccourci : ⌥⌘O (Ctrl+Alt+O sous Windows et Linux ; « take_from », Réglages → Raccourcis clavier ;
 * ⇧⌘O était déjà pris par « Écran divisé : côte à côte ou en haut et en bas »).
 *
 * ─── Comment un module s'inscrit ───────────────────────────────────────────────────────────────────────────────────────
 *  Un élément pris : {kind, ref_id, title, value, data, origin}
 *    kind : person · event · act · source · media · note · place · investigation · datum (une info précise : une date, un
 *      lieu, un champ) · text (un passage) · row (une ligne de liste) · data (un résultat de « Données ») · set (un ensemble :
 *      data = {columns, rows, source, url, criteria, request, imported, licence} — compté comme 1, avec son nombre de lignes)
 *    origin : {kind, id, label, url, field, person_id, open} — d'où il vient (le lien ↗ pour y revenir).
 *
 *  1. Ce qu'un écran sait RECEVOIR (« 📍 Mettre dans… », glisser du panier, « Prendre depuis… » de cet écran) :
 *    (LCNDA_EXT.dropTargets = LCNDA_EXT.dropTargets || []).push({
 *      id: 'mon_outil', icon: '🧩', label: 'Mon outil', group: 'Créer' | 'Chercher' | 'Ranger',
 *      kinds: ['media', 'set', …] | null (tout),                 // ce qu'il prend (le reste reste dans le panier)
 *      here: () => ctx | null,                                   // l'écran ouvert sait recevoir : {…, label: 'Ici : …'}
 *      choose: async (items, anchor) => ctx | null,              // sinon : choisir où (une fenêtre, un menu)
 *      explain: (items, ctx) => 'la photo sur la piste vidéo',   // « ce que ça fera », écrit par l'outil, une fois
 *      receive: async (items, ctx) => ({message, undo, redo, left}), // ranger ; undo = « ↶ Annuler » ; left = ce qui n'a pas pu être pris (reste dans le panier)
 *    });
 *  2. Ce qu'un outil sait FOURNIR à « Prendre depuis… » (onglet « 🧰 Données ») : une info précise pour une date, un lieu…
 *    (LCNDA_EXT.pickSources = LCNDA_EXT.pickSources || []).push({
 *      id, icon, label, needs: ['place', 'date'] (person, place, year, date), source, sourceUrl,
 *      installed: async () => bool, install: () => …,
 *      fetch: async ctx => ({title, facts: [{label, value, url}], source, url}),       // ctx = {person, place, year, date}
 *      range: async (ctx, progress) => ({columns, rows, source, url}),                 // facultatif : du… au… (ctx.from, ctx.to)
 *    });
 *    Les LCNDA_EXT.dataSources (run(ctx, hôte)) et les LCNDA_EXT.dataLists (moteur des Listes : critères, période, autour de…)
 *    sont proposés aussi, sans rien écrire de plus.
 *  3. Entrées toutes prêtes : LCNDA_EXT.connexions.addMenuItems(screen) (les lignes « 📥 Prendre depuis… » et « 🧺 Vider le panier
 *    ici » pour un bouton « ＋ Ajouter »), .take(items) (au panier), .putInto(items, {anchor}), .openTake(), .openBasket().
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const api = (a, q) => A().api(a, q);
    const post = (op, body = {}) => A().api('cx_write', {}, {method: 'POST', body: {op, ...body}}).then(r => r?.result ?? r);
    const apiPost = (a, body) => A().api(a, {}, {method: 'POST', body}).then(r => r?.result ?? r);
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${nf(n)} ${n > 1 ? (many || one + 's') : one}`);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const S = () => A().state || {};
    const undoToast = (msg, o) => (A().undoToast ? A().undoToast(msg, o) : toast(msg));

    /* ═════════════ réglages ═════════════ */
    const KEY = 'genealogie-connexions', CUR = 'genealogie-connexions-panier', RECENT = 'genealogie-connexions-recents';
    const DEF = {on: true, multi: false, ctx: true, dnd: true};
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const settings = () => ({...DEF, ...(readJ(KEY, {}) || {})});
    const enabled = () => settings().on !== false;
    const curBasket = () => Number(readJ(CUR, 0)) || 0; // le panier en cours (le dernier utilisé ; 0 = le premier)

    /* ═════════════ les sortes ═════════════ */
    const KIND = {person: ['👤', 'Fiche'], event: ['📅', 'Événement'], act: ['📜', 'Acte'], source: ['🔖', 'Source'], media: ['🖼', 'Média'], note: ['📝', 'Note'], place: ['📍', 'Lieu'],
        investigation: ['🕵️', 'Enquête'], datum: ['✳️', 'Info précise'], text: ['❝', 'Passage'], row: ['📋', 'Ligne de liste'], data: ['🧰', 'Donnée'], set: ['▦', 'Ensemble'],
        citation: ['🔖', 'Citation'], digest: ['📜', 'Dépouillement'], courrier: ['📮', 'Courrier'], reminder: ['⏰', 'Rappel'], atelier: ['📚', 'Élément de l’Atelier']};
    const icon = it => (it.kind === 'set' && it.data?.icon) || KIND[it.kind]?.[0] || '•';
    const setCount = it => (it.kind === 'set' ? (it.data?.rows || []).length : 0);
    const itemLine = it => `${it.title || ''}${it.value && it.value !== it.title ? ` — ${it.value}` : ''}`.trim();
    /** un élément en texte, avec sa source (note, Atelier, document) */
    function itemText(it) {
        const o = it.origin || {}, src = [o.label, o.url].filter(Boolean).join(' — ');
        if (it.kind === 'set') {
            const d = it.data || {}, head = (d.columns || []).join(' | ');
            return `${it.title}${d.criteria ? ` (${d.criteria})` : ''}\n${head}\n${(d.rows || []).map(r => (r || []).join(' | ')).join('\n')}\n${T('Source :')} ${[d.source, d.url, d.licence].filter(Boolean).join(' — ') || src}${d.imported ? `\n${T('Importé le {d}', {d: d.imported})}` : ''}`;
        }
        return `${itemLine(it)}${src ? `\n${T('Source :')} ${src}` : ''}`;
    }
    const itemHtml = it => {
        if (it.kind === 'set') { const d = it.data || {}; return `<p><b>${esc(it.title)}</b>${d.criteria ? ` <i>(${esc(d.criteria)})</i>` : ''}</p><table><tr>${(d.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr>${(d.rows || []).map(r => `<tr>${(r || []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table><p><small>${esc(T('Source :'))} ${esc([d.source, d.licence].filter(Boolean).join(' — '))}${d.url ? ` ${esc(d.url)}` : ''}</small></p>`; }
        const o = it.origin || {}; return `<p>${esc(itemLine(it))}${o.label || o.url ? `<br><small>${esc(T('Source :'))} ${esc([o.label, o.url].filter(Boolean).join(' — '))}</small>` : ''}</p>`;
    };
    /** un ensemble → des éléments séparés (une ligne chacun) */
    const explode = it => (it.kind !== 'set' ? [it] : (it.data?.rows || []).map(r => ({kind: 'row', title: String((r || [])[0] ?? ''), value: (r || []).slice(1).filter(x => x !== '' && x != null).join(' · '),
        _from: it.id, data: {columns: it.data.columns, row: r}, origin: {label: [it.title, it.data.source].filter(Boolean).join(' — '), url: it.data.url || it.origin?.url || ''}})));

    /* ═════════════ 🧺 le panier ═════════════ */
    let count = null, basket = null, loading = null; // basket : {basket_id, baskets, items} chargé à la demande
    let baskets = null; // la liste des paniers (nom, emoji, couleur, nombre, date) : lue avec le panier
    const basketName = id => { const b = (baskets || []).find(x => Number(x.id) === Number(id)); return b && (baskets.length > 1 || b.name !== 'Mon panier') ? `${b.icon ? b.icon + ' ' : ''}${b.name}` : ''; };
    async function loadBasket(force = false) {
        if (basket && !force) return basket;
        if (loading && !force) return loading;
        loading = api('cx_basket', {basket_id: curBasket()}).then(r => { basket = r; baskets = r.baskets || baskets; count = (r.items || []).length; paintPill(); return r; }).finally(() => { loading = null; });
        return loading;
    }
    const setCountFrom = r => { if (r && r.count != null) { count = Number(r.count); paintPill(); } basket = null; };
    async function take(items, {quiet = false, origin = null, basketId = null} = {}) {
        items = (items || []).filter(Boolean).map(it => (origin && !it.origin ? {...it, origin} : it));
        if (!items.length) return null;
        if (kiosk()) { toast(T('Mode consultation : rien ne peut être mis de côté.')); return null; }
        if (basketId && Number(basketId) !== curBasket()) { writeJ(CUR, Number(basketId)); basket = null; count = null; } // le panier choisi devient celui en cours (retenu)
        const r = await post('basket_add', {basket_id: curBasket(), items});
        setCountFrom(r); remember(items);
        if (!quiet) {
            const n = r.ids.length, bn = basketName(r.basket_id);
            const msg = n ? (bn ? T('🧺 {n} dans « {b} »', {n: plural(n, T('chose'), T('choses')), b: bn}) : T('🧺 {n} au panier', {n: plural(n, T('chose'), T('choses'))})) + (r.skipped ? ` ${T('({n} déjà dedans)', {n: r.skipped})}` : '') : T('Déjà dans le panier.');
            if (n) undoToast(msg, {icon: '🧺', undo: async () => { setCountFrom(await post('basket_remove', {ids: r.ids})); refreshPanel(); }, redo: async () => { setCountFrom(await post('basket_add', {basket_id: r.basket_id, items})); refreshPanel(); }});
            else toast(msg);
        }
        refreshPanel();
        return r;
    }
    async function removeFromBasket(ids, {quiet = false} = {}) {
        const r = await post('basket_remove', {ids}); setCountFrom(r); refreshPanel();
        if (!quiet && r.removed?.length) undoToast(T('{n} retirées du panier', {n: plural(r.removed.length, T('chose'), T('choses'))}), {icon: '🧺', undo: async () => { setCountFrom(await post('basket_restore', {rows: r.removed})); refreshPanel(); }});
        return r;
    }
    const remember = items => { const list = readJ(RECENT, []) || []; const keyOf = x => `${x.kind}|${x.ref_id || 0}|${x.title}|${x.value || ''}`; const seen = new Set(items.map(keyOf));
        writeJ(RECENT, [...items.map(x => ({kind: x.kind, ref_id: x.ref_id || 0, title: x.title, value: x.value || '', origin: x.origin || null, data: x.kind === 'set' ? null : x.data || null})), ...list.filter(x => !seen.has(keyOf(x)))].slice(0, 40)); };

    /* ── la pastille : seulement s'il y a quelque chose ── */
    let pill = null;
    function paintPill() {
        if (!enabled() || !count) { if (pill) pill.hidden = true; return; }
        if (!pill) {
            const meta = document.querySelector('.topbar-meta'); if (!meta) return;
            const hiddenBar = !meta.getClientRects().length; // petit écran : la barre du haut est cachée → la pastille flotte en bas à droite
            pill = document.createElement('button'); pill.type = 'button'; pill.className = 'screen-tool cx-pill'; pill.id = 'cx-pill';
            pill.setAttribute('aria-haspopup', 'dialog');
            if (hiddenBar) { pill.classList.add('is-float'); document.body.appendChild(pill); } else meta.insertBefore(pill, meta.querySelector('.status-dot') || null);
            pill.addEventListener('click', () => openBasket(pill));
            pill.addEventListener('dragover', e => { if (dragItems(e) !== null || e.dataTransfer?.types?.includes('text/plain')) { e.preventDefault(); pill.classList.add('is-over'); } });
            pill.addEventListener('dragleave', () => pill.classList.remove('is-over'));
            pill.addEventListener('drop', e => { pill.classList.remove('is-over'); const txt = e.dataTransfer?.getData('text/plain'); if (txt && dragItems(e) === null) { e.preventDefault(); take([{kind: 'text', title: txt.slice(0, 120), value: txt.length > 120 ? txt : '', origin: screenOrigin()}]); } });
        }
        pill.hidden = false;
        const cb = (baskets || []).find(x => Number(x.id) === (curBasket() || Number(baskets[0]?.id)));
        pill.innerHTML = `<span aria-hidden="true">${esc(cb?.icon || '🧺')}</span><b>${esc(nf(count))}</b>`;
        pill.title = T('Le panier : {n} (cliquer pour l’ouvrir, glisser une chose dessus pour l’y mettre)', {n: plural(count, T('chose'), T('choses'))}) + (cb && baskets.length > 1 ? ` — ${cb.name}` : '');
        pill.setAttribute('aria-label', T('Le panier : {n}', {n: plural(count, T('chose'), T('choses'))}));
    }
    const boot = () => { if (!enabled() || count != null) return; api('cx_count', {basket_id: curBasket()}).then(r => { if (count != null) return; count = Number(r.count) || 0; paintPill(); }) /* une prise faite entre-temps a déjà le bon nombre */.catch(() => {}); };
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
    if (document.readyState === 'complete') idle(boot, {timeout: 4000}); else window.addEventListener('load', () => idle(boot, {timeout: 4000}), {once: true});

    /* ── le panneau du panier ── */
    let panel = null;
    function refreshPanel() { if (panel?.isConnected) drawPanel(); }
    async function openBasket(anchor = pill) {
        if (panel?.isConnected) { panel.remove(); panel = null; return; }
        panel = document.createElement('div'); panel.className = 'cx-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', T('Mon panier'));
        document.body.appendChild(panel);
        const r = anchor?.getBoundingClientRect?.();
        if (r && innerWidth > 520) { panel.style.top = `${Math.round(r.bottom + 6)}px`; panel.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`; }
        panel.innerHTML = UI().spinner ? UI().spinner(T('Chargement…')) : '…';
        const close = e => { if (!panel) return; if (e.type === 'keydown' ? e.key === 'Escape' : !panel.contains(e.target) && !e.target.closest?.('#cx-pill, .ui-actmenu, dialog, .toast')) { panel.remove(); panel = null; document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', close, true); } };
        setTimeout(() => { document.addEventListener('mousedown', close, true); document.addEventListener('keydown', close, true); }, 0);
        await drawPanel(true);
    }
    async function drawPanel(force = false) {
        const b = await loadBasket(force || !basket); if (!panel) return;
        const items = b.items || [];
        panel.innerHTML = `<div class="cx-panel-head">${basketSelect(b, 'data-cx-bsel')}
            <button type="button" class="icon-button" data-cx-close aria-label="${esc(T('Fermer'))}">×</button></div>
            ${items.length ? `<ul class="cx-plist">${items.map(it => `<li draggable="${settings().dnd ? 'true' : 'false'}" data-cx-bi="${it.id}"><span class="cx-ico" aria-hidden="true">${icon(it)}</span><span class="cx-t"><b>${esc(it.title)}</b>${it.kind === 'set' ? ` <small class="cx-n">${esc(plural(setCount(it), T('ligne')))}</small>` : ''}${it.value && it.kind !== 'set' ? `<small>${esc(String(it.value).slice(0, 140))}</small>` : ''}${it.origin?.label ? `<small class="muted">${esc(T('de :'))} ${esc(it.origin.label)}</small>` : ''}</span>
                ${it.origin && (it.origin.open || it.origin.url || it.origin.id) ? `<button type="button" class="link-button" data-cx-go="${it.id}" title="${esc(T('Revenir là d’où ça vient'))}">↗</button>` : ''}<button type="button" class="icon-button small" data-cx-x="${it.id}" aria-label="${esc(T('Retirer du panier'))}" title="${esc(T('Retirer du panier'))}">×</button></li>`).join('')}</ul>
                <div class="cx-panel-acts"><button type="button" class="button small" data-cx-put>📍 ${esc(T('Mettre dans…'))}</button><button type="button" class="button small secondary" data-cx-keep>⭐ ${esc(T('Garder comme liste'))}</button><button type="button" class="button small secondary danger" data-cx-clear>${esc(T('Tout retirer'))}</button></div>
                ${settings().dnd ? `<p class="cx-hint muted">${esc(T('…ou glisse une ligne (ou tout le panier) sur l’écran ouvert.'))}</p>` : ''}`
            : `<p class="muted cx-empty">${esc(T('Le panier est vide. Coche des choses n’importe où (« 🧺 Au panier »), ou clic droit sur une date, un lieu, une phrase : « 🧺 Prendre… ».'))}</p>`}
            <div class="cx-panel-foot">${basketMeta(b)}<span class="cx-sp"></span><button type="button" class="link-button" data-cx-bfull>⛶ ${esc(T('Ouvrir en grand'))}</button> · <button type="button" class="link-button" data-cx-brename>✎ ${esc(T('Modifier'))}</button> · <button type="button" class="link-button" data-cx-bdup>⧉ ${esc(T('Dupliquer'))}</button>${(b.baskets || []).length > 1 ? ` · <button type="button" class="link-button" data-cx-bdel>🗑 ${esc(T('Supprimer ce panier'))}</button>` : ''}</div>`;
        bindPanel(items, b);
    }
    function bindPanel(items, b) {
        const byId = id => items.find(x => Number(x.id) === Number(id));
        panel.querySelector('[data-cx-close]')?.addEventListener('click', () => { panel.remove(); panel = null; });
        panel.querySelectorAll('[data-cx-x]').forEach(x => x.addEventListener('click', () => removeFromBasket([Number(x.dataset.cxX)])));
        panel.querySelectorAll('[data-cx-go]').forEach(x => x.addEventListener('click', () => openOrigin(byId(x.dataset.cxGo))));
        panel.querySelector('[data-cx-put]')?.addEventListener('click', e => putInto(items, {anchor: e.currentTarget, fromBasket: true, dests: bOf(b, b.basket_id)?.dests}));
        panel.querySelector('[data-cx-clear]')?.addEventListener('click', async () => {
            const r = await post('basket_clear', {basket_id: b.basket_id}); setCountFrom(r); refreshPanel();
            undoToast(T('Panier vidé ({n})', {n: plural(r.removed.length, T('chose'), T('choses'))}), {icon: '🧺', undo: async () => { setCountFrom(await post('basket_restore', {rows: r.removed})); refreshPanel(); }});
        });
        panel.querySelector('[data-cx-keep]')?.addEventListener('click', () => keepAsList(items, b));
        panel.querySelector('[data-cx-bsel]')?.addEventListener('change', async e => { await switchBasket(e.target.value, b); drawPanel(true); });
        panel.querySelector('[data-cx-brename]')?.addEventListener('click', async () => { await editBasket(b.basket_id); drawPanel(true); });
        panel.querySelector('[data-cx-bdup]')?.addEventListener('click', async () => { await dupBasket(b.basket_id); drawPanel(true); });
        panel.querySelector('[data-cx-bfull]')?.addEventListener('click', () => { panel.remove(); panel = null; openBasketView(); });
        panel.querySelector('[data-cx-bdel]')?.addEventListener('click', async () => { await delBasket(b.basket_id); drawPanel(true); });
        panel.querySelectorAll('li[draggable="true"]').forEach(li => li.addEventListener('dragstart', e => {
            const one = byId(li.dataset.cxBi), list = e.altKey ? items : [one];
            startDrag(e, list, {fromBasket: true});
        }));
    }
    /* ═════════════ 🧺 les paniers nommés (« Mariage MAZAUD 1813 »), rangés dans des 📁 dossiers (dossier › sous-dossier › …) ═════════════
     * Un panier contient des éléments ; un dossier contient des paniers et des sous-dossiers, et toujours au moins un panier quelque part dedans
     * (un nouveau dossier vient avec « Nouveau panier » ; vider un dossier de son dernier panier propose de le supprimer, avec ↶).
     * Pour l'écran « Paniers » à venir : LCNDA_EXT.cxBaskets = {tree, items, create, createFolder, edit, editFolder, move, moveFolder, remove, removeFolder, moveItems}. */
    let folders = null;
    const ICI = () => new RegExp(`^\\s*${T('Ici')}\\s*:\\s*`, 'i');
    const bLabel = x => `${x.icon || '🧺'} ${x.name}`;
    const shortWhen = s => { const d = new Date(String(s || '').replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}) : ''; };
    const bOf = (b, id) => (b?.baskets || baskets || []).find(y => Number(y.id) === Number(id)) || null;
    const fOf = id => (folders || []).find(y => Number(y.id) === Number(id)) || null;
    const fKids = id => (folders || []).filter(x => Number(x.parent_id) === Number(id));
    const fTree = id => { const out = [Number(id)]; for (let k = 0; k < out.length; k++) fKids(out[k]).forEach(x => { if (!out.includes(Number(x.id))) out.push(Number(x.id)); }); return out; };
    const crumbs = x => { if (!x) return ''; const f = fOf(x.folder_id); return [...(f ? f.path.map(n => `📁 ${n}`) : []), bLabel(x)].join(' › '); };
    const keepTree = r => { if (r?.baskets) baskets = r.baskets; if (r?.folders) folders = r.folders; return r; };
    /** « 🧺 Mariage MAZAUD 1813 ▾ » : les paniers rangés par dossier, « ＋ Nouveau panier… », « ＋ Nouveau dossier… » */
    const basketSelect = (b, attr) => { const list = b.baskets || [], top = list.filter(x => !Number(x.folder_id)), opt = x => `<option value="${x.id}" ${Number(x.id) === Number(b.basket_id) ? 'selected' : ''}>${esc(`${bLabel(x)} (${nf(x.count)})`)}</option>`;
        return `<label class="cx-bsw"><span class="cx-sr">${esc(T('Quel panier'))}</span><select ${attr} aria-label="${esc(T('Quel panier'))}">${top.map(opt).join('')}${(b.folders || folders || []).map(f => { const its = list.filter(x => Number(x.folder_id) === Number(f.id)); return its.length ? `<optgroup label="${esc(f.path.map(n => `📁 ${n}`).join(' › '))}">${its.map(opt).join('')}</optgroup>` : ''; }).join('')}
            <option value="new">＋ ${esc(T('Nouveau panier…'))}</option><option value="newfolder">＋ ${esc(T('Nouveau dossier…'))}</option></select></label>`; };
    const destLine = x => ((x?.dests || []).length ? `→ ${x.dests.map(d => String(d.label || '').replace(ICI(), '')).join(' · ')}` : '');
    const basketMeta = b => { const x = bOf(b, b.basket_id); if (!x) return '';
        return `<span class="cx-bmeta">${Number(x.folder_id) ? `<span class="cx-crumbs">${esc(crumbs(x))}</span><br>` : ''}${esc(plural(x.count, T('élément'), T('éléments')))}${x.done ? ` · ${esc(T('{n} utilisés', {n: nf(x.done)}))}` : ''}${x.updated_at ? ` · ${esc(T('modifié le {d}', {d: shortWhen(x.updated_at)}))}` : ''}${x.note ? `<br><i>${esc(x.note)}</i>` : ''}${destLine(x) ? `<br><span class="cx-dests-line">${esc(destLine(x))}</span>` : ''}</span>`; };
    const folderOptions = (sel, banned = []) => `<option value="0">${esc(T('— tout en haut —'))}</option>${(folders || []).filter(f => !banned.includes(Number(f.id))).map(f => `<option value="${f.id}" ${Number(f.id) === Number(sel) ? 'selected' : ''}>${esc(`${' '.repeat(f.depth || 0)}📁 ${f.name}`)}</option>`).join('')}`;
    /** le formulaire d'un panier : nom, emoji, couleur, une ligne, dans quel dossier, où il va d'habitude */
    function basketForm(cur = {}) {
        return new Promise(res => {
            const v = {name: cur.name || '', icon: cur.icon || '🧺', color: cur.color || '', note: cur.note || '', folder_id: Number(cur.folder_id || 0), dests: cur.dests || []};
            if (!ext.openDialog) { const name = window.prompt(T('Le nom du panier'), v.name); res(name ? {...v, name} : null); return; }
            // les destinations : l'écran ouvert (une enquête précise…), celles déjà choisies, puis les outils
            const opts = [], seen = new Set(), add = d => { const k = `${d.id}|${JSON.stringify(d.ctx || null)}`; if (!seen.has(k)) { seen.add(k); opts.push(d); } };
            const tools = DT.filter(t => t.id !== 'basket' && (!t.enabled || t.enabled() !== false));
            tools.forEach(t => { const h = hereOf(t); if (h) add({id: t.id, label: String(h.label || T(t.label)), ctx: h}); });
            v.dests.forEach(add); tools.forEach(t => add({id: t.id, label: T(t.label)}));
            const on = d => v.dests.some(x => x.id === d.id && JSON.stringify(x.ctx || null) === JSON.stringify(d.ctx || null));
            let done = false;
            ext.openDialog({eyebrow: '🧺', title: cur.id ? T('Modifier le panier') : T('Nouveau panier'), submitLabel: cur.id ? T('Enregistrer') : T('Créer le panier'),
                body: `<div class="cx-bform"><label>${esc(T('Nom'))}<input name="name" maxlength="120" required value="${esc(v.name)}" placeholder="${esc(T('ex. Mariage MAZAUD 1813'))}"></label>
                    <div class="cx-bform-row"><label>${esc(T('Emoji'))}<input name="icon" maxlength="8" value="${esc(v.icon)}" style="width:4em"></label><label>${esc(T('Couleur'))}<input type="color" name="color" value="${esc(v.color || '#055dff')}"></label>
                    <label class="cx-grow">${esc(T('Dans le dossier'))}<select name="folder">${folderOptions(v.folder_id)}</select></label></div>
                    <label>${esc(T('Une ligne pour dire à quoi il sert (facultatif)'))}<input name="note" maxlength="300" value="${esc(v.note)}" placeholder="${esc(T('ex. les pièces pour la demande d’acte'))}"></label>
                    <fieldset class="cx-bdests"><legend>${esc(T('Ce panier va d’habitude dans (« Mettre dans… » les choisit d’avance)'))}</legend>${opts.map((d, k) => `<label class="checkbox-line"><input type="checkbox" name="dest" value="${k}" ${on(d) ? 'checked' : ''}> ${esc(String(d.label).replace(ICI(), ''))}</label>`).join('')}</fieldset></div>`,
                onSubmit: f => { done = true; res({name: f.elements.name.value.trim(), icon: f.elements.icon.value.trim(), color: f.elements.color.value, note: f.elements.note.value.trim(), folder_id: Number(f.elements.folder.value) || 0,
                    dests: [...f.querySelectorAll('[name="dest"]:checked')].map(c => opts[Number(c.value)]).map(d => ({id: d.id, label: String(d.label).replace(ICI(), ''), ...(d.ctx ? {ctx: d.ctx} : {})}))}); },
                onOpen: d => d.addEventListener('close', () => { if (!done) res(null); })});
        });
    }
    function folderForm(cur = {}) {
        return new Promise(res => {
            if (!ext.openDialog) { const name = window.prompt(T('Le nom du dossier'), cur.name || ''); res(name ? {name, icon: '', parent_id: Number(cur.parent_id || 0)} : null); return; }
            let done = false;
            ext.openDialog({eyebrow: '📁', title: cur.id ? T('Modifier le dossier') : T('Nouveau dossier'), submitLabel: cur.id ? T('Enregistrer') : T('Créer le dossier'),
                body: `<div class="cx-bform"><label>${esc(T('Nom'))}<input name="name" maxlength="120" required value="${esc(cur.name || '')}" placeholder="${esc(T('ex. Famille MAZAUD'))}"></label>
                    <div class="cx-bform-row"><label>${esc(T('Emoji'))}<input name="icon" maxlength="8" value="${esc(cur.icon || '📁')}" style="width:4em"></label>${cur.id ? '' : `<label class="cx-grow">${esc(T('Dans le dossier'))}<select name="parent">${folderOptions(cur.parent_id || 0)}</select></label>`}</div>
                    ${cur.id ? '' : `<label>${esc(T('Son premier panier'))}<input name="bname" maxlength="120" value="${esc(T('Nouveau panier'))}"></label><p class="cx-muted"><small>${esc(T('Un dossier contient toujours au moins un panier.'))}</small></p>`}</div>`,
                onSubmit: f => { done = true; res({name: f.elements.name.value.trim(), icon: f.elements.icon.value.trim(), parent_id: Number(f.elements.parent?.value || cur.parent_id || 0), basket_name: f.elements.bname?.value.trim() || ''}); },
                onOpen: d => d.addEventListener('close', () => { if (!done) res(null); })});
        });
    }
    /** une question à quelques réponses (une carte chacune) → la clé, ou null */
    function askChoice(title, text, choices) {
        return new Promise(res => {
            if (!ext.openDialog) { res(choices[0]?.[0] ?? null); return; }
            let val = null;
            ext.openDialog({eyebrow: '🧺', title, submitLabel: T('OK'), body: `<p>${esc(text)}</p><div class="cx-choices">${choices.map(([k, l, sub], n) => `<label class="cx-how"><input type="radio" name="cx-choice" value="${esc(k)}" ${n ? '' : 'checked'}><span><b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`).join('')}</div>`,
                onSubmit: f => { val = f.querySelector('[name="cx-choice"]:checked')?.value ?? null; }, onOpen: d => d.addEventListener('close', () => res(val))});
        });
    }
    const loadTree = async () => keepTree(await api('cx_basket', {basket_id: curBasket()}));
    async function newBasket(folder = 0) { if (!folders) await loadTree(); const v = await basketForm({folder_id: folder}); if (!v?.name) return 0; const r = keepTree(await post('basket_new', v)); writeJ(CUR, Number(r.id)); basket = null; count = 0; paintPill(); toast(T('🧺 Panier « {n} » créé : ce que tu prends y va maintenant.', {n: v.name})); return Number(r.id); }
    async function newFolder(parent = 0) {
        if (!folders) await loadTree(); const v = await folderForm({parent_id: parent}); if (!v?.name) return 0;
        const r = keepTree(await post('folder_new', v)); writeJ(CUR, Number(r.basket_id)); basket = null; count = 0; paintPill();
        undoToast(T('📁 Dossier « {n} » créé, avec son panier « {b} »', {n: v.name, b: bOf(null, r.basket_id)?.name || ''}), {icon: '📁', undo: async () => { await post('folder_delete', {folder_id: r.id, mode: 'all'}).catch(() => {}); writeJ(CUR, 0); basket = null; await loadTree(); refreshPanel(); }});
        return Number(r.basket_id);
    }
    async function switchBasket(id) {
        if (id === 'new') return newBasket(); if (id === 'newfolder') return newFolder();
        writeJ(CUR, Number(id)); basket = null; count = null; await loadBasket(true); return Number(id);
    }
    /** un dossier n'a plus de panier : le supprimer aussi ? (un seul ↶ avec ce qui vient d'être fait) */
    async function askEmptied(emptied, undoFirst) {
        const rs = [];
        for (const f of emptied || []) {
            if (!fOf(f.id)) continue;
            const a = await askChoice(T('Le dossier « {n} » n’a plus de panier', {n: f.name}), T('Un dossier contient toujours au moins un panier. Que faire ?'),
                [['del', T('Supprimer aussi le dossier « {n} »', {n: f.name})], ['new', T('Le garder, avec un « Nouveau panier » dedans')]]);
            if (a === 'del') rs.push(keepTree(await post('folder_delete', {folder_id: f.id, mode: 'all'})));
            else { const r = keepTree(await post('basket_new', {name: T('Nouveau panier'), folder_id: f.id})); rs.push({made: r.id}); }
        }
        return async () => { for (const r of rs.reverse()) { if (r.made) await post('basket_delete', {basket_id: r.made}).catch(() => {}); else await post('folder_undelete', r); } await undoFirst?.(); };
    }
    async function editBasket(id) {
        if (!folders) await loadTree();
        const x = bOf(null, id); if (!x) return;
        const v = await basketForm(x); if (!v?.name) return;
        try { const r = keepTree(await post('basket_edit', {basket_id: id, ...v})); basket = null;
            const undo = await askEmptied(r.emptied, async () => { keepTree(await post('basket_edit', {basket_id: id, ...r.before})); basket = null; });
            undoToast(T('Panier « {n} » modifié', {n: v.name}), {icon: v.icon || '🧺', undo: async () => { await undo(); await loadTree(); refreshPanel(); }}); }
        catch (e) { toast(e.message, 'error'); }
    }
    async function editFolder(id) {
        const f = fOf(id); if (!f) return; const v = await folderForm(f); if (!v?.name) return;
        const r = keepTree(await post('folder_edit', {folder_id: id, name: v.name, icon: v.icon}));
        undoToast(T('Dossier « {n} » modifié', {n: v.name}), {icon: '📁', undo: async () => { keepTree(await post('folder_edit', r.before)); refreshPanel(); }});
    }
    async function dupBasket(id) {
        const x = bOf(null, id);
        const name = await askText(T('Le nom de la copie'), `${x?.name || T('Panier')} (${T('copie')})`); if (!name) return;
        const r = keepTree(await post('basket_duplicate', {basket_id: id, name})); writeJ(CUR, Number(r.id)); basket = null; count = null; await loadBasket(true);
        undoToast(T('Panier « {n} » créé (copie)', {n: name}), {icon: '⧉', undo: async () => { await post('basket_delete', {basket_id: r.id}); writeJ(CUR, Number(id)); basket = null; await loadBasket(true); refreshPanel(); }});
    }
    async function delBasket(id) {
        try { const r = keepTree(await post('basket_delete', {basket_id: id})); writeJ(CUR, 0); basket = null; await loadBasket(true);
            const undo = await askEmptied(r.emptied, async () => { await post('basket_undelete', {basket: r.basket, rows: r.rows}); writeJ(CUR, Number(r.basket.id)); });
            undoToast(T('Panier « {n} » supprimé', {n: r.basket.name}), {undo: async () => { await undo(); basket = null; await loadBasket(true); refreshPanel(); }}); }
        catch (e) { toast(e.message, 'error'); }
    }
    async function delFolder(id) {
        const f = fOf(id); if (!f) return;
        const mode = await askChoice(T('Supprimer le dossier « {n} »', {n: f.name}), T('Il contient {n}. Que faire de ce qu’il contient ?', {n: plural(f.baskets, T('panier'), T('paniers'))}),
            [['up', T('Le garder : paniers et sous-dossiers remontent d’un niveau')], ['all', T('Tout supprimer'), T('le dossier, ses sous-dossiers, leurs paniers et tout ce qu’ils contiennent')]]); if (!mode) return;
        try { const r = keepTree(await post('folder_delete', {folder_id: id, mode})); basket = null; if (r.baskets_removed?.some(b => Number(b.id) === curBasket())) writeJ(CUR, 0); await loadBasket(true);
            undoToast(T('Dossier « {n} » supprimé', {n: f.name}), {icon: '📁', undo: async () => { keepTree(await post('folder_undelete', r)); basket = null; await loadBasket(true); refreshPanel(); }}); }
        catch (e) { toast(e.message, 'error'); }
    }
    async function moveBasket(id, folder) {
        try { const r = keepTree(await post('basket_move', {basket_id: id, folder_id: folder})); basket = null;
            const undo = await askEmptied(r.emptied, async () => keepTree(await post('basket_move', r.before)));
            undoToast(T('« {n} » rangé dans « {p} »', {n: bOf(null, id)?.name || '', p: folder ? fOf(folder)?.name || '' : T('tout en haut')}), {icon: '📁', undo: async () => { await undo(); await loadTree(); refreshPanel(); }});
            return true; } catch (e) { toast(e.message, 'error'); return false; }
    }
    async function moveFolder(id, parent) {
        try { const r = keepTree(await post('folder_move', {folder_id: id, parent_id: parent}));
            undoToast(T('« {n} » rangé dans « {p} »', {n: fOf(id)?.name || '', p: parent ? fOf(parent)?.name || '' : T('tout en haut')}), {icon: '📁', undo: async () => { keepTree(await post('folder_move', r.before)); refreshPanel(); }});
            return true; } catch (e) { toast(e.message, 'error'); return false; }
    }
    async function moveItems(ids, to) {
        const r = keepTree(await post('item_move', {ids, basket_id: to})); basket = null; count = null;
        undoToast(T('{n} rangés dans « {p} »', {n: plural(ids.length, T('élément'), T('éléments')), p: bOf(null, to)?.name || ''}), {icon: '🧺', undo: async () => { keepTree(await post('item_unmove', {before: r.before})); basket = null; refreshPanel(); }});
    }
    /** « Au panier » : dans lequel ? (plusieurs paniers : un petit menu, le dernier utilisé en premier) → id, ou null si annulé */
    async function chooseBasket(anchor) {
        const b = keepTree(await loadBasket(true)), list = b.baskets || baskets || [];
        const cur = Number(b.basket_id) || curBasket();
        if (list.length < 2) return cur || Number(list[0]?.id) || 0;
        const ordered = [...list].sort((a, c) => (Number(c.id) === cur) - (Number(a.id) === cur));
        return new Promise(res => { let done = false; UI().menuAt?.(anchor || document.body, [...ordered.map(x => ({icon: x.icon || '🧺', label: `${crumbs(x).replace(/^\S+\s/u, '')} (${nf(x.count)})`, run: () => { done = true; res(Number(x.id)); }})), '-',
            {icon: '＋', label: T('Nouveau panier…'), run: async () => { done = true; res(await newBasket() || null); }}, {icon: '📁', label: T('Nouveau dossier…'), run: async () => { done = true; res(await newFolder() || null); }}], {title: T('Dans quel panier ?'), onClose: () => setTimeout(() => { if (!done) res(null); }, 50)}); });
    }
    /** ⛶ un panier en grand, comme une liste de courses : « ✓ utilisé », une note par élément, l'ordre en glissant ; « ☑ Choisir… » une partie */
    async function openBasketView() {
        document.querySelector('dialog.cx-bview')?.close();
        const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-put cx-bview'; dlg.dataset.noFoot = ''; dlg.setAttribute('aria-labelledby', 'cx-bview-h');
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        const vs = {pick: false, picked: new Set()};
        const draw = async () => {
            const b = keepTree(await api('cx_basket', {basket_id: curBasket()})); basket = null; if (!dlg.isConnected) return;
            const items = b.items || [], x = bOf(b, b.basket_id) || {}, sel = items.filter(it => vs.picked.has(Number(it.id))), nOn = sel.length;
            const row = it => `<li draggable="true" data-cx-vi="${it.id}" class="cx-bitem${Number(it.done) ? ' is-done' : ''}"><span class="cx-grip" aria-hidden="true" title="${esc(T('Glisser pour changer l’ordre'))}">⋮⋮</span>
                ${vs.pick ? `<label class="cx-chk"><input type="checkbox" data-cx-pk="${it.id}" ${vs.picked.has(Number(it.id)) ? 'checked' : ''} aria-label="${esc(T('Prendre « {t} »', {t: it.title}))}"></label>` : `<label class="cx-chk" title="${esc(T('✓ utilisé'))}"><input type="checkbox" data-cx-vdone ${Number(it.done) ? 'checked' : ''} aria-label="${esc(T('« {t} » utilisé', {t: it.title}))}"></label>`}<span class="cx-ico" aria-hidden="true">${icon(it)}</span>
                <span class="cx-t"><b>${esc(it.title)}</b>${it.kind === 'set' ? `<small>${esc(plural(setCount(it), T('ligne')))}</small>` : it.value && !sameText(it.title, it.value) ? `<small>${esc(String(it.value).slice(0, 160))}</small>` : ''}${it.origin?.label ? `<small class="cx-muted">${esc(T('de :'))} ${esc(it.origin.label)}${it.origin.url ? ` · ${srcLink(it.origin.url)}` : ''}</small>` : ''}
                ${vs.pick ? '' : `<input class="cx-vnote" data-cx-vnote value="${esc(it.note || '')}" placeholder="${esc(T('une note…'))}" aria-label="${esc(T('Note sur « {t} »', {t: it.title}))}">`}</span>
                ${Number(it.done) && !vs.pick ? `<span class="cx-pl is-ok">✓ ${esc(T('utilisé'))}</span>` : ''}${vs.pick ? '' : `<button type="button" class="cx-sum-x" data-cx-vx aria-label="${esc(T('Retirer du panier'))}">×</button>`}</li>`;
            const html = `<form method="dialog" class="cx-tk"><header class="cx-tk-head"${x.color ? ` style="box-shadow: inset 6px 0 0 ${esc(x.color)}"` : ''}><div class="cx-tk-ht"><span class="cx-eyebrow">🧺 ${esc(T('Panier'))}</span>
                    <h2 id="cx-bview-h">${basketSelect(b, 'data-cx-vsel')}</h2><p class="cx-tk-say">${basketMeta(b)}</p></div>
                    <button type="button" class="cx-b is-ter is-sm" data-cx-vedit>✎ ${esc(T('Modifier'))}</button><button type="button" class="cx-x" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></header>
                <div class="cx-put-body">${vs.pick ? `<div class="cx-pickbar"><input type="checkbox" data-cx-pall data-mixed="${nOn && nOn < items.length ? 1 : 0}" ${items.length && nOn === items.length ? 'checked' : ''} aria-label="${esc(T('Tout'))}"><b>${esc(T('Coche ce que tu mets dans…'))}</b><button type="button" class="cx-b is-sec is-sm" data-cx-pall2>☑ ${esc(T('Tout'))}</button><button type="button" class="cx-b is-ter is-sm" data-cx-pnone>${esc(T('Rien'))}</button></div>` : ''}
                    ${items.length ? `<ol class="cx-blist">${items.map(row).join('')}</ol>` : `<div class="cx-empty"><span class="cx-empty-i" aria-hidden="true">🧺</span><b>${esc(T('Le panier est vide'))}</b><p>${esc(T('Le panier garde des choses pour plus tard, d’un écran à l’autre. Coche des lignes n’importe où dans l’app, puis « 🧺 Garder dans le panier ».'))}</p></div>`}</div>
                <footer class="cx-tk-foot"><div class="cx-cnt"><span class="cx-what">${esc(vs.pick ? T('{n} sur {t}', {n: plural(nOn, T('élément coché'), T('éléments cochés')), t: nf(items.length)}) : T('Coche « ✓ utilisé » au fur et à mesure ; glisse les lignes pour les ranger.'))}</span></div><div class="cx-acts">
                    ${vs.pick ? `<button type="button" class="cx-b is-ter" data-cx-vpick>${esc(T('Annuler le choix'))}</button><button type="button" class="cx-b is-pri" data-cx-vputsel ${nOn ? '' : 'disabled'}><span>📍 ${esc(T(nOn > 1 ? 'Mettre les {n} cochés dans…' : 'Mettre le coché dans…', {n: nf(nOn)}))}</span></button>`
                    : `<button type="button" class="cx-b is-ter" data-cx-vdup>⧉ ${esc(T('Dupliquer'))}</button>${(b.baskets || []).length > 1 ? `<button type="button" class="cx-b is-ter" data-cx-vdel>🗑 ${esc(T('Supprimer'))}</button>` : ''}<button type="button" class="cx-b is-sec" data-cx-vpick ${items.length ? '' : 'disabled'}>☑ ${esc(T('Choisir…'))}</button>
                    <button type="button" class="cx-b is-pri" data-cx-vput ${items.length ? '' : 'disabled'}><span>📍 ${esc(T('Mettre tout dans…'))}</span></button>`}</div></footer></form>`;
            // seul le formulaire est redessiné : un message « ↶ Annuler » posé dans la fenêtre reste là
            const tpl = document.createElement('template'); tpl.innerHTML = html; const old = dlg.querySelector(':scope > form'); if (old) old.replaceWith(tpl.content.firstElementChild); else dlg.prepend(tpl.content.firstElementChild);
            setMixed(dlg);
            const byId = id => items.find(y => Number(y.id) === Number(id)), q = sl => dlg.querySelector(sl), dests = x.dests || [];
            q('[data-cx-x]').addEventListener('click', () => dlg.close());
            q('[data-cx-vsel]').addEventListener('change', async e => { await switchBasket(e.target.value); vs.picked.clear(); draw(); });
            q('[data-cx-vedit]').addEventListener('click', async () => { await editBasket(b.basket_id); draw(); });
            q('[data-cx-vdup]')?.addEventListener('click', async () => { await dupBasket(b.basket_id); draw(); });
            q('[data-cx-vdel]')?.addEventListener('click', async () => { await delBasket(b.basket_id); draw(); });
            dlg.querySelectorAll('[data-cx-vpick]').forEach(bt => bt.addEventListener('click', () => { vs.pick = !vs.pick; vs.picked.clear(); draw(); }));
            q('[data-cx-vput]')?.addEventListener('click', e => { dlg.close(); putInto(items, {anchor: e.currentTarget, fromBasket: true, dests}); });
            q('[data-cx-vputsel]')?.addEventListener('click', e => { dlg.close(); putInto(sel, {anchor: e.currentTarget, fromBasket: true, dests}); });
            const all = on => { items.forEach(it => (on ? vs.picked.add(Number(it.id)) : vs.picked.delete(Number(it.id)))); draw(); };
            q('[data-cx-pall]')?.addEventListener('change', e => all(e.target.checked)); q('[data-cx-pall2]')?.addEventListener('click', () => all(true)); q('[data-cx-pnone]')?.addEventListener('click', () => all(false));
            dlg.querySelectorAll('[data-cx-pk]').forEach(c => c.addEventListener('change', () => { const id = Number(c.dataset.cxPk); if (c.checked) vs.picked.add(id); else vs.picked.delete(id); draw(); }));
            dlg.querySelectorAll('[data-cx-vi]').forEach(li => {
                const it = byId(li.dataset.cxVi);
                li.querySelector('[data-cx-vdone]')?.addEventListener('change', async e => { const r = await post('item_set', {id: it.id, done: e.target.checked}); undoToast(e.target.checked ? T('✓ « {t} » utilisé', {t: it.title}) : T('« {t} » à utiliser', {t: it.title}), {icon: '🧺', undo: async () => { await post('item_set', r.before); draw(); }}); draw(); });
                li.querySelector('[data-cx-vnote]')?.addEventListener('change', async e => { const r = await post('item_set', {id: it.id, note: e.target.value}); undoToast(T('Note gardée'), {icon: '📝', undo: async () => { await post('item_set', r.before); draw(); }}); });
                li.querySelector('[data-cx-vx]')?.addEventListener('click', async () => { await removeFromBasket([it.id]); draw(); });
                li.addEventListener('dragstart', e => { if (e.target.closest?.('input')) return; dlg.dataset.drag = li.dataset.cxVi; li.classList.add('is-drag'); try { e.dataTransfer.setData('text/plain', it.title); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} });
                li.addEventListener('dragend', () => li.classList.remove('is-drag'));
                li.addEventListener('dragover', e => { if (dlg.dataset.drag) e.preventDefault(); });
                li.addEventListener('drop', async e => { const from = dlg.dataset.drag; delete dlg.dataset.drag; if (!from || from === li.dataset.cxVi) return; e.preventDefault(); e.stopPropagation();
                    const ids = items.map(y => Number(y.id)).filter(y => y !== Number(from)); ids.splice(ids.indexOf(Number(li.dataset.cxVi)), 0, Number(from));
                    const r = await post('item_order', {basket_id: b.basket_id, ids}); undoToast(T('Ordre changé'), {icon: '⇅', undo: async () => { await post('item_order', {basket_id: b.basket_id, ids: r.before}); draw(); }}); draw(); });
                li.addEventListener('keydown', async e => { if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); // Alt+↑ / Alt+↓ : déplacer au clavier
                    const ids = items.map(y => Number(y.id)), i = ids.indexOf(Number(it.id)), j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]];
                    await post('item_order', {basket_id: b.basket_id, ids}); await draw(); dlg.querySelector(`[data-cx-vi="${it.id}"] input`)?.focus(); });
            });
            refreshPanel();
        };
        await draw();
        return dlg;
    }
    const setMixed = host => host.querySelectorAll('[data-mixed]').forEach(c => { c.indeterminate = c.dataset.mixed === '1'; });
    /** l'arbre de tous les paniers : 📁 dossiers › 🧺 paniers › éléments (pour « Prendre depuis… → Panier ») ; cases à trois états */
    function basketTreeHtml(st, list) {
        const all = st.bk, idx = new Map(list.map((x, i) => [x, i])), closed = st.closed || (st.closed = new Set());
        const itemsOf = bid => list.filter(x => Number(x.basket_id) === Number(bid));
        const bNode = (x, d) => { const its = itemsOf(x.id), open = !closed.has(`b${x.id}`), cur = Number(x.id) === Number(all.basket_id);
            return `<section class="cx-tnode" style="--d:${d}"><div class="cx-thead${cur ? ' is-cur' : ''}" draggable="true" data-cx-tb="${x.id}"><button type="button" class="cx-tw2" data-cx-tog="b${x.id}" aria-expanded="${open}" aria-label="${esc(open ? T('Replier') : T('Déplier'))}">${open ? '▾' : '▸'}</button>
                <input type="checkbox" data-cx-grp="b${x.id}" aria-label="${esc(T('Prendre tout « {n} »', {n: x.name}))}" ${its.length ? '' : 'disabled'}><span aria-hidden="true">${esc(x.icon || '🧺')}</span><b>${esc(x.name)}</b><span class="cx-bmeta">${esc(plural(its.length, T('élément'), T('éléments')))}${destLine(x) ? ` · ${esc(destLine(x))}` : ''}</span></div>
                ${open && its.length ? `<ul class="cx-rlist">${its.map(y => rowHtml(st, y, idx.get(y))).join('')}</ul>` : ''}</section>`; };
        const fNode = (f, d) => { const open = !closed.has(`f${f.id}`), bs = (all.baskets || []).filter(x => Number(x.folder_id) === Number(f.id));
            return `<section class="cx-tnode is-folder" style="--d:${d}"><div class="cx-thead" draggable="true" data-cx-tf="${f.id}"><button type="button" class="cx-tw2" data-cx-tog="f${f.id}" aria-expanded="${open}" aria-label="${esc(open ? T('Replier') : T('Déplier'))}">${open ? '▾' : '▸'}</button>
                <input type="checkbox" data-cx-grp="f${f.id}" aria-label="${esc(T('Prendre tout « {n} »', {n: f.name}))}"><span aria-hidden="true">${esc(f.icon || '📁')}</span><b>${esc(f.name)}</b><span class="cx-bmeta">${esc(plural(f.baskets, T('panier'), T('paniers')))} · ${esc(plural(f.total, T('élément'), T('éléments')))}</span>
                <button type="button" class="cx-b is-ter is-sm" data-cx-fmenu="${f.id}" aria-label="${esc(T('Dossier « {n} » : plus…', {n: f.name}))}">⋯</button></div>
                ${open ? `${fKids(f.id).map(k => fNode(k, d + 1)).join('')}${bs.map(x => bNode(x, d + 1)).join('')}` : ''}</section>`; };
        return `<div class="cx-ttree" data-cx-ttree>${(all.folders || []).filter(f => !Number(f.parent_id)).map(f => fNode(f, 0)).join('')}${(all.baskets || []).filter(x => !Number(x.folder_id)).map(x => bNode(x, 0)).join('')}</div><p class="cx-sr" id="cx-hint-space">${esc(T('Espace ou double-clic : cocher'))}</p>`;
    }
    const grpItems = (st, k) => { const id = Number(k.slice(1)); const bids = k[0] === 'b' ? [id] : (st.bk.baskets || []).filter(x => fTree(id).includes(Number(x.folder_id))).map(x => Number(x.id)); return st.results.filter(y => bids.includes(Number(y.basket_id))); };
    function paintGroups(st, res) {
        res.querySelectorAll('[data-cx-grp]').forEach(c => { const all = grpItems(st, c.dataset.cxGrp), n = all.filter(y => st.picked.has(pickKey(y))).length;
            c.checked = !!all.length && n === all.length; c.indeterminate = n > 0 && n < all.length; });
    }
    function bindBasketTree(st, res) {
        paintGroups(st, res);
        res.querySelectorAll('[data-cx-grp]').forEach(c => c.addEventListener('change', () => { // un dossier ou un panier entier (cases à trois états)
            grpItems(st, c.dataset.cxGrp).forEach(it => { togglePick(st, it, c.checked); const cb = res.querySelector(`[data-cx-ri="${st.results.indexOf(it)}"]`); if (cb) { cb.checked = c.checked; cb.closest('li')?.classList.toggle('is-on', c.checked); } });
            if (st.picked.size >= 2) st.preview = null; paintCount(st); paintGroups(st, res); }));
        res.addEventListener('change', e => { if (e.target.matches('[data-cx-ri]')) paintGroups(st, res); });
        res.querySelectorAll('[data-cx-tog]').forEach(t => t.addEventListener('click', () => { const k = t.dataset.cxTog; if (st.closed.has(k)) st.closed.delete(k); else st.closed.add(k); drawTab(st); }));
        res.querySelectorAll('[data-cx-fmenu]').forEach(bt => bt.addEventListener('click', () => { const id = Number(bt.dataset.cxFmenu); UI().menuAt?.(bt, [
            {icon: '🧺', label: T('Un nouveau panier dans ce dossier…'), run: async () => { await newBasket(id); drawTab(st); }}, {icon: '📁', label: T('Un sous-dossier…'), run: async () => { await newFolder(id); drawTab(st); }},
            {icon: '✎', label: T('Renommer…'), run: async () => { await editFolder(id); drawTab(st); }}, {icon: '🗑', label: T('Supprimer le dossier…'), run: async () => { await delFolder(id); drawTab(st); }}], {title: `📁 ${fOf(id)?.name || ''}`}); }));
        // glisser : un panier ou un dossier sur un dossier (ou tout en haut) ; un élément sur un panier
        const drop = async (e, z) => { const d = res.dataset.drag || ''; delete res.dataset.drag; if (!d) return; e.preventDefault(); e.stopPropagation();
            const [k, id] = d.split(':'), toF = z?.dataset.cxTf, toB = z?.dataset.cxTb;
            if (k === 'b' && toF !== undefined) await moveBasket(Number(id), Number(toF)); else if (k === 'b' && !z) await moveBasket(Number(id), 0);
            else if (k === 'f' && toF !== undefined && toF !== id) await moveFolder(Number(id), Number(toF)); else if (k === 'f' && !z) await moveFolder(Number(id), 0);
            else if (k === 'i' && toB !== undefined) await moveItems([Number(id)], Number(toB));
            drawTab(st); };
        res.querySelectorAll('[data-cx-tb], [data-cx-tf]').forEach(h => h.addEventListener('dragstart', e => { e.stopPropagation(); res.dataset.drag = h.dataset.cxTb !== undefined ? `b:${h.dataset.cxTb}` : `f:${h.dataset.cxTf}`; try { e.dataTransfer.setData('text/plain', h.textContent.trim()); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} }));
        res.querySelectorAll('.cx-ttree li[data-cx-r]').forEach(li => { li.draggable = true; li.addEventListener('dragstart', e => { const it = st.results[Number(li.dataset.cxR)]; if (!it?.id) return; e.stopPropagation(); res.dataset.drag = `i:${it.id}`; try { e.dataTransfer.setData('text/plain', it.title); } catch (_) {} }); });
        res.querySelectorAll('[data-cx-tb], [data-cx-tf]').forEach(z => { z.addEventListener('dragover', e => { if (res.dataset.drag) { e.preventDefault(); z.classList.add('is-over'); } }); z.addEventListener('dragleave', () => z.classList.remove('is-over')); z.addEventListener('drop', e => { z.classList.remove('is-over'); drop(e, z); }); });
        res.querySelector('[data-cx-ttree]')?.addEventListener('dragover', e => { if (res.dataset.drag) e.preventDefault(); });
        res.querySelector('[data-cx-ttree]')?.addEventListener('drop', e => { if (!e.target.closest('[data-cx-tb], [data-cx-tf]')) drop(e, null); });
    }
    /** pour l'écran « Paniers » à venir (même modèle, mêmes ↶) */
    ext.cxBaskets = {tree: async () => { const r = await loadTree(); return {baskets: r.baskets, folders: r.folders, current: Number(r.basket_id)}; }, items: async id => (await api('cx_basket', {basket_id: id})).items || [],
        create: async (o = {}) => keepTree(await post('basket_new', o)), createFolder: async (o = {}) => keepTree(await post('folder_new', o)), edit: async (id, o) => keepTree(await post('basket_edit', {basket_id: id, ...o})), editFolder: async (id, o) => keepTree(await post('folder_edit', {folder_id: id, ...o})),
        move: (id, folder) => moveBasket(id, folder), moveFolder: (id, parent) => moveFolder(id, parent), remove: id => delBasket(id), removeFolder: id => delFolder(id), moveItems: (ids, to) => moveItems(ids, to), choose: chooseBasket, open: openBasketView};
    /** ⭐ Garder comme liste : les fiches dans « Mes listes » (une nouvelle liste) ; si plusieurs paniers : le panier garde son nom */
    async function keepAsList(items, b) {
        const persons = items.filter(x => x.kind === 'person' && x.ref_id);
        if (!persons.length) {
            if (settings().multi) { const name = await askText(T('Garder ce panier sous un nom'), T('Panier du {d}', {d: new Date().toLocaleDateString('fr-FR')})); if (name) { await post('basket_rename', {basket_id: b.basket_id, name}); await post('basket_new', {name: T('Mon panier')}).then(r => writeJ(CUR, r.id)); basket = null; refreshPanel(); toast(T('Panier gardé : « {n} ». Un nouveau panier vide est prêt.', {n: name})); } return; }
            toast(T('« Mes listes » garde des fiches : il n’y en a pas dans le panier. Active « plusieurs paniers » (Réglages → 🧺 Panier et connexions) pour garder un panier sous un nom.')); return;
        }
        const name = await askText(T('Le nom de la liste'), T('Panier du {d}', {d: new Date().toLocaleDateString('fr-FR')})); if (!name) return;
        const SB = ext.selectionBar?.post || (body => apiPost('listes_plus_write', body));
        let created = null;
        try { created = await apiPost('save_my_list', {name, source: 'persons', icon: '🧺'}); } catch (_) {}
        const listId = Number(created?.id || created?.list_id || 0);
        if (!listId) { toast(T('La liste n’a pas pu être créée : crée-la dans Listes → Mes listes, puis « ★ Ajouter à Mes listes ».'), 'error'); return; }
        const r = await SB({op: 'mylist_add', list_id: listId, ids: persons.map(x => x.ref_id)});
        undoToast(T('⭐ Liste « {n} » : {c}', {n: name, c: plural(persons.length, T('fiche'))}), {undo: async () => { await SB({op: 'mylist_restore', list_id: listId, before: r.before}); try { await apiPost('delete_my_list', {id: listId}); } catch (_) {} }});
    }
    function askText(title, value = '') {
        return new Promise(res => {
            if (!ext.openDialog) { res(window.prompt(title, value)); return; }
            let done = false;
            ext.openDialog({eyebrow: '🧺', title, body: `<label>${esc(T('Nom'))}<input name="v" maxlength="120" value="${esc(value)}" required></label>`, submitLabel: T('OK'),
                onSubmit: f => { done = true; res(f.elements.v.value.trim()); }, onOpen: d => d.addEventListener('close', () => { if (!done) res(null); })});
        });
    }

    /* ═════════════ ↗ revenir là d'où ça vient ═════════════ */
    function openOrigin(it) {
        if (!it) return;
        const o = it.origin || {}, open = o.open || {};
        const go = (mod, set) => { const st = S(); Object.assign(st, set || {}); A().persistUiState?.(); A().setModule?.(mod); };
        if (open.module === 'enquetes' && open.investigation_id) return go('enquetes', {enquetesTab: 'enquetes', currentInvestigationId: Number(open.investigation_id), investigationFolderId: 0});
        if (open.module === 'atelier') return go('enquetes', {enquetesTab: 'atelier'});
        if (open.list) return ext.dataListsEngine?.open?.(open.list, open.preset || null);
        if (it.kind === 'person' && it.ref_id) return A().openPersonById?.(Number(it.ref_id));
        if (o.person_id || o.kind === 'person') return A().openPersonById?.(Number(o.person_id || o.id));
        if (o.url) return window.open(o.url, '_blank', 'noopener');
        if (it.kind === 'set' && it.data?.url) return window.open(it.data.url, '_blank', 'noopener');
        toast(T('Pas d’écran où revenir pour cet élément.'));
    }
    /** ce qui est affiché maintenant (l'origine d'une info prise ici) */
    function screenOrigin(el = null) {
        const st = S(), person = st.currentPerson?.person;
        const ev = el?.closest?.('[data-event-id]');
        if (st.module === 'personnes' && person?.id) {
            const name = A().personName ? A().personName(person) : `${person.first_name || ''} ${person.last_name || ''}`.trim();
            return {kind: ev ? 'event' : 'person', id: Number(ev?.dataset.eventId || person.id), person_id: Number(person.id), label: T('Fiche de {n}', {n: name}), screen: 'personnes'};
        }
        if (st.module === 'enquetes' && st.currentInvestigationId) return {kind: 'investigation', id: Number(st.currentInvestigationId), label: document.querySelector('.investigation-detail h1, .investigation-detail h2')?.textContent?.trim() || T('Enquête'), open: {module: 'enquetes', investigation_id: Number(st.currentInvestigationId)}};
        const h = document.querySelector('#workspace .page-header h1, #workspace .page-header h2, #workspace h2');
        return {kind: 'screen', label: (h?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) || T('Écran'), screen: st.module || ''};
    }

    /* ═════════════ 📍 « Mettre dans… » : le registre et la fenêtre ═════════════ */
    const DT = ext.dropTargets = ext.dropTargets || [];
    const accepted = (t, items) => (t.kinds ? items.filter(it => t.kinds.includes(it.kind)) : items);
    const targetsFor = items => DT.filter(t => t && t.id && (!t.enabled || t.enabled() !== false) && accepted(t, items).length);
    const hereOf = t => { try { return t.here?.() || null; } catch (_) { return null; } };

    /* 📍 « Mettre dans… » (dans l'esprit de « Prendre depuis… ») : en-tête qui dit quoi, « Comment ? » en deux cartes (seulement pour
     * un ensemble), une recherche, les destinations rangées (Récemment utilisées · Ma recherche · Écrire et montrer · Ranger), chacune avec
     * « ce que ça donne » ; on choisit, puis « Mettre dans … » en bas (double-clic ou Entrée : tout de suite). La dernière est retenue. */
    const PUT_RECENT = 'genealogie-cx-put-recents';
    const PUT_SECT = [['recent', 'Récemment utilisées'], ['search', 'Ma recherche (enquêtes, notes, rappels)'], ['write', 'Écrire et montrer'], ['store', 'Ranger']];
    const sectOf = t => ({investigation: 'search', note: 'search', reminder: 'search', atelier: 'write', book: 'write', montage: 'write', send_textdoc: 'write', send_keynote: 'write', send_site: 'write', basket: 'store', send_sheet: 'store', map: 'store', mylist: 'store'}[t.id]
        || ({Chercher: 'search', Créer: 'write', Ranger: 'store'}[t.group] || 'store'));
    async function putInto(items, {anchor = null, fromBasket = false, only = null, dests = null} = {}) {
        items = (items || []).filter(Boolean);
        if (!items.length) return toast(T('Rien à mettre.'));
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'));
        const sets = items.filter(x => x.kind === 'set'), nRows = sets.reduce((n, x) => n + setCount(x), 0);
        const name1 = String(items[0].title || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, ''), short = sets.length ? name1.split(' — ')[0] : name1; // un ensemble : le nom de la liste (les critères sont dans « Comment ? »)
        const what = items.length === 1 ? `« ${short.length > 80 ? short.slice(0, 79) + '…' : short} »${sets.length ? ` (${plural(nRows, T('ligne'))})` : ''}` : plural(items.length, T('élément'), T('éléments'));
        const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-put'; dlg.dataset.noFoot = ''; dlg.setAttribute('aria-labelledby', 'cx-put-h');
        let sel = null; // {id, here}
        // le panier dit où il va d'habitude : ces destinations sont choisies d'avance (un clic sur une autre ligne les remplace)
        let preset = (dests || []).filter(d => DT.some(t => t.id === d.id)).map(d => ({id: d.id, here: false, ctx: d.ctx || null, label: d.label}));
        const asRows = () => dlg.querySelector('[name="cx-setmode"]:checked')?.value === 'rows';
        const its = () => (asRows() ? items.flatMap(explode) : items);
        const recent = () => (readJ(PUT_RECENT, []) || []).filter(x => typeof x === 'string');
        const row = (t, h, its2) => { const acc = accepted(t, its2), ctx = h ? hereOf(t) : null; let ex = ''; try { ex = t.explain?.(acc, ctx) || ''; } catch (_) {}
            const part = acc.length < its2.length ? T('{a} sur {b} iront là ; le reste reste dans le panier.', {a: acc.length, b: its2.length}) : '';
            const on = sel && sel.id === t.id && sel.here === h;
            return `<button type="button" class="cx-dest${on ? ' is-on' : ''}" role="option" aria-selected="${on}" data-cx-dest="${esc(t.id)}" data-cx-here="${h ? 1 : 0}"><span class="cx-ico" aria-hidden="true">${esc(t.icon || '•')}</span><span class="cx-t"><b>${esc(h ? String(ctx?.label || T('Ici')) : T(t.label))}</b><small>${esc(ex ? T('Ça donne : {x}', {x: ex}) : T(t.label))}</small>${part ? `<small class="cx-part">${esc(part)}</small>` : ''}</span></button>`; };
        const draw = () => {
            const list0 = its(), list = targetsFor(list0).filter(t => !only || only.includes(t.id));
            const here = list.filter(t => hereOf(t)), rec = recent().map(id => list.find(t => t.id === id)).filter(Boolean).slice(0, 3);
            const block = (title, html) => (html ? `<h4 class="cx-sect">${esc(title)}</h4><div class="cx-dlist" role="listbox" aria-label="${esc(title)}">${html}</div>` : '');
            dlg.querySelector('[data-cx-dests]').innerHTML = (here.length ? block(T('Ici, l’écran ouvert'), here.map(t => row(t, true, list0)).join('')) : '')
                + block(T('Récemment utilisées'), rec.map(t => row(t, false, list0)).join(''))
                + PUT_SECT.slice(1).map(([k, l]) => block(T(l), list.filter(t => sectOf(t) === k && !rec.includes(t)).map(t => row(t, false, list0)).join(''))).join('')
                || `<p class="cx-muted">${esc(T('Aucun outil ne peut recevoir ça pour l’instant.'))}</p>`;
            filter(); paintGo();
        };
        const filter = () => { const q = fold(dlg.querySelector('[data-cx-dq]').value); dlg.querySelectorAll('[data-cx-dest]').forEach(b => { b.hidden = !!q && !fold(b.textContent).includes(q); });
            dlg.querySelectorAll('.cx-dlist').forEach(l => { const any = [...l.children].some(b => !b.hidden); l.hidden = !any; l.previousElementSibling.hidden = !any; }); };
        const paintGo = () => {
            const go = dlg.querySelector('[data-cx-putgo]'), say = dlg.querySelector('[data-cx-putsay]'), t = sel && DT.find(x => x.id === sel.id);
            if (preset.length && !sel) { go.disabled = false; go.querySelector('span').textContent = `📍 ${T('Mettre dans {d}', {d: preset.map(d => String(d.label || '').replace(/…$/, '')).join(' + ')})}`; say.textContent = T('Les destinations habituelles de ce panier (choisies d’avance)'); return; }
            go.disabled = !t;
            if (!t) { go.querySelector('span').textContent = `📍 ${T('Mettre dans…')}`; say.textContent = T('Choisis où les mettre.'); return; }
            const ctx = sel.here ? hereOf(t) : null, acc = accepted(t, its()); let ex = ''; try { ex = t.explain?.(acc, ctx) || ''; } catch (_) {}
            const name = sel.here ? String(ctx?.label || T('Ici')).replace(new RegExp(`^\\s*${T('Ici')}\\s*:\\s*`, 'i'), '') : T(t.label).replace(/…$/, '');
            go.querySelector('span').textContent = `${t.icon || '📍'} ${T('Mettre dans {d}', {d: name})}`;
            say.textContent = [plural(acc.length, T('élément'), T('éléments')), ex].filter(Boolean).join(' → ');
        };
        const lineN = nf(nRows);
        dlg.innerHTML = `<form method="dialog" class="cx-tk">
            <header class="cx-tk-head"><div class="cx-tk-ht"><span class="cx-eyebrow">📍 ${esc(T('Mettre dans…'))}</span><h2 id="cx-put-h">${esc(T('Mettre {w} dans…', {w: what}))}</h2>
                <p class="cx-tk-say">${esc(T('Choisis où les mettre : chaque élément garde d’où il vient. Rien n’est rangé avant ton clic, et « ↶ Annuler » est proposé.'))}</p></div>
                <button type="button" class="cx-x" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></header>
            <div class="cx-put-body">
                ${sets.length ? `<fieldset class="cx-howto"><legend>${esc(T('Comment ?'))}</legend><div class="cx-howcards">
                    <label class="cx-how"><input type="radio" name="cx-setmode" value="table" checked><span><b>▦ ${esc(T('Un seul tableau avec sa source'))}</b><small>${esc(T('1 élément, ses {n} lignes et d’où elles viennent', {n: lineN}))}</small></span></label>
                    <label class="cx-how"><input type="radio" name="cx-setmode" value="rows"><span><b>≡ ${esc(T('Une ligne = un élément'))}</b><small>${esc(T('{n} éléments séparés, chacun avec la source', {n: lineN}))}</small></span></label></div></fieldset>` : ''}
                ${preset.length ? `<div class="cx-presets"><b>${esc(T('Ce panier va d’habitude dans :'))}</b> ${preset.map(d => `<span class="cx-chip is-on">${esc(String(d.label || ''))}</span>`).join(' ')}<small class="cx-muted">${esc(T('Choisis une autre ligne pour changer.'))}</small></div>` : ''}
                <div class="cx-srch"><input type="search" class="cx-dq" data-cx-dq placeholder="${esc(T('Chercher une destination (enquête, note, Atelier…)'))}" aria-label="${esc(T('Chercher une destination'))}" autocomplete="off"></div>
                <div class="cx-dests" data-cx-dests></div></div>
            <footer class="cx-tk-foot"><div class="cx-cnt"><span class="cx-what" data-cx-putsay aria-live="polite"></span></div>
                <div class="cx-acts"><button type="submit" class="cx-b is-ter" value="cancel">${esc(T('Annuler'))}</button><button type="button" class="cx-b is-pri" data-cx-putgo disabled><span></span></button></div></footer></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.querySelector('[data-cx-x]').addEventListener('click', () => dlg.close());
        dlg.querySelector('[data-cx-dq]').addEventListener('input', filter);
        dlg.querySelector('[data-cx-dq]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = [...dlg.querySelectorAll('[data-cx-dest]')].find(x => !x.hidden); if (b) { pick(b); b.focus(); } } if (e.key === 'ArrowDown') { e.preventDefault(); [...dlg.querySelectorAll('[data-cx-dest]')].find(x => !x.hidden)?.focus(); } });
        dlg.querySelectorAll('[name="cx-setmode"]').forEach(r => r.addEventListener('change', draw));
        const pick = b => { preset = []; dlg.querySelector('.cx-presets')?.remove(); sel = {id: b.dataset.cxDest, here: b.dataset.cxHere === '1'}; dlg.querySelectorAll('[data-cx-dest]').forEach(x => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on)); }); paintGo(); };
        let busy = false;
        const go = async () => {
            if (preset.length && !sel) { // plusieurs destinations habituelles : l'une après l'autre
                if (busy) return; busy = true; dlg.close(); const list = its();
                for (const d of preset) { const t = DT.find(x => x.id === d.id); if (t) await deliver(t, list, {ctx: d.ctx || null, anchor, fromBasket: fromBasket && d === preset.at(-1), original: items}); }
                return;
            }
            const t = sel && DT.find(x => x.id === sel.id); if (!t || busy) return; busy = true;
            const list = its(); writeJ(PUT_RECENT, [t.id, ...recent().filter(x => x !== t.id)].slice(0, 6));
            dlg.close();
            await deliver(t, list, {here: sel.here, anchor, fromBasket, original: items});
        };
        const box = dlg.querySelector('[data-cx-dests]');
        box.addEventListener('click', e => { const b = e.target.closest('[data-cx-dest]'); if (b) pick(b); });
        box.addEventListener('dblclick', e => { const b = e.target.closest('[data-cx-dest]'); if (b) { pick(b); go(); } });
        box.addEventListener('keydown', e => {
            const b = e.target.closest('[data-cx-dest]'); if (!b) return;
            if (e.key === 'Enter') { e.preventDefault(); pick(b); go(); }
            else if (e.key === ' ') { e.preventDefault(); pick(b); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const all = [...box.querySelectorAll('[data-cx-dest]')].filter(x => !x.hidden), k = all.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1); if (all[k]) all[k].focus(); else if (k < 0) dlg.querySelector('[data-cx-dq]').focus(); }
        });
        dlg.querySelector('[data-cx-putgo]').addEventListener('click', go);
        draw();
        const last = recent()[0], hb = box.querySelector('[data-cx-here="1"]') || (last && box.querySelector(`[data-cx-dest="${CSS.escape(last)}"]`));
        if (hb && !preset.length) pick(hb); // l'écran ouvert, sinon la dernière destination : déjà choisie (un clic pour mettre)
        else paintGo();
        dlg.querySelector('[data-cx-dq]').focus();
    }
    /** ranger dans une destination ; ce qui a été pris du panier en sort (le reste y reste), un seul « ↶ Annuler » */
    async function deliver(t, items, {here = false, anchor = null, fromBasket = false, original = null, ctx: given = null} = {}) {
        const acc = accepted(t, items);
        let ctx = given || (here ? hereOf(t) : null);
        try {
            if (!ctx) ctx = t.choose ? await t.choose(acc, anchor) : (hereOf(t) || {});
            if (!ctx) return null;
            const r = await t.receive(acc, ctx) || {};
            let removed = null;
            const kept = new Set(r.left || []); // ce que l'outil n'a pas pu prendre (une carte : ce qui n'a pas de position) reste dans le panier
            const doneIds = fromBasket ? (original || items).filter(x => x.id && !kept.has(x) && (acc.includes(x) || acc.some(a => a._from === x.id && !kept.has(a)))).map(x => x.id) : [];
            if (doneIds.length) { removed = await post('basket_remove', {ids: doneIds}); setCountFrom(removed); refreshPanel(); }
            const left = items.length - acc.length + (fromBasket ? kept.size : 0);
            const msg = (r.message || T('Rangé : {n}', {n: plural(acc.length, T('chose'), T('choses'))})) + (left ? ` ${T('({n} reste dans le panier)', {n: left})}` : '');
            undoToast(msg, {icon: t.icon, undo: (r.undo || removed?.removed?.length) ? async () => { await r.undo?.(); if (removed?.removed?.length) { setCountFrom(await post('basket_restore', {rows: removed.removed})); refreshPanel(); } r.after?.(); } : null, redo: r.redo});
            r.after?.();
            return r;
        } catch (e) { toast(e.message || String(e), 'error'); return null; }
    }

    /* ═════════════ glisser du panier sur l'écran ouvert ═════════════ */
    const MIME = 'application/x-lcnda-cx';
    let dragging = null, overlay = null;
    function startDrag(e, items, o = {}) {
        if (!settings().dnd) return;
        dragging = {items, ...o};
        try { e.dataTransfer.setData(MIME, '1'); e.dataTransfer.setData('text/plain', items.map(itemLine).join('\n')); e.dataTransfer.effectAllowed = 'copy'; } catch (_) {}
    }
    const dragItems = e => (dragging && e.dataTransfer?.types?.includes(MIME) ? dragging.items : null);
    const hereTarget = items => targetsFor(items).find(t => hereOf(t)) || null;
    document.addEventListener('dragover', e => {
        const items = dragItems(e); if (!items) return;
        const ws = e.target.closest?.('#workspace'); if (!ws) { overlay?.remove(); overlay = null; return; }
        const t = hereTarget(items); if (!t) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
        if (!overlay) {
            overlay = document.createElement('div'); overlay.className = 'cx-drop'; overlay.setAttribute('aria-hidden', 'true');
            const acc = accepted(t, items), left = items.filter(x => !acc.includes(x));
            let ex = ''; try { ex = t.explain?.(acc, hereOf(t)) || ''; } catch (_) {}
            overlay.innerHTML = `<div><b>${esc(T('Lâche ici : {what}', {what: ex || T(t.label)}))}</b>${left.length ? `<small>${esc(T('« {t} » ne va pas ici : il reste dans le panier', {t: left.map(x => x.title).slice(0, 2).join(', ')}))}</small>` : ''}</div>`;
            const r = ws.getBoundingClientRect(); Object.assign(overlay.style, {top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${Math.min(r.height, innerHeight - r.top)}px`});
            document.body.appendChild(overlay);
        }
    });
    document.addEventListener('drop', e => {
        const items = dragItems(e); overlay?.remove(); overlay = null; if (!items) return;
        const t = hereTarget(items); if (!t || !e.target.closest?.('#workspace, .cx-drop')) return;
        e.preventDefault(); const d = dragging; dragging = null;
        deliver(t, items, {here: true, fromBasket: d.fromBasket});
    });
    document.addEventListener('dragend', () => { overlay?.remove(); overlay = null; setTimeout(() => { dragging = null; }, 0); });

    /* ═════════════ les destinations de l'app ═════════════ */
    const invOpen = () => { const st = S(); return st.module === 'enquetes' && Number(st.currentInvestigationId) && document.querySelector('#workspace .investigation-detail') ? Number(st.currentInvestigationId) : 0; };
    const invTitle = () => document.querySelector('.investigation-detail .page-header h1, .investigation-detail .page-header h2, .investigation-detail h1, .investigation-detail h2')?.textContent?.trim() || T('cette enquête');
    const reloadInv = id => { const st = S(); if (st.module === 'enquetes' && Number(st.currentInvestigationId) === Number(id)) A().refreshScreen?.(); };
    /** 🕵️ choisir une enquête (toutes celles où la personne est principale ou secondaire, ou les dernières), et une piste */
    async function chooseInvestigation({personId = 0, title = T('Dans quelle enquête ?'), items = [], allowNew = true, pickItem = true, multiple = false, newTitle = ''} = {}) {
        let list = []; try { list = (await api('cx_person_investigations', {person_id: personId || 0})).investigations || []; } catch (_) {}
        return new Promise(res => {
            const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-inv';
            const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
            const role = r => (r === 'main' ? '' : r === 'primary' ? ` ${T('(principale)')}` : ` ${T('(secondaire)')}`);
            dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">🕵️ ${esc(T('ENQUÊTE'))}</span><h2>${esc(title)}</h2></div><button type="button" class="icon-button" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></div>
                <div class="cx-body">${multiple ? `<div class="cx-invs">${list.map((i, k) => `<label class="checkbox-line"><input type="checkbox" name="inv" value="${i.id}" ${k === 0 ? 'checked' : ''}> ${esc(i.title)}<small class="muted">${esc(role(i.role))}${i.status !== 'open' ? ` · ${esc(T('fermée'))}` : ''}</small></label>`).join('') || `<p class="muted">${esc(T('Aucune enquête pour cette personne.'))}</p>`}</div>`
                    : `<label>${esc(T('Enquête'))}<select name="inv">${list.map((i, k) => opt(i.id, `${i.title}${role(i.role)}${i.status !== 'open' ? ` · ${T('fermée')}` : ''}`, k === 0)).join('')}${allowNew && personId ? opt('new', T('＋ Une nouvelle enquête…'), !list.length) : ''}</select></label>
                    <label data-cx-newl ${list.length ? 'hidden' : ''}>${esc(T('Titre de la nouvelle enquête'))}<input name="newtitle" value="${esc(newTitle)}" maxlength="200"></label>
                    ${pickItem ? `<label data-cx-iteml>${esc(T('Piste'))}<select name="item"></select></label>` : ''}`}</div>
                <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-cx-cancel>${esc(T('Annuler'))}</button><button type="submit" class="button">${esc(T('Ranger ici'))}</button></div></form>`;
            document.body.appendChild(dlg);
            let answered = false; const answer = v => { if (answered) return; answered = true; res(v); dlg.close(); };
            dlg.addEventListener('close', () => { dlg.remove(); if (!answered) { answered = true; res(null); } });
            dlg.querySelector('[data-cx-x]').addEventListener('click', () => answer(null)); dlg.querySelector('[data-cx-cancel]').addEventListener('click', () => answer(null));
            const f = dlg.querySelector('form');
            const items0 = () => { const sel = f.elements.inv?.value, inv = list.find(i => String(i.id) === sel), s = f.querySelector('select[name="item"]'); f.querySelector('[data-cx-newl]').hidden = sel !== 'new'; if (!s) return;
                s.innerHTML = opt(0, items.length > 1 ? T('＋ Une nouvelle piste pour tout') : T('＋ Une nouvelle piste'), true) + (items.length > 1 ? opt('each', T('＋ Une nouvelle piste pour chaque élément'), false) : '') + (inv?.items || []).map(x => opt(x.id, `📌 ${x.title}`, false)).join(''); };
            if (!multiple) { f.elements.inv.addEventListener('change', items0); items0(); }
            f.addEventListener('submit', e => {
                e.preventDefault();
                if (multiple) return answer({ids: [...f.querySelectorAll('[name="inv"]:checked')].map(x => Number(x.value)), list});
                const sel = f.elements.inv.value, it = f.querySelector('select[name="item"]')?.value || '0';
                if (!sel) return;
                answer(sel === 'new' ? {create: true, title: f.elements.newtitle.value.trim() || newTitle, person_id: personId} : {investigation_id: Number(sel), title: list.find(i => String(i.id) === sel)?.title || '', item_id: it === 'each' ? 0 : Number(it) || 0, mode: it === 'each' ? 'each' : 'one'});
            });
            dlg.showModal();
        });
    }
    async function ensureInvestigation(c) {
        if (!c?.create) return c;
        const r = await apiPost('save_investigation', {person_id: c.person_id, title: c.title || T('Nouvelle enquête'), status: 'open'});
        return {...c, investigation_id: Number(r?.id || r?.investigation_id || 0), created: true, item_id: 0, mode: 'one'};
    }
    const personOf = items => Number(items.find(x => x.kind === 'person' && x.ref_id)?.ref_id || items.find(x => x.origin?.person_id)?.origin?.person_id || S().currentPerson?.person?.id || 0);
    DT.push({
        id: 'investigation', icon: '🕵️', label: 'Une enquête (piste ou pièce)…', group: 'Chercher',
        here: () => { const id = invOpen(); return id ? {investigation_id: id, item_id: 0, mode: 'one', label: T('Ici : l’enquête « {t} »', {t: invTitle()})} : null; },
        choose: async items => { const c = await chooseInvestigation({personId: personOf(items), items, newTitle: items[0]?.title || ''}); return c ? ensureInvestigation(c) : null; },
        explain: items => { const m = items.filter(x => x.kind === 'media').length, p = items.filter(x => x.kind === 'person').length, o = items.length - m - p;
            return [m ? T('{n} comme pièces', {n: plural(m, T('média'), T('médias'))}) : '', p ? T('{n} comme personnes liées', {n: plural(p, T('fiche'))}) : '', o ? T('{n} sur une piste', {n: plural(o, T('chose'), T('choses'))}) : ''].filter(Boolean).join(', '); },
        receive: async (items, ctx) => {
            const r = await post('inv_receive', {investigation_id: ctx.investigation_id, item_id: ctx.item_id || 0, mode: ctx.mode || 'one', items});
            reloadInv(ctx.investigation_id);
            return {message: T('🕵️ Rangé dans l’enquête « {t} » : {n}', {t: ctx.title || invTitle(), n: plural(items.length, T('chose'), T('choses'))}),
                undo: async () => { await post('inv_receive_undo', r); if (ctx.created) await apiPost('delete_investigation', {id: ctx.investigation_id}); reloadInv(ctx.investigation_id); }};
        }});
    /* 📝 une note sur une fiche (le texte de chaque élément, avec sa source) */
    DT.push({
        id: 'note', icon: '📝', label: 'Une note sur une fiche…', group: 'Ranger',
        here: () => { const p = S().module === 'personnes' && S().currentPerson?.person; return p?.id ? {person_id: Number(p.id), label: T('Ici : une note sur la fiche de {n}', {n: A().personName ? A().personName(p) : p.first_name || ''})} : null; },
        choose: async () => { const it = await (window.LCNDA_PICKER || A()).openPicker?.({kind: 'person', title: T('La note va sur la fiche de…')}); return it ? {person_id: Number(it.id), title: it.title} : null; },
        explain: items => T('une note avec {n} et leur source', {n: plural(items.length, T('chose'), T('choses'))}),
        receive: async (items, ctx) => {
            const r = await apiPost('add_note', {person_id: ctx.person_id, title: items.length === 1 ? items[0].title.slice(0, 200) : T('{n} pris le {d}', {n: plural(items.length, T('élément')), d: new Date().toLocaleDateString('fr-FR')}), body: items.map(itemText).join('\n\n')});
            const id = Number(r?.id || 0); const after = () => { if (S().module === 'personnes' && Number(S().currentPerson?.person?.id) === ctx.person_id) A().refreshScreen?.(); };
            return {message: T('📝 Note ajoutée ({n})', {n: plural(items.length, T('chose'), T('choses'))}), undo: id ? async () => { await apiPost('delete_note', {id}); after(); } : null, after};
        }});
    /* 📚 l'Atelier : sur l'élément ouvert (ses notes), sinon de nouveaux éléments dans le projet */
    const atelierState = () => { const st = S(); return st.module === 'enquetes' && st.enquetesTab === 'atelier' ? (st.atelierView || st.atelier || null) : null; };
    const atelierAgain = () => { const st = S(); if (st.module === 'enquetes' && st.enquetesTab === 'atelier') ext.atelier?.(++st.workspaceToken); };
    DT.push({
        id: 'atelier', icon: '📚', label: 'Un projet de l’Atelier…', group: 'Ranger',
        here: () => { const v = ext.atelierHere?.(); return v?.project ? {...v, label: v.item ? T('Ici : dans l’élément « {t} »', {t: v.itemTitle || ''}) : T('Ici : dans le projet « {t} »', {t: v.projectTitle || ''})} : null; },
        choose: async () => {
            let list = []; try { list = (await api('atelier_projects')).projects || []; } catch (_) {}
            if (!list.length) { toast(T('Aucun projet dans l’Atelier : crée-en un dans Enquêtes → Atelier.')); return null; }
            return new Promise(res => UI().menuAt?.(document.activeElement || document.body, list.slice(0, 40).map(p => ({icon: p.icon || '📚', label: p.title, run: () => res({project: Number(p.id), projectTitle: p.title})})), {title: T('Dans quel projet ?'), onClose: () => setTimeout(() => res(null), 50)}));
        },
        explain: (items, ctx) => (ctx?.item ? T('ajouté aux notes de l’élément, avec la source') : T('{n} (notes avec leur source ; un ensemble : un tableau sourcé)', {n: plural(items.length, T('élément'), T('éléments'))})),
        receive: async (items, ctx) => {
            if (ctx.item) { // ajouté aux notes de l'élément ouvert, avec la source
                const proj = await api('atelier_project', {id: ctx.project}); const it = (proj.items || []).find(x => Number(x.id) === Number(ctx.item));
                if (!it) throw new Error(T('Élément introuvable.'));
                const data = typeof it.data === 'object' && it.data ? it.data : (JSON.parse(it.data_json || '{}') || {});
                const before = {...data}, add = items.map(itemText).join('\n\n');
                await apiPost('save_atelier_item', {id: it.id, title: it.title, tags: it.tags || JSON.parse(it.tags_json || '[]'), data: {...data, notes: `${data.notes ? data.notes + '\n\n' : ''}${add}`}});
                atelierAgain();
                return {message: T('📚 Ajouté à « {t} »', {t: it.title}), undo: async () => { await apiPost('save_atelier_item', {id: it.id, title: it.title, tags: it.tags || JSON.parse(it.tags_json || '[]'), data: before}); atelierAgain(); }};
            }
            const ids = [];
            for (const x of items) {
                const p = x.kind === 'person' && x.ref_id ? {type: 'person', title: x.title, data: {person_id: x.ref_id, name: x.title, notes: x.value || ''}}
                    : x.kind === 'set' ? {type: 'note', title: x.title, data: {text: itemText(x)}}
                    : x.kind === 'datum' || x.kind === 'text' || x.kind === 'data' || x.kind === 'row' ? {type: 'quote', title: x.title.slice(0, 300), data: {text: x.value || x.title, notes: itemText(x)}}
                    : {type: 'note', title: x.title.slice(0, 300), data: {text: itemText(x)}};
                const r = await apiPost('save_atelier_item', {project_id: ctx.project, ...p, folder_ids: ctx.folder ? [ctx.folder] : undefined});
                if (r?.id) ids.push(Number(r.id));
            }
            atelierAgain();
            return {message: T('📚 {n} dans l’Atelier', {n: plural(ids.length, T('élément'), T('éléments'))}), undo: async () => { await apiPost('atelier_items_action', {project_id: ctx.project, ids, action: 'delete'}); atelierAgain(); }};
        }});
    /* ⏰ une tâche, un rappel (rattachable à une enquête ou une piste) */
    DT.push({
        id: 'reminder', icon: '⏰', label: 'Une tâche, un rappel…', group: 'Ranger',
        choose: async items => {
            const c = await new Promise(res => { let done = false; ext.openDialog?.({eyebrow: '⏰', title: T('Un rappel'), submitLabel: T('Créer le rappel'),
                body: `<label>${esc(T('Titre'))}<input name="t" value="${esc(items.length === 1 ? items[0].title : T('Voir {n}', {n: plural(items.length, T('chose'), T('choses'))}))}" required maxlength="300"></label><label>${esc(T('Pour le'))}<input type="date" name="d" value="${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}"></label><label class="checkbox-line"><input type="checkbox" name="inv"> ${esc(T('Le rattacher à une enquête ou une piste'))}</label>`,
                onSubmit: f => { done = true; res({title: f.elements.t.value.trim(), due: f.elements.d.value, inv: f.elements.inv.checked}); }, onOpen: d => d.addEventListener('close', () => { if (!done) res(null); })}); });
            if (!c) return null;
            if (c.inv) { const i = await chooseInvestigation({personId: personOf(items), items: [{}], allowNew: false}); if (i) Object.assign(c, {investigation_id: i.investigation_id, item_id: i.item_id}); }
            return c;
        },
        explain: () => T('un rappel avec un lien vers chacune'),
        receive: async (items, ctx) => {
            const r = await post('reminder_add', {title: ctx.title, due: ctx.due, notes: items.map(itemText).join('\n\n'), investigation_id: ctx.investigation_id || 0, investigation_item_id: ctx.item_id || 0});
            return {message: T('⏰ Rappel « {t} » créé', {t: ctx.title}), undo: async () => { await apiPost('delete_standalone_reminder', {id: r.reminder_id}).catch(() => apiPost('delete_record', {type: 'standalone_reminder', id: r.reminder_id})); if (r.link_id) await post('link_remove', {id: r.link_id}); }};
        }});
    /* 📋 Mes listes (les fiches) */
    DT.push({
        id: 'mylist', icon: '📋', label: 'Une de « Mes listes »…', group: 'Ranger', kinds: ['person'],
        choose: async () => { let lists = []; try { lists = ((await api('my_lists')).lists || []).filter(l => l.source === 'persons'); } catch (_) {}
            if (!lists.length) { toast(T('Aucune de « Mes listes » ne contient des personnes : crée-en une dans Listes → Mes listes.')); return null; }
            return new Promise(res => UI().menuAt?.(document.activeElement || document.body, lists.map(l => ({icon: l.icon || '📋', label: l.name, run: () => res({list_id: Number(l.id), name: l.name})})), {title: T('Dans quelle liste ?'), onClose: () => setTimeout(() => res(null), 50)})); },
        explain: items => T('{n} ajoutées à la liste', {n: plural(items.length, T('fiche'))}),
        receive: async (items, ctx) => { const SB = body => apiPost('listes_plus_write', body); const r = await SB({op: 'mylist_add', list_id: ctx.list_id, ids: items.map(x => x.ref_id)});
            return {message: T('📋 {n} ajoutées à « {l} »', {n: plural(items.length, T('fiche')), l: ctx.name}), undo: async () => { await SB({op: 'mylist_restore', list_id: ctx.list_id, before: r.before}); }}; }});
    /* 📖 Livre de famille : à la fin du livre (« Mot de la fin »), avec les sources */
    DT.push({
        id: 'book', icon: '📖', label: 'Le Livre de famille…', group: 'Créer',
        enabled: () => !!ext.familyBookPanelHtml,
        choose: async () => ({}),
        explain: () => T('à la fin du livre (« Mot de la fin »), avec leur source'),
        receive: async items => {
            const K = 'genealogie-family-book', before = localStorage.getItem(K), c = readJ(K, {}) || {};
            const add = items.map(itemText).join('\n\n');
            c.epilogue = `${c.epilogue ? c.epilogue + '\n\n' : ''}${add}`;
            c.sections = [...new Set([...(c.sections || ['cover', 'tree', 'people', 'chronology']), 'epilogue'])]; c.off = (c.off || []).filter(k => k !== 'epilogue');
            writeJ(K, c);
            return {message: T('📖 Ajouté au Livre de famille ({n})', {n: plural(items.length, T('chose'), T('choses'))}), undo: async () => { try { if (before == null) localStorage.removeItem(K); else localStorage.setItem(K, before); } catch (_) {} }};
        }});
    /* 🧺 le panier lui-même (depuis « Prendre depuis… » ou « Envoyer vers… ») */
    DT.push({id: 'basket', icon: '🧺', label: 'Le panier', group: 'Ranger', enabled: () => enabled(), choose: async () => ({}), explain: () => T('mis de côté, pour plus tard'),
        receive: async items => { const r = await take(items, {quiet: true}); return {message: T('🧺 {n} au panier', {n: plural(r?.ids?.length || 0, T('chose'), T('choses'))}), undo: async () => { setCountFrom(await post('basket_remove', {ids: r?.ids || []})); }}; }});
    /* les outils de création d'« 📤 Envoyer vers… » : ce que le panier leur donne (images, texte, tableau) */
    const viaSend = (key, icon, label, explain, kindOf) => DT.push({id: 'send_' + key, icon, label, group: 'Créer',
        enabled: () => !!(ext.sendTargets || []).find(t => t.key === key)?.ready?.(),
        kinds: null, choose: async () => ({}), explain,
        receive: async items => {
            const t = ext.sendTargets.find(x => x.key === key);
            const {kind, data} = await kindOf(items);
            await t.run(kind, data, {title: items[0]?.title || ''});
            return {message: T('{i} Ouvert dans {l}', {i: icon, l: T(label)})};
        }});
    const asHtml = items => `<h1>${esc(items.length === 1 ? items[0].title : T('Éléments pris le {d}', {d: new Date().toLocaleDateString('fr-FR')}))}</h1>${items.map(itemHtml).join('')}`;
    const asRows = items => { const s = items.find(x => x.kind === 'set'); if (s && items.length === 1) return [s.data.columns || [], ...(s.data.rows || [])]; return [[T('Quoi'), T('Détail'), T('Source')], ...items.flatMap(explode).map(x => [x.title, x.value || '', [x.origin?.label, x.origin?.url].filter(Boolean).join(' — ')])]; };
    viaSend('textdoc', '📝', 'Un nouveau document (Traitement de texte)', () => T('un document avec chaque élément et sa source'), async items => ({kind: 'text', data: {html: asHtml(items), name: items[0]?.title || T('Document')}}));
    viaSend('sheet', '🧾', 'Le Tableur', () => T('une ligne par élément (un ensemble : son tableau)'), async items => ({kind: 'rows', data: {rows: asRows(items), name: items[0]?.title || T('Tableau')}}));
    viaSend('keynote', '🎞️', 'Une nouvelle présentation', () => T('une diapositive de texte'), async items => ({kind: 'text', data: {html: asHtml(items), name: items[0]?.title}}));
    viaSend('site', '🌐', 'Une page de mon site…', () => T('le texte et ses sources sur une page'), async items => ({kind: 'text', data: {html: asHtml(items), name: items[0]?.title}}));
    DT.push({id: 'montage', icon: '🎬', label: 'Un nouveau montage vidéo', group: 'Créer', kinds: ['media'], enabled: () => !!ext.newMontage, choose: async () => ({}), explain: items => T('{n} sur la piste vidéo', {n: plural(items.length, T('image'))}),
        receive: async items => { const medias = await mediaRows(items); await ext.sendTo('images', {medias}, {to: 'montage-new'}); return {message: T('🎬 Montage ouvert avec {n}', {n: plural(medias.length, T('image'))})}; }});
    async function mediaRows(items) {
        const out = [];
        for (const x of items) {
            if (x.data?.filename) { out.push({id: x.ref_id, filename: x.data.filename, title: x.title}); continue; }
            try { const r = await api('picker_search', {kind: 'media', ids: String(x.ref_id)}); const m = r.groups?.[0]?.items?.[0]; out.push({id: x.ref_id, filename: m?.filename || String(m?.thumb || '').replace(/^media\//, ''), title: x.title}); } catch (_) {}
        }
        return out.filter(m => m.filename);
    }

    /* ═════════════ 📤 « Envoyer vers… » : 5 destinations de plus ═════════════ */
    function sendItems(kind, d, o) {
        const label = d.name || o.title || T('Envoyé');
        if (kind === 'image' || kind === 'video' || kind === 'audio') return [{kind: 'media', ref_id: Number(d.media?.id) || 0, title: d.media?.title || label, data: {filename: d.media?.filename || ''}, origin: screenOrigin()}];
        if (kind === 'images') return (d.medias || []).map(m => ({kind: 'media', ref_id: Number(m.id), title: m.title || m.filename, data: {filename: m.filename}, origin: screenOrigin()}));
        if (kind === 'rows') { const rows = d.rows || []; return [{kind: 'set', title: label, value: '', data: {columns: rows[0] || [], rows: rows.slice(1), source: screenOrigin().label}, origin: screenOrigin()}]; }
        if (kind === 'svg') return [{kind: 'text', title: label, value: T('(un dessin)'), origin: screenOrigin()}];
        const div = document.createElement('div'); div.innerHTML = String(d.html || '').replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');
        const txt = (div.textContent || '').replace(/\s+\n/g, '\n').trim();
        return [{kind: 'text', title: label.slice(0, 200), value: txt.slice(0, 20000), origin: screenOrigin()}];
    }
    const SEND_NEW = [
        ['investigation', '🕵️', 'Dans une enquête (piste ou pièce)…', 'Enquête', ['image', 'images', 'text', 'rows', 'audio', 'video']],
        ['board', '🧩', 'Sur le tableau d’une enquête…', 'Enquête', ['image', 'images', 'text']],
        ['note', '📝', 'Dans une note sur une fiche…', 'Ranger', ['image', 'images', 'text', 'rows']],
        ['proof', '⚖️', 'Dans un dossier de preuve…', 'Ranger', ['text', 'rows', 'image']],
        ['basket', '🧺', 'Dans le panier', 'Ranger', ['image', 'images', 'text', 'rows', 'audio', 'video', 'svg']],
    ];
    function addSendTargets() {
        const list = ext.sendTargets; if (!Array.isArray(list)) return false;
        SEND_NEW.forEach(([key, icon, label, group, kinds]) => {
            if (list.some(t => t.key === 'cx_' + key)) return;
            list.push({key: 'cx_' + key, icon, label, group, kinds, ready: () => enabled() && (key !== 'board' || !!ext.openBoardById) && (key !== 'proof' || !!ext.preuve),
                run: async (kind, d, o) => {
                    const items = sendItems(kind, d, o);
                    if (key === 'basket') return take(items);
                    if (key === 'board') return sendToBoard(items, kind, d);
                    if (key === 'proof') return sendToProof(items);
                    const t = DT.find(x => x.id === key); return deliver(t, items, {anchor: o.anchor});
                }});
        });
        return true;
    }
    /** 🧩 le tableau d'une enquête : on choisit l'enquête, l'élément est rangé dans une piste et le tableau s'ouvre */
    async function sendToBoard(items) {
        const t = DT.find(x => x.id === 'investigation');
        const r = await deliver(t, items, {});
        if (r && ext.boardOfInvestigation) ext.boardOfInvestigation(r.investigation_id);
        else if (r) toast(T('Rangé dans l’enquête : ouvre son « 🧩 Tableau » pour le poser.'));
        return r;
    }
    /** ⚖️ un dossier de preuve : le texte devient une note du dossier (ouvert ensuite) */
    async function sendToProof(items) {
        if (ext.preuve?.addNote) return ext.preuve.addNote(items.map(itemText).join('\n\n'));
        const pid = personOf(items) || (await (window.LCNDA_PICKER || A()).openPicker?.({kind: 'person', title: T('Le dossier de preuve de…')}))?.id;
        if (!pid) return null;
        const t = DT.find(x => x.id === 'note'); await deliver(t, items, {});
        ext.preuve?.openFor?.(Number(pid));
        return null;
    }

    /* ═════════════ ☑ la barre de sélection : « 🧺 Au panier » et « 📍 Mettre dans… » ═════════════ */
    function selItems(kind, ids, sel) {
        const rows = sel?.rows?.() || [];
        return ids.map(id => { const row = rows.find(r => String(r.dataset.selId || r.dataset.ongSel || '') === String(id));
            const title = (row?.querySelector('.table-link, strong, b, a')?.textContent || row?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) || `${KIND[kind]?.[1] || ''} ${id}`;
            const value = (row?.querySelector('.event-date')?.childNodes?.[0]?.textContent || '').trim();
            return {kind: KIND[kind] ? kind : 'row', ref_id: Number(id) || 0, title, value, origin: screenOrigin(row)}; });
    }
    function addSelectionActions() {
        const SB = ext.selectionBar; if (!SB || SB.__cx) return !!SB;
        SB.__cx = true;
        SB.extraActions = SB.extraActions || [];
        SB.extraActions.push(o => (enabled() ? [
            {id: 'cx_take', icon: '🧺', label: T('Au panier'), help: T('Mettre les lignes cochées de côté (elles te suivent d’écran en écran)'), edit: true, run: (ids, sel) => take(selItems(o.kind || 'row', ids, sel))},
            {id: 'cx_put', icon: '📍', label: T('Mettre dans…'), help: T('Ranger les lignes cochées dans une enquête, une note, l’Atelier, une liste…'), edit: true, run: (ids, sel) => putInto(selItems(o.kind || 'row', ids, sel), {anchor: sel.el})},
        ] : []));
        return true;
    }

    /* ═════════════ clic droit : « 🧺 Prendre « 3 mai 1872 » » (une info précise) ═════════════ */
    const FIELD_OF = [[/date|when|jour/, 'date'], [/place|lieu|where/, 'lieu'], [/title|titre|name|nom/, 'nom'], [/note|body|texte|text/, 'texte']];
    function preciseOf(target) {
        if (!enabled() || !settings().ctx || kiosk()) return null;
        const zone = target.closest?.('#workspace, dialog[open]'); if (!zone) return null;
        if (target.closest('.cx-panel, .cx-modal, .ui-actmenu, input, textarea, select, button, [contenteditable="true"]')) return null;
        const sel = window.getSelection?.(), stext = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : '';
        let text = stext, el = target, kind = 'text';
        const own = [...(target.childNodes || [])].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
        if (!text && own.length >= 2 && own.length <= 160) { text = own; kind = 'datum'; } // le texte de l'élément lui-même (« 3 février 1978 », sans l'âge en petit)
        if (!text) {
            for (let n = target; n && n !== zone; n = n.parentElement) { const t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim(); if (t && t.length <= 160) { el = n; text = t; } if (!t || t.length > 160) break; }
            kind = 'datum';
        }
        if (!text || text.length < 2) return null;
        const cls = `${el.className || ''} ${el.parentElement?.className || ''}`.toLowerCase();
        const field = (FIELD_OF.find(([re]) => re.test(cls)) || [null, ''])[1];
        const origin = {...screenOrigin(el), field};
        const ev = el.closest?.('[data-event-id]'); const evLabel = ev?.querySelector('.item-title-row strong, strong')?.textContent?.trim() || '';
        const title = field && evLabel ? `${evLabel} — ${field}` : field ? `${field[0].toUpperCase()}${field.slice(1)}` : (kind === 'text' ? T('Passage') : T('Info'));
        return {kind, title: kind === 'text' ? text.slice(0, 120) : title, value: text.slice(0, 20000), ref_id: 0, origin};
    }
    /** les lignes du menu (clic droit) — appelées par app-actions.js (UI.ctxExtras) */
    function ctxItems(e) {
        const it = preciseOf(e.target); if (!it) return [];
        const short = it.value.length > 40 ? it.value.slice(0, 38) + '…' : it.value;
        return [{icon: '🧺', label: T('Prendre « {t} »', {t: short}), run: () => take([it])}, {icon: '📍', label: T('Mettre « {t} » dans…', {t: short}), run: () => putInto([it])}];
    }
    (UI().ctxExtras = UI().ctxExtras || []).push(ctxItems);

    /* ═════════════ ＋ Ajouter : les deux lignes à ajouter au menu d'un outil ═════════════ */
    function shortcutText() { try { return A().shortcutKit?.hint?.('take_from') || ''; } catch (_) { return ''; } }
    function addMenuItems() {
        if (!enabled() || kiosk()) return [];
        const out = ['-', {icon: '📥', label: T('Prendre depuis…'), shortcut: shortcutText(), run: () => openTake()}];
        if (count) out.push({icon: '🧺', label: T('Vider le panier ici ({n})', {n: nf(count)}), run: () => emptyHere()});
        return [...out, ...(ext.cxNeeds?.addMenuItems?.() || [])]; // 🧩 « Un besoin… » (heritage-connexions-besoins.js)
    }
    /** « 🧺 Vider le panier ici » : tout ce que l'écran ouvert sait prendre */
    async function emptyHere() {
        const b = await loadBasket(true), items = b.items || [];
        const t = hereTarget(items); if (!t) return putInto(items, {fromBasket: true});
        return deliver(t, items, {here: true, fromBasket: true});
    }

    /* ═════════════ 📥 « Prendre depuis… » (maquette validée docs/design/prendre-depuis.html) ═════════════
     * Une colonne : en-tête (où ça va), corps (rubriques à gauche · recherche + lignes · poignée · aperçu), pied (combien, ce que fait
     * « Prendre »). Seule la liste défile. Clic sur une ligne = la montrer à droite ; la case, un double-clic ou Espace = la cocher. */
    const RAIL = [['Mis de côté', [['basket', '🧺', 'Panier'], ['recent', '🕘', 'Récents']]],
        ['Dans ma base', [['person', '👤', 'Fiches'], ['event', '📅', 'Événements'], ['act', '📜', 'Actes'], ['source', '🔖', 'Sources'], ['media', '🖼', 'Médias'], ['note', '📝', 'Notes'], ['place', '📍', 'Lieux']]],
        ['Ailleurs', [['data', '🧰', 'Données'], ['lists', '📋', 'Listes'], ['outside', '📂', 'De l’extérieur']]]];
    const TABS = RAIL.flatMap(([, a]) => a);
    const HINT = {basket: 'Ce que tu as mis de côté, d’un écran à l’autre.', recent: 'Ce que tu as pris ces derniers jours.', person: 'Un nom, un prénom, une année…', event: 'Un nom, une commune, une année ou une période (1780-1800)…',
        act: 'Une sorte d’acte, un nom, une commune, une cote…', source: 'Un titre, un auteur, une cote, un service d’archives…', media: 'Un titre, un nom de fichier, une cote, une personne…', note: 'Un mot de la note…', place: 'Une commune, un hameau, un département…'};
    const PS = ext.pickSources = ext.pickSources || [];
    const SPLIT = 'genealogie-cx-take-split';
    let takeState = null;
    /** la destination « ici » (l'écran ouvert qui sait recevoir) */
    const hereDest = () => DT.find(t => t.id !== 'basket' && (!t.enabled || t.enabled() !== false) && hereOf(t)) || null;
    /** « Ici : l'enquête « X » » → « l'enquête « X » » (la destination dite une fois, sans « Ici : ») */
    const destName = st => String(st.ctx?.label || (st.target ? T(st.target.label) : '')).replace(new RegExp(`^\\s*${T('Ici')}\\s*:\\s*`, 'i'), '').trim();
    const cleanIt = it => { if (!it) return it; const {_v, ...r} = it; return r; };
    const narrow = () => window.matchMedia?.('(max-width: 980px)').matches;
    async function openTake({tab = '', dest = null, ctx = null, restore = null} = {}) {
        if (!enabled()) return;
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'));
        if (takeState?.dlg?.isConnected) takeState.dlg.close();
        const target = dest || hereDest();
        const st = takeState = {tab: restore?.tab || tab || (count ? 'basket' : 'person'), q: restore?.q || '', picked: new Map(restore?.picked || []), results: [], target, ctx: ctx || (target ? hereOf(target) : null),
            preview: null, filters: new Set(), rank: 'date', mview: 'list', list: restore?.list || null, used: new Map(), back: restore?.back || null};
        const dn = target ? destName(st) : '';
        const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-take'; dlg.dataset.noFoot = ''; dlg.setAttribute('aria-labelledby', 'cx-take-h'); // le pied est le sien (pas de « Fermer » ajouté)
        const split = Number(readJ(SPLIT, 0)) || 0; if (split) dlg.style.setProperty('--cx-pw', `${split}px`);
        dlg.innerHTML = `<form method="dialog" class="cx-tk">
            <header class="cx-tk-head"><div class="cx-tk-ht"><span class="cx-eyebrow">📥 ${esc(T('Prendre depuis…'))}</span>
                <h2 id="cx-take-h">${target ? `${esc(T('Ajouter à'))} <span class="cx-destpill"><span aria-hidden="true">${esc(target.icon || '📥')}</span> ${esc(dn)}</span>` : esc(T('Prendre depuis…'))}</h2>
                <p class="cx-tk-say">${esc(target ? T('Coche ce que tu veux prendre, puis « 📥 Prendre ». Clique une ligne pour la voir en grand à droite.') : T('Coche ce que tu veux prendre, puis garde-le dans le panier ou mets-le ailleurs. Clique une ligne pour la voir en grand.'))}</p></div>
                <button type="button" class="cx-x" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></header>
            <div class="cx-quoi"><button type="button" data-cx-quoi aria-expanded="false" aria-controls="cx-rail"><span><span class="cx-quoi-lab">${esc(T('Quoi :'))}</span> <b data-cx-quoi-t></b></span><span aria-hidden="true">▾</span></button></div>
            <div class="cx-tk-body">
                <nav class="cx-rail" id="cx-rail" role="tablist" aria-orientation="vertical" aria-label="${esc(T('Où chercher'))}">${RAIL.map(([g, a]) => `<h5>${esc(T(g))}</h5>${a.map(([k, i, l]) => `<button type="button" role="tab" data-cx-tab="${k}" aria-selected="false"><span aria-hidden="true">${i}</span> <span class="cx-rl">${esc(T(l))}</span>${k === 'basket' && count ? `<span class="cx-rn is-b">${nf(count)}</span>` : ''}</button>`).join('')}`).join('')}</nav>
                <section class="cx-mid" aria-live="polite">
                    <div class="cx-tools" data-cx-tools><div class="cx-srch" data-cx-srch><input type="search" class="cx-q" data-cx-q aria-label="${esc(T('Chercher'))}" autocomplete="off"></div><div class="cx-chips" data-cx-chips></div></div>
                    <div class="cx-res" data-cx-res tabindex="-1"></div>
                </section>
                <div class="cx-gut" data-cx-gut role="separator" tabindex="0" aria-orientation="vertical" aria-label="${esc(T('Largeur de l’aperçu (← →)'))}"></div>
                <aside class="cx-prev" data-cx-prev aria-label="${esc(T('Aperçu'))}"></aside>
            </div>
            <footer class="cx-tk-foot"><div class="cx-cnt"><b data-cx-n class="cx-n"></b><span class="cx-what">${esc(target ? T('Prendre = les ajouter à {d}', {d: dn}) : T('Garder dans le panier = les retrouver plus tard, depuis n’importe quel écran'))}</span></div>
                <div class="cx-acts">
                    <button type="button" class="cx-b is-ter" data-cx-toput>${esc(T('Mettre ailleurs…'))}</button>
                    <button type="button" class="cx-b ${target ? 'is-sec' : 'is-pri'}" data-cx-tobasket>🧺 ${esc(T('Garder dans le panier'))}</button>
                    ${target ? `<button type="button" class="cx-b is-pri" data-cx-takehere><span>📥 ${esc(T('Prendre'))} <span data-cx-n2></span></span><small>${esc(T('dans {d}', {d: dn}))}</small></button>` : ''}</div></footer></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => { dlg.remove(); if (takeState === st) takeState = null; }); dlg.showModal();
        st.dlg = dlg;
        dlg.querySelector('[data-cx-x]').addEventListener('click', () => dlg.close());
        const rail = dlg.querySelector('.cx-rail');
        rail.addEventListener('click', e => { const b = e.target.closest('[data-cx-tab]'); if (!b) return; goTab(st, b.dataset.cxTab); });
        rail.addEventListener('keydown', e => { // ↑ ↓ entre les rubriques
            if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault();
            const bs = [...rail.querySelectorAll('[data-cx-tab]')], i = bs.indexOf(document.activeElement), n = bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]; n.focus(); goTab(st, n.dataset.cxTab);
        });
        dlg.querySelector('[data-cx-quoi]').addEventListener('click', e => { const on = !dlg.classList.contains('is-railopen'); dlg.classList.toggle('is-railopen', on); e.currentTarget.setAttribute('aria-expanded', String(on)); if (on) rail.querySelector('[aria-selected="true"]')?.focus(); });
        let tm = 0; const q = dlg.querySelector('[data-cx-q]');
        q.value = st.q;
        q.addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value.trim(); drawTab(st); }, 200); });
        q.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); if (e.key === 'ArrowDown') { e.preventDefault(); dlg.querySelector('[data-cx-res] .cx-rt')?.focus(); } });
        bindGutter(st);
        const picked = () => [...st.picked.values()].map(cleanIt);
        const need = () => { const p = picked(); if (!p.length) toast(T('Coche d’abord ce que tu prends.')); return p; };
        let busy = false; // un double-clic sur « Prendre » ne prend pas deux fois
        dlg.querySelector('[data-cx-tobasket]').addEventListener('click', async e => { const p = need(); if (!p.length || busy) return; busy = true;
            const id = await chooseBasket(e.currentTarget); if (id == null) { busy = false; return; } // plusieurs paniers : lequel ? (le dernier utilisé en premier)
            dlg.close(); await take(p, {basketId: id}); });
        dlg.querySelector('[data-cx-toput]').addEventListener('click', e => { const p = need(); if (!p.length || busy) return; busy = true; dlg.close(); putInto(p, {anchor: e.currentTarget, fromBasket: p.every(x => x.id && st.fromBasket?.has(x.id)), dests: st.tab === 'basket' && st.bk ? bOf(st.bk, st.bk.basket_id)?.dests : null}); });
        dlg.querySelector('[data-cx-takehere]')?.addEventListener('click', async () => { const p = need(); if (!p.length || busy) return; busy = true; dlg.close(); await deliver(target, p, {here: true, ctx: st.ctx || null, fromBasket: p.some(x => x.id && st.fromBasket?.has(x.id)), original: p}); });
        dlg.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('is-sheet')) { e.preventDefault(); closeSheet(st); } else if (e.key === 'Escape' && dlg.classList.contains('is-railopen')) { e.preventDefault(); dlg.classList.remove('is-railopen'); } });
        paintCount(st); drawTab(st);
        return st;
    }
    function goTab(st, k) {
        if (st.tab !== k) { st.tab = k; st.q = ''; st.filters = new Set(); st.list = null; st.dlg.querySelector('[data-cx-q]').value = ''; }
        st.dlg.classList.remove('is-railopen'); st.dlg.querySelector('[data-cx-quoi]')?.setAttribute('aria-expanded', 'false');
        drawTab(st);
    }
    /** la poignée entre la liste et l'aperçu : se tire, ou ← → au clavier ; la largeur est retenue */
    function bindGutter(st) {
        const g = st.dlg.querySelector('[data-cx-gut]'), dlg = st.dlg;
        const cur = () => st.dlg.querySelector('[data-cx-prev]').getBoundingClientRect().width || 340;
        const set = w => { const max = Math.max(260, dlg.getBoundingClientRect().width - 560); w = Math.round(Math.min(max, Math.max(240, w))); dlg.style.setProperty('--cx-pw', `${w}px`); writeJ(SPLIT, w); g.setAttribute('aria-valuenow', String(w)); };
        g.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(cur() + (e.key === 'ArrowLeft' ? 32 : -32)); } });
        g.addEventListener('pointerdown', e => {
            e.preventDefault(); g.setPointerCapture?.(e.pointerId); const right = dlg.getBoundingClientRect().right;
            const mv = ev => set(right - ev.clientX - 1), up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); };
            g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
        });
    }
    const pickKey = it => `${it.kind}|${it.ref_id || 0}|${it.title}|${it.value || ''}|${it.id || ''}`;
    function paintCount(st) {
        const n = st.picked.size, el = st.dlg.querySelector('[data-cx-n]');
        el.textContent = n ? T(n > 1 ? '{n} cochées' : '{n} cochée', {n: nf(n)}) : T('Rien de coché');
        const n2 = st.dlg.querySelector('[data-cx-n2]'); if (n2) n2.textContent = n ? `(${nf(n)})` : '';
        st.dlg.querySelector('[data-cx-takehere]')?.toggleAttribute('aria-disabled', !n);
        if (!st.preview && (n >= 2 || st.sum)) drawSummary(st); else if (st.sum && n < 2) { st.sum = false; previewItem(st, null); }
    }
    const togglePick = (st, it, on) => { const k = pickKey(it); if (on) st.picked.set(k, it); else st.picked.delete(k); };

    /* ── une ligne : qui, quand, où, combien de sources, déjà utilisé ? ── */
    const EV_ICON = {BIRT: '👶', CHR: '⛪', BAPM: '⛪', MARR: '💍', ENGA: '💍', MARC: '📜', DEAT: '✝', BURI: '⚰', CREM: '⚰', CENS: '🏠', RESI: '🏠', OCCU: '🛠', MILI: '🎖'};
    const EV_TYPE = {BIRT: 'n', CHR: 'n', BAPM: 'n', MARR: 'm', ENGA: 'm', MARC: 'm', DIV: 'm', DEAT: 'd', BURI: 'd', CREM: 'd'};
    const ACT_KIND = {naissance: 'Acte de naissance', bapteme: 'Acte de baptême', mariage: 'Acte de mariage', deces: 'Acte de décès', sepulture: 'Acte de sépulture', notarial: 'Acte notarié', notoriete: 'Acte de notoriété', recensement: 'Recensement', militaire: 'Registre militaire', lettre: 'Lettre', autre: 'Autre acte'};
    const looksCode = s => /^[0-9a-f-]{16,}$/i.test(String(s || '').trim()) || /^(capture|screenshot|img|dsc|scan)[ _-]?\S*\.(png|jpe?g|pdf|tiff?)$/i.test(String(s || '').trim());
    const shortDate = s => { const d = new Date(String(s || '').replace(' ', 'T')); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}) : ''; };
    /** une ligne du serveur (picker_search) → un élément à prendre, avec sa vue (_v : ce qu'on affiche ; jamais envoyé) */
    function pickItem(kind, x) {
        const v = {ico: x.icon || KIND[kind]?.[0], who: '', date: '', place: '', extra: [], pills: [], thumb: x.thumb || '', fields: [], todo: false, year: null, type: ''};
        let title = x.title || '', value = '';
        if (kind === 'event') {
            v.ico = EV_ICON[x.tag] || '📅'; v.type = EV_TYPE[x.tag] || 'o'; v.who = x.who || ''; v.date = x.date_text || (x.year ? String(x.year) : ''); v.place = x.place || ''; v.year = x.year || null;
            const typ = x.type || title; title = v.who && !title.includes(v.who) ? `${title} · ${v.who}` : title;
            v.src = Number(x.sources ?? -1); if (v.src >= 0) v.pills.push(v.src ? ['ok', plural(v.src, T('source'))] : ['q', T('sans source')]);
            v.fields = [[T('Sorte'), typ], [T('Qui'), v.who], [T('Date'), v.date], [T('Lieu'), v.place || T('lieu inconnu')], [T('Sources'), v.src >= 0 ? (v.src ? plural(v.src, T('source')) : T('aucune pour l’instant')) : '']];
            value = [v.who, v.date, v.place].filter(Boolean).join(' · ');
        } else if (kind === 'act') {
            const raw = looksCode(x.raw_title ?? title) ? '' : (x.raw_title ?? title);
            v.todo = !!x.undescribed; v.date = x.date_text || ''; v.place = x.place || ''; v.year = Number(String(v.date).match(/\d{4}/)?.[0]) || null;
            title = raw || (v.todo ? T('Acte sans titre (importé le {d})', {d: shortDate(x.created_at) || '…'}) : T(ACT_KIND[x.act_kind] || 'Acte'));
            const stt = ['checked', 'done'].includes(x.status) ? ['ok', T('Relue')] : x.status === 'doing' ? ['blue', T('En cours')] : x.has_text ? ['blue', T('Transcrit, à relire')] : ['q', T('À faire')];
            v.pills.push(v.todo ? ['red', T('À décrire')] : stt);
            if (x.cote) v.extra.push(x.cote); if (x.people_count) v.extra.push(plural(x.people_count, T('personne')));
            v.fields = [[T('Sorte'), x.act_kind && x.act_kind !== 'apreciser' ? T(ACT_KIND[x.act_kind] || 'Acte') : T('à préciser')], [T('Date'), v.date], [T('Lieu'), v.place], [T('Cote'), x.cote], [T('Personnes'), x.people_count ? plural(x.people_count, T('personne')) : T('aucune personne')], [T('État'), v.todo ? T('À décrire') : stt[1]]];
            value = [T(ACT_KIND[x.act_kind] || ''), v.date, v.place].filter(Boolean).join(' · ');
        } else if (kind === 'media') {
            const named = x.title && x.title !== x.filename && !looksCode(x.title);
            v.todo = !named && !x.date_text && !x.people_count; v.date = x.date_text || x.year || ''; v.place = x.place || ''; v.year = Number(x.year) || null;
            const typ = {image: T('Photo'), document: T('Document'), audio: T('Audio'), video: T('Vidéo')}[x.media_type] || T('Média');
            if (v.todo) v.pills.push(['q', T('pas encore décrit')]); else if (x.has_tr) v.pills.push(['blue', T('transcrit')]);
            v.extra = [typ, x.cote, x.people_count ? plural(x.people_count, T('personne')) : ''].filter(Boolean);
            v.fields = [[T('Sorte'), typ], [T('Date'), v.date], [T('Lieu'), v.place], [T('Cote'), x.cote], [T('Personnes'), x.people_count ? plural(x.people_count, T('personne')) : T('aucune personne')], [T('Fichier'), x.filename]];
            value = [typ, v.date, v.place].filter(Boolean).join(' · ');
        } else {
            const meta = String(x.meta || x.sub || '');
            v.extra = meta ? [meta] : []; v.year = Number(meta.match(/\b(1[0-9]{3}|20\d\d)\b/)?.[1]) || null;
            if (kind === 'place') v.place = title; if (x.badge && kind !== 'person') v.pills.push(['', x.badge]);
            v.fields = meta.split(' · ').filter(Boolean).map((s, i) => [i ? '' : T(KIND[kind]?.[1] || ''), s]);
            value = meta;
        }
        return {kind, ref_id: Number(x.id) || 0, title, value, _v: v,
            data: kind === 'media' ? {filename: x.filename || String(x.thumb || '').replace(/^media\//, '').split('?')[0]} : kind === 'place' && x.lat != null ? {lat: x.lat, lon: x.lon} : null,
            origin: kind === 'person' ? {kind: 'person', id: Number(x.id), person_id: Number(x.id), label: x.title} : x.person_id ? {kind: 'person', id: Number(x.person_id), person_id: Number(x.person_id), label: T('Fiche de {n}', {n: x.who || x.person_name || ''})} : {kind, id: Number(x.id), label: `${T(KIND[kind]?.[1] || '')} « ${x.title || title} »`}};
    }
    const viewOf = it => it._v || {ico: icon(it), extra: it.kind === 'set' ? [plural(setCount(it), T('ligne'))] : [], pills: [], fields: []};
    const sameText = (a, b) => { const x = fold(a).replace(/\W+/g, ' ').trim(), y = fold(b).replace(/\W+/g, ' ').trim(); return !y || x === y || x.startsWith(y) || y.startsWith(x); };
    const labKey = it => `${it.kind}|${String(it.title || '').trim().slice(0, 200)}|${String(it.value || '').trim().slice(0, 200)}`;
    /** ce qui est déjà dans les pistes de l'enquête (titre + valeur) : pour les lignes de liste et les infos sans numéro */
    async function loadInvLabels(st) { const inv = Number(st.ctx?.investigation_id || 0); if (!inv || st.invLabels) return; try { st.invLabels = new Set((await api('cx_used', {kind: 'labels', investigation_id: inv})).labels || []); } catch (_) { st.invLabels = new Set(); } }
    function usedPill(st, it) {
        if (!it.ref_id && st.invLabels?.has(labKey(it))) return ['ok', T('✓ déjà dans l’enquête')];
        const u = st.used.get(`${it.kind}:${it.ref_id}`) || []; if (!u.length) return null;
        const inv = Number(st.ctx?.investigation_id || 0);
        return u.some(x => x.investigation_id === inv) ? ['ok', T('✓ déjà dans l’enquête')] : ['', T(u.length > 1 ? 'utilisé dans {n} enquêtes' : 'utilisé dans 1 enquête', {n: u.length})];
    }
    function rowHtml(st, it, i) {
        const v = viewOf(it), on = st.picked.has(pickKey(it)), up = usedPill(st, it);
        const line2 = [v.who && !it.title.includes(v.who) ? v.who : '', v.date, v.place].filter(Boolean);
        const t2 = it.kind === 'event' ? [v.date, v.place].filter(Boolean).join(' · ') : line2.length ? line2.join(' · ') : '';
        const t3 = [...(v.extra || [])].filter(Boolean).join(' · ') || (!t2 && it.value && it.kind !== 'set' && !sameText(it.title, it.value) ? String(it.value).slice(0, 160) : '');
        const pills = [...(v.pills || []), up].filter(Boolean);
        const th = v.thumb ? `<span class="cx-th"><img src="${esc(v.thumb)}" alt="" loading="lazy" decoding="async"></span>` : (['media', 'act'].includes(it.kind) ? '<span class="cx-th is-none" aria-hidden="true"></span>' : '');
        const lbl = `${it.title}${t2 ? ` — ${t2}` : ''}`;
        return `<li data-cx-r="${i}" class="cx-row${on ? ' is-on' : ''}${v.todo ? ' is-todo' : ''}"><label class="cx-chk"><input type="checkbox" data-cx-ri="${i}" ${on ? 'checked' : ''} aria-label="${esc(T('Prendre « {t} »', {t: lbl.slice(0, 120)}))}"></label>${th}
            <button type="button" class="cx-rt" data-cx-see="${i}" aria-describedby="cx-hint-space"><span class="cx-t1">${st.mview === 'grid' && it.kind === 'media' ? '' : `<span class="cx-ico" aria-hidden="true">${esc(v.ico || icon(it))}</span>`}${esc(it.title)}</span>${t2 ? `<span class="cx-t2">${esc(t2)}</span>` : ''}${t3 ? `<span class="cx-t3">${esc(t3)}</span>` : ''}</button>
            <span class="cx-rp">${(it.kind === 'data' || it.kind === 'row') && (it.data?.links?.length || it.origin?.url) ? `<span class="cx-lk">${it.data?.links?.length ? it.data.links.slice(0, 3).map(l => srcLink(l.url, l.label)).join(' · ') : srcLink(it.origin.url)}</span>` : ''}${pills.map(([c, t]) => `<span class="cx-pl${c ? ` is-${c}` : ''}">${esc(t)}</span>`).join('')}${v.todo && !kiosk() ? `<button type="button" class="cx-b is-ter is-sm" data-cx-describe="${i}">✎ ${esc(T('Décrire'))}</button>` : ''}</span></li>`;
    }
    /** les lignes, rangées (par date, personne, lieu) ; les actes et médias pas décrits à la fin, « À décrire » */
    function resultsHtml(st, list, {groups = true} = {}) {
        st.results = list;
        if (!list.length) return '';
        const idx = new Map(list.map((x, i) => [x, i]));
        const rank = st.rank, keyOf = x => (rank === 'person' ? viewOf(x).who : rank === 'place' ? viewOf(x).place : '') || '';
        let order = [...list];
        if (groups && ['event', 'act', 'media', 'source', 'note'].includes(st.tab)) {
            if (rank === 'date') order.sort((a, b) => (viewOf(a).year ?? 1e9) - (viewOf(b).year ?? 1e9));
            else order.sort((a, b) => (keyOf(a) ? 0 : 1) - (keyOf(b) ? 0 : 1) || keyOf(a).localeCompare(keyOf(b), 'fr') || (viewOf(a).year ?? 1e9) - (viewOf(b).year ?? 1e9));
        }
        const known = order.filter(x => !viewOf(x).todo), todo = order.filter(x => viewOf(x).todo);
        const grid = st.mview === 'grid' && st.tab === 'media';
        const ul = arr => `<ul class="cx-rlist${grid ? ' cx-mgrid' : ''}">${arr.map(x => rowHtml(st, x, idx.get(x))).join('')}</ul>`;
        let html = '';
        if (groups && rank !== 'date' && ['event', 'act', 'media'].includes(st.tab)) {
            const by = new Map(); known.forEach(x => { const k = keyOf(x) || (rank === 'person' ? T('Sans personne') : T('Sans lieu')); by.set(k, [...(by.get(k) || []), x]); });
            html = [...by].map(([k, arr]) => `<h6 class="cx-gh">${esc(k)} <span>${nf(arr.length)}</span></h6>${ul(arr)}`).join('');
        } else html = known.length ? ul(known) : '';
        if (todo.length) html += `<h6 class="cx-gh is-todo">${esc(T('À décrire'))} <span>${nf(todo.length)}</span><small>${esc(T('pas encore de sorte, de date ni de lieu : « ✎ Décrire » pour les retrouver ensuite'))}</small></h6>${ul(todo)}`;
        return `${html}<p class="cx-sr" id="cx-hint-space">${esc(T('Espace ou double-clic : cocher'))}</p>`;
    }
    function bindResults(st, host) {
        const itOf = el => st.results[Number(el.dataset.cxRi ?? el.dataset.cxSee ?? el.dataset.cxDescribe ?? el.dataset.cxR)];
        const flip = (li, on) => { const cb = li?.querySelector('[data-cx-ri]'); const it = itOf(cb || {dataset: {}}); if (!cb || !it) return; cb.checked = on ?? !cb.checked; togglePick(st, it, cb.checked); li.classList.toggle('is-on', cb.checked);
            if (st.picked.size >= 2) st.preview = null; // plusieurs cases : à droite, « N éléments choisis » et ce que fera « Prendre »
            paintCount(st); };
        host.querySelectorAll('[data-cx-ri]').forEach(b => b.addEventListener('change', () => flip(b.closest('li'), b.checked)));
        host.querySelectorAll('[data-cx-see]').forEach(b => {
            b.addEventListener('click', () => { host.querySelectorAll('.cx-row.is-focus').forEach(x => x.classList.remove('is-focus')); b.closest('li').classList.add('is-focus'); previewItem(st, itOf(b), {open: true}); });
            b.addEventListener('dblclick', e => { e.preventDefault(); flip(b.closest('li')); });
            b.addEventListener('keydown', e => {
                if (e.key === ' ') { e.preventDefault(); flip(b.closest('li')); }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const all = [...host.querySelectorAll('[data-cx-see]')], j = all.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1); if (all[j]) { all[j].focus(); all[j].click(); } else if (j < 0) st.dlg.querySelector('[data-cx-q]:not([hidden])')?.focus(); }
            });
        });
        host.querySelectorAll('[data-cx-describe]').forEach(b => b.addEventListener('click', () => describe(st, itOf(b))));
    }
    /** ✎ Décrire : l'acte (dans la transcription) ou le média ; la fenêtre se ferme, on y revient avec ⌥⌘O */
    function describe(st, it) {
        if (!it) return;
        if (it.kind === 'act' && ext.openActTranscriber) { st.dlg.close(); return ext.openActTranscriber({id: it.ref_id}); }
        if (it.kind === 'media') { const f = A().openMedia || window.LCNDA_PICKER?.openMedia; if (f) { st.dlg.close(); return f(it.ref_id); } }
        openOrigin(it);
    }
    const openIt = it => {
        if (it.kind === 'act' && it.ref_id && ext.openActTranscriber) return ext.openActTranscriber({id: it.ref_id});
        if (it.kind === 'media' && it.ref_id) { const f = A().openMedia || window.LCNDA_PICKER?.openMedia; if (f) return f(it.ref_id); }
        return openOrigin(it);
    };
    /** l'aperçu : grande vignette, tous les champs, ↗ ouvrir, « Déjà utilisé dans… », et chaque morceau à prendre tout seul */
    function previewItem(st, it, {open = false} = {}) {
        const box = st.dlg.querySelector('[data-cx-prev]'); st.preview = it || null; st.sum = false;
        if (!it) { box.innerHTML = st.picked.size >= 2 ? '' : `<div class="cx-help"><p><b>${esc(T('Clique une ligne pour la voir ici.'))}</b></p><p>${esc(T('La case (ou Espace, ou un double-clic) la coche. Coche plusieurs lignes, même dans plusieurs rubriques : elles restent cochées.'))}</p></div>`; if (st.picked.size >= 2) drawSummary(st); return; }
        const v = viewOf(it), up = st.used.get(`${it.kind}:${it.ref_id}`) || [];
        const parts = it.kind === 'set' ? [] : [...(v.fields || []).filter(([, s]) => s).map(([l, s]) => [l, String(s)]), ...(v.fields?.length ? [] : String(it.value || '').split(/\s+·\s+|\n/).map(s => ['', s]))].map(([l, s]) => [l, s.trim()]).filter(([, s], i, a) => s && a.findIndex(y => y[1] === s) === i).slice(0, 20);
        const bigTh = v.thumb ? `<img class="cx-big" src="${esc(v.thumb)}" alt="${esc(it.title)}">` : '';
        const back = st.picked.size >= 2 ? `<button type="button" class="cx-b is-ter is-sm" data-cx-sumback>← ${esc(T('{n} éléments choisis', {n: nf(st.picked.size)}))}</button>` : '';
        const canOpen = it.origin?.url || it.origin?.open || it.ref_id || it.origin?.person_id;
        box.innerHTML = `<button type="button" class="cx-b is-ter is-sm cx-prev-back" data-cx-sheetx>← ${esc(T('Retour à la liste'))}</button>${back}${bigTh}<h4><span aria-hidden="true">${esc(v.ico || icon(it))}</span> ${esc(it.title)}</h4>
            ${it.kind === 'set' ? `<div class="cx-set">${setTable(it, 30)}</div>` : ''}
            ${v.fields?.filter(([, s]) => s).length ? `<dl class="cx-dl">${v.fields.filter(([, s]) => s).map(([l, s]) => `<dt>${esc(l)}</dt><dd>${esc(s)}</dd>`).join('')}</dl>` : !v.fields?.length && it.value && it.kind !== 'set' && !sameText(it.title, it.value) ? `<p>${esc(String(it.value).slice(0, 600))}</p>` : ''}
            ${it.origin?.label && it.kind !== 'set' ? `<p class="cx-src"><small>${esc(T('Source :'))} ${esc(it.origin.label)}${it.origin.url ? ` · ${srcLink(it.origin.url)}` : ''}</small></p>` : ''}
            ${canOpen ? `<p><button type="button" class="cx-b is-sec is-sm" data-cx-open>↗ ${esc(T('ouvrir'))}</button></p>` : ''}
            ${up.length ? `<h5 class="cx-sect">${esc(T('Déjà utilisé dans'))}</h5><ul class="cx-used">${up.map(u => `<li>🕵️ ${esc(u.title)}${u.item_title ? ` — <small>${esc(u.item_title)}</small>` : ''}</li>`).join('')}</ul>` : it.ref_id && ['event', 'act', 'media', 'source', 'note', 'place'].includes(it.kind) ? `<p class="cx-muted"><small>${esc(T('Pas encore utilisé dans une enquête.'))}</small></p>` : ''}
            ${parts.length > 1 ? `<h5 class="cx-sect">${esc(T('Prendre seulement une info'))}</h5><ul class="cx-parts">${parts.map(([l, p], i) => `<li><label class="checkbox-line"><input type="checkbox" data-cx-part="${i}" ${st.picked.has(pickKey(partOf(it, l, p))) ? 'checked' : ''}> ${l ? `<span class="cx-muted">${esc(l)} :</span> ` : ''}${esc(p)}</label></li>`).join('')}</ul>` : ''}`;
        box.querySelectorAll('[data-cx-part]').forEach(b => b.addEventListener('change', () => { const [l, p] = parts[Number(b.dataset.cxPart)]; togglePick(st, partOf(it, l, p), b.checked); const keep = st.preview; paintCount(st); st.preview = keep; }));
        box.querySelector('[data-cx-open]')?.addEventListener('click', () => openIt(it));
        box.querySelector('[data-cx-sumback]')?.addEventListener('click', () => { st.preview = null; drawSummary(st); });
        box.querySelector('[data-cx-sheetx]')?.addEventListener('click', () => closeSheet(st));
        if (open && narrow()) { st.dlg.classList.add('is-sheet'); box.querySelector('[data-cx-sheetx]')?.focus(); }
    }
    const closeSheet = st => { st.dlg.classList.remove('is-sheet'); st.dlg.querySelector('.cx-row.is-focus .cx-rt')?.focus(); };
    /** une info précise : « la date », « le lieu »… d'un élément */
    const partOf = (it, l, p) => ({kind: 'datum', title: `${it.title}${l ? ` — ${String(l).toLowerCase()}` : ''}`.slice(0, 200), value: p, ref_id: 0,
        origin: {...(it.origin || {}), kind: it.origin?.kind || it.kind, id: it.origin?.id || it.ref_id, label: it.origin?.label || `${KIND[it.kind]?.[1] || ''} « ${it.title} »`}});
    /** plusieurs cases cochées : « N éléments choisis » (× pour en retirer un) et ce que « Prendre » va faire */
    function drawSummary(st) {
        const box = st.dlg.querySelector('[data-cx-prev]'), items = [...st.picked.entries()]; st.sum = true; st.preview = null;
        if (!items.length) { previewItem(st, null); return; }
        let will = ''; const list = items.map(([, x]) => cleanIt(x));
        if (st.target) { try { will = st.target.explain?.(accepted(st.target, list), st.ctx) || ''; } catch (_) {} }
        const acc = st.target ? accepted(st.target, list).length : list.length;
        const dn = st.target ? destName(st) : '';
        box.innerHTML = `<button type="button" class="cx-b is-ter is-sm cx-prev-back" data-cx-sheetx>← ${esc(T('Retour à la liste'))}</button><h4 data-cx-sum>${esc(T(items.length > 1 ? '{n} éléments choisis' : '{n} élément choisi', {n: nf(items.length)}))}</h4>
            <ul class="cx-sum">${items.map(([k, x]) => `<li><span aria-hidden="true">${esc(viewOf(x).ico || icon(x))}</span><span class="cx-sum-t">${esc(x.title)}${x.kind === 'datum' ? ` <small>${esc(x.value)}</small>` : ''}</span><button type="button" class="cx-sum-x" data-cx-unpick="${esc(k)}" aria-label="${esc(T('Ne plus prendre « {t} »', {t: x.title}))}">×</button></li>`).join('')}</ul>
            <div class="cx-will"><b>${esc(T('Ce que « Prendre » va faire'))}</b><br>${esc(st.target ? (will || T('Les {n} vont dans {d}, chacun avec d’où il vient (↗ pour y revenir).', {n: nf(acc), d: dn})) : T('Garder dans le panier : tu les retrouves plus tard, sur n’importe quel écran (🧺 en haut).'))}${st.target && acc < list.length ? `<br><small>${esc(T('{a} sur {b} iront là ; le reste reste dans le panier.', {a: acc, b: list.length}))}</small>` : ''}</div>`;
        box.querySelectorAll('[data-cx-unpick]').forEach(b => b.addEventListener('click', () => {
            st.picked.delete(b.dataset.cxUnpick);
            st.dlg.querySelectorAll('[data-cx-ri]').forEach(cb => { const it = st.results[Number(cb.dataset.cxRi)]; if (it && pickKey(it) === b.dataset.cxUnpick) { cb.checked = false; cb.closest('li')?.classList.remove('is-on'); } });
            paintCount(st); if (st.picked.size >= 1) drawSummary(st);
        }));
        box.querySelector('[data-cx-sheetx]')?.addEventListener('click', () => closeSheet(st));
    }
    /** une adresse → un petit lien lisible : « ↗ OpenStreetMap » (jamais l'adresse brute) */
    const HOSTS = [[/openstreetmap\.org/, 'OpenStreetMap'], [/wikidata\.org/, 'Wikidata'], [/wikipedia\.org/, 'Wikipédia'], [/wikimedia\.org/, 'Wikimedia'], [/geoportail|ign\.fr/, 'IGN'], [/insee\.fr/, 'INSEE'], [/data\.gouv\.fr/, 'data.gouv.fr'], [/meteo|open-meteo/, 'Météo'], [/google\.[a-z.]+\/maps|maps\.google/, 'Google Maps'], [/archives|ad\d\d/, 'Archives'], [/geneanet/, 'Geneanet'], [/gallica\.bnf/, 'Gallica']];
    const hostLabel = u => { let h = ''; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return T('source'); } return (HOSTS.find(([re]) => re.test(u)) || [null, h])[1]; };
    const srcLink = (u, label = '') => (/^https?:\/\//i.test(String(u || '')) ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">↗ ${esc(label || hostLabel(u))}</a>` : esc(u || ''));
    const cellOf = c => (/^https?:\/\/\S+$/i.test(String(c ?? '').trim()) ? srcLink(String(c).trim()) : esc(c));
    const setTable = (it, max = 200) => { const d = it.data || {}; return `<div class="cx-tw"><table class="data-table cx-tbl"><thead><tr>${(d.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(d.rows || []).slice(0, max).map(r => `<tr>${(r || []).map(c => `<td>${cellOf(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${(d.rows || []).length > max ? `<p class="cx-muted">${esc(T('… et {n} autres lignes', {n: nf(d.rows.length - max)}))}</p>` : ''}<p class="cx-muted"><small>${esc(T('Source :'))} ${esc([d.source, d.licence].filter(Boolean).join(' — '))}${d.url ? ` ${srcLink(d.url)}` : ''}${d.criteria ? ` · ${esc(d.criteria)}` : ''}</small></p>`; };

    /** quand c'est vide : pourquoi, et quoi faire */
    function emptyHtml(st, why) {
        const tab = TABS.find(([k]) => k === st.tab) || [], name = T(tab[2] || '');
        const E = {
            basket: ['🧺', T('Le panier est vide'), T('Le panier garde des choses pour plus tard, d’un écran à l’autre. Coche des lignes n’importe où dans l’app, puis « 🧺 Garder dans le panier ».'), [['person', T('Voir mes fiches')]]],
            recent: ['🕘', T('Rien de pris pour l’instant'), T('Ce que tu prends (ou mets de côté) apparaîtra ici, pour le reprendre d’un clic.'), [['event', T('Voir les événements')]]],
            search: ['🔍', T('Rien pour « {q} »', {q: st.q}), T('Essaie l’orthographe d’époque, un seul mot ou seulement l’année. Les accents ne comptent pas.'), [['clear', T('Effacer la recherche')]]],
            filter: ['🔎', T('Rien avec ces filtres'), T('Les filtres cochés cachent tout ce qui est ici.'), [['nofilter', T('Enlever les filtres')]]],
            none: [tab[1] || '📭', T('Rien dans « {r} » pour l’instant', {r: name}), T('Ajoute-en dans l’app, ou va chercher ailleurs : Listes, Données, De l’extérieur.'), [['lists', T('Voir les listes')], ['outside', T('Importer…')]]],
        }[why];
        return `<div class="cx-empty"><span class="cx-empty-i" aria-hidden="true">${E[0]}</span><b>${esc(E[1])}</b><p>${esc(E[2])}</p><div class="cx-empty-row">${E[3].map(([k, l]) => `<button type="button" class="cx-b is-sec is-sm" data-cx-empty="${k}">${esc(l)}</button>`).join('')}</div></div>`;
    }
    function bindEmpty(st, host) {
        host.querySelectorAll('[data-cx-empty]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.cxEmpty;
            if (k === 'clear') { st.q = ''; st.dlg.querySelector('[data-cx-q]').value = ''; drawTab(st); }
            else if (k === 'nofilter') { st.filters = new Set(); drawTab(st); }
            else goTab(st, k);
        }));
    }
    /** les pastilles et « Ranger par » de la rubrique */
    function chipsHtml(st) {
        const inv = Number(st.ctx?.investigation_id || 0), F = [];
        if (st.tab === 'event') F.push(['n', T('Naissances')], ['m', T('Mariages')], ['d', T('Décès')], ['nosrc', T('Sans source')]);
        if (st.tab === 'act' || st.tab === 'media') F.push(['todo', T('À décrire')]);
        if (inv && ['event', 'act', 'media', 'source', 'note', 'place', 'person'].includes(st.tab)) F.push(['notused', T('Pas encore dans l’enquête')]);
        const rank = ['event', 'act', 'media'].includes(st.tab) ? `<span class="cx-lab">${esc(T('Ranger par'))}</span><span class="cx-seg" role="group" aria-label="${esc(T('Ranger par'))}">${[['date', T('date')], ['person', T('personne')], ['place', T('lieu')]].map(([k, l]) => `<button type="button" data-cx-rank="${k}" aria-pressed="${st.rank === k}">${esc(l)}</button>`).join('')}</span>` : '';
        const view = st.tab === 'media' ? `<span class="cx-seg" role="group" aria-label="${esc(T('Affichage'))}">${[['list', '☰ ' + T('liste')], ['grid', '▦ ' + T('grille')]].map(([k, l]) => `<button type="button" data-cx-mview="${k}" aria-pressed="${st.mview === k}">${esc(l)}</button>`).join('')}</span>` : '';
        return F.length || rank || view ? `<span class="cx-cf">${F.map(([k, l]) => `<button type="button" class="cx-chip" data-cx-chip="${k}" aria-pressed="${st.filters.has(k)}">${esc(l)}</button>`).join('')}</span><span class="cx-sp"></span><span class="cx-ca">${rank}${view}</span>` : '';
    }
    function applyFilters(st, list) {
        const f = st.filters, inv = Number(st.ctx?.investigation_id || 0); if (!f.size) return list;
        const types = ['n', 'm', 'd'].filter(k => f.has(k));
        return list.filter(x => { const v = viewOf(x);
            if (types.length && !types.includes(v.type)) return false;
            if (f.has('nosrc') && v.src !== 0) return false;
            if (f.has('todo') && !v.todo) return false;
            if (f.has('notused') && (st.used.get(`${x.kind}:${x.ref_id}`) || []).some(u => u.investigation_id === inv)) return false;
            return true; });
    }
    async function loadUsed(st, list) {
        const by = {}; list.forEach(x => { if (x.ref_id && ['event', 'act', 'media', 'source', 'note', 'place', 'person'].includes(x.kind) && !st.used.has(`${x.kind}:${x.ref_id}`)) (by[x.kind] = by[x.kind] || []).push(x.ref_id); });
        await Promise.all(Object.entries(by).map(async ([kind, ids]) => {
            try { const r = await api('cx_used', {kind, ids: ids.slice(0, 200).join(',')}); ids.forEach(id => st.used.set(`${kind}:${id}`, (r.used || {})[id] || [])); } catch (_) {}
        }));
    }

    async function drawTab(st) {
        const dlg = st.dlg; dlg.querySelectorAll('[data-cx-tab]').forEach(b => { const on = b.dataset.cxTab === st.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        const tab = TABS.find(([k]) => k === st.tab) || TABS[0];
        dlg.querySelector('[data-cx-quoi-t]').textContent = `${tab[1]} ${T(tab[2])}`;
        const res = dlg.querySelector('[data-cx-res]'), q = dlg.querySelector('[data-cx-q]'), srch = dlg.querySelector('[data-cx-srch]'), chips = dlg.querySelector('[data-cx-chips]');
        const special = ['data', 'lists', 'outside'].includes(st.tab);
        srch.hidden = special; q.hidden = special; // le champ est vraiment retiré là où il ne sert pas (Listes, Données, De l'extérieur)
        q.placeholder = T(HINT[st.tab] || 'Chercher…');
        dlg.classList.toggle('is-wide', st.tab === 'outside' || (st.tab === 'lists' && !st.list)); // De l'extérieur, la liste des listes : sans aperçu, toute la largeur
        if (!st.preview || st.preview.kind !== st.tab) previewItem(st, null);
        chips.innerHTML = special ? '' : chipsHtml(st); chips.hidden = !chips.innerHTML;
        if (st.tab === 'basket') { // 🧺 quel panier, ＋ Nouveau panier…, ⛶ en grand
            const b = await loadBasket(true); if (!st.dlg.isConnected) return;
            chips.hidden = false; chips.innerHTML = `<span class="cx-cf">${basketSelect(b, 'data-cx-tbsel')}<button type="button" class="cx-b is-ter is-sm" data-cx-bview>⛶ ${esc(T('Ouvrir en grand'))}</button><button type="button" class="cx-b is-ter is-sm" data-cx-bnew>＋ ${esc(T('Panier'))}</button><button type="button" class="cx-b is-ter is-sm" data-cx-fnew>＋ 📁 ${esc(T('Dossier'))}</button></span><span class="cx-sp"></span><span class="cx-ca">${basketMeta(b)}</span>`;
            chips.querySelector('[data-cx-bnew]').addEventListener('click', async () => { await newBasket(); drawTab(st); });
            chips.querySelector('[data-cx-fnew]').addEventListener('click', async () => { await newFolder(); drawTab(st); });
            chips.querySelector('[data-cx-tbsel]').addEventListener('change', async e => { await switchBasket(e.target.value); drawTab(st); });
            chips.querySelector('[data-cx-bview]').addEventListener('click', () => { st.dlg.close(); openBasketView(); });
        }
        chips.querySelectorAll('[data-cx-chip]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.cxChip; if (st.filters.has(k)) st.filters.delete(k); else st.filters.add(k); drawTab(st); }));
        chips.querySelectorAll('[data-cx-rank]').forEach(b => b.addEventListener('click', () => { st.rank = b.dataset.cxRank; drawTab(st); }));
        chips.querySelectorAll('[data-cx-mview]').forEach(b => b.addEventListener('click', () => { st.mview = b.dataset.cxMview; drawTab(st); }));
        const seq = st.seq = (st.seq || 0) + 1, mine = () => seq === st.seq && st.dlg.isConnected;
        if (!res.children.length || special) res.innerHTML = UI().spinner ? UI().spinner(T('Chargement…'), {inline: true}) : '…';
        else res.setAttribute('aria-busy', 'true');
        let list = []; st.more = false;
        try {
            if (st.tab === 'basket') { const b = st.bk = keepTree(await api('cx_basket', {basket_id: curBasket(), all: (baskets || []).length > 1 || (folders || []).length ? 1 : 0})); if ((b.baskets || []).length > 1 && !b.items.some(x => Number(x.basket_id) !== Number(b.basket_id))) Object.assign(b, keepTree(await api('cx_basket', {basket_id: curBasket(), all: 1}))); list = (b.items || []).filter(x => !st.q || fold(itemLine(x)).includes(fold(st.q))); st.fromBasket = new Set(list.map(x => x.id)); }
            else if (st.tab === 'recent') list = (readJ(RECENT, []) || []).filter(x => !st.q || fold(itemLine(x)).includes(fold(st.q)));
            else if (st.tab === 'note') { const r = await api('cx_notes', {q: st.q}); list = (r.items || []).map(n => ({kind: 'note', ref_id: Number(n.id), title: n.title || String(n.body || '').slice(0, 80), value: String(n.body || '').slice(0, 600), _v: {ico: '📝', who: n.person_name || '', extra: [String(n.body || '').replace(/\s+/g, ' ').slice(0, 140)], pills: [], fields: [[T('Fiche'), n.person_name || ''], [T('Texte'), String(n.body || '').slice(0, 600)]]}, origin: n.person_name ? {kind: 'person', id: Number(n.entity_id), person_id: Number(n.entity_id), label: T('Fiche de {n}', {n: n.person_name})} : null})); }
            else if (['person', 'event', 'act', 'source', 'media', 'place'].includes(st.tab)) {
                // « Treignac 1780-1800 » : la période se filtre ici (le serveur cherche les mots)
                const yr = st.q.match(/(?:^|\s)(\d{3,4})\s*(?:-|–|à|a|au|to)\s*(\d{3,4})(?=\s|$)/i); let qs = st.q, range = null;
                if (yr) { range = [Number(yr[1]), Number(yr[2])].sort((a, b) => a - b); qs = st.q.replace(yr[0], ' ').replace(/\s+/g, ' ').trim(); }
                const r = await api('picker_search', {kind: st.tab, q: qs, limit: 100, ...(range && st.tab === 'event' ? {year_from: range[0], year_to: range[1]} : {})});
                list = (r.groups || []).flatMap(g => g.items || []).map(x => pickItem(st.tab, x)); st.more = !!r.more;
                if (range) { list = list.filter(x => { const y = viewOf(x).year; return y && y >= range[0] && y <= range[1]; }); }
            }
            else if (special) {
                if (!mine()) return;
                if (st.tab === 'data') await drawData(st, res); else if (st.tab === 'outside') drawOutside(st, res); else if (st.list) await drawListIn(st, res); else drawLists(st, res);
                if (mine()) res.dataset.cxShown = `${st.tab}||${st.list?.id || ''}|`;
                return;
            }
            if (st.ctx?.investigation_id || ['event', 'act', 'media', 'source'].includes(st.tab)) await loadUsed(st, list);
            await loadInvLabels(st);
        } catch (e) { if (mine()) res.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
        if (!mine()) return;
        res.removeAttribute('aria-busy');
        if (st.target?.kinds) list = list.filter(x => st.target.kinds.includes(x.kind) || x.kind === 'set');
        const shown = applyFilters(st, list);
        const tree = st.tab === 'basket' && st.bk && ((st.bk.baskets || []).length > 1 || (st.bk.folders || []).length);
        res.innerHTML = tree && list.length ? basketTreeHtml(st, shown) : shown.length ? resultsHtml(st, shown) + (st.more ? `<p class="cx-muted cx-pad"><small>${esc(T('Les {n} premiers seulement : précise la recherche (un nom, une commune, une période comme 1780-1800).', {n: nf(list.length)}))}</small></p>` : '') : emptyHtml(st, list.length ? 'filter' : st.q ? 'search' : ['basket', 'recent'].includes(st.tab) ? st.tab : 'none');
        if (tree && list.length) bindBasketTree(st, res);
        res.scrollTop = 0; res.dataset.cxShown = `${st.tab}|${st.q}|${[...st.filters].join(',')}|${st.rank}`; bindResults(st, res); bindEmpty(st, res); // data-cx-shown : ce qui est affiché (pour les essais)
        if (st.picked.size >= 2 && !st.preview) drawSummary(st);
    }

    /* ── 🧰 Données : une source, ses critères (personne, lieu, année, date, du… au…), l'aperçu, une info ou tout ── */
    const dataSourcesAll = () => {
        const seen = new Set(), out = [];
        PS.forEach(p => { if (p && p.id && !seen.has(p.id) && (!p.enabled || p.enabled() !== false)) { seen.add(p.id); out.push({...p, _ps: true}); } });
        (ext.dataSources || []).forEach(d => { if (d && d.id && typeof d.run === 'function' && !seen.has(d.id)) { seen.add(d.id); out.push(d); } });
        return out;
    };
    async function drawData(st, res) {
        const all = dataSourcesAll();
        const cur = all.find(d => d.id === st.dataId) || null;
        const groups = [...new Set(all.map(d => d.group || T('Autres')))];
        res.innerHTML = `<div class="cx-pad cx-data"><h6 class="cx-step">1. ${esc(T('Quelle donnée ?'))}</h6>
            <label class="cx-dsel"><span class="cx-sr">${esc(T('Une source de données'))}</span><select data-cx-ds aria-label="${esc(T('Une source de données'))}"><option value="">${esc(T('— choisir —'))}</option>${groups.map(g => `<optgroup label="${esc(T(g))}">${all.filter(d => (d.group || T('Autres')) === g).map(d => `<option value="${esc(d.id)}" ${cur?.id === d.id ? 'selected' : ''}>${esc(`${d.icon || '🧰'} ${T(d.label)}`)}</option>`).join('')}</optgroup>`).join('')}</select></label>
            ${cur ? '' : `<p class="cx-muted">${esc(T('Une info précise pour une date, un lieu, une personne : la météo d’un jour, les cimetières autour d’une commune, les prénoms d’une année… Chaque info garde sa source.'))}</p>`}
            <div data-cx-dform></div></div>`;
        res.querySelector('[data-cx-ds]').addEventListener('change', e => { st.dataId = e.target.value; drawData(st, res); });
        if (!cur) return;
        const host = res.querySelector('[data-cx-dform]');
        let ok = true; try { ok = typeof cur.installed === 'function' ? (await cur.installed()) !== false : true; } catch (_) { ok = true; }
        if (!ok) {
            host.innerHTML = `<p class="cx-notinst">${esc(T('Ces données ne sont pas encore installées sur cet ordinateur.'))}</p>${cur.install && !kiosk() ? `<button type="button" class="cx-b is-sec is-sm" data-cx-install>⤓ ${esc(T('Installer'))}</button>` : ''}`;
            host.querySelector('[data-cx-install]')?.addEventListener('click', () => { st.dlg.close(); try { cur.install(); } catch (e) { toast(e.message, 'error'); } });
            return;
        }
        const needs = Array.isArray(cur.needs) ? cur.needs : [];
        const v = st.dataCtx = st.dataCtx || {};
        const PK = window.LCNDA_PICKER || A();
        if (st.ctx?.placeText && !v.place && needs.includes('place')) v.place = await placeByName(st.ctx.placeText); // l'élément ouvert (Atelier) donne son lieu
        if (st.ctx?.date && !v.date) v.date = st.ctx.date;
        host.innerHTML = `<h6 class="cx-step">2. ${esc(needs.length ? T('Où, quand ?') : T('Chercher'))}</h6><div class="cx-dform">${needs.includes('person') ? `<label><span class="pk-lab">${esc(T('Personne'))}</span>${PK.pickerField?.({name: 'cx_person', hiddenName: false, kind: 'person', value: v.person || null, inline: true}) || ''}</label>` : ''}
            ${needs.includes('place') ? `<label><span class="pk-lab">${esc(T('Lieu'))}</span>${PK.pickerField?.({name: 'cx_place', hiddenName: false, kind: 'place', value: v.place || null, inline: true}) || ''}</label>` : ''}
            ${needs.includes('year') ? `<label>${esc(T('Année'))}<input type="number" min="1" max="2100" name="cx_year" value="${esc(v.year || '')}"></label>` : ''}
            ${needs.includes('date') ? `<label>${esc(T('Date'))}<input type="date" name="cx_date" value="${esc(v.date || '')}"></label>${cur.range ? `<label>${esc(T('… jusqu’au (pour une période)'))}<input type="date" name="cx_to" value="${esc(v.to || '')}"></label>` : ''}` : ''}
            <button type="button" class="cx-b is-pri is-sm" data-cx-run>🔍 ${esc(T('Chercher : {w}', {w: T(cur.label)}))}</button></div>
            ${cur.source ? `<p class="cx-muted"><small>${esc(T('Source :'))} ${cur.sourceUrl ? srcLink(cur.sourceUrl, cur.source) : esc(cur.source)}</small></p>` : ''}
            <div class="cx-dout" data-cx-dout></div>`;
        const f = host.querySelector('.cx-dform');
        f.addEventListener('picker-change', e => { const k = e.target.closest?.('.pk')?.dataset?.picker || ''; const it = e.detail?.item || null; if (k === 'person') v.person = it; else if (k === 'place') v.place = it; });
        const pre = st.ctx?.date || st.ctx?.placeText ? st.ctx : null;
        if (pre?.date && f.querySelector('[name="cx_date"]') && !v.date) f.querySelector('[name="cx_date"]').value = pre.date;
        host.querySelector('[data-cx-run]').addEventListener('click', () => runData(st, cur, f, host.querySelector('[data-cx-dout]')));
    }
    const placeCtx = it => { if (!it) return null; const name = String(it.title || it.name || '').replace(/\s*\(.*\)\s*$/, ''); return {id: Number(it.id) || 0, name, title: it.title, latitude: it.lat ?? it.latitude ?? null, longitude: it.lon ?? it.longitude ?? null, lat: it.lat ?? it.latitude ?? null, lon: it.lon ?? it.longitude ?? null, country: it.country || ''}; };
    async function runData(st, d, f, out) {
        const v = st.dataCtx;
        const PK = window.LCNDA_PICKER || A();
        const pv = kind => { const el = f.querySelector(`.pk[data-picker="${kind}"]`); return el && PK.pickerValue ? PK.pickerValue(el) : null; };
        v.year = Number(f.querySelector('[name="cx_year"]')?.value) || null; v.date = f.querySelector('[name="cx_date"]')?.value || ''; v.to = f.querySelector('[name="cx_to"]')?.value || '';
        if ((d.needs || []).includes('place') && !v.place) { const id = pv('place'); if (id) { const r = await api('picker_search', {kind: 'place', ids: String(id)}); v.place = r.groups?.[0]?.items?.[0] || null; } }
        if ((d.needs || []).includes('person') && !v.person) { const id = pv('person'); if (id) v.person = {id}; }
        const miss = (d.needs || []).filter(n => (n === 'place' && !v.place) || (n === 'person' && !v.person) || (n === 'year' && !v.year) || (n === 'date' && !v.date));
        if (miss.length) { out.innerHTML = `<p class="error">${esc(T('Il manque : {w}', {w: miss.map(m => T({place: 'le lieu', person: 'la personne', year: 'l’année', date: 'la date'}[m])).join(', ')}))}</p>`; return; }
        out.innerHTML = UI().spinner ? UI().spinner(T('Je cherche…'), {inline: true}) : '…';
        const ctx = {place: placeCtx(v.place), year: v.year || (v.date ? Number(v.date.slice(0, 4)) : null), date: v.date, from: v.date, to: v.to};
        if (v.person) { try { const det = await api('person', {id: v.person.id}); ctx.person = {...det, ...(det.person || {}), person: det.person, events: det.events}; } catch (_) {} }
        const placeLabel = ctx.place?.name || '';
        try {
            let items = [];
            if (d._ps && d.range && v.to && v.to > v.date) {
                const r = await d.range(ctx, (i, n) => { out.innerHTML = UI().spinner ? UI().spinner(T('Je lis {i} sur {n}…', {i, n}), {inline: true}) : `${i}/${n}`; });
                const criteria = [placeLabel, `${T('du')} ${frDate(v.date)} ${T('au')} ${frDate(v.to)}`].filter(Boolean).join(', ');
                items = [{kind: 'set', title: `${d.icon || ''} ${T(d.label)} — ${criteria}`.trim(), value: '', data: {icon: d.icon, columns: r.columns, rows: r.rows, source: r.source || d.source, url: r.url || d.sourceUrl || '', criteria, request: {source: d.id, ctx: {place: v.place, date: v.date, to: v.to}}}, origin: {label: T(d.label), url: r.url || d.sourceUrl || ''}}];
            } else if (d._ps) {
                const r = await d.fetch(ctx);
                const label = `${T(d.label)}${placeLabel ? ` — ${placeLabel}` : ''}${v.date ? `, ${frDate(v.date)}` : v.year ? `, ${v.year}` : ''}`;
                items = (r.facts || []).map(x => ({kind: 'data', title: `${x.label}`, value: x.value, origin: {label: [r.title || label, x.source || r.source].filter(Boolean).join(' — '), url: x.url || r.url || d.sourceUrl || ''}}));
                if (items.length > 1) items.push({kind: 'set', title: r.title || label, value: '', data: {icon: d.icon, columns: [T('Quoi'), T('Valeur'), T('Source')], rows: (r.facts || []).map(x => [x.label, x.value, x.url || r.url || '']), source: r.source || d.source, url: r.url || d.sourceUrl || '', criteria: [placeLabel, v.date ? frDate(v.date) : ''].filter(Boolean).join(', '), request: {source: d.id, ctx: {place: v.place, date: v.date}}}, origin: {label: T(d.label), url: r.url || ''}});
            } else {
                const host = document.createElement('div'); host.className = 'cx-run-host';
                out.innerHTML = ''; out.appendChild(host);
                await Promise.race([d.run(ctx, host), new Promise(r => setTimeout(r, 20000))]);
                const lines = linesOf(host), firstUrl = host.querySelector('a[href^="http"]')?.href || d.sourceUrl || '';
                const label = `${T(d.label)}${placeLabel ? ` — ${placeLabel}` : ''}${ctx.year ? `, ${ctx.year}` : ''}`;
                items = lines.map(l => ({kind: 'data', title: l.text.slice(0, 120), value: l.text.length > 120 ? l.text : '', data: l.links?.length ? {links: l.links} : null, origin: {label, url: l.url || firstUrl}}));
                if (items.length > 1) items.push({kind: 'set', title: label, value: '', data: {icon: d.icon, columns: [T('Info'), T('Source')], rows: lines.map(l => [l.text, l.url || firstUrl]), source: d.source || label, url: firstUrl, criteria: [placeLabel, ctx.year].filter(Boolean).join(', ')}, origin: {label, url: firstUrl}});
            }
            if (!items.length) { out.innerHTML = `<div class="cx-empty"><span class="cx-empty-i" aria-hidden="true">🔎</span><b>${esc(T('Rien trouvé pour ces critères.'))}</b><p>${esc(T('Essaie une autre date, un lieu voisin ou une distance plus grande.'))}</p></div>`; return; }
            out.innerHTML = `<h6 class="cx-step">3. ${esc(T('Les résultats'))}</h6><p class="cx-muted"><small>${esc(T('Coche une info précise, ou « ▦ Tout le tableau » (avec sa source) :'))}</small></p><div data-cx-dres></div>`;
            const box = out.querySelector('[data-cx-dres]'); await loadInvLabels(st);
            box.innerHTML = resultsHtml(st, items.sort((a, b) => (a.kind === 'set') - (b.kind === 'set')).map(x => (x.kind === 'set' ? {...x, title: `▦ ${T('Tout le tableau')} : ${x.title}`} : x)), {groups: false});
            bindResults(st, box);
            const set = st.results.find(x => x.kind === 'set'); if (set) previewItem(st, set);
        } catch (e) { out.innerHTML = `<p class="error">${esc(e.notInstalled ? T('Ces données ne sont pas encore installées sur cet ordinateur.') : e.message)}</p>`; }
    }
    const frDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return String(s || ''); const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}); };
    /** le texte d'un résultat affiché → ses lignes (une info chacune, avec son lien ↗ s'il y en a un) */
    function linesOf(host) {
        const skip = '.muted small, script, style, button, [hidden], .ui-spinner, .skeleton';
        let blocks = [...host.querySelectorAll('li, tr, p, dd, .wx-norm, .hist-life > div, [class*="-line"], [class*="-row"]')].filter(b => !b.closest(skip) && !b.querySelector('li, tr, p, dd'));
        const items = blocks.filter(b => b.matches('li, tr')); if (items.length >= 2) blocks = items; // une liste (des cimetières…) : ses lignes, pas la phrase d'introduction ni la source
        const out = [], seen = new Set();
        (blocks.length ? blocks : [host]).forEach(b => {
            const c = b.cloneNode(true); c.querySelectorAll('button, script, style').forEach(x => x.remove());
            // les petits liens « carte ↗ · itinéraire ↗ » : gardés à part (↗ carte), pas dans le texte de la ligne
            const links = [...c.querySelectorAll('a[href^="http"]')].filter(a => /↗/.test(a.textContent)).map(a => { const l = a.textContent.replace(/↗/g, '').trim(); a.remove(); return {label: l, url: a.href}; });
            const text = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').replace(/↗\s*source/gi, '').replace(/(\s*·\s*)+$/, '').trim();
            if (text.length < 3 || text.length > 1000 || seen.has(text)) return; seen.add(text);
            out.push({text, url: b.querySelector('a[href^="http"]')?.href || links[0]?.url || '', links});
        });
        return out.slice(0, 200);
    }

    /* ── 📋 Listes : « Dis ce qu'il te faut », les listes par thème ; une liste s'ouvre DANS la fenêtre (critères, lignes à cocher, tout le tableau) ── */
    const listsAll = () => (ext.dataListsEngine?.list?.() || []).filter(d => !d.link && (!d.enabled || d.enabled() !== false));
    const ASK_EX = ['les décès à Tulle du 1er au 30 juin 1980', 'les châteaux à 4 km de Brive', 'les gares de la Corrèze', 'les crues de 1875'];
    function drawLists(st, res) {
        const lists = listsAll();
        const groups = [...new Set(lists.map(d => d.group || 'Autres'))];
        res.innerHTML = `<div class="cx-pad"><div class="cx-ask"><label for="cx-ask-in"><b>${esc(T('Dis ce qu’il te faut :'))}</b></label>
            <div class="cx-ask-row"><input id="cx-ask-in" type="search" data-cx-ask placeholder="${esc(T('ex. les décès à Tulle du 1er au 30 juin 1980 · les châteaux à 4 km de Brive'))}"><button type="button" class="cx-b is-pri is-sm" data-cx-askgo>${esc(T('Chercher'))}</button></div>
            <p class="cx-ex"><span class="cx-muted">${esc(T('Par exemple :'))}</span> ${ASK_EX.map(x => `<button type="button" class="cx-chip" data-cx-askex data-i18n-off>${esc(x)}</button>`).join(' ')}</p>
            <p class="cx-muted" data-cx-askmsg role="status"><small>${esc(T('Ou choisis une liste : elle s’ouvre ici, avec ses critères ; tu coches des lignes ou tu prends tout le tableau.'))}</small></p></div>
            ${groups.map(g => `<h6 class="cx-gh">${esc(T(g))}</h6><ul class="cx-llist">${lists.filter(d => (d.group || 'Autres') === g).map(d => `<li><button type="button" class="cx-lrow" data-cx-list="${esc(d.id)}"><span class="cx-ico" aria-hidden="true">${esc(d.icon || '📋')}</span><span class="cx-lt"><b>${esc(T(d.label))}</b><small>${esc(T('Ça donne : une ligne par élément, avec sa source'))}${d.source ? ` · ${esc(d.source)}` : ''}</small></span><span aria-hidden="true">›</span></button></li>`).join('')}</ul>`).join('')}</div>`;
        res.querySelectorAll('[data-cx-list]').forEach(b => b.addEventListener('click', () => { st.list = {id: b.dataset.cxList, state: null}; drawTab(st); }));
        const ask = async () => {
            const q = res.querySelector('[data-cx-ask]').value.trim(); if (!q) return;
            const msg = res.querySelector('[data-cx-askmsg]');
            const r = await parseAsk(q, lists);
            if (!r) { msg.innerHTML = `<small>${esc(T('Je n’ai pas compris quelle liste : choisis-la ci-dessous.'))}</small>`; return; }
            st.list = {id: r.id, state: r.preset, asked: q}; drawTab(st);
        };
        res.querySelector('[data-cx-askgo]').addEventListener('click', ask);
        res.querySelector('[data-cx-ask]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
        res.querySelectorAll('[data-cx-askex]').forEach(b => b.addEventListener('click', () => { res.querySelector('[data-cx-ask]').value = b.textContent; ask(); }));
    }
    const LBLANK = () => ({q: '', crit: [], period: null, near: null, sort: '', dir: 'asc', view: 'table'});
    const ldCols = (d, s) => [...(d.fields || []).filter(f => f.type !== 'url' && !f.hidden), ...(s?.near ? [{key: '_km', label: 'Distance (km)', type: 'number'}] : [])];
    const ldVal = (f, v) => (v == null ? '' : f.type === 'bool' ? (v && v !== 'non' && v !== '0' ? T('oui') : T('non')) : f.type === 'number' && typeof v === 'number' ? v.toLocaleString('fr-FR', {maximumFractionDigits: 2}) : String(v));
    const ldCrit = (d, s) => { const E = ext.dataListsEngine; return [s.q ? `« ${s.q} »` : '', ...(s.crit || []).map(c => E.critText(d, c)), s.period ? E.periodText(s.period) : '', s.near ? E.nearText(s.near) : ''].filter(Boolean); };
    /** une ligne d'une liste → un élément « ligne de liste » (avec sa liste comme source et son lien ↗) */
    function ldRowItem(d, s, r) {
        const cs = ldCols(d, s), vals = cs.map(f => ldVal(f, r[f.key])), url = (d.fields || []).filter(f => f.type === 'url').map(f => r[f.key]).find(Boolean) || '';
        const head = cs.map(f => `${T(f.label)}${f.unit ? ` (${T(f.unit)})` : ''}`);
        return {kind: 'row', title: String(vals.find(Boolean) || T(d.label)).slice(0, 200), value: vals.slice(1).filter(Boolean).join(' · ').slice(0, 2000), ref_id: 0,
            data: {columns: head, row: vals, list: d.id, icon: d.icon || '📋'},
            _v: {ico: d.icon || '📋', extra: [], pills: [], fields: head.map((h, i) => [h, vals[i]]).filter(([, x]) => x)},
            origin: {kind: 'list', id: d.id, label: `${T('Listes')} · ${T(d.label)}${d.source ? ` — ${d.source}` : ''}`, url: url || d.sourceUrl || '', open: {list: d.id, preset: s}}};
    }
    async function ldAll(d, s, max = 5000) {
        const E = ext.dataListsEngine, out = []; let total = Infinity;
        while (out.length < Math.min(total, max)) { const p = await E.fetchPage(d, s, out.length, 2000); total = p.total; if (!p.rows.length) break; out.push(...p.rows); }
        return out.slice(0, max);
    }
    function ldSet(d, s, rows) {
        const cs = ldCols(d, s), crit = ldCrit(d, s).join(' · ');
        return {kind: 'set', title: `${d.icon || '📋'} ${T(d.label)}${crit ? ` — ${crit}` : ''}`, value: '',
            data: {icon: d.icon || '📋', columns: cs.map(f => `${T(f.label)}${f.unit ? ` (${T(f.unit)})` : ''}`), rows: rows.map(r => cs.map(f => ldVal(f, r[f.key]))), source: d.source || T(d.label), url: d.sourceUrl || '', criteria: crit, request: {list: d.id, state: s}, taken: new Date().toISOString().slice(0, 10)},
            origin: {kind: 'list', id: d.id, label: `${T('Listes')} · ${T(d.label)}`, url: d.sourceUrl || '', open: {list: d.id, preset: s}}};
    }
    async function drawListIn(st, res) {
        const E = ext.dataListsEngine, d = listsAll().find(x => x.id === st.list.id);
        if (!E || !d) { st.list = null; return drawLists(st, res); }
        const s = st.list.state = {...LBLANK(), ...(st.list.state || E.stateOf(d.id) || {})};
        const crit = ldCrit(d, s);
        const top = `<div class="cx-lhead"><button type="button" class="cx-b is-ter is-sm" data-cx-lback>← ${esc(T('Toutes les listes'))}</button>
            <h3 class="cx-ltitle"><span aria-hidden="true">${esc(d.icon || '📋')}</span> ${esc(T(d.label))}</h3>
            ${st.list.asked ? `<p class="cx-understood" role="status">${esc(T('J’ai compris : « {q} »', {q: st.list.asked}))} → <b>${esc(T(d.label))}</b>${crit.length ? ` · ${esc(crit.join(' · '))}` : ''}</p>` : ''}
            <div class="cx-lcrit">${crit.length ? crit.map(c => `<span class="cx-chip is-on">${esc(c)}</span>`).join('') : `<span class="cx-muted"><small>${esc(T('Aucun critère : toute la liste.'))}</small></span>`}</div>
            <div class="cx-srch cx-lsrch"><input type="search" data-cx-lq value="${esc(s.q || '')}" placeholder="${esc(T('Chercher dans cette liste (un nom, une commune, une année…)'))}" aria-label="${esc(T('Chercher dans cette liste'))}"></div>
            <div class="cx-lacts"><span class="cx-lcount" data-cx-lcount aria-live="polite"></span><button type="button" class="cx-b is-sec is-sm" data-cx-lall>☑ ${esc(T('Tout cocher'))}</button><button type="button" class="cx-b is-sec is-sm" data-cx-lset>▦ ${esc(T('Prendre tout le tableau'))}</button>
                <button type="button" class="cx-b is-ter is-sm" data-cx-lfull title="${esc(T('Tu quittes cette fenêtre ; un bandeau te ramène ici, et ce que tu as coché reste coché.'))}">↗ ${esc(T('Ouvrir la liste complète dans l’app'))}</button></div>
            <p class="cx-muted cx-lnote"><small>${esc(T('« Ouvrir la liste complète » : pour trier, ajouter un critère, enregistrer la recherche. Un bandeau te ramène ici, ce que tu as coché reste coché.'))}</small></p></div><div data-cx-lrows></div>`;
        res.innerHTML = `<div class="cx-pad">${top}</div>`;
        const rowsBox = res.querySelector('[data-cx-lrows]'), cnt = res.querySelector('[data-cx-lcount]');
        res.querySelector('[data-cx-lback]').addEventListener('click', () => { st.list = null; drawTab(st); });
        let tm = 0; res.querySelector('[data-cx-lq]').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { s.q = e.target.value.trim(); paintRows(); }, 250); });
        res.querySelector('[data-cx-lq]').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
        res.querySelector('[data-cx-lall]').addEventListener('click', () => { const on = st.results.some(x => !st.picked.has(pickKey(x))); st.results.forEach(x => togglePick(st, x, on)); rowsBox.querySelectorAll('[data-cx-ri]').forEach(cb => { cb.checked = on; cb.closest('li')?.classList.toggle('is-on', on); }); paintCount(st); });
        res.querySelector('[data-cx-lset]').addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true;
            try { const rows = await ldAll(d, s); if (!rows.length) { toast(T('Aucune ligne trouvée avec ces critères.')); return; } const it = ldSet(d, s, rows); togglePick(st, it, true); paintCount(st); previewItem(st, it); toast(T('▦ Ensemble coché : {n}', {n: plural(rows.length, T('ligne'))})); }
            catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
        });
        res.querySelector('[data-cx-lfull]').addEventListener('click', () => openFullList(st, d, s));
        const ok = d.installed ? await d.installed().catch(() => false) : true;
        if (!ok) { rowsBox.innerHTML = `<div class="cx-empty"><span class="cx-empty-i" aria-hidden="true">⤓</span><b>${esc(T('Ces données ne sont pas encore installées sur cet ordinateur.'))}</b>${d.install && !kiosk() ? `<div class="cx-empty-row"><button type="button" class="cx-b is-sec is-sm" data-cx-lfull2>↗ ${esc(T('Les installer (page de la liste)'))}</button></div>` : ''}</div>`; rowsBox.querySelector('[data-cx-lfull2]')?.addEventListener('click', () => openFullList(st, d, s)); return; }
        const paintRows = async () => {
            const seq = st.lseq = (st.lseq || 0) + 1;
            rowsBox.innerHTML = UI().spinner ? UI().spinner(T('On cherche…'), {inline: true}) : '…';
            let p; try { p = await E.fetchPage(d, s, 0, 200); } catch (err) { if (seq === st.lseq) rowsBox.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
            if (seq !== st.lseq || !rowsBox.isConnected) return;
            const items = p.rows.map(r => ldRowItem(d, s, r)); await loadInvLabels(st);
            cnt.textContent = p.more ? T('plus de {n} lignes', {n: nf(p.total)}) : plural(p.total, T('ligne'));
            rowsBox.innerHTML = items.length ? resultsHtml(st, items, {groups: false}) + (p.total > items.length ? `<p class="cx-muted cx-pad"><small>${esc(T('Les {a} premières lignes sur {b} : « ▦ Prendre tout le tableau » les prend toutes, ou ajoute un critère.', {a: nf(items.length), b: nf(p.total)}))}</small></p>` : '')
                : `<div class="cx-empty"><span class="cx-empty-i" aria-hidden="true">🔎</span><b>${esc(T('Rien ne correspond à ces critères.'))}</b><p>${esc(T('Retire un critère, élargis la période ou la distance (↗ Ouvrir la liste complète).'))}</p></div>`;
            bindResults(st, rowsBox);
        };
        await paintRows();
    }
    /** ↗ la page Listes en grand : la fenêtre se ferme, un bandeau ramène ici (ce qui est coché reste coché) */
    function openFullList(st, d, s) {
        const app = S();
        const back = {module: app.module, enquetesTab: app.enquetesTab, currentInvestigationId: app.currentInvestigationId, investigationFolderId: app.investigationFolderId, currentPersonId: app.currentPersonId, atelier: app.atelier ? JSON.parse(JSON.stringify(app.atelier)) : undefined};
        listTake = {target: st.target, ctx: st.ctx, id: d.id, snap: {tab: 'lists', q: '', picked: [...st.picked.entries()], list: {id: d.id, state: s}, back}};
        st.dlg.close();
        ext.dataListsEngine.open(d.id, s);
    }
    /** « ← Revenir à Prendre depuis… » : l'écran d'avant, puis la fenêtre telle qu'on l'a laissée */
    async function backToTake(snap, target, ctx) {
        const b = snap.back || {};
        if (b.module && b.module !== S().module) {
            const app = S(); Object.entries(b).forEach(([k, v]) => { if (v !== undefined) app[k] = v; }); A().persistUiState?.(); A().setModule?.(b.module);
            for (let i = 0; i < 30 && target && !hereOf(target); i++) await new Promise(r => setTimeout(r, 100));
        }
        return openTake({dest: target, ctx: (target && hereOf(target)) || ctx, restore: snap});
    }
    let listTake = null; // {target, ctx, id, snap} : « Prendre depuis… » a ouvert une liste en grand ; on revient
    /** la demande en français → {id de liste, critères} (dates « du 1er au 30 juin 1859 », « en 1859 », « de 1850 à 1860 » ; « à 4 km de Brive » ; « à Tulle ») */
    const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
    function parseDates(s) {
        const f = fold(s).replace(/1er/g, '1'), M = `(${MONTHS.join('|')})`, p2 = n => String(n).padStart(2, '0'), ymd = (d, m, y) => `${y}-${p2(MONTHS.indexOf(m) + 1)}-${p2(d)}`;
        const last = (m, y) => new Date(Number(y), MONTHS.indexOf(m) + 1, 0).getDate();
        let m;
        if ((m = f.match(new RegExp(`du (\\d{1,2}) ${M}? ?(\\d{4})? ?au (\\d{1,2}) ${M} (\\d{4})`)))) return {from: ymd(m[1], m[2] || m[5], m[3] || m[6]), to: ymd(m[4], m[5], m[6])};
        if ((m = f.match(new RegExp(`(?:en |au mois de )?${M} (\\d{4})`)))) return {from: ymd(1, m[1], m[2]), to: ymd(last(m[1], m[2]), m[1], m[2])};
        if ((m = f.match(/(?:de|entre) (\d{4}) (?:a|et) (\d{4})/))) return {yfrom: Number(m[1]), yto: Number(m[2])};
        if ((m = f.match(/(?:en|annee) (\d{4})/))) return {yfrom: Number(m[1]), yto: Number(m[1])};
        return null;
    }
    const SYN = [[/deces|morts?|decede/, ['insee_deces']], [/chateau/, ['chateaux']], [/gare|train/, ['hist_gares']], [/seisme|tremblement/, ['hist_seismes']], [/crue|inondation/, ['hist_crues']], [/vendange/, ['hist_vendanges']], [/prenom/, ['pp_prenoms']], [/election|vote/, ['elections']]];
    async function placeByName(name) {
        try { const r = await api('picker_search', {kind: 'place', q: name, limit: 5}); return (r.groups || []).flatMap(g => g.items || []).find(x => x.lat != null) || (r.groups || []).flatMap(g => g.items || [])[0] || null; } catch (_) { return null; }
    }
    /** une faute de frappe (une lettre de trop, de moins ou changée) : « chateux », « cimetieres », « seimes » */
    const near1 = (a, b) => { if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false; let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1); };
    const STOP = new Set('les la le l des de du d un une a au aux en et ou dans sur pour avec autour pres km rayon moins plus entre mois annee annees jour vers commune ville village departement dep me il faut je veux cherche trouve tous toutes tout liste the of'.split(' '));
    async function parseAsk(q, lists) {
        lists = (lists || []).filter(x => x && !x.link); // les listes qui ouvrent un autre écran ne se prennent pas d'ici
        const f = fold(q).replace(/[’']/g, ' ').replace(/\s+/g, ' ');
        const words = f.split(/[^a-z0-9-]+/).filter(Boolean);
        let d = null, used = new Set();
        for (const [re, ids] of SYN) { const m = f.match(re); if (m) { d = lists.find(x => ids.includes(x.id)); if (d) { used.add(m[0]); break; } } }
        if (!d) { // les mots du nom de la liste, au pluriel ou non, avec une faute de frappe permise
            const score = x => { const lw = fold(x.label).split(/[^a-z]+/).filter(w => w.length > 3).map(w => w.replace(/s$/, '')); let n = 0; words.forEach(w => { if (STOP.has(w)) return; const w1 = w.replace(/s$/, ''); if (lw.some(l => l === w1 || (w1.length > 4 && (l.startsWith(w1) || w1.startsWith(l))) || near1(l, w1))) { n++; used.add(w); } }); return n; };
            d = lists.map(x => ({x, n: score(x)})).sort((a, b) => b.n - a.n).find(z => z.n)?.x || null;
            if (d) { used = new Set(); const lw = fold(d.label).split(/[^a-z]+/).filter(w => w.length > 3).map(w => w.replace(/s$/, '')); words.forEach(w => { const w1 = w.replace(/s$/, ''); if (lw.some(l => l === w1 || (w1.length > 4 && (l.startsWith(w1) || w1.startsWith(l))) || near1(l, w1))) used.add(w); }); }
        }
        if (!d) return null;
        const preset = {q: '', crit: [], period: null, near: null};
        const dt = parseDates(q), fields = d.fields || [];
        const dateField = fields.find(x => x.type === 'date' && /deces|date|jour/.test(fold(x.key + ' ' + x.label))) || fields.find(x => x.type === 'date');
        if (dt?.from && dateField) preset.crit.push({key: dateField.key, kind: 'daterange', from: dt.from, to: dt.to});
        else if (dt && d.period) { const a = dt.yfrom || Number(dt.from.slice(0, 4)), b = dt.yto || Number(dt.to.slice(0, 4)); preset.period = a === b ? {mode: 'in', from: a, to: a} : {mode: 'overlap', from: a, to: b}; }
        else if (dt) { const yf = fields.find(x => x.type === 'year'); const a = dt.yfrom || Number(dt.from.slice(0, 4)), b = dt.yto || Number(dt.to.slice(0, 4)); if (yf) preset.crit.push({key: yf.key, kind: 'range', from: a, to: b}); }
        // « à 4 km de Brive », « autour de 5 km de Treignac », « dans un rayon de 5 km autour de Treignac », « à moins de 5 km de Treignac », « autour de Brive »
        const near = f.match(/(\d+(?:[.,]\d+)?) ?km (?:de |d |autour de |du |des |a |de la |du centre de )?([a-z][a-z' -]*?)(?: du | de \d| en | entre | depuis |$)/) || f.match(/autour de ([a-z][a-z' -]*?)(?: du | en | depuis |$)/);
        let placeWords = '';
        if (near && d.geo) {
            const km = near.length > 2 && /^\d/.test(near[1]) ? Number(String(near[1]).replace(',', '.')) : 10, name = (near.length > 2 && /^\d/.test(near[1]) ? near[2] : near[1]).trim();
            const pl = await placeByName(name); if (pl?.lat != null) { preset.near = {lat: pl.lat, lon: pl.lon, km, title: String(pl.title || name).replace(/\s*\(.*\)$/, '')}; placeWords = name; }
        } else {
            const m = f.match(/ (?:a|dans|sur la commune de|de) ([a-z][a-z' -]+?)(?: du | de \d| en \d| entre | au |$)/);
            const placeField = fields.find(x => x.type === 'place' && /deces/.test(fold(x.key))) || fields.find(x => x.type === 'place' && /commune/.test(fold(x.key))) || fields.find(x => x.type === 'place');
            if (m && placeField && !/^(\d|les |la |l )/.test(m[1])) { const ws = q.slice(f.indexOf(m[1])).split(/\s+/).slice(0, m[1].trim().split(/\s+/).length).join(' '); preset.crit.push({key: placeField.key, kind: 'place', value: ws.replace(/^(.)/, c => c.toUpperCase())}); placeWords = m[1]; }
        }
        // « dans le 19 », « en Corrèze (19) », « du 87 » : un numéro de département → le code Insee commence par…
        const dep = f.match(/(?:^| )(?:dans le |du |le |en |\()(\d{2}|2a|2b|97\d)(?:\)|$| )/);
        const codeField = fields.find(x => /^(code|insee|code_insee|depcom)$/.test(x.key)) || fields.find(x => /code insee/.test(fold(x.label)));
        if (dep && codeField) preset.crit.push({key: codeField.key, kind: 'text', op: 'starts', value: dep[1].toUpperCase()});
        // les mots qui restent (« Donati », « Saint-Amand ») : une recherche dans la liste
        const consumed = new Set([...used, ...fold(placeWords).split(/[^a-z0-9-]+/), ...MONTHS]);
        const rest = words.filter(w => !STOP.has(w) && !consumed.has(w) && !consumed.has(w.replace(/s$/, '')) && !/^\d+$/.test(w) && !(dep && w === dep[1]) && w.length > 2 && !(SYN.some(([re]) => re.test(w))));
        if (rest.length && !preset.near && !preset.crit.some(c => c.kind === 'place')) preset.q = q.split(/\s+/).filter(w => rest.includes(fold(w).replace(/[’'.,;:!?()]/g, ''))).join(' ');
        return {id: d.id, preset};
    }
    /** la barre « 🧺 Prendre… » de la page d'une liste (appelée par app-listes-donnees.js).
     *  « ☑ Choisir des lignes » (ou l'ouverture de « Prendre… ») : une case devant chaque ligne, Maj+clic pour une suite, « Tout cocher (N) »,
     *  « × Désélectionner » ; « Prendre… » propose alors « les 2 cochées » ou « les 5 trouvées », et pour une longue liste « les 20 premières »
     *  ou « de la ligne 10 à 30 » (dans l'ordre affiché). Les cases tiennent quand on trie ou qu'on voit les suivantes.
     *  Venue de « Prendre depuis… » : le bandeau « 📥 Tu choisis des lignes pour … », « Prendre les N cochées », « Tout prendre (N) », « ← Revenir ». */
    let pageTake = null; // {L, page, sel: Map(clé → ligne brute), on, last, bar, back}
    const selKeyOf = (L, r) => pickKey(ldRowItem(L.d, L.state?.() || {}, r));
    function listBar(page, L) {
        if (!enabled() || !page) return;
        const send = page.querySelector('[data-ld-save]'); // dans la barre des critères (toujours visible)
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ui-listbar-btn'; btn.dataset.ldTake = '';
        btn.textContent = `🧺 ${T('Prendre…')}`; btn.title = T('Mettre les lignes trouvées (avec leurs critères et leur source) au panier, ou dans une enquête, l’Atelier…');
        const chooseBtn = document.createElement('button'); chooseBtn.type = 'button'; chooseBtn.className = 'ui-listbar-btn'; chooseBtn.dataset.ldChoose = ''; chooseBtn.setAttribute('aria-pressed', 'false');
        chooseBtn.textContent = `☑ ${T('Choisir des lignes')}`; chooseBtn.title = T('Une case devant chaque ligne, pour n’en prendre qu’une partie (Maj+clic : une suite)');
        if (send) send.after(btn, chooseBtn); else page.querySelector('.ld-bar-row')?.prepend(btn, chooseBtn);
        const strip = document.createElement('div'); strip.className = 'cx-ldsel'; strip.hidden = true; strip.setAttribute('aria-live', 'polite');
        page.querySelector('.ld-bar')?.after(strip);
        const back = listTake && listTake.id === L.d.id ? listTake : null;
        const pt = pageTake = {L, page, sel: new Map(), on: false, last: -1, bar: null, back, strip, chooseBtn};
        const setOn = on => { pt.on = on; chooseBtn.setAttribute('aria-pressed', String(on)); chooseBtn.classList.toggle('is-active', on); if (!on && !back) { page.querySelectorAll('.cx-ldck').forEach(x => x.remove()); } else repaintRows(); paintPageTake(); };
        chooseBtn.addEventListener('click', () => setOn(!pt.on));
        strip.addEventListener('click', e => {
            if (e.target.closest('[data-cx-selall]')) { (L.rows?.() || []).forEach(r => pt.sel.set(selKeyOf(L, r), r)); syncSnap(); repaintRows(); paintPageTake(); }
            if (e.target.closest('[data-cx-selnone]')) { pt.sel.clear(); syncSnap(); repaintRows(); paintPageTake(); }
        });
        if (back?.target) {
            btn.hidden = true; chooseBtn.hidden = true; // un seul bouton pour prendre : celui du bandeau
            (back.snap.picked || []).forEach(([k, x]) => { if (x.kind === 'row' && x.data?.list === L.d.id) pt.sel.set(k, x._raw || x); });
            const dn = destName({ctx: back.ctx, target: back.target}).replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim();
            const bar = pt.bar = document.createElement('div'); bar.className = 'cx-ltake'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', T('Prendre des lignes'));
            bar.innerHTML = `<div class="cx-ltake-t"><b>📥 ${esc(T('Tu choisis des lignes pour {d}', {d: dn}))}</b><span>${esc(T('Coche les lignes, ou prends tout. Chaque ligne garde la liste comme source.'))}</span></div>
                <button type="button" class="cx-b is-pri is-sm" data-cx-ltake-sel disabled></button><button type="button" class="cx-b is-sec is-sm" data-cx-ltake></button>
                <button type="button" class="cx-b is-ter is-sm" data-cx-lback>← ${esc(T('Revenir à Prendre depuis…'))}</button><button type="button" class="cx-x" data-cx-lx aria-label="${esc(T('Fermer ce bandeau'))}">×</button>`;
            page.querySelector('.ld-bar')?.before(bar);
            const done = () => { listTake = null; bar.remove(); btn.hidden = false; chooseBtn.hidden = false; pt.back = null; setOn(false); };
            bar.querySelector('[data-cx-lx]').addEventListener('click', done);
            bar.querySelector('[data-cx-lback]').addEventListener('click', () => { const b = back; done(); backToTake(b.snap, b.target, b.ctx); });
            bar.querySelector('[data-cx-ltake]').addEventListener('click', async e => { e.currentTarget.disabled = true; const it = await listSet(L); if (!it) { e.currentTarget.disabled = false; return; } const r = await deliver(back.target, [it], {ctx: back.ctx}); if (r) done(); else e.currentTarget.disabled = false; });
            bar.querySelector('[data-cx-ltake-sel]').addEventListener('click', async e => {
                const rows = pageSelItems(); if (!rows.length) return; e.currentTarget.disabled = true;
                const r = await deliver(back.target, rows, {ctx: back.ctx});
                if (!r) { e.currentTarget.disabled = false; return; }
                const keys = new Set([...pt.sel.keys()]); back.snap.picked = (back.snap.picked || []).filter(([k]) => !keys.has(k));
                const b = back; done(); backToTake(b.snap, b.target, b.ctx);
            });
            pt.on = true;
        }
        paintPageTake();
        btn.addEventListener('click', async () => {
            const n = L.total?.() || 0, c = pt.sel.size;
            if (!pt.on) setOn(true); // les cases apparaissent : on peut n'en prendre qu'une partie
            const part = async (a, b) => { let rows; try { rows = await L.allRows(); } catch (e) { toast(e.message, 'error'); return null; } return listSet(L, rows.slice(a, b), T('lignes {a} à {b}', {a: nf(a + 1), b: nf(Math.min(b, rows.length))})); };
            const sub = (mk, label) => [
                {icon: '▦', label: T('{w} au panier, comme un ensemble', {w: label}), run: async () => { const it = await mk(); if (it) take([it]); }},
                {icon: '🧺', label: T('{w} au panier, ligne par ligne', {w: label}), run: async () => { const it = await mk(); if (it) take(explode(it)); }},
                {icon: '📍', label: T('Mettre {w} dans…', {w: label.charAt(0).toLowerCase() + label.slice(1)}), run: async () => { const it = await mk(); if (it) putInto([it], {anchor: btn}); }}];
            UI().menuAt?.(btn, [
                ...(c ? sub(() => listSet(L, [...pt.sel.values()], T('{n} lignes choisies', {n: nf(c)})), T(c > 1 ? 'Les {n} cochées' : 'La ligne cochée', {n: nf(c)})) : []),
                ...(c ? ['-'] : []),
                {icon: '▦', label: T('Tout au panier, comme un ensemble ({n} lignes)', {n: nf(n)}), run: async () => { const it = await listSet(L); if (it) take([it]); }},
                n <= 300 ? {icon: '🧺', label: T('Au panier, ligne par ligne ({n})', {n: nf(n)}), run: async () => { const it = await listSet(L); if (it) take(explode(it)); }} : null,
                {icon: '📍', label: T('Mettre les {n} trouvées dans…', {n: nf(n)}), run: async () => { const it = await listSet(L); if (it) putInto([it], {anchor: btn}); }},
                ...(n > 20 ? ['-', {icon: '⤒', label: T('Les 20 premières (dans l’ordre affiché) au panier'), run: async () => { const it = await part(0, 20); if (it) take([it]); }},
                    {icon: '↔', label: T('De la ligne… à la ligne… (au panier)'), run: async () => {
                        const v = await askText(T('Quelles lignes ? (ex. 10-30, dans l’ordre affiché)'), '1-20'); const m = String(v || '').match(/(\d+)\s*(?:-|–|à|a)\s*(\d+)/); if (!m) return;
                        const a = Math.max(1, Math.min(Number(m[1]), Number(m[2]))), b = Math.max(Number(m[1]), Number(m[2])); const it = await part(a - 1, b); if (it) take([it]); }}] : []),
            ].filter(Boolean), {title: c ? T('Prendre les {c} cochées ou les {n} trouvées', {c: nf(c), n: nf(n)}) : T('Prendre les lignes trouvées')});
        });
    }
    /** les cases cochées → des éléments « ligne de liste » */
    const pageSelItems = () => { const pt = pageTake; if (!pt) return []; const s = pt.L.state?.() || {}; return [...pt.sel.values()].map(r => (r && r.kind === 'row' ? cleanIt(r) : cleanIt(ldRowItem(pt.L.d, s, r)))); };
    /** le bandeau de « Prendre depuis… » garde les cases (← Revenir) */
    function syncSnap() {
        const pt = pageTake; if (!pt?.back) return;
        const s = pt.L.state?.() || {}, others = (pt.back.snap.picked || []).filter(([, x]) => !(x.kind === 'row' && x.data?.list === pt.L.d.id));
        pt.back.snap.picked = [...others, ...[...pt.sel].map(([k, r]) => { const it = r && r.kind === 'row' ? r : {...ldRowItem(pt.L.d, s, r), _raw: r}; return [k, it]; })];
    }
    function paintPageTake() {
        const pt = pageTake; if (!pt?.page?.isConnected) return;
        const n = pt.sel.size, tot = pt.L.total?.() || 0, shown = (pt.L.rows?.() || []).length;
        if (pt.strip) { pt.strip.hidden = !pt.on; pt.strip.innerHTML = pt.on ? `<b>${esc(n ? T(n > 1 ? '{n} cochées' : '{n} cochée', {n: nf(n)}) : T('Rien de coché'))}</b> <span class="cx-muted">${esc(T('Maj+clic : toute une suite'))}</span>
            <button type="button" class="cx-b is-sec is-sm" data-cx-selall>☑ ${esc(T('Tout cocher ({n})', {n: nf(shown)}))}</button>${n ? `<button type="button" class="cx-b is-ter is-sm" data-cx-selnone>× ${esc(T('Désélectionner'))}</button>` : ''}` : ''; }
        if (pt.bar?.isConnected) {
            const sel = pt.bar.querySelector('[data-cx-ltake-sel]'); sel.textContent = T(n > 1 ? 'Prendre les {n} cochées' : n ? 'Prendre la ligne cochée' : 'Prendre les lignes cochées', {n: nf(n)}); sel.disabled = !n;
            pt.bar.querySelector('[data-cx-ltake]').textContent = tot ? T('Tout prendre ({n})', {n: nf(tot)}) : T('Tout prendre');
        }
    }
    const repaintRows = () => { const pt = pageTake; const res = pt?.page?.querySelector('[data-ld-results]'); if (res) { res.querySelectorAll('.cx-ldck').forEach(x => x.remove()); listRowsPainted(res, pt.L.rows?.() || [], {d: pt.L.d}); } };
    /** la page a dessiné ses lignes : une case devant chacune (quand on choisit des lignes, ou pendant le bandeau) */
    function listRowsPainted(res, rows, {d} = {}) {
        const pt = pageTake; if (!pt?.page?.isConnected || !d || pt.L.d.id !== d.id || !pt.on) return;
        const tr0 = res.querySelector('thead tr'); if (tr0 && !tr0.querySelector('.cx-ldck')) tr0.insertAdjacentHTML('afterbegin', `<th class="cx-ldck"><span class="cx-sr">${esc(T('Prendre'))}</span></th>`);
        const trs = [...res.querySelectorAll('tbody tr[data-ld-row]')];
        trs.forEach(tr => {
            if (tr.querySelector('.cx-ldck')) return;
            const i = Number(tr.dataset.ldRow), r = rows[i]; if (!r) return;
            const k = selKeyOf(pt.L, r), on = pt.sel.has(k), title = ldRowItem(d, pt.L.state?.() || {}, r).title;
            tr.classList.toggle('is-on', on);
            tr.insertAdjacentHTML('afterbegin', `<td class="cx-ldck"><input type="checkbox" ${on ? 'checked' : ''} aria-label="${esc(T('Prendre « {t} »', {t: title}))}"></td>`);
            tr.querySelector('.cx-ldck input').addEventListener('click', e => {
                const val = e.target.checked, from = e.shiftKey && pt.last >= 0 ? Math.min(pt.last, i) : i, to = e.shiftKey && pt.last >= 0 ? Math.max(pt.last, i) : i;
                for (let x = from; x <= to; x++) { const rr = rows[x]; if (!rr) continue; const kk = selKeyOf(pt.L, rr); if (val) pt.sel.set(kk, rr); else pt.sel.delete(kk);
                    const t2 = res.querySelector(`tr[data-ld-row="${x}"]`); if (t2) { t2.classList.toggle('is-on', val); const cb = t2.querySelector('.cx-ldck input'); if (cb) cb.checked = val; } }
                pt.last = i; syncSnap(); paintPageTake();
            });
        });
        paintPageTake();
    }
    /** des lignes → un ensemble sourcé, qui garde sa demande (pour la relancer) ; rows : seulement celles-ci (cochées, les 20 premières…) */
    async function listSet(L, only = null, part = '') {
        let rows; if (only) rows = only; else { try { rows = await L.allRows(); } catch (e) { toast(e.message, 'error'); return null; } }
        if (!rows.length) { toast(T('Aucune ligne trouvée avec ces critères.')); return null; }
        const t2 = L.table2d(rows.slice(0, 5000)), crit = [L.critSummary(), part].filter(Boolean).join(' · '), d = L.d;
        return {kind: 'set', title: `${d.icon || '📋'} ${T(d.label)}${crit ? ` — ${crit}` : ''}`, value: '',
            data: {icon: d.icon || '📋', columns: t2[0], rows: t2.slice(1), source: d.source || T(d.label), url: d.sourceUrl || '', criteria: crit, request: {list: d.id, state: L.state()}, taken: new Date().toISOString().slice(0, 10)},
            origin: {kind: 'list', id: d.id, label: `${T('Listes')} · ${T(d.label)}`, url: d.sourceUrl || '', open: {list: d.id, preset: L.state()}}};
    }

    /* ── 📂 De l'extérieur : quatre cartes (un fichier, une image ou un PDF, un tableau collé, l'adresse d'un fichier de données) ── */
    function drawOutside(st, res) {
        res.innerHTML = `<div class="cx-pad cx-out"><p class="cx-muted">${esc(T('Ce qui n’est pas encore dans ta base : chaque import garde d’où il vient et la date.'))}</p><div class="cx-cards">
            <div class="cx-card"><h6>📄 ${esc(T('Un fichier de données'))}</h6><p>${esc(T('CSV, TSV, XLSX, ODS, JSON : un relevé, un tableau d’association…'))}</p><p class="cx-gives">${esc(T('Ça donne : un tableau, filtrable par date, lieu, mot, distance'))}</p>
                <label class="cx-b is-sec is-sm cx-file">${esc(T('Choisir un fichier…'))}<input type="file" data-cx-file accept=".csv,.tsv,.txt,.json,.xlsx,.ods" hidden></label></div>
            <div class="cx-card"><h6>🖼 ${esc(T('Une image ou un PDF'))}</h6><p>${esc(T('Une photo, un acte scanné, un document.'))}</p><p class="cx-gives">${esc(T('Ça donne : un média de ta base, déjà coché'))}</p>
                <label class="cx-b is-sec is-sm cx-file">${esc(T('Choisir une image ou un PDF…'))}<input type="file" data-cx-media accept="image/*,application/pdf" hidden></label></div>
            <div class="cx-card"><details><summary><h6>📋 ${esc(T('Coller un tableau (copié d’un site, d’un PDF, d’Excel)'))}</h6></summary><textarea data-cx-paste rows="5" aria-label="${esc(T('Le tableau collé'))}" placeholder="${esc(T('Colle ici les lignes, la première avec les titres des colonnes'))}"></textarea><button type="button" class="cx-b is-sec is-sm" data-cx-pastego>${esc(T('Lire le tableau'))}</button></details><p class="cx-gives">${esc(T('Ça donne : un tableau, avec ses colonnes reconnues'))}</p></div>
            <div class="cx-card"><details><summary><h6>🌐 ${esc(T('L’adresse d’un fichier de données (CSV, JSON)'))}</h6></summary><input type="url" data-cx-url aria-label="${esc(T('L’adresse du fichier'))}" placeholder="https://…/donnees.csv"><button type="button" class="cx-b is-sec is-sm" data-cx-urlgo>⤓ ${esc(T('Télécharger ce fichier'))}</button></details><p class="cx-gives">${esc(T('Seulement un fichier de données (pas une page web) ; téléchargé une fois, quand tu cliques.'))}</p></div>
            </div><div data-cx-imp aria-live="polite"></div></div>`;
        const imp = res.querySelector('[data-cx-imp]');
        const fromRows = (rows, prov) => showImport(st, imp, rows, prov);
        res.querySelector('[data-cx-file]').addEventListener('change', async e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (file.size > 20 * 1048576) return toast(T('Fichier trop gros (plus de 20 Mo).'), 'error');
            try { fromRows(await readTable(file.name, await file.arrayBuffer()), {name: file.name}); } catch (err) { imp.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
        });
        res.querySelector('[data-cx-media]').addEventListener('change', async e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (!ext.rtUploadCopy) return toast(T('L’envoi dans les médias n’est pas chargé.'), 'error');
            try { const r = await ext.rtUploadCopy(file, {title: file.name}); const it = {kind: 'media', ref_id: Number(r.media_id || r.id), title: file.name, data: {filename: r.filename}, origin: {label: T('Importé le {d} : {n}', {d: new Date().toLocaleDateString('fr-FR'), n: file.name})}};
                st.picked.set(pickKey(it), it); paintCount(st); imp.innerHTML = `<p>✓ ${esc(T('« {n} » est dans les médias et coché.', {n: file.name}))}</p>`; } catch (err) { toast(err.message, 'error'); }
        });
        res.querySelector('[data-cx-pastego]').addEventListener('click', () => {
            const txt = res.querySelector('[data-cx-paste]').value; if (!txt.trim()) return;
            try { fromRows(parseText(txt), {name: T('Tableau collé')}); } catch (err) { imp.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
        });
        res.querySelector('[data-cx-urlgo]').addEventListener('click', async () => {
            const url = res.querySelector('[data-cx-url]').value.trim(); if (!url) return;
            imp.innerHTML = UI().spinner ? UI().spinner(T('Téléchargement…'), {inline: true}) : '…';
            try { const r = await post('fetch_url', {url}); const bin = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0)); fromRows(await readTable(r.name, bin.buffer), {name: r.name, url: r.url}); }
            catch (err) { imp.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
        });
    }
    const isFormula = s => typeof s === 'string' && (/^\s*[=@]/.test(s) || /^\s*[+\-]\s*[A-Za-z(]/.test(s));
    const clean = v => { let s = String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim(); if (isFormula(s)) s = ''; return s.slice(0, 2000); };
    function parseText(txt) {
        const SH = window.LCNDA_SHEET;
        if (SH?.parseCSV) { const t = String(txt).replace(/^﻿/, ''); const sep = t.split('\n')[0].includes('\t') ? '\t' : (SH.sniffSep ? SH.sniffSep(t) : ';'); return SH.parseCSV(t, {sep}); }
        const lines = String(txt).replace(/\r/g, '').split('\n').filter(l => l.trim()); const sep = lines[0].includes('\t') ? '\t' : lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
        return lines.map(l => l.split(sep));
    }
    async function readTable(name, buf) {
        const SH = window.LCNDA_SHEET;
        if (SH?.readFile) { const r = await SH.readFile(name, buf); const m = SH.matrix ? SH.matrix(r.wb, null, 0) : null; if (m?.length) return m; }
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
        if (/\.json$/i.test(name) || /^\s*\[/.test(text)) { const j = JSON.parse(text); const arr = Array.isArray(j) ? j : j.rows || j.data || []; const cols = [...new Set(arr.flatMap(o => (o && typeof o === 'object' ? Object.keys(o) : [])))]; return [cols, ...arr.map(o => cols.map(c => o?.[c]))]; }
        return parseText(text);
    }
    /** colonnes reconnues : date, année, lieu, latitude, longitude, nom */
    const COL = [['date', /date|jour|deces|naissance|^le$/], ['year', /^an(nee)?$|annee|year/], ['place', /lieu|commune|ville|place|paroisse|localite/], ['lat', /^lat/], ['lon', /^(lon|lng)/], ['name', /^nom|name|personne/]];
    const isoOf = v => { const s = String(v || '').trim(); let m; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0]; if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`; return ''; };
    function showImport(st, box, raw, prov) {
        const rows = (raw || []).map(r => (r || []).map(clean)).filter(r => r.some(Boolean)).slice(0, 50000);
        if (rows.length < 2) { box.innerHTML = `<p class="error">${esc(T('Pas de tableau lisible (il faut une ligne de titres et au moins une ligne).'))}</p>`; return; }
        const head = rows[0].map((h, i) => h || T('Colonne {n}', {n: i + 1})), body = rows.slice(1);
        const roles = {}; head.forEach((h, i) => { const f = fold(h); const r = COL.find(([k, re]) => re.test(f) && roles[k] == null); if (r) roles[r[0]] = i; });
        if (roles.date == null) { const i = head.findIndex((h, k) => body.slice(0, 20).filter(r => isoOf(r[k])).length >= Math.min(3, body.length)); if (i >= 0) roles.date = i; }
        const today = new Date().toISOString().slice(0, 10);
        box.innerHTML = `<div class="cx-imp"><p><b>${esc(prov.name)}</b> · ${esc(plural(body.length, T('ligne')))} · ${esc(T('importé le {d}', {d: frDate(today)}))}</p>
            <div class="cx-roles">${head.map((h, i) => `<label>${esc(h)}<select data-cx-role="${i}"><option value="">—</option>${[['date', T('date')], ['year', T('année')], ['place', T('lieu')], ['lat', T('latitude')], ['lon', T('longitude')], ['name', T('nom')]].map(([k, l]) => `<option value="${k}" ${roles[k] === i ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}</div>
            <div class="cx-filt"><label>${esc(T('du'))}<input type="date" data-cx-from></label><label>${esc(T('au'))}<input type="date" data-cx-to></label><label>${esc(T('contient'))}<input type="search" data-cx-has></label>
                <label>${esc(T('à moins de'))}<input type="number" min="0" step="0.5" data-cx-km style="width:5em"> km ${esc(T('de'))}<input type="search" data-cx-near placeholder="${esc(T('une ville'))}"></label></div>
            <label>${esc(T('Source / licence'))}<input data-cx-lic value="${esc(prov.url ? prov.url : '')}" placeholder="${esc(T('ex. Archives de la Corrèze, Licence Ouverte'))}"></label>
            <p class="cx-cnt" data-cx-cnt></p><div class="cx-set" data-cx-iprev></div>
            <div class="cx-imp-acts"><button type="button" class="button small" data-cx-iall>▦ ${esc(T('Tout prendre (un ensemble)'))}</button><button type="button" class="button small secondary" data-cx-irows>☰ ${esc(T('Prendre ligne par ligne'))}</button></div></div>`;
        const q = s => box.querySelector(s);
        let near = null;
        const role = k => { const el = [...box.querySelectorAll('[data-cx-role]')].find(s => s.value === k); return el ? Number(el.dataset.cxRole) : null; };
        const kmTo = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x))); };
        const filtered = () => {
            const from = q('[data-cx-from]').value, to = q('[data-cx-to]').value, has = fold(q('[data-cx-has]').value), di = role('date'), yi = role('year'), la = role('lat'), lo = role('lon'), km = Number(q('[data-cx-km]').value) || 0;
            return body.filter(r => {
                if ((from || to) && di != null) { const d = isoOf(r[di]); if (!d || (from && d < from) || (to && d > to)) return false; }
                else if ((from || to) && yi != null) { const y = Number(r[yi]); if (!y || (from && y < Number(from.slice(0, 4))) || (to && y > Number(to.slice(0, 4)))) return false; }
                if (has && !fold(r.join(' ')).includes(has)) return false;
                if (near && km && la != null && lo != null) { const a = Number(String(r[la]).replace(',', '.')), b = Number(String(r[lo]).replace(',', '.')); if (!Number.isFinite(a) || !Number.isFinite(b) || kmTo(near.lat, near.lon, a, b) > km) return false; }
                return true;
            });
        };
        const crit = () => [q('[data-cx-from]').value || q('[data-cx-to]').value ? `${T('du')} ${frDate(q('[data-cx-from]').value) || '…'} ${T('au')} ${frDate(q('[data-cx-to]').value) || '…'}` : '', q('[data-cx-has]').value ? `« ${q('[data-cx-has]').value} »` : '', near && q('[data-cx-km]').value ? T('à {k} km de {p}', {k: q('[data-cx-km]').value, p: near.title}) : ''].filter(Boolean).join(' · ');
        const asSet = list => ({kind: 'set', title: `📂 ${prov.name}${crit() ? ` — ${crit()}` : ''}`, value: '', data: {icon: '📂', columns: head, rows: list, source: prov.url ? prov.name : `${prov.name} (${T('fichier importé')})`, url: prov.url || '', licence: q('[data-cx-lic]').value.trim(), criteria: crit(), imported: today, request: {imported: prov.name}},
            origin: {label: T('Importé le {d} : {n}', {d: frDate(today), n: prov.name}), url: prov.url || ''}});
        const paint = () => { const list = filtered(); q('[data-cx-cnt]').textContent = T('{n} sur {t}', {n: plural(list.length, T('ligne')), t: nf(body.length)}); q('[data-cx-iprev]').innerHTML = setTable(asSet(list), 15); };
        box.querySelectorAll('input, select').forEach(el => el.addEventListener(el.matches('[data-cx-near]') ? 'change' : 'input', paint));
        q('[data-cx-near]').addEventListener('change', async e => { near = e.target.value.trim() ? await placeByName(e.target.value.trim()) : null; if (near) near.title = String(near.title || '').replace(/\s*\(.*\)$/, ''); paint(); });
        q('[data-cx-iall]').addEventListener('click', () => { const it = asSet(filtered()); st.picked.set(pickKey(it), it); paintCount(st); toast(T('▦ Ensemble coché : {n}', {n: plural(it.data.rows.length, T('ligne'))})); });
        q('[data-cx-irows]').addEventListener('click', () => { explode(asSet(filtered())).slice(0, 500).forEach(it => st.picked.set(pickKey(it), it)); paintCount(st); });
        paint();
    }

    /* ═════════════ ⚙️ Réglages → 🧺 Panier et connexions ═════════════ */
    const TAB = ['connexions', '01g', '🧺 Panier et connexions'];
    function saveSettings(next, msg) {
        const before = readJ(KEY, null);
        writeJ(KEY, next); paintPill(); drawSettings();
        undoToast(msg, {undo: async () => { if (before == null) { try { localStorage.removeItem(KEY); } catch (_) {} } else writeJ(KEY, before); paintPill(); drawSettings(); }});
    }
    function drawSettings(token) {
        const st = S(); if (st.module !== 'maintenance' || st.maintenanceTab !== TAB[0]) return;
        if (token !== undefined && token !== st.workspaceToken) return;
        const ws = document.getElementById('workspace'); if (!ws) return;
        const s = settings(), K = UI().toggleHtml;
        const tg = (k, label, sub) => (K ? `<div class="cx-tg">${K(T(label), {checked: !!s[k], attrs: `data-cx-tg="${k}"`, sub: T(sub)})}</div>` : `<label class="checkbox-line"><input type="checkbox" data-cx-tg="${k}" ${s[k] ? 'checked' : ''}> ${esc(T(label))}</label>`);
        const combo = shortcutText();
        ws.innerHTML = `<section class="page cx-settings">${UI().pageHeader ? UI().pageHeader({title: T('Panier et connexions'), icon: '🧺', where: T('Réglages'), help: esc(T('Prendre des choses n’importe où et les mettre n’importe où : 📥 Prendre depuis…, 🧺 le panier, 📍 Mettre dans…. Rien n’est rangé tout seul.'))}) : `<h2>🧺 ${esc(T('Panier et connexions'))}</h2>`}
            <div class="maintenance-panel">${tg('on', 'Panier et connexions', 'Éteint : l’app se comporte comme avant (pas de pastille, pas de « Prendre depuis… », pas de « Au panier »).')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Le panier'))}</h3>
                <label class="checkbox-line"><input type="radio" name="cx-multi" value="0" ${s.multi ? '' : 'checked'}> <span><b>${esc(T('Un seul panier'))}</b><br><small class="muted">${esc(T('« ⭐ Garder comme liste » le range dans Mes listes.'))}</small></span></label>
                <label class="checkbox-line"><input type="radio" name="cx-multi" value="1" ${s.multi ? 'checked' : ''}> <span><b>${esc(T('Plusieurs paniers, avec un nom'))}</b><br><small class="muted">${esc(T('Un menu dans le panier pour passer de l’un à l’autre.'))}</small></span></label>
                <p class="muted"><small>${esc(T('Le panier est gardé dans la base : il te suit sur un autre ordinateur et dans les sauvegardes.'))}</small></p></div>
            <div class="maintenance-panel"><h3>${esc(T('Prendre et déposer'))}</h3>${tg('ctx', 'Clic droit : « 🧺 Prendre… » une date, un lieu, une phrase', 'Sur une fiche, une note, une transcription, une enquête… ; un texte choisi à la souris aussi.')}${tg('dnd', 'Glisser du panier sur l’écran ouvert', 'Un cadre bleu dit ce qui va se passer avant qu’on lâche.')}</div>
            <div class="maintenance-panel"><h3>${esc(T('Raccourci clavier'))}</h3><p>📥 ${esc(T('Prendre depuis…'))} : <b>${esc(combo || T('aucun'))}</b> · <button type="button" class="link-button" data-cx-keys>${esc(T('Changer dans Raccourcis clavier'))}</button></p>
                <p class="muted"><small>${esc(T('⇧⌘O était déjà pris (écran divisé) : le raccourci de départ est ⌥⌘O (Ctrl+Alt+O sous Windows et Linux).'))}</small></p></div>${ext.cxNeeds?.settingsHtml?.() || ''}</section>`;
        ext.cxNeeds?.bindSettings?.(ws); // 🧩 les besoins (heritage-connexions-besoins.js)
        ws.querySelectorAll('[data-cx-tg]').forEach(el => { const inp = el.matches('input') ? el : el.querySelector('input'); (inp || el).addEventListener('change', e => { const k = el.dataset.cxTg; const v = !!(e.target.checked ?? inp?.checked); saveSettings({...settings(), [k]: v}, v ? T('Activé') : T('Éteint')); if (k === 'on' && v && count == null) boot(); }); });
        ws.querySelectorAll('[name="cx-multi"]').forEach(r => r.addEventListener('change', e => { writeJ(CUR, 0); basket = null; saveSettings({...settings(), multi: e.target.value === '1'}, e.target.value === '1' ? T('Plusieurs paniers') : T('Un seul panier')); }));
        ws.querySelector('[data-cx-keys]')?.addEventListener('click', () => { st.maintenanceTab = 'raccourcis'; A().persistUiState?.(); A().setModule?.('maintenance'); });
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);
    function register() {
        const tabs = A().defaultMaintenanceTabs;
        if (Array.isArray(tabs) && !tabs.some(t => t[0] === TAB[0])) { let i = tabs.findIndex(t => t[0] === 'look_msgs'); tabs.splice(i < 0 ? tabs.length : i + 1, 0, TAB); }
        addSendTargets(); addSelectionActions();
        return Array.isArray(tabs);
    }
    if (!register()) document.addEventListener('DOMContentLoaded', () => { register(); setTimeout(register, 500); }, {once: true});
    setTimeout(register, 0);

    /* ═════════════ 🕵️ les pièces d'une piste (plusieurs événements, sources, médias, infos…) ═════════════ */
    /** une destination « cette piste » (menu ⋯ d'une piste : « 📥 Prendre dans cette piste… ») */
    function pisteDest(invId, item) {
        const base = DT.find(t => t.id === 'investigation');
        return {...base, id: 'investigation', here: () => ({investigation_id: Number(invId), item_id: Number(item.id), mode: 'one', title: invTitle(), label: T('Ici : la piste « {t} »', {t: item.title})})};
    }
    function linksHtml(item) {
        const links = item?.links || []; if (!links.length) return '';
        return `<div class="cx-links" data-cx-links="${Number(item.id)}">${links.map(l => { const it = {kind: l.entity_type, title: l.label, value: l.value, data: l.data};
            return `<span class="investigation-item-meta-pill cx-link" title="${esc([l.label, l.value, l.origin?.label].filter(Boolean).join(' — '))}"><span aria-hidden="true">${icon(it)}</span>${esc(String(l.label || l.value).slice(0, 80))}${l.entity_type === 'set' ? ` <small>(${esc(plural((l.data?.rows || []).length, T('ligne')))})</small>` : l.value && l.value !== l.label ? ` <small>${esc(String(l.value).slice(0, 60))}</small>` : ''}${l.origin?.url ? ` <a href="${esc(l.origin.url)}" target="_blank" rel="noopener" title="${esc(T('↗ source'))}">↗</a>` : ''}${kiosk() ? '' : `<button type="button" class="investigation-item-meta-pill-remove" data-cx-link-x="${Number(l.id)}" aria-label="${esc(T('Retirer de la piste'))}" title="${esc(T('Retirer de la piste'))}">×</button>`}</span>`; }).join('')}</div>`;
    }
    document.addEventListener('click', async e => {
        const x = e.target.closest?.('[data-cx-link-x]'); if (!x) return;
        e.preventDefault(); e.stopPropagation();
        try { const r = await post('item_link_remove', {ids: [Number(x.dataset.cxLinkX)]}); A().refreshScreen?.();
            undoToast(T('Retiré de la piste'), {undo: async () => { await post('item_link_restore', {rows: r.removed}); A().refreshScreen?.(); }}); } catch (err) { toast(err.message, 'error'); }
    }, true);

    /* ═════════════ 👤 la fiche : « ⋯ → ☑ Choisir plusieurs » (ses événements) ═════════════ */
    let ficheSel = null;
    (ext.personMoreItems = ext.personMoreItems || []).push(detail => {
        if (!enabled() || kiosk() || !detail?.person?.id || !ext.selectionBar) return null;
        return {icon: '☑', label: ficheSel?.el?.isConnected ? T('Ne plus choisir plusieurs') : T('Choisir plusieurs (événements)'), run: () => {
            if (ficheSel?.el?.isConnected) { ficheSel.destroy(); document.querySelectorAll('#workspace .event-row .sel-box').forEach(b => b.remove()); ficheSel = null; return; }
            const first = document.querySelector('#workspace .event-row[data-event-id]'); if (!first) return toast(T('Pas d’événement sur cette fiche.'));
            ficheSel = ext.selectionBar({host: first.parentElement, rowSelector: '.event-row[data-event-id]', idOf: el => el.dataset.eventId, kind: 'event', what: [T('événement coché'), T('événements cochés')], actions: []});
        }};
    });

    /** « Dans quelle enquête ? » pour une piste proposée (Où chercher ?, Que manque-t-il ?) → paramètres pour le serveur ; {} si éteint (comme avant) ; null si annulé */
    async function leadTarget(personId, newTitle = '', title = T('Dans quelle enquête ?')) {
        if (!enabled()) return {};
        const c = await chooseInvestigation({personId, title, items: [{}], newTitle}); if (!c) return null;
        return c.create ? {new_investigation: 1, new_title: c.title || newTitle} : {investigation_id: c.investigation_id, item_id: c.item_id || 0, investigation_title: c.title};
    }
    /** 📮 une réponse enregistrée pour un courrier relié à une piste : « La ranger dans la piste ? » (un clic, ↶) */
    async function courrierReplied(id, vals = {}) {
        if (!enabled() || !id) return;
        let links = []; try { links = ((await api('cx_links', {a_type: 'courrier', a_id: id})).links || []).filter(l => l.b_type === 'investigation_item'); } catch (_) { return; }
        if (!links.length) return;
        const l = links[0];
        const item = {kind: 'courrier', ref_id: id, title: T('Réponse : {o}', {o: vals.objet || T('courrier')}).slice(0, 200), value: [vals.destinataire, vals.recu_le ? T('reçue le {d}', {d: frDate(vals.recu_le)}) : T('réponse reçue')].filter(Boolean).join(' · '), origin: {label: T('Registre de courriers'), kind: 'courrier', id}};
        toast(T('📮 Ce courrier attendait une réponse pour la piste « {p} ».', {p: l.b_label || ''}), '', {action: {label: T('🕵️ La ranger dans la piste'), run: async () => {
            const r = await post('inv_receive', {investigation_id: l.investigation_id, item_id: l.b_id, items: [item]});
            undoToast(T('📮 Réponse rangée dans la piste « {p} »', {p: l.b_label || ''}), {undo: async () => { await post('inv_receive_undo', r); }});
        }}});
    }
    ext.connexions = {redrawSettings: () => drawSettings(), courrierReplied, leadTarget, pisteDest, linksHtml, enabled, settings, take, putInto, deliver, openTake, openBasket, addMenuItems, emptyHere, chooseInvestigation, listBar, listRowsPainted, itemText, explode, parseAsk, parseDates, screenOrigin, openOrigin, ctxItems,
        openBasketView, chooseBasket, count: () => count, refresh: () => { basket = null; return api('cx_count', {basket_id: curBasket()}).then(setCountFrom); }, KIND};
})();
