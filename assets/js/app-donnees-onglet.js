/* LCNDA — 📊 L'onglet Données du haut : tout ce qu'on y ouvre Y RESTE (demande du 2026-11-26).
 *
 *  - Un thème, une liste réunie 🔀, une liste, « Les N listes », « ← Tous les thèmes » : même moteur, même dessin que Listes
 *    (LCNDA_EXT.dataListsEngine + app-listes-themes.js) ; seul l'hôte change. Le moteur demande ici quand l'onglet est ouvert
 *    (openKey → donneesOnglet.open) : le module reste « donnees », le fil d'Ariane dit « 📊 Données · ⚔️ Guerres et soldats ».
 *  - L'adresse : « #donnees », « #donnees/themes », « #donnees/data_theme_guerres », « #donnees/data_bo_mpf » (liens, ← → du navigateur).
 *  - La colonne de gauche : 📊 Récap, 🧰 Tous les thèmes, puis les 20 thèmes en groupes repliables (le même dessin que les groupes de
 *    Listes : details.mt-group, app-sidegroups.js / app.css) ; dans chaque groupe : le thème entier, ses listes réunies 🔀, ses listes.
 *    Replié / ouvert : retenu pour chaque thème ; le groupe de la page ouverte s'ouvre tout seul.
 *  - Ranger les thèmes : ⠿ glisser un groupe, Alt + ↑ ↓ sur son titre, « ⋯ » (monter, descendre, masquer), « Réordonner » (↑ ↓, ⠿ par
 *    heritage-dnd.js, cases à cocher) ; « Afficher les thèmes masqués » ; « ↺ Rétablir l'ordre de départ » ; ↶ Annuler (A().undoToast).
 *    Le même ordre et les mêmes thèmes masqués pour les cartes de « Toutes les données » (aux deux portes : c'est le même écran).
 *    La colonne de Listes garde son propre rangement (« Réordonner » de Listes, genealogie-list-groups) : rien n'y change.
 *  Réglages : genealogie-donnees-themes {order: [id], hidden: [id]} ; genealogie-donnees-themes-ouverts {id: true|false} ;
 *    lcnda-donnees-ouvert (la page ouverte, sur ce navigateur) ; lcnda-donnees-voir-masques ('1').
 *  API : LCNDA_EXT.donneesOnglet = {sidebar, open, current, hash, ordered, prefs, arrangeCards, openDialog, reset}.
 *  Essai : tests/test-donnees-onglet.js
 */
