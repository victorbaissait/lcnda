/**
 * 🗓 Widget « Ma semaine de recherche » (tableau de bord et Suivi : même moteur de widgets). Il remplace l'ancienne
 * « Liste de travail quotidienne » (même type « daily_research » : les tableaux de bord qui l'avaient le gardent).
 * Une seule liste rangée par urgence (🔴 en retard, 📌 aujourd'hui, 🗓 cette semaine, ⏳ quand tu as le temps, ✓ fait) :
 * rappels, courriers, visites d'archives, pistes et hypothèses, « Que manque-t-il ? » (dont SocFace), à vérifier, entraide.
 * Chaque ligne : ↗ ouvrir, ✓ fait, ⏭ reporter (H7 ↶ Annuler). Réglage K2 (période, rangement, sortes et leur ordre,
 * nombre de lignes), ⛶ en grand, « 🧩 Une chose à la fois » : la chose la plus urgente seule, en grand.
 * Serveur : lib/semaine.php (GET semaine, POST semaine_mark). Chargé après app.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.dashboard = ext.dashboard || {}; ext.dashboardConfig = ext.dashboardConfig || {};
    const esc = v => A().escapeHtml(v ?? '');
    const TYPE = 'daily_research';
    const SORTS = {
        rappel: ['🔔', 'Rappels'], courrier: ['✉️', 'Courriers en attente'], visite: ['🏛', 'Visites d’archives'], piste: ['🔍', 'Pistes et hypothèses'],
        manque: ['💡', 'À chercher (Que manque-t-il ?)'], verifier: ['⚠️', 'À vérifier'], entraide: ['🤝', 'Demandes d’entraide'], fait: ['✓', 'Fait cette semaine'],
    };
    const ORDER = Object.keys(SORTS);
    const URG = {late: ['🔴', 'En retard', 'red'], today: ['📌', 'Aujourd’hui', 'blue'], week: ['🗓', 'Cette semaine', 'yellow'], later: ['⏳', 'Quand tu as le temps', 'grey'], done: ['✓', 'Fait cette semaine', 'green']};
    const plural = (n, w, many = '') => A().plural ? A().plural(n, w, many) : `${n} ${n > 1 ? (many || w + 's') : w}`;
    const i18n = (text, vars) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(text, vars) : String(text ?? '')); // 🌐 app-i18n.js

    /** les réglages d'un widget, complétés */
    function cfgOf(w) {
        const c = w?.config || {};
        const order = [...new Set([...(Array.isArray(c.sortOrder) ? c.sortOrder.filter(k => SORTS[k]) : []), ...ORDER])];
        return {horizon: c.horizon === 'today' ? 'today' : 'week', group: c.group === 'sorte' ? 'sorte' : 'urgence', order, hidden: Array.isArray(c.hiddenSorts) ? c.hiddenSorts.filter(k => SORTS[k]) : [], limit: Math.max(1, Math.min(80, Number(w?.limit) || 5))};
    }

    let LAST = null, loading = null;
    const load = async () => { loading = loading || A().api('semaine').finally(() => { loading = null; }); LAST = await loading; return LAST; };
    const byKey = key => (LAST?.items || []).find(i => i.key === key) || (LAST?.done || []).find(i => i.key === key) || null;

    /** ce que montre un widget : ses sortes, sa période */
    function visible(data, cfg) {
        const today = data.today || '';
        const items = (data.items || []).filter(i => !cfg.hidden.includes(i.sort) && !(cfg.horizon === 'today' && i.urgency === 'week'));
        const done = cfg.hidden.includes('fait') ? [] : (data.done || []).filter(i => cfg.horizon !== 'today' || String(i.date || '').slice(0, 10) === today);
        return {items, done};
    }
    const sosaUrl = sf => sf && window.LCNDA_SOCFACE?.searchUrl ? window.LCNDA_SOCFACE.searchUrl({last: sf.last, first: sf.first, place: sf.place, y1: sf.year, y2: sf.year, gender: sf.gender}) : '';
    const safe = u => A().safeUrl ? A().safeUrl(u) : (/^https?:\/\//i.test(u) ? u : '');

    function rowHtml(it, cfg, hide) {
        const [ic] = SORTS[it.sort] || ['•'];
        const done = it.urgency === 'done';
        const urg = URG[it.urgency] || URG.later;
        const badges = [cfg.group === 'sorte' && !done ? UI().badge?.(urg[1], urg[2]) : '', it.badge ? UI().badge?.(it.badge, /Impossible/.test(it.badge) ? 'red' : /vérifier|Lecture/.test(it.badge) ? 'yellow' : 'grey', {cls: 'msr-b'}) : ''].join('');
        const when = done && it.date && UI().when ? UI().when(it.date) : '';
        const sf = it.sf ? sosaUrl(it.sf) : '', url = !sf && it.url ? safe(it.url) : '';
        return `<li class="msr-row${done ? ' is-done' : ''} is-${esc(it.urgency)}" data-msr-key="${esc(it.key)}"${hide ? ' hidden' : ''}>
            <span class="msr-ico" aria-hidden="true">${done ? '✓' : ic}</span>
            <div class="msr-main"><div class="msr-title">${esc(it.title)}</div><div class="msr-sub">${badges}${esc(it.detail || '')}${when ? ` · ${when}` : ''}</div></div>
            <div class="msr-acts">${sf ? `<a class="button small secondary msr-ext" href="${esc(sf)}" target="_blank" rel="noopener noreferrer">🔍 SocFace ↗</a>` : url ? `<a class="icon-button small msr-ext" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Ouvrir le lien" aria-label="Ouvrir le lien">🔗</a>` : ''}${it.open ? `<button type="button" class="icon-button small" data-msr-open title="Ouvrir" aria-label="Ouvrir">↗</button>` : ''}${done ? '' : `<button type="button" class="icon-button small msr-done" data-msr-done title="✓ ${esc(it.done_label || 'Fait')}" aria-label="${esc(it.done_label || 'Fait')}">✓</button><button type="button" class="icon-button small" data-msr-snooze title="Reporter à demain ou à la semaine prochaine" aria-label="Reporter">⏭</button>`}</div></li>`;
    }
    const moreLabel = n => n === 1 ? i18n('Voir le suivant ↓') : i18n('Voir les {n} suivants ↓', {n}); // C6
    function sectionHtml(id, icon, label, rows, cfg, big) {
        if (!rows.length) return '';
        const lim = big ? Infinity : cfg.limit;
        const more = rows.length - lim;
        return `<section class="msr-sec" data-msr-sec="${esc(id)}"><h4 class="msr-sec-h"><span aria-hidden="true">${icon}</span> ${esc(label)} <small>${rows.length}</small></h4>
            <ul class="msr-list">${rows.map((r, i) => rowHtml(r, cfg, i >= lim)).join('')}</ul>${more > 0 ? `<button type="button" class="link-button msr-more" data-msr-more="${lim}">Voir les ${Math.min(more, lim)} suivants ↓</button>` : ''}</section>`;
    }
    function countersHtml(items, done) {
        const c = {late: 0, today: 0, week: 0, later: 0}; items.forEach(i => { c[i.urgency] = (c[i.urgency] || 0) + 1; });
        const pills = [['late', i18n('{n} en retard', {n: plural(c.late, 'chose')})], ['today', i18n('{n} aujourd’hui', {n: c.today})], ['week', i18n('{n} cette semaine', {n: c.week})], ['later', i18n('{n} quand tu as le temps', {n: c.later})]]
            .filter(([k]) => c[k]).map(([k, t]) => UI().badge?.(`${URG[k][0]} ${t}`, URG[k][2], {cls: 'msr-count'}) || '');
        if (done.length) pills.push(UI().badge?.(`✓ ${plural(done.length, 'chose')} faite${done.length > 1 ? 's' : ''}`, 'green', {cls: 'msr-count'}) || '');
        return pills.length ? `<div class="msr-counts">${pills.join('')}</div>` : '';
    }
    /** 🧩 Une chose à la fois : seulement la plus urgente, en grand */
    function focusHtml(items, done) {
        const it = items[0];
        if (!it) return doneOrEmpty(done, true);
        const urg = URG[it.urgency] || URG.later, sf = it.sf ? sosaUrl(it.sf) : '';
        return `<div class="msr-focus" data-msr-key="${esc(it.key)}"><div class="msr-focus-k">${UI().badge?.(`${urg[0]} ${urg[1]}`, urg[2]) || ''} <span>${esc((SORTS[it.sort] || ['', ''])[0])} ${esc((SORTS[it.sort] || ['', ''])[1])}</span></div>
            <p class="msr-focus-t">${esc(it.title)}</p><p class="msr-focus-d">${esc(it.detail || '')}</p>
            <div class="msr-focus-acts"><button type="button" class="button" data-msr-done>✓ ${esc(it.done_label || 'C’est fait')}</button>${it.open ? '<button type="button" class="button secondary" data-msr-open>↗ Ouvrir</button>' : ''}${sf ? `<a class="button secondary" href="${esc(sf)}" target="_blank" rel="noopener noreferrer">🔍 SocFace ↗</a>` : ''}<button type="button" class="button secondary" data-msr-snooze>⏭ Plus tard</button></div>
            ${items.length > 1 ? `<p class="msr-focus-next">Ensuite : ${plural(items.length - 1, 'autre chose', 'autres choses')}. <button type="button" class="link-button" data-msr-big>Tout voir</button></p>` : ''}</div>`;
    }
    function doneOrEmpty(done, nothing) {
        if (!nothing) return '';
        return done.length ? A().empty('Tout est fait pour cette semaine, bravo ! Profite-en pour avancer une recherche.', {icon: '🎉', action: {label: '💡 Voir ce qui manque', attrs: 'data-msr-go="gaps"'}})
            : A().empty('Rien d’urgent : ta semaine est libre. Ajoute un rappel ou regarde ce qui manque à ton arbre.', {icon: '🌿', action: {label: '💡 Voir ce qui manque', attrs: 'data-msr-go="gaps"'}});
    }
    function bodyHtml(data, cfg, {big = false, filter = ''} = {}) {
        if (!data) return A().empty('Ta semaine de recherche n’a pas pu être lue. Réessaie dans un instant.', {icon: '⛔'});
        let {items, done} = visible(data, cfg);
        if (filter && filter !== 'all') { items = items.filter(i => i.sort === filter); done = filter === 'fait' ? done : []; }
        if (!big && document.documentElement.classList.contains('a11y-simple')) return `<div class="msr is-focus">${focusHtml(items, done)}</div>`;
        const pos = k => cfg.order.indexOf(k);
        const rank = {late: 0, today: 1, week: 2, later: 3};
        let secs = '';
        if (cfg.group === 'sorte') {
            cfg.order.forEach(k => {
                if (k === 'fait') { secs += sectionHtml('fait', '✓', SORTS.fait[1], done, cfg, big); return; }
                secs += sectionHtml(k, SORTS[k][0], SORTS[k][1], items.filter(i => i.sort === k).sort((a, b) => (rank[a.urgency] - rank[b.urgency]) || String(a.date || '9').localeCompare(String(b.date || '9'))), cfg, big);
            });
        } else {
            ['late', 'today', 'week', 'later'].forEach(u => { secs += sectionHtml(u, URG[u][0], URG[u][1], items.filter(i => i.urgency === u).sort((a, b) => (pos(a.sort) - pos(b.sort)) || String(a.date || '9').localeCompare(String(b.date || '9'))), cfg, big); });
            secs += sectionHtml('done', '✓', URG.done[1], done, cfg, big);
        }
        const nothing = !items.length;
        return `<div class="sw${big ? ' is-big' : ''}">${countersHtml(items, done)}${nothing ? doneOrEmpty(done, true) : ''}${secs}${data.counts?.snoozed ? `<p class="msr-snoozed">${i18n('⏭ {n} : elles reviendront le jour dit.', {n: plural(data.counts.snoozed, 'chose reportée', 'choses reportées')})}</p>` : ''}</div>`;
    }

    ext.dashboard[TYPE] = {
        load: () => load().catch(() => null),
        render: (index, widget, span, data) => {
            const cfg = cfgOf(widget);
            const n = data ? visible(data, cfg).items.length : '';
            return A().card(index, '🗓 Ma semaine de recherche', n === '' ? '' : n, `<div data-msr-body data-msr-widget="${esc(widget.id)}">${bodyHtml(data, cfg)}</div>`, span,
                `<button type="button" class="button small secondary" data-msr-big title="Voir en grand" aria-label="Voir en grand">⛶</button>`);
        },
    };

    /* ─────────── réglage du widget (K2 : chaque changement gardé tout de suite) ─────────── */
    const seg = (name, cur, opts, uid) => `<div class="segmented msr-seg" role="radiogroup">${opts.map(([v, l]) => `<label class="${cur === v ? 'is-active' : ''}"><input type="radio" name="${uid}-${name}" value="${v}" ${cur === v ? 'checked' : ''} data-msr-cfg="${name}">${l}</label>`).join('')}</div>`;
    const sortRowsHtml = c => c.order.map(k => `<div class="msr-cfg-sort" data-msr-sort-row="${k}"><label class="checkbox-line"><input type="checkbox" data-msr-sort="${k}" ${c.hidden.includes(k) ? '' : 'checked'}> <span aria-hidden="true">${SORTS[k][0]}</span> ${esc(SORTS[k][1])}</label><button type="button" class="icon-button small" data-msr-up title="Monter">↑</button><button type="button" class="icon-button small" data-msr-down title="Descendre">↓</button></div>`).join('');
    ext.dashboardConfig[TYPE] = {
        html: w => {
            const c = cfgOf(w), uid = `sw_${w.id}`.replace(/[^a-z0-9_]/gi, '_');
            return `<div class="msr-cfg" data-msr-cfg-box>
                <div class="msr-cfg-row"><span class="msr-cfg-lab">Montrer</span>${seg('horizon', c.horizon, [['today', 'Aujourd’hui'], ['week', 'Cette semaine']], uid)}</div>
                <div class="msr-cfg-row"><span class="msr-cfg-lab">Ranger</span>${seg('group', c.group, [['urgence', 'Par urgence'], ['sorte', 'Par sorte']], uid)}</div>
                <fieldset class="msr-cfg-sorts"><legend>Ce qu’on montre, dans cet ordre</legend><div data-msr-sorts>${sortRowsHtml(c)}</div><p class="ui-hint">Décoche ce que tu ne veux pas voir ; ⠿ ou Alt + ↑ / ↓ pour changer l’ordre.</p></fieldset>
                <div class="msr-cfg-foot"><button type="button" class="button small secondary" data-msr-cfg-reset>↺ Remettre comme au départ</button><button type="button" class="button small" data-msr-cfg-close>Fermer</button></div></div>`;
        },
        read: ed => {
            const box = ed.querySelector('[data-msr-cfg-box]'); if (!box) return {};
            return {horizon: box.querySelector('[data-msr-cfg="horizon"]:checked')?.value || 'week', group: box.querySelector('[data-msr-cfg="group"]:checked')?.value || 'urgence',
                sortOrder: [...box.querySelectorAll('[data-msr-sort-row]')].sort((a, b) => (Number(getComputedStyle(a).order) || 0) - (Number(getComputedStyle(b).order) || 0)).map(r => r.dataset.msrSortRow),
                hiddenSorts: [...box.querySelectorAll('[data-msr-sort]')].filter(i => !i.checked).map(i => i.dataset.msrSort)};
        },
    };
    function saveEditor(ed, {reset = false} = {}) {
        const id = ed.dataset.dashboardWidgetEditor;
        const s = A().dashboardBlockSettings(), w = s.widgets.find(x => x.id === id); if (!w) return;
        const before = JSON.parse(JSON.stringify(w));
        w.width = ed.querySelector('.block-widths [aria-pressed="true"]')?.dataset.blockWidth || w.width;
        const lim = ed.querySelector('[data-dashboard-widget-limit]'); if (lim) w.limit = Math.max(1, Math.min(80, Number(lim.value) || w.limit || 5));
        w.config = reset ? {} : {...(w.config || {}), ...ext.dashboardConfig[TYPE].read(ed)};
        if (reset) w.limit = 5;
        A().saveDashboardBlockSettings(s);
        const sv = ed.querySelector('.msr-saved'); if (sv) { sv.hidden = false; clearTimeout(sv._t); sv._t = setTimeout(() => { sv.hidden = true; }, 2500); }
        const card = ed.closest('.dashboard-widget'); if (card) card.className = card.className.replace(/\bspan-\d+\b/, `span-${w.width}`);
        return before;
    }
    const editorOf = el => el.closest?.('.dashboard-widget[data-widget-type="daily_research"] [data-dashboard-widget-editor]');
    const prep = ed => { if (ed.dataset.msrBound) return; ed.dataset.msrBound = '1'; ed.querySelector('.dashboard-widget-back-title')?.insertAdjacentHTML('beforeend', '<span class="ui-ph-saved msr-saved" hidden>✓ Enregistré</span>'); };
    document.addEventListener('input', e => { const ed = editorOf(e.target); if (ed && !e.target.closest('.pk')) { prep(ed); saveEditor(ed); } });
    document.addEventListener('change', e => { const ed = editorOf(e.target); if (!ed) return; prep(ed);
        const lab = e.target.closest('.msr-seg label'); if (lab) lab.parentElement.querySelectorAll('label').forEach(l => l.classList.toggle('is-active', l === lab));
        saveEditor(ed); });
    document.addEventListener('click', e => {
        const ed = editorOf(e.target); if (!ed) return; prep(ed);
        if (e.target.closest('[data-block-width]')) setTimeout(() => saveEditor(ed), 0);
        const mv = e.target.closest('[data-msr-up], [data-msr-down]');
        if (mv) { const row = mv.closest('[data-msr-sort-row]'), up = mv.matches('[data-msr-up]'); const sib = up ? row.previousElementSibling : row.nextElementSibling; if (sib) { up ? sib.before(row) : sib.after(row); saveEditor(ed); } return; }
        if (e.target.closest('[data-msr-cfg-reset]')) {
            const id = ed.dataset.dashboardWidgetEditor, before = saveEditor(ed, {reset: true});
            A().undoToast?.('Réglages de « Ma semaine de recherche » remis comme au départ.', {undo: async () => { const s = A().dashboardBlockSettings(), i = s.widgets.findIndex(x => x.id === id); if (i >= 0 && before) { s.widgets[i] = before; A().saveDashboardBlockSettings(s); } await A().renderDashboard(); }});
            A().renderDashboard(); return;
        }
        if (e.target.closest('[data-msr-cfg-close]')) { ed.closest('.dashboard-widget')?.querySelector('[data-cancel-dashboard-widget]')?.click(); }
    });

    /* ─────────── ⛶ en grand ─────────── */
    let bigDlg = null, bigFilter = 'all', bigCfg = null;
    function drawBig() {
        if (!bigDlg || !LAST) return;
        const {items, done} = visible(LAST, bigCfg);
        const n = k => k === 'all' ? items.length + done.length : k === 'fait' ? done.length : items.filter(i => i.sort === k).length;
        const pills = ['all', ...bigCfg.order.filter(k => !bigCfg.hidden.includes(k))].filter(k => k === 'all' || n(k));
        if (!pills.includes(bigFilter)) bigFilter = 'all';
        bigDlg.querySelector('[data-msr-filters]').innerHTML = pills.map(k => `<button type="button" class="${k === bigFilter ? 'is-active' : ''}" data-msr-filter="${k}">${k === 'all' ? 'Tout' : `${SORTS[k][0]} ${esc(SORTS[k][1])}`} (${n(k)})</button>`).join('');
        bigDlg.querySelector('[data-msr-horizon]').innerHTML = [['today', 'Aujourd’hui'], ['week', 'Cette semaine']].map(([v, l]) => `<button type="button" class="${bigCfg.horizon === v ? 'is-active' : ''}" data-msr-hz="${v}">${l}</button>`).join('');
        bigDlg.querySelector('[data-msr-body]').innerHTML = bodyHtml(LAST, bigCfg, {big: true, filter: bigFilter});
    }
    async function openBig(widgetId) {
        const w = (A().dashboardBlockSettings?.().widgets || []).find(x => x.id === widgetId) || {config: {}};
        bigCfg = cfgOf(w); bigFilter = 'all';
        bigDlg?.close();
        const dlg = bigDlg = document.createElement('dialog');
        dlg.className = 'modal modal-xl msr-big'; dlg.dataset.ownClose = '1';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">TABLEAU DE BORD · EN GRAND</span><h2>🗓 Ma semaine de recherche</h2><p class="muted">Ce qu’il y a à faire, le plus urgent d’abord. ✓ quand c’est fait, ⏭ pour reporter : « ↶ Annuler » en bas à gauche si tu te trompes.</p></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <div class="msr-big-bar"><div class="segmented" role="tablist" data-msr-horizon></div><div class="ui-filters msr-filters" role="tablist" data-msr-filters></div></div>
            <div class="msr-big-body" data-msr-body data-msr-big-body>${UI().spinner ? UI().spinner('Ta semaine…') : '…'}</div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button" data-x>Fermer</button></div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { dlg.remove(); if (bigDlg === dlg) bigDlg = null; });
        dlg.addEventListener('click', e => {
            if (e.target.closest('[data-x]')) return dlg.close();
            const f = e.target.closest('[data-msr-filter]'); if (f) { bigFilter = f.dataset.msrFilter; drawBig(); return; }
            const h = e.target.closest('[data-msr-hz]'); if (h) { bigCfg = {...bigCfg, horizon: h.dataset.msrHz}; drawBig(); }
        });
        dlg.addEventListener('keydown', e => { if (e.key === 'Tab' && e.target.closest?.('[data-msr-filters]')) { const bs = [...dlg.querySelectorAll('[data-msr-filter]')], i = bs.findIndex(b => b.dataset.msrFilter === bigFilter); if (bs.length > 1) { e.preventDefault(); bigFilter = bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].dataset.msrFilter; drawBig(); dlg.querySelector(`[data-msr-filter="${bigFilter}"]`)?.focus(); } } });
        dlg.showModal();
        try { await load(); } catch (err) { dlg.querySelector('[data-msr-body]').innerHTML = UI().notice ? UI().notice('error', err.message) : esc(err.message); return; }
        drawBig();
    }

    /* ─────────── rafraîchir sans tout redessiner ─────────── */
    async function refresh() {
        try { await load(); } catch (err) { A().toast(err.message, 'error'); return; }
        const ws = A().dashboardBlockSettings?.().widgets || [];
        document.querySelectorAll('[data-msr-body][data-msr-widget]').forEach(el => {
            const w = ws.find(x => x.id === el.dataset.msrWidget) || {config: {}}, cfg = cfgOf(w);
            el.innerHTML = bodyHtml(LAST, cfg);
            const small = el.closest('.card')?.querySelector('.card-title h3 small'); if (small) small.textContent = `(${visible(LAST, cfg).items.length})`;
        });
        drawBig();
    }

    /* ─────────── ↗ ouvrir, ✓ fait, ⏭ reporter ─────────── */
    function openTarget(o) {
        if (!o) return;
        bigDlg?.close();
        const app = A(), st = app.state;
        if (o.kind === 'person' && o.id) { st.currentPersonId = Number(o.id); return app.setModule('personnes'); }
        if (o.kind === 'list') { st.listType = o.list; if (o.list === 'archive_visits' && o.id) st.archiveVisitFocus = Number(o.id); return app.setModule('listes'); }
        if (o.kind === 'investigation') { Object.assign(st, {currentInvestigationId: Number(o.id), enquetesTab: 'enquetes'}); return app.setModule('enquetes'); }
        if (o.kind === 'journal') return ext.journal?.open ? ext.journal.open(o.target) : (st.researchKind = 'journal', app.setModule('recherche'));
        if (o.kind === 'gaps') { st.researchKind = 'gaps'; return app.setModule('recherche'); }
        if (o.kind === 'murs') return ext.ouChercher?.openPerson ? ext.ouChercher.openPerson(Number(o.id) || 0, 'murs') : (st.researchKind = 'murs', app.setModule('recherche')); // 🧩 heritage-ou-chercher.js
        if (o.kind === 'socface') { st.researchKind = 'socface'; return app.setModule('recherche'); }
        if (o.kind === 'controle') return ext.openControle ? ext.openControle({level: o.level || ''}) : (st.maintenanceTab = 'controle', app.setModule('maintenance'));
    }
    const post = async body => { const r = await A().api('semaine_mark', {}, {method: 'POST', body}); return r?.result || r; };
    async function markDone(it) {
        let r;
        try { r = await post({op: 'done', key: it.key, title: it.title, open: it.open || null}); } catch (err) { A().toast(err.message, 'error', {retry: () => markDone(it)}); return; }
        await refresh();
        let prev = r.prev;
        A().undoToast(`✓ ${r.label || it.done_label || 'Fait'} : « ${it.title} »`, {
            undoneText: i18n('« {title} » remis à faire', {title: it.title}),
            undo: async () => { await post({op: 'restore', key: it.key, prev}); await refresh(); },
            redo: async () => { const r2 = await post({op: 'done', key: it.key, title: it.title, open: it.open || null}); prev = r2.prev; await refresh(); },
        });
    }
    async function snooze(it, until) {
        let r;
        try { r = await post({op: 'snooze', key: it.key, until, title: it.title}); } catch (err) { A().toast(err.message, 'error', {retry: () => snooze(it, until)}); return; }
        await refresh();
        let prev = r.prev;
        const when = until === 'tomorrow' ? 'à demain' : 'à la semaine prochaine';
        A().undoToast(i18n(until === 'tomorrow' ? '⏭ Reporté à demain : « {title} »' : '⏭ Reporté à la semaine prochaine : « {title} »', {title: it.title}), {
            undoneText: i18n('« {title} » n’est plus reporté', {title: it.title}),
            undo: async () => { await post({op: 'restore', key: it.key, prev}); await refresh(); },
            redo: async () => { const r2 = await post({op: 'snooze', key: it.key, until, title: it.title}); prev = r2.prev; await refresh(); },
        });
    }
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-msr-big]')) { e.preventDefault(); const card = t.closest('.dashboard-widget'); openBig(card?.dataset.dashboardWidget || ''); return; }
        const go = t.closest?.('[data-msr-go]'); if (go) { e.preventDefault(); bigDlg?.close(); A().state.researchKind = 'gaps'; A().setModule('recherche'); return; }
        const more = t.closest?.('[data-msr-more]');
        if (more) { const n = Number(more.dataset.msrMore) || 5; const hid = [...more.closest('.msr-sec').querySelectorAll('.msr-row[hidden]')]; hid.slice(0, n).forEach(r => { r.hidden = false; }); const left = hid.length - n; if (left > 0) more.textContent = moreLabel(Math.min(left, n)); else more.remove(); return; }
        const row = t.closest?.('[data-msr-key]'); if (!row || !t.closest('[data-msr-open], [data-msr-done], [data-msr-snooze]')) return;
        const it = byKey(row.dataset.msrKey); if (!it) return;
        e.preventDefault();
        if (t.closest('[data-msr-open]')) return openTarget(it.open);
        if (t.closest('[data-msr-done]')) { t.closest('button').disabled = true; return markDone(it); }
        const b = t.closest('[data-msr-snooze]');
        const items = [{icon: '⏭', label: 'À demain', run: () => snooze(it, 'tomorrow')}, {icon: '🗓', label: 'À la semaine prochaine', run: () => snooze(it, 'nextweek')}];
        if (UI().menuAt) UI().menuAt(b, items, {title: 'Reporter'}); else snooze(it, 'tomorrow');
    });
    // K14 : clic droit sur une ligne = le même menu que ses boutons
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('.msr-row[data-msr-key]'); if (!row || e.shiftKey || !UI().contextMenu) return;
        const it = byKey(row.dataset.msrKey); if (!it) return;
        e.preventDefault(); e.stopPropagation();
        UI().contextMenu(e, [
            ...(it.open ? [{icon: '↗', label: 'Ouvrir', run: () => openTarget(it.open)}] : []),
            ...(it.urgency === 'done' ? [] : [{icon: '✓', label: it.done_label || 'Fait', run: () => markDone(it)}, '-', {icon: '⏭', label: 'Reporter à demain', run: () => snooze(it, 'tomorrow')}, {icon: '🗓', label: 'Reporter à la semaine prochaine', run: () => snooze(it, 'nextweek')}]),
        ], {title: it.title});
    }, true);

    ext.semaine = {load, refresh, openBig, bodyHtml, cfgOf, visible, SORTS, ORDER}; // pour les tests
})();
