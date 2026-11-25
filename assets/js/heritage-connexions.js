/* LCNDA — 🔌 Connexions : 📥 « Prendre depuis… », 🧺 le panier, 📍 « Mettre dans… » (maquette validée docs/design/connexions-besoins.html).
 * Serveur : lib/connexions.php (tables cx_baskets, cx_basket_items, investigation_item_links, cx_links). Essai : tests/test-connexions-panier.js
 *
 * Rien n'est calculé au repos : le nombre d'éléments du panier est lu une fois (GET cx_count, après l'affichage), le panier
 * lui-même seulement quand on l'ouvre ; les fenêtres ne cherchent que quand on les ouvre. Rien n'est rangé tout seul :
 * toujours un clic, avec « ↶ Annuler ». Réglages → « 🧺 Panier et connexions » (clé genealogie-connexions) : tout éteindre,
 * un ou plusieurs paniers, clic droit, glisser. Raccourci : ⌥⌘O / Ctrl+Alt+O (« take_from », Réglages → Raccourcis clavier ;
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
 *      receive: async (items, ctx) => ({message, undo, redo}),   // ranger ; undo = « ↶ Annuler »
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
    const curBasket = () => (settings().multi ? Number(readJ(CUR, 0)) || 0 : 0);

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
    async function loadBasket(force = false) {
        if (basket && !force) return basket;
        if (loading && !force) return loading;
        loading = api('cx_basket', {basket_id: curBasket()}).then(r => { basket = r; count = (r.items || []).length; paintPill(); return r; }).finally(() => { loading = null; });
        return loading;
    }
    const setCountFrom = r => { if (r && r.count != null) { count = Number(r.count); paintPill(); } basket = null; };
    async function take(items, {quiet = false, origin = null} = {}) {
        items = (items || []).filter(Boolean).map(it => (origin && !it.origin ? {...it, origin} : it));
        if (!items.length) return null;
        if (kiosk()) { toast(T('Mode consultation : rien ne peut être mis de côté.')); return null; }
        const r = await post('basket_add', {basket_id: curBasket(), items});
        setCountFrom(r); remember(items);
        if (!quiet) {
            const n = r.ids.length;
            const msg = n ? T('🧺 {n} au panier', {n: plural(n, T('chose'), T('choses'))}) + (r.skipped ? ` ${T('({n} déjà dedans)', {n: r.skipped})}` : '') : T('Déjà dans le panier.');
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
        pill.innerHTML = `<span aria-hidden="true">🧺</span><b>${esc(nf(count))}</b>`;
        pill.title = T('Le panier : {n} (cliquer pour l’ouvrir, glisser une chose dessus pour l’y mettre)', {n: plural(count, T('chose'), T('choses'))});
        pill.setAttribute('aria-label', T('Le panier : {n}', {n: plural(count, T('chose'), T('choses'))}));
    }
    const boot = () => { if (!enabled() || count != null) return; api('cx_count', {basket_id: curBasket()}).then(r => { count = Number(r.count) || 0; paintPill(); }).catch(() => {}); };
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
        const items = b.items || [], multi = settings().multi;
        const cur = (b.baskets || []).find(x => Number(x.id) === Number(b.basket_id));
        panel.innerHTML = `<div class="cx-panel-head"><b>🧺 ${esc(multi && cur ? cur.name : T('Mon panier'))} (${nf(items.length)})</b>
            ${multi ? `<select data-cx-bsel aria-label="${esc(T('Quel panier'))}">${(b.baskets || []).map(x => `<option value="${x.id}" ${Number(x.id) === Number(b.basket_id) ? 'selected' : ''}>${esc(`${x.name} (${x.count})`)}</option>`).join('')}<option value="new">＋ ${esc(T('Un nouveau panier…'))}</option></select>` : ''}
            <button type="button" class="icon-button" data-cx-close aria-label="${esc(T('Fermer'))}">×</button></div>
            ${items.length ? `<ul class="cx-plist">${items.map(it => `<li draggable="${settings().dnd ? 'true' : 'false'}" data-cx-bi="${it.id}"><span class="cx-ico" aria-hidden="true">${icon(it)}</span><span class="cx-t"><b>${esc(it.title)}</b>${it.kind === 'set' ? ` <small class="cx-n">${esc(plural(setCount(it), T('ligne')))}</small>` : ''}${it.value && it.kind !== 'set' ? `<small>${esc(String(it.value).slice(0, 140))}</small>` : ''}${it.origin?.label ? `<small class="muted">${esc(T('de :'))} ${esc(it.origin.label)}</small>` : ''}</span>
                ${it.origin && (it.origin.open || it.origin.url || it.origin.id) ? `<button type="button" class="link-button" data-cx-go="${it.id}" title="${esc(T('Revenir là d’où ça vient'))}">↗</button>` : ''}<button type="button" class="icon-button small" data-cx-x="${it.id}" aria-label="${esc(T('Retirer du panier'))}" title="${esc(T('Retirer du panier'))}">×</button></li>`).join('')}</ul>
                <div class="cx-panel-acts"><button type="button" class="button small" data-cx-put>📍 ${esc(T('Mettre dans…'))}</button><button type="button" class="button small secondary" data-cx-keep>⭐ ${esc(T('Garder comme liste'))}</button><button type="button" class="button small secondary danger" data-cx-clear>${esc(T('Tout retirer'))}</button></div>
                ${settings().dnd ? `<p class="cx-hint muted">${esc(T('…ou glisse une ligne (ou tout le panier) sur l’écran ouvert.'))}</p>` : ''}`
            : `<p class="muted cx-empty">${esc(T('Le panier est vide. Coche des choses n’importe où (« 🧺 Au panier »), ou clic droit sur une date, un lieu, une phrase : « 🧺 Prendre… ».'))}</p>`}
            ${multi ? `<div class="cx-panel-foot"><button type="button" class="link-button" data-cx-brename>✎ ${esc(T('Renommer'))}</button>${(b.baskets || []).length > 1 ? ` · <button type="button" class="link-button" data-cx-bdel>🗑 ${esc(T('Supprimer ce panier'))}</button>` : ''}</div>` : ''}`;
        bindPanel(items, b);
    }
    function bindPanel(items, b) {
        const byId = id => items.find(x => Number(x.id) === Number(id));
        panel.querySelector('[data-cx-close]')?.addEventListener('click', () => { panel.remove(); panel = null; });
        panel.querySelectorAll('[data-cx-x]').forEach(x => x.addEventListener('click', () => removeFromBasket([Number(x.dataset.cxX)])));
        panel.querySelectorAll('[data-cx-go]').forEach(x => x.addEventListener('click', () => openOrigin(byId(x.dataset.cxGo))));
        panel.querySelector('[data-cx-put]')?.addEventListener('click', e => putInto(items, {anchor: e.currentTarget, fromBasket: true}));
        panel.querySelector('[data-cx-clear]')?.addEventListener('click', async () => {
            const r = await post('basket_clear', {basket_id: b.basket_id}); setCountFrom(r); refreshPanel();
            undoToast(T('Panier vidé ({n})', {n: plural(r.removed.length, T('chose'), T('choses'))}), {icon: '🧺', undo: async () => { setCountFrom(await post('basket_restore', {rows: r.removed})); refreshPanel(); }});
        });
        panel.querySelector('[data-cx-keep]')?.addEventListener('click', () => keepAsList(items, b));
        panel.querySelector('[data-cx-bsel]')?.addEventListener('change', async e => {
            let id = e.target.value;
            if (id === 'new') { const name = await askText(T('Le nom du nouveau panier'), T('Panier {n}', {n: (b.baskets || []).length + 1})); if (!name) { drawPanel(true); return; } id = (await post('basket_new', {name})).id; }
            writeJ(CUR, Number(id)); basket = null; count = null; await drawPanel(true);
        });
        panel.querySelector('[data-cx-brename]')?.addEventListener('click', async () => { const cur = (b.baskets || []).find(x => Number(x.id) === Number(b.basket_id)); const name = await askText(T('Renommer le panier'), cur?.name || ''); if (name) { await post('basket_rename', {basket_id: b.basket_id, name}); drawPanel(true); } });
        panel.querySelector('[data-cx-bdel]')?.addEventListener('click', async () => {
            const r = await post('basket_delete', {basket_id: b.basket_id}); writeJ(CUR, 0); basket = null; await drawPanel(true);
            undoToast(T('Panier « {n} » supprimé', {n: r.basket.name}), {undo: async () => { await post('basket_undelete', {basket: r.basket, rows: r.rows}); writeJ(CUR, Number(r.basket.id)); basket = null; refreshPanel(); }});
        });
        panel.querySelectorAll('li[draggable="true"]').forEach(li => li.addEventListener('dragstart', e => {
            const one = byId(li.dataset.cxBi), list = e.altKey ? items : [one];
            startDrag(e, list, {fromBasket: true});
        }));
    }
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

    async function putInto(items, {anchor = null, fromBasket = false, only = null} = {}) {
        items = (items || []).filter(Boolean);
        if (!items.length) return toast(T('Rien à mettre.'));
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'));
        const sets = items.filter(x => x.kind === 'set');
        const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-put';
        const draw = () => {
            const asRows = dlg.querySelector('[name="cx-setmode"]:checked')?.value === 'rows';
            const its = asRows ? items.flatMap(explode) : items;
            const list = targetsFor(its).filter(t => !only || only.includes(t.id));
            const here = list.filter(t => hereOf(t)), rest = list.filter(t => !hereOf(t));
            const row = (t, h) => { const acc = accepted(t, its), ctx = h ? hereOf(t) : null; let ex = ''; try { ex = t.explain?.(acc, ctx) || ''; } catch (_) {}
                const part = acc.length < its.length ? T('{a} sur {b} iront là ; le reste reste dans le panier.', {a: acc.length, b: its.length}) : '';
                return `<button type="button" class="cx-dest" data-cx-dest="${esc(t.id)}" data-cx-here="${h ? 1 : 0}"><span class="cx-ico" aria-hidden="true">${esc(t.icon || '•')}</span><span class="cx-t"><b>${esc(h ? (ctx?.label || T('Ici')) : T(t.label))}</b>${ex ? `<small>${esc(ex)}</small>` : ''}${part ? `<small class="cx-part">${esc(part)}</small>` : ''}</span></button>`; };
            dlg.querySelector('[data-cx-dests]').innerHTML = (here.length ? `<h4>${esc(T('Ici, l’écran ouvert'))}</h4>${here.map(t => row(t, true)).join('')}` : '')
                + `<h4>${esc(T('Partout ailleurs'))}</h4>${rest.concat(here).map(t => row(t, false)).join('') || `<p class="muted">${esc(T('Aucun outil ne peut recevoir ça pour l’instant.'))}</p>`}`;
            filter();
        };
        const filter = () => { const q = fold(dlg.querySelector('[data-cx-dq]').value); dlg.querySelectorAll('[data-cx-dest]').forEach(b => { b.hidden = !!q && !fold(b.textContent).includes(q); }); };
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">📍 ${esc(T('METTRE DANS…'))}</span><h2>${esc(T('Mettre dans… ({n})', {n: plural(items.length, T('chose'), T('choses'))}))}</h2></div><button type="button" class="icon-button" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="cx-body">${sets.length ? `<fieldset class="cx-setmode"><legend>${esc(T('Les ensembles ({n} lignes) :', {n: nf(sets.reduce((n, s) => n + setCount(s), 0))}))}</legend><label class="checkbox-line"><input type="radio" name="cx-setmode" value="table" checked> ${esc(T('un tableau avec sa source (1 élément)'))}</label><label class="checkbox-line"><input type="radio" name="cx-setmode" value="rows"> ${esc(T('des éléments séparés (une ligne chacun)'))}</label></fieldset>` : ''}
            <input type="search" class="cx-dq" data-cx-dq placeholder="${esc(T('🔎 chercher une destination…'))}" aria-label="${esc(T('Chercher une destination'))}"><div class="cx-dests" data-cx-dests></div></div>
            <div class="modal-actions"><span class="spacer"></span><button type="submit" class="button secondary">${esc(T('Annuler'))}</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        dlg.querySelector('[data-cx-x]').addEventListener('click', () => dlg.close());
        dlg.querySelector('[data-cx-dq]').addEventListener('input', filter);
        dlg.querySelectorAll('[name="cx-setmode"]').forEach(r => r.addEventListener('change', draw));
        dlg.querySelector('[data-cx-dests]').addEventListener('click', async e => {
            const b = e.target.closest('[data-cx-dest]'); if (!b) return;
            const t = DT.find(x => x.id === b.dataset.cxDest); if (!t) return;
            const asRows = dlg.querySelector('[name="cx-setmode"]:checked')?.value === 'rows';
            const its = asRows ? items.flatMap(explode) : items;
            dlg.close();
            await deliver(t, its, {here: b.dataset.cxHere === '1', anchor, fromBasket, original: items});
        });
        draw();
    }
    /** ranger dans une destination ; ce qui a été pris du panier en sort (le reste y reste), un seul « ↶ Annuler » */
    async function deliver(t, items, {here = false, anchor = null, fromBasket = false, original = null} = {}) {
        const acc = accepted(t, items);
        let ctx = here ? hereOf(t) : null;
        try {
            if (!ctx) ctx = t.choose ? await t.choose(acc, anchor) : (hereOf(t) || {});
            if (!ctx) return null;
            const r = await t.receive(acc, ctx) || {};
            let removed = null;
            const doneIds = fromBasket ? (original || items).filter(x => x.id && (acc.includes(x) || acc.some(a => a._from === x.id))).map(x => x.id) : [];
            if (doneIds.length) { removed = await post('basket_remove', {ids: doneIds}); setCountFrom(removed); refreshPanel(); }
            const left = items.length - acc.length;
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
            const role = r => (r === 'main' ? '' : r === 'primary' ? T(' (principale)') : T(' (secondaire)'));
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
            const items0 = () => { const sel = f.elements.inv?.value, inv = list.find(i => String(i.id) === sel), s = f.elements.item; f.querySelector('[data-cx-newl]').hidden = sel !== 'new'; if (!s) return;
                s.innerHTML = opt(0, items.length > 1 ? T('＋ Une nouvelle piste pour tout') : T('＋ Une nouvelle piste'), true) + (items.length > 1 ? opt('each', T('＋ Une nouvelle piste pour chaque élément'), false) : '') + (inv?.items || []).map(x => opt(x.id, `📌 ${x.title}`, false)).join(''); };
            if (!multiple) { f.elements.inv.addEventListener('change', items0); items0(); }
            f.addEventListener('submit', e => {
                e.preventDefault();
                if (multiple) return answer({ids: [...f.querySelectorAll('[name="inv"]:checked')].map(x => Number(x.value)), list});
                const sel = f.elements.inv.value, it = f.elements.item?.value || '0';
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
        return out;
    }
    /** « 🧺 Vider le panier ici » : tout ce que l'écran ouvert sait prendre */
    async function emptyHere() {
        const b = await loadBasket(true), items = b.items || [];
        const t = hereTarget(items); if (!t) return putInto(items, {fromBasket: true});
        return deliver(t, items, {here: true, fromBasket: true});
    }

    /* ═════════════ 📥 « Prendre depuis… » ═════════════ */
    const TABS = [['basket', '🧺', 'Panier'], ['recent', '🕘', 'Récents'], ['person', '👤', 'Fiches'], ['event', '📅', 'Événements'], ['act', '📜', 'Actes'], ['source', '🔖', 'Sources'], ['media', '🖼', 'Médias'], ['note', '📝', 'Notes'], ['place', '📍', 'Lieux'], ['data', '🧰', 'Données'], ['lists', '📋', 'Listes'], ['outside', '📂', 'De l’extérieur']];
    const PS = ext.pickSources = ext.pickSources || [];
    let takeState = null;
    /** la destination « ici » (l'écran ouvert qui sait recevoir) */
    const hereDest = () => DT.find(t => t.id !== 'basket' && (!t.enabled || t.enabled() !== false) && hereOf(t)) || null;
    async function openTake({tab = '', dest = null} = {}) {
        if (!enabled()) return;
        if (kiosk()) return toast(T('Mode consultation : rien ne peut être modifié.'));
        const target = dest || hereDest();
        const st = takeState = {tab: tab || (count ? 'basket' : 'person'), q: '', picked: new Map(), results: [], target, ctx: target ? hereOf(target) : null, preview: null};
        const dlg = document.createElement('dialog'); dlg.className = 'modal cx-modal cx-take';
        const tabs = TABS.filter(([k]) => !target?.kinds || ['basket', 'recent', 'data', 'lists', 'outside'].includes(k) || target.kinds.includes(k));
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">📥 ${esc(T('PRENDRE DEPUIS…'))}</span><h2>${esc(target ? st.ctx?.label || T(target.label) : T('Prendre depuis…'))}</h2></div><button type="button" class="icon-button" data-cx-x aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="cx-tabs" role="tablist">${tabs.map(([k, i, l]) => `<button type="button" role="tab" data-cx-tab="${k}">${i} ${esc(T(l))}${k === 'basket' && count ? ` <small>${nf(count)}</small>` : ''}</button>`).join('')}</div>
            <div class="cx-take-body"><div class="cx-left"><input type="search" class="cx-q" data-cx-q placeholder="${esc(T('🔎 Chercher…'))}" aria-label="${esc(T('Chercher'))}"><div class="cx-res" data-cx-res></div></div><div class="cx-prev" data-cx-prev></div></div>
            <div class="modal-actions cx-take-foot"><span data-cx-n class="cx-n"></span><span class="spacer"></span>
                <button type="button" class="button secondary" data-cx-tobasket>🧺 ${esc(T('Au panier'))}</button>
                <button type="button" class="button secondary" data-cx-toput>📍 ${esc(T('Mettre dans…'))}</button>
                ${target ? `<button type="button" class="button" data-cx-takehere>📥 ${esc(T('Prendre'))} <span data-cx-n2></span></button>` : ''}</div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => { dlg.remove(); if (takeState === st) takeState = null; }); dlg.showModal();
        st.dlg = dlg;
        dlg.querySelector('[data-cx-x]').addEventListener('click', () => dlg.close());
        dlg.querySelectorAll('[data-cx-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.cxTab; st.q = ''; dlg.querySelector('[data-cx-q]').value = ''; drawTab(st); }));
        let tm = 0; dlg.querySelector('[data-cx-q]').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value.trim(); drawTab(st); }, 220); });
        dlg.querySelector('[data-cx-q]').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
        const picked = () => [...st.picked.values()];
        dlg.querySelector('[data-cx-tobasket]').addEventListener('click', async () => { const p = picked(); if (!p.length) return toast(T('Coche d’abord ce que tu prends.')); dlg.close(); await take(p); });
        dlg.querySelector('[data-cx-toput]').addEventListener('click', e => { const p = picked(); if (!p.length) return toast(T('Coche d’abord ce que tu prends.')); dlg.close(); putInto(p, {anchor: e.currentTarget, fromBasket: p.every(x => x.id && st.fromBasket?.has(x.id))}); });
        dlg.querySelector('[data-cx-takehere]')?.addEventListener('click', async () => { const p = picked(); if (!p.length) return toast(T('Coche d’abord ce que tu prends.')); dlg.close(); await deliver(target, p, {here: true, fromBasket: p.some(x => x.id && st.fromBasket?.has(x.id)), original: p}); });
        drawTab(st);
        return st;
    }
    const pickKey = it => `${it.kind}|${it.ref_id || 0}|${it.title}|${it.value || ''}|${it.id || ''}`;
    function paintCount(st) { const n = st.picked.size; st.dlg.querySelector('[data-cx-n]').textContent = n ? T('{n} cochées', {n: nf(n)}) : ''; const n2 = st.dlg.querySelector('[data-cx-n2]'); if (n2) n2.textContent = n ? `(${nf(n)})` : ''; }
    function resultsHtml(st, list) {
        st.results = list;
        if (!list.length) return `<p class="muted cx-none">${esc(st.q ? T('Rien trouvé.') : T('Rien ici pour l’instant.'))}</p>`;
        return `<ul class="cx-rlist">${list.map((it, i) => `<li data-cx-r="${i}" class="${st.picked.has(pickKey(it)) ? 'is-on' : ''}"><label class="cx-chk"><input type="checkbox" data-cx-ri="${i}" ${st.picked.has(pickKey(it)) ? 'checked' : ''} aria-label="${esc(T('Prendre'))}"></label><span class="cx-ico" aria-hidden="true">${icon(it)}</span><button type="button" class="cx-rt" data-cx-see="${i}"><b>${esc(it.title)}</b>${it.kind === 'set' ? ` <small class="cx-n">${esc(plural(setCount(it), T('ligne')))}</small>` : ''}${it.value && it.kind !== 'set' ? `<small>${esc(String(it.value).slice(0, 140))}</small>` : ''}</button></li>`).join('')}</ul>`;
    }
    function bindResults(st, host) {
        host.querySelectorAll('[data-cx-ri]').forEach(b => b.addEventListener('change', () => { const it = st.results[Number(b.dataset.cxRi)]; if (!it) return; const k = pickKey(it); if (b.checked) st.picked.set(k, it); else st.picked.delete(k); b.closest('li')?.classList.toggle('is-on', b.checked); paintCount(st); }));
        host.querySelectorAll('[data-cx-see]').forEach(b => b.addEventListener('click', () => previewItem(st, st.results[Number(b.dataset.cxSee)])));
    }
    /** l'aperçu : ce que c'est, ↗ ouvrir, et chaque morceau à prendre tout seul (une info précise) */
    function previewItem(st, it) {
        const box = st.dlg.querySelector('[data-cx-prev]'); if (!it) { box.innerHTML = ''; return; }
        const parts = it.kind === 'set' ? [] : [it.title, ...String(it.value || '').split(/\s+·\s+|\n/)].map(s => s.trim()).filter((s, i, a) => s && a.indexOf(s) === i).slice(0, 20);
        box.innerHTML = `<h4>${icon(it)} ${esc(it.title)}</h4>${it.kind === 'set' ? `<div class="cx-set">${setTable(it, 30)}</div>` : ''}
            ${parts.length > 1 ? `<p class="muted"><small>${esc(T('Prendre seulement une info précise :'))}</small></p><ul class="cx-parts">${parts.map((p, i) => `<li><label class="checkbox-line"><input type="checkbox" data-cx-part="${i}"> ${esc(p)}</label></li>`).join('')}</ul>` : ''}
            ${it.origin?.url || it.origin?.open || it.ref_id ? `<p><button type="button" class="link-button" data-cx-open>↗ ${esc(T('ouvrir'))}</button></p>` : ''}`;
        box.querySelectorAll('[data-cx-part]').forEach(b => b.addEventListener('change', () => {
            const p = parts[Number(b.dataset.cxPart)], d = {kind: 'datum', title: `${it.title}`.slice(0, 200), value: p, ref_id: 0, origin: {...(it.origin || {}), kind: it.origin?.kind || it.kind, id: it.origin?.id || it.ref_id, label: it.origin?.label || `${KIND[it.kind]?.[1] || ''} « ${it.title} »`}};
            const k = pickKey(d); if (b.checked) st.picked.set(k, d); else st.picked.delete(k); paintCount(st);
        }));
        box.querySelector('[data-cx-open]')?.addEventListener('click', () => openOrigin(it));
    }
    const setTable = (it, max = 200) => { const d = it.data || {}; return `<table class="data-table cx-tbl"><thead><tr>${(d.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(d.rows || []).slice(0, max).map(r => `<tr>${(r || []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${(d.rows || []).length > max ? `<p class="muted">${esc(T('… et {n} autres lignes', {n: nf(d.rows.length - max)}))}</p>` : ''}<p class="muted"><small>${esc(T('Source :'))} ${esc([d.source, d.licence].filter(Boolean).join(' — '))}${d.url ? ` <a href="${esc(d.url)}" target="_blank" rel="noopener">↗ ${esc(T('source'))}</a>` : ''}${d.criteria ? ` · ${esc(d.criteria)}` : ''}</small></p>`; };

    async function drawTab(st) {
        const dlg = st.dlg; dlg.querySelectorAll('[data-cx-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cxTab === st.tab)));
        const res = dlg.querySelector('[data-cx-res]'), q = dlg.querySelector('[data-cx-q]'), prev = dlg.querySelector('[data-cx-prev]');
        q.hidden = ['data', 'lists', 'outside'].includes(st.tab); prev.innerHTML = '';
        res.innerHTML = UI().spinner ? UI().spinner(T('Chargement…'), {inline: true}) : '…';
        const seq = st.seq = (st.seq || 0) + 1, mine = () => seq === st.seq && st.dlg.isConnected;
        let list = [];
        try {
            if (st.tab === 'basket') { const b = await loadBasket(true); list = (b.items || []).filter(x => !st.q || fold(itemLine(x)).includes(fold(st.q))); st.fromBasket = new Set(list.map(x => x.id)); }
            else if (st.tab === 'recent') list = (readJ(RECENT, []) || []).filter(x => !st.q || fold(itemLine(x)).includes(fold(st.q)));
            else if (st.tab === 'note') { const r = await api('cx_notes', {q: st.q}); list = (r.items || []).map(n => ({kind: 'note', ref_id: Number(n.id), title: n.title || String(n.body || '').slice(0, 80), value: String(n.body || '').slice(0, 600), origin: n.person_name ? {kind: 'person', id: Number(n.entity_id), person_id: Number(n.entity_id), label: T('Fiche de {n}', {n: n.person_name})} : null})); }
            else if (['person', 'event', 'act', 'source', 'media', 'place'].includes(st.tab)) {
                const r = await api('picker_search', {kind: st.tab, q: st.q, limit: 40});
                list = (r.groups || []).flatMap(g => g.items || []).map(x => ({kind: st.tab, ref_id: Number(x.id) || 0, title: x.title || '', value: [x.sub, x.badge].filter(Boolean).join(' · '),
                    data: st.tab === 'media' ? {filename: x.filename || String(x.thumb || '').replace(/^media\//, '').split('?')[0]} : st.tab === 'place' && x.lat != null ? {lat: x.lat, lon: x.lon} : null,
                    origin: st.tab === 'person' ? {kind: 'person', id: Number(x.id), person_id: Number(x.id), label: x.title} : x.person_id ? {kind: 'person', person_id: Number(x.person_id), label: x.person_name || ''} : {kind: st.tab, id: Number(x.id), label: `${KIND[st.tab][1]} « ${x.title} »`}}));
            }
            else if (st.tab === 'data') { if (mine()) await drawData(st, res); return; }
            else if (st.tab === 'lists') { if (mine()) drawLists(st, res); return; }
            else if (st.tab === 'outside') { if (mine()) drawOutside(st, res); return; }
        } catch (e) { if (mine()) res.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
        if (!mine()) return;
        if (st.target?.kinds) list = list.filter(x => st.target.kinds.includes(x.kind) || x.kind === 'set');
        res.innerHTML = resultsHtml(st, list); bindResults(st, res);
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
        res.innerHTML = `<label class="cx-dsel">${esc(T('Une source de données'))}<select data-cx-ds><option value="">${esc(T('— choisir —'))}</option>${groups.map(g => `<optgroup label="${esc(T(g))}">${all.filter(d => (d.group || T('Autres')) === g).map(d => `<option value="${esc(d.id)}" ${cur?.id === d.id ? 'selected' : ''}>${esc(`${d.icon || '🧰'} ${T(d.label)}`)}</option>`).join('')}</optgroup>`).join('')}</select></label><div data-cx-dform></div>`;
        res.querySelector('[data-cx-ds]').addEventListener('change', e => { st.dataId = e.target.value; drawData(st, res); });
        if (!cur) return;
        const host = res.querySelector('[data-cx-dform]');
        let ok = true; try { ok = typeof cur.installed === 'function' ? (await cur.installed()) !== false : true; } catch (_) { ok = true; }
        if (!ok) {
            host.innerHTML = `<p class="cx-notinst">${esc(T('Ces données ne sont pas encore installées sur cet ordinateur.'))}</p>${cur.install && !kiosk() ? `<button type="button" class="button small" data-cx-install>⤓ ${esc(T('Installer'))}</button>` : ''}`;
            host.querySelector('[data-cx-install]')?.addEventListener('click', () => { st.dlg.close(); try { cur.install(); } catch (e) { toast(e.message, 'error'); } });
            return;
        }
        const needs = Array.isArray(cur.needs) ? cur.needs : [];
        const v = st.dataCtx = st.dataCtx || {};
        const PK = window.LCNDA_PICKER || A();
        if (st.ctx?.placeText && !v.place && needs.includes('place')) v.place = await placeByName(st.ctx.placeText); // l'élément ouvert (Atelier) donne son lieu
        if (st.ctx?.date && !v.date) v.date = st.ctx.date;
        host.innerHTML = `<div class="cx-dform">${needs.includes('person') ? `<label><span class="pk-lab">${esc(T('Personne'))}</span>${PK.pickerField?.({name: 'cx_person', hiddenName: false, kind: 'person', value: v.person || null, inline: true}) || ''}</label>` : ''}
            ${needs.includes('place') ? `<label><span class="pk-lab">${esc(T('Lieu'))}</span>${PK.pickerField?.({name: 'cx_place', hiddenName: false, kind: 'place', value: v.place || null, inline: true}) || ''}</label>` : ''}
            ${needs.includes('year') ? `<label>${esc(T('Année'))}<input type="number" min="1" max="2100" name="cx_year" value="${esc(v.year || '')}"></label>` : ''}
            ${needs.includes('date') ? `<label>${esc(T('Date'))}<input type="date" name="cx_date" value="${esc(v.date || '')}"></label>${cur.range ? `<label>${esc(T('… jusqu’au (pour une période)'))}<input type="date" name="cx_to" value="${esc(v.to || '')}"></label>` : ''}` : ''}
            <button type="button" class="button small" data-cx-run>${esc(T('Voir'))}</button></div><div class="cx-dout" data-cx-dout></div>`;
        const f = host.querySelector('.cx-dform');
        f.addEventListener('picker-change', e => { const k = e.target.closest?.('.pk')?.dataset?.picker || ''; const it = e.detail?.item || null; if (k === 'person') v.person = it; else if (k === 'place') v.place = it; });
        // l'élément ouvert de l'Atelier (ou l'écran) donne déjà sa date et son lieu ?
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
                items = lines.map(l => ({kind: 'data', title: l.text.slice(0, 120), value: l.text, origin: {label, url: l.url || firstUrl}}));
                if (items.length > 1) items.push({kind: 'set', title: label, value: '', data: {icon: d.icon, columns: [T('Info'), T('Source')], rows: lines.map(l => [l.text, l.url || firstUrl]), source: d.source || label, url: firstUrl, criteria: [placeLabel, ctx.year].filter(Boolean).join(', ')}, origin: {label, url: firstUrl}});
            }
            if (!items.length) { out.innerHTML = `<p class="muted">${esc(T('Rien trouvé pour ces critères.'))}</p>`; return; }
            out.innerHTML = `<p class="muted"><small>${esc(T('Coche une info précise, ou « ▦ Tout » (un tableau sourcé) :'))}</small></p><div data-cx-dres></div>`;
            const box = out.querySelector('[data-cx-dres]');
            box.innerHTML = resultsHtml(st, items.sort((a, b) => (a.kind === 'set') - (b.kind === 'set')).map(x => (x.kind === 'set' ? {...x, title: `▦ ${T('Tout')} : ${x.title}`} : x)));
            bindResults(st, box);
            const set = st.results.find(x => x.kind === 'set'); if (set) previewItem(st, set);
        } catch (e) { out.innerHTML = `<p class="error">${esc(e.notInstalled ? T('Ces données ne sont pas encore installées sur cet ordinateur.') : e.message)}</p>`; }
    }
    const frDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return String(s || ''); const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}); };
    /** le texte d'un résultat affiché → ses lignes (une info chacune, avec son lien ↗ s'il y en a un) */
    function linesOf(host) {
        const skip = '.muted small, script, style, button, [hidden], .ui-spinner, .skeleton';
        const blocks = [...host.querySelectorAll('li, tr, p, dd, .wx-norm, .hist-life > div, [class*="-line"], [class*="-row"]')].filter(b => !b.closest(skip) && !b.querySelector('li, tr, p, dd'));
        const out = [], seen = new Set();
        (blocks.length ? blocks : [host]).forEach(b => {
            const c = b.cloneNode(true); c.querySelectorAll('button, script, style').forEach(x => x.remove());
            const text = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').replace(/↗\s*source/gi, '').trim();
            if (text.length < 3 || text.length > 1000 || seen.has(text)) return; seen.add(text);
            out.push({text, url: b.querySelector('a[href^="http"]')?.href || ''});
        });
        return out.slice(0, 200);
    }

    /* ── 📋 Listes : le moteur des Listes de données tel quel (critères, période, autour de, territoires) ── */
    function drawLists(st, res) {
        const lists = (ext.dataListsEngine?.list?.() || []).filter(d => !d.link && (!d.enabled || d.enabled() !== false));
        res.innerHTML = `<div class="cx-ask"><label>${esc(T('Dis ce qu’il te faut :'))}<input type="search" data-cx-ask placeholder="${esc(T('ex. les décès à Tulle du 1er au 30 juin 1980 · les châteaux à 4 km de Brive'))}"></label><button type="button" class="button small" data-cx-askgo>${esc(T('Chercher'))}</button><p class="muted" data-cx-askmsg><small>${esc(T('Ou choisis une liste : elle s’ouvre avec tous ses critères (période, commune, « autour de… », territoire), puis « 🧺 Prendre… ».'))}</small></p></div>
            <ul class="cx-rlist cx-lists">${lists.map(d => `<li><button type="button" class="cx-rt" data-cx-list="${esc(d.id)}"><b>${esc(`${d.icon || '📋'} ${T(d.label)}`)}</b><small>${esc(T(d.group || ''))}${d.source ? ` · ${esc(d.source)}` : ''}</small></button></li>`).join('')}</ul>`;
        const go = (id, preset) => { const tgt = st.target, ctx = st.ctx; st.dlg.close(); listTake = {target: tgt, ctx, id}; ext.dataListsEngine.open(id, preset || null); };
        res.querySelectorAll('[data-cx-list]').forEach(b => b.addEventListener('click', () => go(b.dataset.cxList)));
        const ask = async () => {
            const q = res.querySelector('[data-cx-ask]').value.trim(); if (!q) return;
            const msg = res.querySelector('[data-cx-askmsg]');
            const r = await parseAsk(q, lists);
            if (!r) { msg.innerHTML = `<small>${esc(T('Je n’ai pas compris quelle liste : choisis-la ci-dessous.'))}</small>`; return; }
            go(r.id, r.preset);
        };
        res.querySelector('[data-cx-askgo]').addEventListener('click', ask);
        res.querySelector('[data-cx-ask]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
    }
    let listTake = null; // {target, ctx, id} : « Prendre depuis… » a ouvert une liste ; on revient déposer
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
    async function parseAsk(q, lists) {
        const f = fold(q);
        let d = null;
        for (const [re, ids] of SYN) if (re.test(f)) { d = lists.find(x => ids.includes(x.id)); if (d) break; }
        if (!d) d = lists.map(x => ({x, n: fold(x.label).split(/[^a-z]+/).filter(w => w.length > 3 && f.includes(w.replace(/s$/, ''))).length})).sort((a, b) => b.n - a.n).find(z => z.n)?.x || null;
        if (!d) return null;
        const preset = {q: '', crit: [], period: null, near: null};
        const dt = parseDates(q), fields = d.fields || [];
        const dateField = fields.find(x => x.type === 'date' && /deces|date|jour/.test(fold(x.key + ' ' + x.label))) || fields.find(x => x.type === 'date');
        if (dt?.from && dateField) preset.crit.push({key: dateField.key, kind: 'daterange', from: dt.from, to: dt.to});
        else if (dt && d.period) { const a = dt.yfrom || Number(dt.from.slice(0, 4)), b = dt.yto || Number(dt.to.slice(0, 4)); preset.period = a === b ? {mode: 'in', from: a, to: a} : {mode: 'overlap', from: a, to: b}; }
        const near = f.match(/a (\d+(?:[.,]\d+)?) ?km (?:de|d |autour de|du|des) ?([a-z' -]+?)(?: du | de | en | entre |$)/) || f.match(/autour de ([a-z' -]+?)(?: du | en |$)/);
        if (near && d.geo) {
            const km = near.length > 2 ? Number(String(near[1]).replace(',', '.')) : 10, name = (near.length > 2 ? near[2] : near[1]).trim();
            const pl = await placeByName(name); if (pl?.lat != null) preset.near = {lat: pl.lat, lon: pl.lon, km, title: String(pl.title || name).replace(/\s*\(.*\)$/, '')};
        } else {
            const m = f.match(/ (?:a|dans|sur la commune de) ([a-z][a-z' -]+?)(?: du | de \d| en | entre | au |$)/);
            const placeField = fields.find(x => x.type === 'place' && /deces|commune/.test(fold(x.key))) || fields.find(x => x.type === 'place');
            if (m && placeField) { const words = q.slice(f.indexOf(m[1])).split(/\s+/).slice(0, m[1].trim().split(/\s+/).length).join(' '); preset.crit.push({key: placeField.key, kind: 'place', value: words.replace(/^(.)/, c => c.toUpperCase())}); }
        }
        return {id: d.id, preset};
    }
    /** la barre « 🧺 Prendre… » de la page d'une liste (appelée par app-listes-donnees.js) */
    function listBar(page, L) {
        if (!enabled() || !page) return;
        const send = page.querySelector('[data-ld-save]'); // dans la barre des critères (toujours visible)
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ui-listbar-btn'; btn.dataset.ldTake = '';
        btn.textContent = `🧺 ${T('Prendre…')}`; btn.title = T('Mettre les lignes trouvées (avec leurs critères et leur source) au panier, ou dans une enquête, l’Atelier…');
        if (send) send.after(btn); else page.querySelector('.ld-bar-row')?.prepend(btn);
        const back = listTake && listTake.id === L.d.id ? listTake : null;
        if (back?.target) {
            const bar = document.createElement('div'); bar.className = 'cx-ltake'; bar.setAttribute('role', 'note');
            bar.innerHTML = `<span>📥 ${esc(T('Prendre depuis cette liste pour « {t} » : choisis les critères, puis', {t: back.ctx?.label || T(back.target.label)}))}</span><button type="button" class="button small" data-cx-ltake>📥 ${esc(T('Tout prendre'))}</button><button type="button" class="link-button" data-cx-lx>✕</button>`;
            page.querySelector('.ld-bar')?.before(bar);
            bar.querySelector('[data-cx-lx]').addEventListener('click', () => { listTake = null; bar.remove(); });
            bar.querySelector('[data-cx-ltake]').addEventListener('click', async () => { const it = await listSet(L); if (!it) return; const r = await deliver(back.target, [it], {}); if (r) { listTake = null; bar.remove(); } });
        }
        btn.addEventListener('click', async () => {
            const n = L.total?.() || 0;
            UI().menuAt?.(btn, [
                {icon: '▦', label: T('Tout au panier, comme un ensemble ({n} lignes)', {n: nf(n)}), run: async () => { const it = await listSet(L); if (it) take([it]); }},
                n <= 300 ? {icon: '🧺', label: T('Au panier, ligne par ligne ({n})', {n: nf(n)}), run: async () => { const it = await listSet(L); if (it) take(explode(it)); }} : null,
                {icon: '📍', label: T('Mettre dans…'), run: async () => { const it = await listSet(L); if (it) putInto([it], {anchor: btn}); }},
            ].filter(Boolean), {title: T('Prendre les lignes trouvées')});
        });
    }
    /** les lignes trouvées → un ensemble sourcé, qui garde sa demande (pour la relancer) */
    async function listSet(L) {
        let rows; try { rows = await L.allRows(); } catch (e) { toast(e.message, 'error'); return null; }
        if (!rows.length) { toast(T('Aucune ligne trouvée avec ces critères.')); return null; }
        const t2 = L.table2d(rows.slice(0, 5000)), crit = L.critSummary(), d = L.d;
        return {kind: 'set', title: `${d.icon || '📋'} ${T(d.label)}${crit ? ` — ${crit}` : ''}`, value: '',
            data: {icon: d.icon || '📋', columns: t2[0], rows: t2.slice(1), source: d.source || T(d.label), url: d.sourceUrl || '', criteria: crit, request: {list: d.id, state: L.state()}, taken: new Date().toISOString().slice(0, 10)},
            origin: {kind: 'list', id: d.id, label: `${T('Listes')} · ${T(d.label)}`, url: d.sourceUrl || '', open: {list: d.id, preset: L.state()}}};
    }

    /* ── 📂 De l'extérieur : un fichier, un tableau collé, l'adresse d'un fichier de données, une image ou un PDF ── */
    function drawOutside(st, res) {
        res.innerHTML = `<div class="cx-out">
            <label class="button small secondary cx-file">📄 ${esc(T('Un fichier (CSV, TSV, XLSX, ODS, JSON)…'))}<input type="file" data-cx-file accept=".csv,.tsv,.txt,.json,.xlsx,.ods" hidden></label>
            <label class="button small secondary cx-file">🖼 ${esc(T('Une image ou un PDF (comme pièce)…'))}<input type="file" data-cx-media accept="image/*,application/pdf" hidden></label>
            <details><summary>📋 ${esc(T('Coller un tableau (copié d’un site, d’un PDF, d’Excel)'))}</summary><textarea data-cx-paste rows="5" placeholder="${esc(T('Colle ici les lignes, la première avec les titres des colonnes'))}"></textarea><button type="button" class="button small" data-cx-pastego>${esc(T('Lire le tableau'))}</button></details>
            <details><summary>🌐 ${esc(T('L’adresse d’un fichier de données (CSV, JSON)'))}</summary><input type="url" data-cx-url placeholder="https://…/donnees.csv"><button type="button" class="button small" data-cx-urlgo>⤓ ${esc(T('Télécharger ce fichier'))}</button><small class="muted">${esc(T('Seulement un fichier de données (pas une page web) ; téléchargé une fois, quand tu cliques.'))}</small></details>
            <div data-cx-imp></div></div>`;
        const imp = res.querySelector('[data-cx-imp]');
        const SH = () => window.LCNDA_SHEET;
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
        void SH;
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
                <p class="muted"><small>${esc(T('⇧⌘O était déjà pris (écran divisé) : le raccourci de départ est ⌥⌘O (Ctrl+Alt+O sous Windows et Linux).'))}</small></p></div></section>`;
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
    ext.connexions = {courrierReplied, leadTarget, pisteDest, linksHtml, enabled, settings, take, putInto, deliver, openTake, openBasket, addMenuItems, emptyHere, chooseInvestigation, listBar, itemText, explode, parseAsk, parseDates, screenOrigin, openOrigin, ctxItems,
        count: () => count, refresh: () => { basket = null; return api('cx_count', {basket_id: curBasket()}).then(setCountFrom); }, KIND};
})();