(() => {
    'use strict';
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP || {};
    const E = () => ext.dataListsEngine || {};
    const TH = () => ext.listesThemes || null;
    const H = () => ext.dataHome || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
    const writeLS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (_) {} };
    const readJ = (k, d) => { try { const v = JSON.parse(readLS(k, 'null')); return v ?? d; } catch (_) { return d; } };
    const MOD = 'donnees', OVERVIEW = 'donnees', TKEY = 'data_theme_', RECAP = 'dno_recap', ALL = 'dno_themes';
    const K_THEMES = 'genealogie-donnees-themes', K_FOLD = 'genealogie-donnees-themes-ouverts', K_OPEN = 'lcnda-donnees-ouvert', K_SHOW = 'lcnda-donnees-voir-masques';
    const okKey = k => /^data_\w{1,120}$/.test(String(k || ''));

    /* ═════════════ l'ordre et les thèmes masqués (un seul réglage) ═════════════ */
    function prefs() {
        const p = readJ(K_THEMES, {}) || {}, ids = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && /^\w{1,40}$/.test(x)) : []);
        return {order: [...new Set(ids(p.order))], hidden: [...new Set(ids(p.hidden))]};
    }
    const savePrefs = p => writeLS(K_THEMES, p.order.length || p.hidden.length ? JSON.stringify({order: p.order, hidden: p.hidden}) : null);
    /** les thèmes dans l'ordre choisi ; un thème nouveau se met à sa place de départ (après son voisin de départ) */
    function ordered(list) {
        const base = [...(list || [])], o = prefs().order.filter(id => base.some(t => t.id === id)); if (!o.length) return base;
        const res = [...o];
        base.forEach((t, i) => { if (res.includes(t.id)) return; const prev = base.slice(0, i).reverse().find(x => res.includes(x.id)); res.splice(prev ? res.indexOf(prev.id) + 1 : 0, 0, t.id); });
        return res.map(id => base.find(t => t.id === id));
    }
    const isHidden = id => prefs().hidden.includes(id);
    const showHidden = () => readLS(K_SHOW, '') === '1';
    const allThemes = () => ordered(TH()?.themeList?.() || []);
    const changed = () => { const p = prefs(); return !!(p.order.length || p.hidden.length); };
    /** changer l'ordre ou les masqués, avec ↶ Annuler */
    function commit(msg, mutate) {
        if (kiosk()) return false;
        const before = readLS(K_THEMES, null), p = prefs(), cur = allThemes().map(t => t.id);
        if (!p.order.length) p.order = cur;
        if (mutate(p, cur) === false) return false;
        if (cur.length && cur.every(id => p.hidden.includes(id))) { A().toast?.(T('Garde au moins un thème visible.'), 'error'); return false; }
        if (p.order.join() === (TH()?.themeList?.() || []).map(t => t.id).join()) p.order = []; // l'ordre de départ : rien à garder
        savePrefs(p); refresh();
        if (A().undoToast) A().undoToast(msg, {undo: () => { writeLS(K_THEMES, before); refresh(); }}); else A().toast?.(msg);
        return true;
    }
    function move(id, to) {
        return commit(T('Thèmes rangés'), (p, cur) => { const order = p.order.filter(x => cur.includes(x)); cur.forEach(x => { if (!order.includes(x)) order.push(x); });
            const i = order.indexOf(id); if (i < 0 || to < 0 || to >= order.length || to === i) return false; order.splice(i, 1); order.splice(to, 0, id); p.order = order; });
    }
    const setHidden = (id, hide) => { const t = TH()?.themes?.().find(x => x.id === id); const name = t ? `${t.icon} ${T(t.label)}` : id;
        return commit(hide ? T('« {t} » masqué', {t: name}) : T('« {t} » affiché', {t: name}), p => { p.hidden = hide ? [...new Set([...p.hidden, id])] : p.hidden.filter(x => x !== id); }); };
    const reset = () => (changed() ? commit(T('L’ordre de départ des thèmes est revenu'), p => { p.order = []; p.hidden = []; }) : false);
    function refresh() {
        try { if (A().state?.module === MOD) A().renderSidebar?.(); } catch (e) { console.error(e); }
        document.querySelectorAll('#workspace .ldt-overview').forEach(arrangeCards);
    }

    /** « Toutes les données » : les cartes des thèmes dans le même ordre, les masquées cachées (sauf « Afficher les thèmes masqués ») */
    function arrangeCards(box) {
        const grid = box?.querySelector?.('[data-ldt-themes]'); if (!grid) return;
        const cards = [...grid.querySelectorAll(':scope > [data-ldt-theme]')], by = new Map(cards.map(c => [c.dataset.ldtTheme, c]));
        const want = ordered(cards.map(c => ({id: c.dataset.ldtTheme}))).map(t => by.get(t.id));
        if (want.some((c, i) => c !== cards[i])) want.forEach(c => grid.appendChild(c));
        const hid = new Set(prefs().hidden), show = showHidden();
        cards.forEach(c => { const h = hid.has(c.dataset.ldtTheme); c.hidden = h && !show; c.classList.toggle('dno-is-hidden', h); });
    }

    /* ═════════════ la page ouverte dans l'onglet, et son adresse ═════════════ */
    let cur = okKey(readLS(K_OPEN, '')) ? readLS(K_OPEN, '') : '', lastHash = '';
    const view = () => (H()._st?.view === 'themes' ? 'themes' : 'recap');
    const hashFor = () => (cur ? `#${MOD}/${encodeURIComponent(cur)}` : view() === 'themes' ? `#${MOD}/themes` : `#${MOD}`);
    const setCur = k => { cur = okKey(k) ? k : ''; writeLS(K_OPEN, cur || null); };
    /** app.js moduleHash : une adresse venue d'ailleurs (lien, ← →) est adoptée ; sinon, celle de la page ouverte */
    function hash() {
        const h = location.hash, m = h.match(/^#donnees(?:\/([^/?#]*))?\/?$/);
        if (m && h !== lastHash) {
            let v = ''; try { v = decodeURIComponent(m[1] || ''); } catch (_) {}
            if (v === 'themes') { setCur(''); if (H()._st) H()._st.view = 'themes'; }
            else if (v === 'recap') { setCur(''); if (H()._st) H()._st.view = 'recap'; }
            else setCur(okKey(v) ? v : '');
        }
        lastHash = hashFor(); return lastHash;
    }
    /** ouvrir dans l'onglet : une page de liste ou de thème, « donnees » (= ← Tous les thèmes), le récap */
    function open(k) {
        const st = A().state; if (!st) return;
        if (k === RECAP) { setCur(''); if (H()._st) { H()._st.view = 'recap'; } }
        else if (k === ALL || k === OVERVIEW || !okKey(k)) { setCur(''); if (H()._st) H()._st.view = 'themes'; }
        else setCur(k);
        if (st.module !== MOD) { A().setModule?.(MOD); return; }
        const h = hashFor();
        if (location.hash !== h) { try { history.pushState(null, '', location.pathname + location.search + h); } catch (_) {} }
        lastHash = h;
        A().renderSidebar?.();
        const w = document.getElementById('workspace'); if (w) w.scrollTop = 0;
        return H().render?.(++st.workspaceToken);
    }
    const current = () => cur;
    /** l'écran de l'onglet : la page ouverte (même moteur que Listes), sinon le récap / les thèmes (app-donnees-accueil.js) */
    function wrapRender() {
        const home = ext.dataHome; if (!home || home.render?.__dno) return !!home;
        const base = home.render;
        const w = async token => {
            if (cur && !ext.lists?.[cur]) { try { E().sync?.(); } catch (_) {} }
            if (cur && ext.lists?.[cur]) return ext.lists[cur](token);
            if (cur) setCur(''); // une liste qui n'existe plus (ou pas encore installée ici) : le récap
            return base(token);
        };
        w.__dno = true; home.render = w; return true;
    }
    if (!wrapRender()) document.addEventListener('DOMContentLoaded', () => { if (!wrapRender()) setTimeout(wrapRender, 300); });

    /* ═════════════ la colonne de gauche ═════════════ */
    const folds = () => { const v = readJ(K_FOLD, {}); return v && typeof v === 'object' ? v : {}; };
    const themeOfKey = k => { if (!k) return ''; if (k.startsWith(TKEY)) return k.slice(TKEY.length); const d = (E().list?.() || []).find(x => E().keyOf?.(x) === k); return d ? TH()?.themeOf?.(d) || '' : ''; };
    function sidebar(content, footer) {
        const sb = A().sideButton; if (!sb || !TH()) { content.innerHTML = ''; return; }
        const all = allThemes(), hid = new Set(prefs().hidden), show = showHidden(), fs = folds();
        const active = cur || (view() === 'themes' ? ALL : RECAP), activeTheme = themeOfKey(cur);
        const I = TH().index(), shownT = all.filter(t => show || !hid.has(t.id));
        const group = t => {
            const ds = (I.by.get(t.id) || []).filter(d => !d.link), mg = ds.filter(d => d.merged), plain = ds.filter(d => !d.merged);
            const keys = [TKEY + t.id, ...[...mg, ...plain].map(d => E().keyOf(d))];
            const open = t.id === activeTheme || fs[t.id] === true;
            let n = 0;
            const items = [sb(esc(TKEY + t.id), esc(t.icon), esc(T('Tout le thème')), active),
                ...mg.map(d => sb(esc(E().keyOf(d)), '🔀', esc(T(d.label)), active)),
                ...plain.map(d => sb(esc(E().keyOf(d)), String(++n).padStart(2, '0'), `${esc(d.icon || '📋')} ${esc(T(d.label))}`, active))].join('');
            return `<details class="mt-group dno-group${hid.has(t.id) ? ' dno-is-hidden' : ''}${t.id === activeTheme ? ' is-current' : ''}" data-mt-group="${esc(t.id)}" data-dno-theme="${esc(t.id)}" ${open ? 'open' : ''}>
                <summary draggable="${kiosk() ? 'false' : 'true'}" data-dno-sum="${esc(t.id)}" title="${esc(T('Glisser pour ranger, ou Alt + flèches'))}"><span class="mt-gicon" aria-hidden="true">${esc(t.icon)}</span><span class="mt-glabel">${esc(T(t.label))}</span>${hid.has(t.id) ? `<span class="ldt-tag dno-hid-tag">${esc(T('masqué'))}</span>` : ''}<small>${nf(ds.length)}</small>${kiosk() ? '' : `<button type="button" class="dno-more" data-dno-more="${esc(t.id)}" aria-label="${esc(T('Ranger ou masquer « {t} »', {t: T(t.label)}))}" aria-haspopup="menu">⋯</button>`}</summary>
                <div class="mt-gitems" data-dno-keys="${esc(keys.join(' '))}">${items}</div></details>`;
        };
        content.innerHTML = `<div class="side-menu mt-groups dno-side" data-dno-side>
            <input type="search" class="mt-search" data-mt-search placeholder="${esc(T('Chercher une liste…'))}" aria-label="${esc(T('Chercher une liste'))}">
            <div class="mt-gitems dno-top">${sb(RECAP, '📊', esc(T('Récap')), active)}${sb(ALL, '🧰', esc(T('Tous les thèmes')), active)}</div>
            ${shownT.map(group).join('')}</div>`;
        const nHid = all.filter(t => hid.has(t.id)).length;
        footer.innerHTML = `<div class="dashboard-footer-actions"><button class="button small secondary" type="button" data-dno-reorder title="${esc(T('L’ordre des thèmes, ceux qui s’affichent'))}">${esc(T('Réordonner'))}</button></div>
            ${nHid ? `<label class="checkbox-line dno-showhid"><input type="checkbox" data-dno-showhid ${show ? 'checked' : ''}> <span>${esc(T('Afficher les thèmes masqués'))} <small class="muted">(${nf(nHid)})</small></span></label>` : ''}
            ${changed() && !kiosk() ? `<button type="button" class="dno-reset button small secondary" data-dno-reset>↺ ${esc(T('Rétablir l’ordre de départ'))}</button>` : ''}`;
        bind(content, footer);
    }
    function bind(content, footer) {
        const signal = A().sidebarSignal?.();
        const on = (el, ev, fn) => el.addEventListener(ev, fn, signal ? {signal} : undefined);
        on(content, 'click', e => {
            const more = e.target.closest('[data-dno-more]'); if (more) { e.preventDefault(); e.stopPropagation(); return themeMenu(more, more.dataset.dnoMore); }
            const sum = e.target.closest('[data-dno-sum]');
            if (sum) { const d = sum.parentElement, id = sum.dataset.dnoSum; const f = folds(); f[id] = !d.open; try { localStorage.setItem(K_FOLD, JSON.stringify(f)); } catch (_) {} return; } // le clic replie ou ouvre : retenu
            const b = e.target.closest('[data-side-value]'); if (b) { e.preventDefault(); open(b.dataset.sideValue); }
        });
        on(content, 'keydown', e => {
            const sum = e.target.closest?.('[data-dno-sum]'); if (!sum || !e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault(); const id = sum.dataset.dnoSum, list = allThemes().map(t => t.id), i = list.indexOf(id);
            if (move(id, i + (e.key === 'ArrowUp' ? -1 : 1))) setTimeout(() => document.querySelector(`[data-dno-sum="${CSS.escape(id)}"]`)?.focus(), 30);
        });
        let dk = '';
        on(content, 'dragstart', e => { const s = e.target.closest?.('[data-dno-sum]'); if (!s || kiosk()) return; dk = s.dataset.dnoSum; s.parentElement.classList.add('is-drag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dk); } catch (_) {} });
        on(content, 'dragover', e => { const g = e.target.closest?.('[data-dno-theme]'); if (!dk || !g) return; e.preventDefault(); content.querySelectorAll('.is-drop').forEach(x => x !== g && x.classList.remove('is-drop')); g.classList.add('is-drop'); });
        on(content, 'drop', e => { const g = e.target.closest?.('[data-dno-theme]'); if (!dk || !g) return; e.preventDefault(); const id = dk; dk = ''; move(id, allThemes().map(t => t.id).indexOf(g.dataset.dnoTheme)); });
        on(content, 'dragend', () => { dk = ''; content.querySelectorAll('.is-drag, .is-drop').forEach(x => x.classList.remove('is-drag', 'is-drop')); });
        const q = content.querySelector('[data-mt-search]');
        on(q, 'input', () => { const v = fold(q.value.trim());
            content.querySelectorAll('[data-dno-theme]').forEach(d => { let any = false; d.querySelectorAll('[data-side-value]').forEach(b => { const hit = !v || fold(`${b.textContent} ${d.querySelector('.mt-glabel')?.textContent || ''}`).includes(v); b.hidden = !hit; any = any || hit; }); d.hidden = !any; if (v && any) d.open = true; }); });
        on(footer, 'click', e => { if (e.target.closest('[data-dno-reorder]')) openDialog(); if (e.target.closest('[data-dno-reset]')) reset(); });
        on(footer, 'change', e => { if (!e.target.matches('[data-dno-showhid]')) return; writeLS(K_SHOW, e.target.checked ? '1' : null); refresh(); });
    }
    function themeMenu(btn, id) {
        const list = allThemes().map(t => t.id), i = list.indexOf(id), hid = isHidden(id);
        const items = [{icon: '↑', label: T('Monter'), disabled: i <= 0, run: () => move(id, i - 1)}, {icon: '↓', label: T('Descendre'), disabled: i >= list.length - 1, run: () => move(id, i + 1)},
            hid ? {icon: '👁', label: T('Afficher ce thème'), run: () => setHidden(id, false)} : {icon: '🙈', label: T('Masquer ce thème'), run: () => setHidden(id, true)},
            '-', {icon: '⇅', label: T('Réordonner…'), run: openDialog}, changed() ? {icon: '↺', label: T('Rétablir l’ordre de départ'), run: reset} : null].filter(Boolean);
        const t = TH()?.themes?.().find(x => x.id === id);
        if (window.LCNDA_UI?.menuAt) window.LCNDA_UI.menuAt(btn, items, {title: t ? `${t.icon} ${T(t.label)}` : ''}); else openDialog();
    }

    /* ═════════════ « Réordonner » : ↑ ↓ (⠿ par heritage-dnd.js), cases à cocher, l'ordre de départ ═════════════ */
    function openDialog() {
        if (kiosk()) return;
        let order = allThemes().map(t => t.id); const hid = new Set(prefs().hidden), byId = new Map(allThemes().map(t => [t.id, t]));
        const dlg = document.createElement('dialog'); dlg.className = 'modal dashboard-reorder-dialog mt-reorder dno-reorder';
        const draw = () => { dlg.querySelector('[data-dno-rows]').innerHTML = order.map((id, i) => { const t = byId.get(id);
            return `<li class="dashboard-reorder-row${hid.has(id) ? ' is-hidden-row' : ''}" data-ii="${i}" data-dno-row="${esc(id)}"><label class="mt-vis" title="${esc(T('Afficher dans la colonne'))}"><input type="checkbox" data-dno-vis="${esc(id)}" ${hid.has(id) ? '' : 'checked'} aria-label="${esc(T('Afficher « {t} »', {t: T(t.label)}))}"></label><span class="order-number">${esc(t.icon)}</span><b style="flex:1">${esc(T(t.label))}</b><span class="order-actions"><button type="button" class="button small secondary" data-move="-1" aria-label="${esc(T('Monter'))}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="button small secondary" data-move="1" aria-label="${esc(T('Descendre'))}" ${i < order.length - 1 ? '' : 'disabled'}>↓</button></span></li>`; }).join(''); };
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">📊 ${esc(T('Données'))}</span><h2>${esc(T('Réordonner les thèmes'))}</h2><p>${esc(T('Range avec ↑ ↓ ou en glissant ⠿, coche ce qui s’affiche. Le même ordre pour les cartes de « Toutes les données ». Puis Enregistrer.'))}</p></div><button class="icon-button" type="button" data-close aria-label="${esc(T('Fermer'))}">×</button></div>
            <div class="dash-reorder-tools"><button type="button" class="button small secondary" data-dno-dreset>↺ ${esc(T('Rétablir l’ordre de départ'))}</button></div>
            <div class="mt-rbody"><section class="mt-rgroup"><ol class="dashboard-reorder-list" data-dno-rows></ol></section></div>
            <div class="modal-actions"><span class="spacer"></span><button class="button secondary" type="button" data-close>${esc(T('Annuler'))}</button><button class="button" type="button" data-save>${esc(T('Enregistrer'))}</button></div>`;
        document.body.append(dlg); draw();
        const close = () => { dlg.close(); dlg.remove(); };
        dlg.addEventListener('change', e => { const id = e.target.dataset?.dnoVis; if (!id) return; if (e.target.checked) hid.delete(id); else hid.add(id); e.target.closest('li')?.classList.toggle('is-hidden-row', !e.target.checked); });
        dlg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-close')) return close();
            if (b.dataset.move) { const i = Number(b.closest('[data-ii]').dataset.ii), j = i + Number(b.dataset.move); if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(); return; }
            if (b.hasAttribute('data-dno-dreset')) { order = (TH()?.themeList?.() || []).map(t => t.id); hid.clear(); draw(); return; }
            if (b.hasAttribute('data-save')) { if (order.every(id => hid.has(id))) return A().toast?.(T('Garde au moins un thème visible.'), 'error');
                if (commit(T('Thèmes rangés'), p => { p.order = [...order]; p.hidden = [...hid]; }) !== false) close(); } });
        dlg.addEventListener('cancel', e => { if (e.target !== dlg) return; e.preventDefault(); close(); });
        dlg.showModal();
    }

    ext.donneesOnglet = {sidebar, open, current, hash, ordered, prefs, isHidden, arrangeCards, openDialog, reset, move, setHidden, K_THEMES};
})();
