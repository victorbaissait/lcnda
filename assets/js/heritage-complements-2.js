/* LCNDA — 🧩 Compléter quatre outils existants (maquette validée docs/design/complements-existants.html), partie 2 :
 *  C 📋 Tous les doutes — Listes → Recherche et organisation → « 📋 Tous les doutes » (nom réglable), 🗓 Ma semaine → « à vérifier »
 *    → « Tout voir → », widget « 📋 Doutes » du tableau de bord. Chaque ligne est lue dans l'outil d'origine (✅ Contrôle,
 *    ⚖️ Hypothèses, 🛡 Liens fragiles, ⚔️ Désaccords de preuve, 📚 Sans source, 🧾 SocFace) et « ↗ » y emmène ; rien n'est recopié.
 *    « 👁 Marquer vu » n'est pas « Ce n'est pas une erreur » (↶ Annuler) ; clic droit ou ⋯ sur une ligne ; glisser vers la gauche
 *    sur téléphone. Barre H10 : chercher, Filtrer ▾ (sorte, personne et ses ancêtres, branche, gravité, vus), Liste | Fiches, Trier.
 *  D 📱 Visite aux archives — Recherche → Que manque-t-il ? → « 🗄 Préparer une visite » ; Listes → Visites d'archives →
 *    « 📱 Emporter sur le téléphone » (un seul fichier .html hors ligne), « ⤒ Rapporter les résultats » (le .zip, revu cote par
 *    cote, ↶ Annuler), « ⤒ Importer les photos du jour » (feuille imprimée + photos rangées par l'heure, réglage).
 * Serveur : lib/doutes.php, lib/visite_mobile.php (par lib/complements.php). La page du téléphone : heritage-complements-core.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, C = () => window.LCNDA_COMPL_CORE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['lists', 'dashboard']) ext[k] = ext[k] || {};
    const X = () => ext.compl || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const plural = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const simple = () => document.documentElement.classList.contains('ms-open');
    const badge = (t, k = 'grey', o = {}) => (UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const cfg = () => X().cfg?.() || C().DEFAULTS;
    const get = (op, q = {}) => A().api('compl', {op, ...q});
    const post = body => X().post(body);
    const fmtDate = iso => (X().fmtDate ? X().fmtDate(iso) : String(iso || ''));
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    /* ═════ C 📋 Tous les doutes ═════ */
    const LIST = 'doutes';
    const SORT = {controle: ['✅', 'Contrôle de la base', '↗ Contrôle'], hypothese: ['⚖️', 'Hypothèse ouverte', '↗ Comparer'], lien: ['🛡', 'Liens fragiles', '↗ Solidité'], preuve: ['⚔️', 'Désaccord de preuve', '↗ Dossier de preuve'],
        source: ['📚', 'Sans source', '↗ Fiche'], socface: ['🧾', 'Lecture SocFace', '↗ Image'], succ: ['⚖️', 'Successoral', '↗ Ouvrir']};
    const LEVEL = {red: ['🔴', 'impossible', 'red'], orange: ['🟠', 'à vérifier', 'yellow'], yellow: ['🟡', 'curieux', 'grey']};
    const NAMES = {all: '📋 Tous les doutes', verify: 'À vérifier', review: 'Points à revoir'};
    const listName = () => NAMES[cfg().doutes_name] || NAMES.all;
    const isHere = token => token === S().workspaceToken && S().module === 'listes' && S().listType === LIST;
    let DATA = null;
    async function load(person = 0, anc = false) { return get('doutes', person ? {person, anc: anc ? 1 : ''} : {}); }
    function openTarget(o) {
        if (!o) return;
        document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
        const st = S();
        if (o.kind === 'controle') return ext.openControle ? ext.openControle({level: o.level || ''}) : (st.maintenanceTab = 'controle', A().setModule('maintenance'));
        if (o.kind === 'hypothese') return ext.hypotheses?.open?.(Number(o.id));
        if (o.kind === 'lien') return ext.preuve?.openLink?.(Number(o.child), Number(o.parent));
        if (o.kind === 'preuve') return ext.preuve?.openCase?.(Number(o.id));
        if (o.kind === 'person' && o.id) { st.currentPersonId = Number(o.id); return A().setModule('personnes'); }
        if (o.kind === 'socface') { st.researchKind = 'socface'; return A().setModule('recherche'); }
        if (o.kind === 'succ') return ext.successoral?.openCase?.(Number(o.id));
    }
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws || !isHere(token)) return;
        await X().loadSet?.();
        const ro = kiosk();
        ws.innerHTML = `<section class="page compl-dt">${UI().pageHeader({title: i18n(listName()), where: i18n('Listes · Recherche et organisation'),
            help: esc(i18n('Chaque ligne est lue dans l’outil d’origine au moment où tu ouvres la liste, et « ↗ » t’y emmène pour décider. Rien n’est copié : corriger dans l’outil fait disparaître la ligne.')),
            actions: ro ? [] : [`<button type="button" class="button secondary" data-dt-csv>${esc(i18n('⤓ Exporter en CSV'))}</button>`],
            more: [`<button type="button" data-dt-set>${esc(i18n('⚙️ Réglages de cet outil'))}</button>`]})}
            <div class="ui-filters compl-dt-pills" role="group" aria-label="${esc(i18n('Sorte'))}" data-dt-pills></div><div data-dt-bar></div><div data-dt-list>${UI().spinner(i18n('Je lis les outils…'))}</div></section>`;
        let d; try { d = DATA = await load(); } catch (e) { if (isHere(token)) ws.querySelector('[data-dt-list]').innerHTML = UI().notice('error', e.message); return; }
        if (!isHere(token)) return;
        let rows = d.rows || [];
        const names = d.names || {};
        const counts = d.counts || {};
        const seenDflt = cfg().doutes_seen_show === 'hide' ? 'unseen' : 'all';
        const bar = UI().listBar({key: 'listes:doutes', search: {placeholder: i18n('Chercher une personne, un lieu…')},
            filters: [{id: 'sort', label: i18n('Sorte'), type: 'check', options: Object.keys(SORT).filter(k => counts[k]).map(k => [k, `${SORT[k][0]} ${i18n(SORT[k][1])}`, `${SORT[k][0]} ${i18n(SORT[k][1])}`, counts[k]])},
                {id: 'person', label: i18n('Personne'), kind: 'person', chipPrefix: '👤', allowFree: false, picker: {animals: false}},
                {id: 'anc', label: i18n('Personne'), type: 'check', text: i18n('et ses ancêtres'), chipLabel: i18n('et ses ancêtres'), disabled: f => !f.person},
                {id: 'branch', label: i18n('Branche'), type: 'radio', dflt: '', options: [['', i18n('Toutes')], ['p', i18n('paternelle (Sosa 2)')], ['m', i18n('maternelle (Sosa 3)')]]},
                {id: 'level', label: i18n('Gravité'), type: 'check', options: Object.entries(LEVEL).map(([k, [ic, l]]) => [k, `${ic} ${i18n(l)}`])},
                {id: 'seen', label: i18n('Vus'), type: 'radio', dflt: seenDflt, value: seenDflt, options: [['unseen', i18n('Pas encore vus')], ['all', i18n('Vus aussi')], ['seen', i18n('Seulement les vus')]]}],
            view: {dflt: 'list', what: 'doutes'}, sort: {options: [['level', i18n('Gravité')], ['sosa', i18n('Sosa')], ['az', 'A → Z']], value: 'level'}, onChange: () => { shown = 60; refetch(); }});
        ws.querySelector('[data-dt-bar]').replaceWith(bar);
        const box = ws.querySelector('[data-dt-list]'), pills = ws.querySelector('[data-dt-pills]');
        let shown = 60, personKey = '';
        const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        async function refetch() {
            const f = bar.state.filters, pid = Number(f.person?.id || 0), key = pid ? `${pid}:${f.anc ? 1 : 0}` : '';
            if (key !== personKey) { personKey = key; try { const r = await load(pid, !!f.anc); rows = r.rows || []; Object.assign(names, r.names || {}); } catch (e) { toast(e.message, 'error'); } }
            paint();
        }
        function visible() {
            const st = bar.state, f = st.filters, q = fold(st.q).trim();
            let list = rows.filter(r => (!q || q.split(/\s+/).every(w => fold([r.title, r.detail, ...(r.people || []).map(p => names[p] || '')].join(' ')).includes(w)))
                && (!(f.sort || []).length || f.sort.includes(r.sort)) && (!f.branch || (r.branches || []).includes(f.branch)) && (!(f.level || []).length || f.level.includes(r.level))
                && (f.seen === 'all' || (f.seen === 'seen' ? r.seen : !r.seen)));
            const rank = {red: 0, orange: 1, yellow: 2};
            list = st.sort === 'sosa' ? [...list].sort((a, b) => (a.sosa || 1e9) - (b.sosa || 1e9)) : st.sort === 'az' ? UI().sortItems(list, 'az', {name: r => r.title}) : [...list].sort((a, b) => rank[a.level] - rank[b.level] || (a.sosa || 1e9) - (b.sosa || 1e9));
            return list;
        }
        function paintPills(list) {
            const cur = bar.state.filters.sort || [];
            const by = {}; rows.forEach(r => { by[r.sort] = (by[r.sort] || 0) + 1; });
            pills.innerHTML = [['', i18n('Tout'), rows.length], ...Object.keys(SORT).filter(k => by[k]).map(k => [k, `${SORT[k][0]} ${i18n(SORT[k][1])}`, by[k]])].map(([k, l, n]) => `<button type="button" class="${(!k && !cur.length) || (k && cur.length === 1 && cur[0] === k) ? 'is-active' : ''}" data-dt-pill="${k}">${esc(l)} <small>${n}</small></button>`).join('');
        }
        const menuHtml = r => {
            const p = (r.people || [])[0], pn = p && !r.masked ? names[p] : '';
            return `<details class="ui-more ui-card-more compl-dt-more"><summary class="icon-button small" title="${esc(i18n('Plus d’actions'))}" aria-label="${esc(i18n('Plus d’actions'))}">⋯</summary><div class="ui-ph-menu" role="menu">
                <button type="button" data-dt-go>${esc(i18n('↗ Ouvrir dans l’outil'))}</button>${ro ? '' : `<button type="button" data-dt-seen>${esc(r.seen ? i18n('👁 Ne plus marquer vu') : i18n('👁 Marquer vu'))}</button>`}
                ${pn ? `<button type="button" data-dt-person="${p}">${esc(i18n('👤 Ouvrir la fiche de {name}', {name: pn}))}</button><button type="button" data-dt-only="${p}">${esc(i18n('🔍 Seulement les doutes de cette personne'))}</button>` : ''}</div></details>`;
        };
        function paint() {
            const list = visible();
            paintPills(list);
            bar.setCount(plural(list.length, 'doute'));
            if (!rows.length) { box.innerHTML = A().emptyState({icon: '📋', text: i18n('Aucun doute pour l’instant'), hint: i18n('Les outils d’origine n’ont rien à vérifier : bravo !')}); return; }
            if (!list.length) { box.innerHTML = A().emptyState({icon: '🔍', text: i18n('Rien ne correspond'), hint: i18n('Enlève un filtre, ou cherche autrement.')}); return; }
            const view = bar.state.view === 'cards' ? 'cards' : 'list';
            const pale = cfg().doutes_seen_show === 'pale' || bar.state.filters.seen !== 'unseen';
            const item = r => {
                const s = SORT[r.sort] || ['•', r.sort, '↗'], lv = LEVEL[r.level] || LEVEL.yellow;
                return {thumb: `<span class="ui-card-ico" aria-hidden="true">${s[0]}</span>`, name: r.title, cls: r.seen && pale ? 'compl-dt-seen' : '', attrs: `data-dt-key="${esc(r.key)}"`,
                    lines: [[i18n(s[1]), r.detail, r.sosa ? `Sosa ${r.sosa}` : ''].filter(Boolean).join(' · '), r.seen ? i18n('vu le {d}', {d: fmtDate(r.seen_at)}) : r.returned ? i18n('revenu : la chose a changé') : ''],
                    badges: [{text: `${lv[0]} ${i18n(lv[1])}`, kind: lv[2]}],
                    actions: `${badge(`${lv[0]} ${i18n(lv[1])}`, lv[2])}<button type="button" class="button small secondary" data-dt-go>${esc(i18n(s[2]))}</button>${menuHtml(r)}`};
            };
            const page = list.slice(0, shown);
            // 🗂 un cadre par personne (réglage genealogie-cadres) : les doutes d'une même personne ensemble, dans l'ordre du tri
            box.innerHTML = UI().framesOn?.() ? UI().personCardsHtml(UI().groupByPerson(page, r => (r.masked ? '' : (r.people || [])[0])).map(g => { const r0 = g.items.find(r => (r.people || []).length === 1 && r.sosa) || {};
                return UI().personCardHtml({id: g.key, name: g.key ? names[g.key] || '' : i18n('Sans personne'), sub: g.key && r0.sosa ? `Sosa ${r0.sosa}` : '', count: plural(g.items.length, 'doute'), body: UI().itemsHtml(view, g.items.map(item))}); }).join(''))
                : UI().itemsHtml(view, page.map(item));
            if (list.length > shown) box.appendChild(UI().moreButton({remaining: list.length - shown, step: 60, onClick: () => { shown += 60; paint(); }}));
        }
        const rowOf = el => { const k = el.closest('[data-dt-key]')?.dataset.dtKey; return rows.find(r => r.key === k); };
        async function markSeen(r) {
            if (ro || !r) return;
            const off = r.seen;
            let res; try { res = await post({op: 'doute_vu', key: r.key, fp: r.fp, title: r.title, ...(off ? {off: 1} : {})}); } catch (e) { return toast(e.message, 'error'); }
            const before = {seen: r.seen, seen_at: r.seen_at};
            r.seen = !off; r.seen_at = r.seen ? today() : '';
            paint();
            A().undoToast(off ? i18n('👁 « {t} » n’est plus marqué vu.', {t: r.title}) : i18n('👁 « {t} » marqué vu.', {t: r.title}), {undo: async () => { await post({op: 'doute_vu_undo', key: r.key, prev: res.prev || null}); Object.assign(r, before); paint(); }});
        }
        ws.addEventListener('click', e => {
            const t = e.target;
            const pl = t.closest('[data-dt-pill]'); if (pl) { bar.setFilter('sort', pl.dataset.dtPill ? [pl.dataset.dtPill] : []); return; }
            if (t.closest('[data-dt-set]')) { t.closest('details')?.removeAttribute('open'); return X().openSettings?.('C'); }
            if (t.closest('[data-dt-csv]')) { const a = document.createElement('a'); a.href = `api.php?action=compl_export&op=doutes_csv${typeof window.LCNDA_GENEALOGY === 'string' ? `&g=${encodeURIComponent(window.LCNDA_GENEALOGY)}` : ''}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return; }
            const r = rowOf(t); if (!r) return;
            if (t.closest('[data-dt-go]') || (t.closest('.ui-row-name, .ui-card-name') && !t.closest('details'))) { t.closest('details')?.removeAttribute('open'); return openTarget(r.open); }
            if (t.closest('[data-dt-seen]')) { t.closest('details')?.removeAttribute('open'); return markSeen(r); }
            const pp = t.closest('[data-dt-person]'); if (pp) { S().currentPersonId = Number(pp.dataset.dtPerson); return A().setModule('personnes'); }
            const on = t.closest('[data-dt-only]'); if (on) { t.closest('details')?.removeAttribute('open'); bar.setFilter('person', {id: Number(on.dataset.dtOnly), title: names[on.dataset.dtOnly] || ''}); }
        }, {signal: A().listControllerSignal?.()});
        // clic droit : le menu ⋯ de la ligne
        ws.addEventListener('contextmenu', e => { const row = e.target.closest('[data-dt-key]'); if (!row) return; const m = row.querySelector('details.compl-dt-more'); if (!m) return; document.querySelectorAll('details.compl-dt-more[open]').forEach(x => x.removeAttribute('open')); const items = [...m.querySelectorAll('.ui-ph-menu button')].map(b => ({label: b.textContent.trim(), danger: b.classList.contains('danger'), run: () => b.click()})); if (UI()?.contextMenu && items.length) UI().contextMenu(e, items); else { e.preventDefault(); m.setAttribute('open', ''); m.querySelector('.ui-ph-menu button')?.focus(); } }, {signal: A().listControllerSignal?.()});
        // téléphone : glisser une ligne vers la gauche = 👁 Marquer vu
        let x0 = null, y0 = null, rk = null;
        box.addEventListener('touchstart', e => { const row = e.target.closest('[data-dt-key]'); if (!row) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; rk = row; }, {passive: true});
        box.addEventListener('touchend', e => { if (!rk || x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = Math.abs(e.changedTouches[0].clientY - y0); const row = rk; rk = null; x0 = null; if (dx < -70 && dy < 40) markSeen(rowOf(row)); }, {passive: true});
        paint();
    }
    function openList(personId = 0) {
        document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
        if (personId) { try { const k = 'lcnda-listbar:listes:doutes'; const o = JSON.parse(localStorage.getItem(k) || '{}') || {}; o.f = {...(o.f || {}), person: {id: Number(personId), title: ''}}; localStorage.setItem(k, JSON.stringify(o)); } catch (_) {} }
        S().listType = LIST; A().setModule('listes');
    }
    ext.lists[LIST] = token => render(token);
    ext.doutes = {open: openList};
    // 📋 le widget du tableau de bord : les trois nombres et le plus grave (ou les 5 premières lignes, réglage)
    ext.dashboard.doutes_widget = {
        load: () => get('doutes_summary').catch(() => null),
        render: (index, widget, span, data) => {
            const c = data?.counts || {red: 0, orange: 0, yellow: 0};
            const body = !data ? `<p class="muted">${esc(i18n('Lecture impossible.'))}</p>` : cfg().doutes_widget === 'top5'
                ? (data.top?.length ? `<ul class="compl-dtw-top">${data.top.map(r => `<li><span aria-hidden="true">${(LEVEL[r.level] || LEVEL.yellow)[0]}</span> <button type="button" class="table-link" data-dtw-go>${esc(r.title)}</button></li>`).join('')}</ul>` : `<p class="muted">${esc(i18n('Aucun doute pour l’instant'))}</p>`)
                : `<div class="compl-dtw"><button type="button" class="compl-dtw-n is-red" data-dtw-go="red"><b>${c.red}</b><span>${esc(i18n('impossibles'))}</span></button><button type="button" class="compl-dtw-n is-orange" data-dtw-go="orange"><b>${c.orange}</b><span>${esc(i18n('à vérifier'))}</span></button><button type="button" class="compl-dtw-n is-yellow" data-dtw-go="yellow"><b>${c.yellow}</b><span>${esc(i18n('curieux'))}</span></button></div>
                    ${data.top?.[0] ? `<p class="compl-dtw-worst">${esc(i18n('Le plus grave : {t}', {t: data.top[0].title}))}</p>` : ''}`;
            return A().card(index, `📋 ${i18n('Doutes')}`, data ? data.total : '', body, span, `<button type="button" class="icon-button small" data-dtw-set title="${esc(i18n('⚙️ Réglages de cet outil'))}" aria-label="${esc(i18n('⚙️ Réglages de cet outil'))}">⚙️</button><button type="button" class="button small secondary" data-dtw-go>${esc(i18n('Tout voir'))}</button>`);
        },
    };
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-doutes-all]')) { e.preventDefault(); return openList(); }
        const g = t.closest?.('[data-dtw-go]'); if (g) { e.preventDefault(); if (g.dataset.dtwGo) { try { const k = 'lcnda-listbar:listes:doutes'; const o = JSON.parse(localStorage.getItem(k) || '{}') || {}; o.f = {...(o.f || {}), level: [g.dataset.dtwGo]}; localStorage.setItem(k, JSON.stringify(o)); } catch (_) {} } return openList(); }
        if (t.closest?.('[data-dtw-set]')) { e.preventDefault(); return X().openSettings?.('C'); }
    });

    /* ═════ D 📱 Visite aux archives ═════ */
    const RES = {found: ['Trouvé', 'green'], none: ['Rien trouvé', 'grey'], partial: ['En partie', 'yellow'], not_consulted: ['Pas consulté', 'grey']};
    const resBadge = r => (RES[r] ? badge(i18n(RES[r][0]), RES[r][1]) : '');
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const refreshPlanner = () => { if (S().module === 'listes' && S().listType === 'archive_visits') A().renderList?.(); };
    /** 🗄 Préparer une visite (depuis « Que manque-t-il ? », rangé par service d'archives) */
    async function prepare({archive = {}, items = [], kinds = {}, years = () => ''} = {}) {
        if (kiosk()) return toast(i18n('Mode consultation : rien ne peut être modifié.'));
        let services = [], cases = [];
        try { services = (await A().api('archive_services')).services || []; } catch (_) {}
        if (!simple()) { try { cases = ((await A().api('successoral', {op: 'list'})).items || []).filter(c => !['clos', 'archive'].includes(c.state)); } catch (_) {} }
        const lab = fold(archive.label);
        const svc = services.find(s => fold(s.name) === lab || (s.short_name && fold(s.short_name) === lab)) || services.find(s => s.kind === 'ad' && archive.department && fold(s.name).includes(fold(archive.department)));
        const row = it => { const k = kinds[it.kind] || ['•', it.what || '']; const w = (it.where || [])[0] || {}; return {cote: w.series || it.archive?.label || '', title: [`${k[0]} ${k[1]}`, it.name, years(it)].filter(Boolean).join(' · '), place: it.place || '', person_id: Number(it.person_id) || 0, kind: it.kind || '', notes: (it.where || []).map(x => `${x.series} : ${x.detail}`).join('\n'), tag: w.detail || '', online: it.kind === 'socface'}; };
        const rows = items.map(row);
        ext.openDialog({eyebrow: archive.label || i18n('VISITE D’ARCHIVES'), title: i18n('🗄 Préparer une visite'), wide: true, submitLabel: i18n('🗄 Créer la visite'), closeLabel: i18n('Fermer'),
            body: `<div class="form-grid"><div class="span-2"><span class="pk-lab">${esc(i18n('Service'))}</span>${P().pickerField({name: 'service_id', kind: 'archive_service', allowCreate: true, value: svc ? svc.id : null})}</div>
                <label>${esc(i18n('Date'))}<input type="date" name="date" min="${today()}"></label>
                ${cases.length ? `<label>${esc(i18n('Pour quel dossier ? (facultatif)'))}<select name="case_id"><option value="">—</option>${cases.map(c => `<option value="${c.id}">⚖️ ${esc(`${c.number} · ${c.title}`)}</option>`).join('')}</select></label>` : ''}</div>
                <p class="ui-hint" data-vp-hours>${svc?.opening_hours ? esc(i18n('Ouvert : {h}', {h: svc.opening_hours})) : esc(i18n('Les horaires et l’adresse sont lus dans la fiche du service.'))}</p>
                <span class="pk-lab">${esc(i18n('Les cotes à voir'))} <small data-vp-count></small></span>
                <ul class="compl-vp-items">${rows.map((r, i) => `<li>${UI().checkHtml(`${r.cote} · ${r.title}`, {checked: !r.online, attrs: `data-vp-i="${i}"`, sub: [r.place, r.tag, r.online ? i18n('déjà en ligne : Où chercher ?') : ''].filter(Boolean).join(' · ')})}</li>`).join('')}</ul>
                <p><button type="button" class="button small secondary" data-vp-print>${esc(i18n('🖨 Imprimer la liste'))}</button></p>`,
            onOpen: d => {
                const count = () => { const n = d.querySelectorAll('[data-vp-i]:checked').length; d.querySelector('[data-vp-count]').textContent = i18n('({n} cochées sur {m})', {n, m: rows.length}); };
                d.addEventListener('change', count); count();
                d.addEventListener('picker-change', e => { const it = e.detail?.item; const s = it && services.find(x => x.id === Number(it.id)); d.querySelector('[data-vp-hours]').textContent = s?.opening_hours ? i18n('Ouvert : {h}', {h: s.opening_hours}) : ''; });
                d.querySelector('[data-vp-print]').addEventListener('click', () => { const sel = rows.filter((_, i) => d.querySelector(`[data-vp-i="${i}"]`)?.checked); UI().openPrintDialog?.({title: archive.label || i18n('🗄 Préparer une visite'), key: 'compl-visite', html: `<section data-k-page><h2>${esc(archive.label || '')}</h2><ul>${sel.map(r => `<li><b>${esc(r.cote)}</b> — ${esc(r.title)}${r.place ? ` · ${esc(r.place)}` : ''}</li>`).join('')}</ul></section>`}); });
            },
            onSubmit: async f => {
                const sel = rows.filter((_, i) => f.querySelector(`[data-vp-i="${i}"]`)?.checked);
                if (!sel.length) { toast(i18n('Coche au moins une cote.'), 'error'); return false; }
                const sid = Number(f.querySelector('[name=service_id]')?.value) || 0;
                let r; try { r = await post({op: 'visite_prepare', service_id: sid, center: sid ? '' : (archive.label || ''), date: f.date.value, case_id: Number(f.case_id?.value) || 0, items: sel}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('🗄 Visite créée : {n}. Elle est dans Listes → Visites d’archives.', {n: plural(r.items, 'cote')}), {undo: async () => { await post({op: 'visite_prepare_undo', id: r.id}); refreshPlanner(); }});
                Object.assign(S(), {listType: 'archive_visits', archiveVisitFocus: r.id}); A().setModule('listes');
            }});
    }
    ext.visitPrepare = prepare;
    /** les boutons de plus sur une feuille de mission (Planificateur de visites, app-listes.js) */
    ext.visitCardActions = (plan, compact = false) => {
        if (kiosk() || !plan) return '';
        const paper = cfg().visite_mode === 'paper';
        return `${plan.succ_case_id && !simple() && !compact ? badge(i18n('⚖️ reliée à un dossier'), 'violet') : ''}`
            + `${paper ? '' : `<button class="button small${compact ? ' secondary' : ''}" type="button" data-vm-export="${plan.id}">${esc(i18n('📱 Emporter sur le téléphone'))}</button>`}`
            + `<button class="button small secondary" type="button" data-vm-import="${plan.id}">${esc(i18n('⤒ Rapporter les résultats'))}</button>`
            + `${paper && !compact ? `<button class="button small secondary" type="button" data-vm-photos="${plan.id}">${esc(i18n('⤒ Importer les photos du jour'))}</button>` : ''}`;
    };
    const pageTexts = () => ({page_title: i18n('Visite aux archives · {what}'), offline: i18n('Marche sans réseau. Tout est gardé dans ce téléphone au fur et à mesure.'), photos_off: i18n('Photo interdite ici : pas de bouton 📷.'),
        add: i18n('＋ Une cote trouvée sur place, pas prévue au départ'), save: i18n('⤓ Enregistrer mes résultats'), found: i18n('Trouvé'), none: i18n('Rien trouvé'), partial: i18n('En partie'), not_consulted: i18n('Pas consulté'),
        note: i18n('Note'), photo: i18n('📷 Photo'), remove: i18n('Retirer cette photo'), cote: i18n('Cote'), what: i18n('Ce que c’est'), extra_head: i18n('Cote ajoutée sur place'),
        kept: i18n('✓ Gardé dans ce téléphone à {time}'), nostore: i18n('⚠️ Ce navigateur ne garde rien dans la page : enregistre tes résultats après chaque cote.'),
        nophoto: i18n('⚠️ Ce téléphone ne garde pas les photos dans la page : enregistre tes résultats après chaque cote.'), notimage: i18n('⚠️ Ce fichier n’est pas une image.'),
        empty: i18n('⚠️ Note au moins un résultat avant d’enregistrer.'), saved: i18n('✓ Fichier « {name} » enregistré : rapporte-le dans l’app (⤒ Rapporter les résultats).'), missing: i18n('Des photos manquaient : elles ne sont pas dans le fichier.')});
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); };
    async function exportDialog(id) {
        let d; try { d = await get('visite', {id}); } catch (e) { return toast(e.message, 'error'); }
        const p = d.plan, set = cfg();
        ext.openDialog({eyebrow: [p.center, p.date && fmtDate(p.date), plural(d.items.length, 'cote')].filter(Boolean).join(' · '), title: i18n('📱 Emporter sur le téléphone'), wide: true, submitLabel: i18n('⤓ Enregistrer la page'), closeLabel: i18n('Fermer'),
            body: `<span class="pk-lab">${esc(i18n('Ce qui part dans la page'))}</span><ul class="compl-vm-what">
                <li>✓ ${esc(i18n('Les cotes, l’acte cherché, la personne et ses années'))} <small class="muted" data-i18n-off>${esc(d.items[0] ? `« ${d.items[0].title} »` : '')}</small></li>
                <li>✓ ${esc(i18n('Ce qu’on sait déjà (parents, conjoint, dates connues) pour reconnaître l’acte sur place'))}</li>
                <li>${UI().checkHtml(i18n('Les personnes vivantes'), {checked: set.visite_living === 'yes', attrs: 'name="living"', sub: i18n('décoché : un vivant devient « Personne vivante »')})}</li>
                <li>🚫 ${esc(i18n('Les fiches confidentielles : jamais'))}</li>
                <li>${UI().checkHtml(i18n('Photo interdite ici'), {checked: p.photos_off, attrs: 'name="photos_off"', sub: i18n('cache le bouton 📷 dans la page')})}</li></ul>
                <p class="ui-hint">${esc(i18n('Un seul fichier .html : aucune requête, rien à installer. Mets-le sur le téléphone (câble, AirDrop, partage Android, courriel à toi-même) ; il marche en mode avion.'))}</p>
                <details class="compl-vm-help"><summary>${esc(i18n('📲 Montrer comment le mettre sur le téléphone'))}</summary><p>${esc(i18n('iPhone : l’aperçu de l’app Fichiers montre la page mais ne la fait pas marcher (pas de cases à cocher). Ouvre-la avec une app qui lit les pages .html, ou passe par la feuille imprimée et les photos (réglage). Android : Chrome ou Firefox l’ouvrent et la font marcher.'))}</p></details>`,
            onSubmit: async f => {
                let r; try { r = await post({op: 'visite_render', id, living: f.living.checked ? 1 : 0, photos_off: f.photos_off.checked ? 1 : 0}); } catch (e) { toast(e.message, 'error'); return false; }
                const html = C().visitPageHtml({...r.data, file: r.filename}, pageTexts(), window.LCNDA_I18N?.lang || 'fr');
                const blob = new Blob([html], {type: 'text/html'});
                download(blob, `${r.filename}.html`);
                toast(i18n('📄 1 fichier, {n} Ko : mets-le sur ton téléphone.', {n: Math.max(1, Math.round(blob.size / 1024))}), 'success');
                refreshPlanner();
            }});
    }
    /** ⤒ Rapporter les résultats : le .zip du téléphone, revu cote par cote (K13), ↶ Annuler */
    function importDialog(id = 0, files = null) {
        if (kiosk()) return toast(i18n('Mode consultation : rien ne peut être modifié.'));
        UI().openImportDialog({title: i18n('Résultats de la visite'), accept: '.zip,application/zip', files, noun: 'cote',
            analyze: async fs => {
                const r = await X().postFiles({op: 'visite_analyze'}, {file: fs[0]});
                if (id && Number(r.visit.id) !== Number(id)) throw new Error(i18n('Ce fichier vient d’une autre visite : « {t} ».', {t: r.visit.title}));
                const propose = r.settings?.visite_found === 'propose';
                const what = x => {
                    if (x.removed) return `<i>${esc(i18n('cote retirée de la visite depuis'))}</i>`;
                    if (x.kind === 'extra') return `<i>${esc(i18n('ajoutée sur place : d’abord ajoutée à la visite'))}</i>`;
                    const out = [];
                    if (x.result && x.result !== 'not_consulted') out.push(x.digest ? i18n('dépouillement déjà relié') : i18n('＋ dépouillement du Journal ({r})', {r: i18n(RES[x.result]?.[0] || x.result).toLocaleLowerCase()}));
                    if (x.photos) out.push(x.result === 'partial' && !x.note ? i18n('{n} → médias « à trier »', {n: plural(x.photos, 'photo')}) : x.who ? i18n('{n} → médias reliés à {who}', {n: plural(x.photos, 'photo'), who: x.who}) : i18n('{n} → médias', {n: plural(x.photos, 'photo')}));
                    if (x.piece) out.push(i18n('📑 pièce du dossier : reçue'));
                    return esc(out.join(' · ') || '—');
                };
                const preview = `<p>${badge(i18n('✓ fichier vérifié'), 'green')} <b data-i18n-off>${esc([r.visit.center, r.visit.date && fmtDate(r.visit.date)].filter(Boolean).join(' · '))}</b>${r.visit.case ? ` · ⚖️ ${esc(r.visit.case)}` : ''}</p>
                    <div class="h-asv-tablewrap"><table class="data-table compl-vm-rev"><thead><tr><th></th><th>${esc(i18n('Cote'))}</th><th>${esc(i18n('Rapporté du téléphone'))}</th><th>${esc(i18n('Ce que l’app fera'))}</th></tr></thead><tbody>
                    ${r.rows.map(x => `<tr data-vm-row="${esc(x.key)}"><td><input type="checkbox" data-vm-on${x.checked ? ' checked' : ''} aria-label="${esc(i18n('Ranger cette cote'))}"></td><td><b data-i18n-off>${esc(x.cote || '—')}</b>${x.title ? `<br><small class="muted" data-i18n-off>${esc(x.title)}</small>` : ''}</td>
                        <td>${resBadge(x.result)} ${x.note ? `<span data-i18n-off>« ${esc(x.note)} »</span>` : ''}${x.photos ? ` · ${esc(plural(x.photos, 'photo'))}` : ''}</td><td>${what(x)}${propose && x.result === 'found' && x.who ? `<br>${UI().checkHtml(i18n('→ Reporter sur la fiche'), {checked: false, attrs: 'data-vm-report'})}` : ''}</td></tr>`).join('')}</tbody></table></div>
                    <p class="ui-hint">${esc(i18n('Aucune date ni aucun lieu n’est écrit sur une fiche : ce qui est trouvé reste un dépouillement avec sa photo ; c’est toi qui le reportes sur la fiche, comme aujourd’hui.'))}</p>`;
                const on = r.rows.filter(x => x.checked);
                return {count: on.length, data: r, preview, summaryHtml: esc(i18n('{n} rapportées, {m}', {n: plural(r.rows.length, 'cote'), m: plural(r.photos, 'photo')})), allowEmpty: true,
                    goLabel: i18n('Ranger {n} et {m}', {n: plural(on.length, 'cote'), m: plural(on.reduce((a, x) => a + x.photos, 0), 'photo')}),
                    onShow: body => body.addEventListener('change', () => { const keys = [...body.querySelectorAll('[data-vm-row]')].filter(tr => tr.querySelector('[data-vm-on]')?.checked).map(tr => tr.dataset.vmRow); const go = body.closest('dialog')?.querySelector('[data-k-go]'); if (go) { const sel = r.rows.filter(x => keys.includes(x.key)); go.textContent = i18n('Ranger {n} et {m}', {n: plural(sel.length, 'cote'), m: plural(sel.reduce((a, x) => a + x.photos, 0), 'photo')}); go.disabled = !sel.length; } })};
            },
            run: async (an, fs, body) => {
                const choices = [...body.querySelectorAll('[data-vm-row]')].map(tr => ({key: tr.dataset.vmRow, on: !!tr.querySelector('[data-vm-on]')?.checked, report: !!tr.querySelector('[data-vm-report]')?.checked}));
                const res = await X().postFiles({op: 'visite_import', choices}, {file: fs[0]});
                refreshPlanner();
                if (res.report?.length) setTimeout(() => toast(i18n('→ Reporter sur la fiche : le dépouillement et ses photos y sont reliés.'), '', {action: {label: i18n('↗ Fiche'), run: () => { S().currentPersonId = res.report[0]; A().setModule('personnes'); }}}), 600);
                return {message: i18n('✓ Visite rangée : {d}, {m}, {p}.', {d: plural(res.digests, 'dépouillement'), m: plural(res.media, 'média'), p: i18n('{n} pièce(s) reçue(s)', {n: res.pieces})}) + (res.done ? ' ' + i18n('Visite marquée « faite ».') : ''),
                    undo: async () => { await post({op: 'visite_import_undo', id: an.data.visit.id}); refreshPlanner(); }};
            }});
    }
    /** ⤒ Photos du jour : la feuille imprimée + les photos du téléphone, rangées dans l'ordre des cotes d'après l'heure */
    async function photosDialog(id) {
        if (kiosk()) return toast(i18n('Mode consultation : rien ne peut être modifié.'));
        let d; try { d = await get('visite', {id}); } catch (e) { return toast(e.message, 'error'); }
        const items = d.items;
        if (!items.length) return toast(i18n('Cette visite n’a pas encore de cote.'), 'error');
        UI().openImportDialog({title: i18n('Importer les photos du jour'), accept: 'image/jpeg,image/png,image/webp', multiple: true, noun: 'photo',
            analyze: async fs => {
                const photos = await Promise.all(fs.map(async f => { let t = null; try { t = C().exifTime(await f.slice(0, 256 * 1024).arrayBuffer()); } catch (_) {} return {time: t || f.lastModified || 0, name: f.name}; }));
                const map = C().assignPhotos(photos, items.map(x => x.id));
                const opt = sel => items.map(x => `<option value="${x.id}"${Number(sel) === x.id ? ' selected' : ''}>${esc(`${x.cote} · ${x.title}`)}</option>`).join('');
                const preview = `<p class="ui-hint">${esc(i18n('Rangées dans l’ordre des cotes d’après l’heure de prise de vue : corrige la cote d’une photo si besoin.'))}</p><ul class="compl-vm-ph">${fs.map((f, i) => `<li><img alt="" src="${esc(URL.createObjectURL(f))}"><span><b data-i18n-off>${esc(f.name)}</b><small class="muted">${photos[i].time ? esc(new Date(photos[i].time).toLocaleTimeString()) : ''}</small>
                    <select data-vm-ph="${i}" aria-label="${esc(i18n('Cote'))}"><option value="">${esc(i18n('— ne pas ranger —'))}</option>${opt(map[i])}</select></span></li>`).join('')}</ul>`;
                return {count: fs.length, preview, noun: 'photo'};
            },
            run: async (an, fs, body) => {
                const map = Object.fromEntries([...body.querySelectorAll('[data-vm-ph]')].map(s => [s.dataset.vmPh, Number(s.value) || 0]));
                const r = await X().postFiles({op: 'visite_photos', id, map}, {'photos[]': fs});
                return {message: i18n('{n} rangées dans les médias (« à trier »).', {n: plural(r.media, 'photo')}), undo: async () => { await post({op: 'visite_photos_undo', id}); refreshPlanner(); }};
            }});
    }
    document.addEventListener('click', e => {
        const t = e.target;
        const ex = t.closest?.('[data-vm-export]'); if (ex) { e.preventDefault(); return exportDialog(Number(ex.dataset.vmExport)); }
        const im = t.closest?.('[data-vm-import]'); if (im) { e.preventDefault(); return importDialog(Number(im.dataset.vmImport)); }
        const ph = t.closest?.('[data-vm-photos]'); if (ph) { e.preventDefault(); return photosDialog(Number(ph.dataset.vmPhotos)); }
    });
    ext.visiteMobile = {prepare, exportDialog, importDialog, photosDialog, pageTexts};

    /* ═════ les branchements ═════ */
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === LIST)) app.defaultListTypes.push([LIST, '33c', listName()]);
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'doutes_widget')) { app.defaultDashboardBlocks.push(['doutes_widget', '📋 Doutes']); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.doutes_widget = '4'; }
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg, {once: true});
    // le nom de la liste suit le réglage
    window.addEventListener('lcnda:compl-settings', () => { const L = A()?.defaultListTypes; const r = L?.find(x => x[0] === LIST); if (r) { r[2] = listName(); A().renderSidebar?.(); } if (S()?.module === 'listes' && S().listType === LIST) A().renderList?.(); });
    setTimeout(() => { X().loadSet?.().then(() => { const r = A()?.defaultListTypes?.find(x => x[0] === LIST); if (r && r[2] !== listName()) { r[2] = listName(); A().renderSidebar?.(); } }); }, 0);
})();
