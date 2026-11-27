/* LCNDA — ⚖️ Comparaison (sorti d'app.js : app.js garde de petits relais qui l'appellent).
 * Comparer deux personnes (ou plus), une personne et un acte transcrit, ou deux images (signatures, photos) avec zoom et superposition.
 * Audit des onglets (§15) : 🧮 note de ressemblance, ↔ événements alignés par sorte (naissance en face de naissance), ⇄ inverser A et B,
 * 👥 fiches C, D… en plus, 🔀 fusionner depuis la comparaison (merge_people, valeur de A ou de B ligne à ligne), 📜 comparer avec un acte,
 * 🖼 rideau et différence pour deux images, ⤓ Exporter (PDF, CSV) et 🖨 Imprimer, 💾 vues enregistrées, mode consultation.
 * Essai : tests/test-audit-chrono.js
 */
(() => {
    'use strict';
    const {$, $$, api, dataRow, empty, escapeHtml, fetchMediaCompareInfo, genderText, mediaCompareLinkInfo, normalizedMediaType, persistUiState, personName, placeDisplay, renderSidebar, setModule, sidebarSignal, state, toast, years} = window.LCNDA_APP;
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const T = (s, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const kiosk = () => document.body.classList.contains('is-kiosk'); // R6 : mode consultation
    const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const MAX_EXTRA = 4; // A, B + jusqu'à 4 fiches en plus (C… F)
    const LETTERS = 'ABCDEF';
    const cmp = () => { state.comparison = state.comparison || {left: 0, right: 0, leftName: '', rightName: '', query: ''}; if (!Array.isArray(state.comparison.extra)) state.comparison.extra = []; return state.comparison; };
    const savedViews = () => (state.bootstrap?.savedViews || []).filter(v => v.module === 'comparison');

    /* ═════ Colonne de gauche ═════ */
    function renderComparisonSidebar(content, footer) {
        const mode = state.comparisonMode === 'images' ? 'images' : state.comparisonMode === 'acte' ? 'acte' : 'personnes';
        const modeToggle = `<div class="segmented comparison-mode-toggle"><button class="${mode === 'personnes' ? 'is-active ' : ''}comparison-mode-btn" data-comparison-mode="personnes">${escapeHtml(T('Personnes'))}</button><button class="${mode === 'acte' ? 'is-active ' : ''}comparison-mode-btn" data-comparison-mode="acte">📜 ${escapeHtml(T('Acte'))}</button><button class="${mode === 'images' ? 'is-active ' : ''}comparison-mode-btn" data-comparison-mode="images">${escapeHtml(T('Images'))}</button></div>`;
        const views = savedViews();
        const savedHtml = `<div class="section-label">💾 ${escapeHtml(T('Vues enregistrées'))}</div><div class="chrono-saved" id="comparison-saved">${views.length ? views.map(v => `<div class="saved-item chrono-saved-item" data-cmp-view-id="${Number(v.id)}"><button type="button" class="chrono-saved-open" data-cmp-open-view="${Number(v.id)}">${escapeHtml(v.name)}</button><button type="button" class="icon-button" data-cmp-view-more="${Number(v.id)}" title="${escapeHtml(T('Plus d’actions'))}" aria-label="${escapeHtml(T('Plus d’actions'))}">⋯</button></div>`).join('') : window.LCNDA_APP.empty(T('Aucune vue pour l’instant : choisis les fiches, puis « 💾 Enregistrer la vue ».'), {icon: '💾'})}</div>`;
        const sig = {signal: sidebarSignal()};
        content.addEventListener('click', async event => {
            const modeBtn = event.target.closest('[data-comparison-mode]');
            if (modeBtn) { state.comparisonMode = modeBtn.dataset.comparisonMode; persistUiState(); renderSidebar(); await renderComparison(); return; }
            const open = event.target.closest('[data-cmp-open-view]'); if (open) { applyView(Number(open.dataset.cmpOpenView)); return; }
            const more = event.target.closest('[data-cmp-view-more]'); if (more) { viewMenu(Number(more.dataset.cmpViewMore), more); return; }
            if (event.target.closest('[data-cmp-swap]')) { swap(); return; }
            if (event.target.closest('[data-cmp-add]')) { const c = cmp(); if (c.extra.length < MAX_EXTRA) { c.extra.push({id: 0, name: ''}); persistUiState(); renderSidebar(); } return; }
            const rm = event.target.closest('[data-cmp-rm-extra]'); if (rm) { const c = cmp(); c.extra.splice(Number(rm.dataset.cmpRmExtra), 1); persistUiState(); renderSidebar(); await renderComparison(); }
        }, sig);
        content.addEventListener('contextmenu', e => { const row = e.target.closest('[data-cmp-view-id]'); if (!row || e.shiftKey) return; e.preventDefault(); viewMenu(Number(row.dataset.cmpViewId), null, e); }, sig);
        if (mode === 'images') {
            // images A et B : la fenêtre unique des médias, dans un champ (pastille, « 🖼 Changer », ×) — comme les personnes A et B
            const mfSide = (side, label) => { const it = state.imageCompare[side]; const value = it?.id ? {...it, thumb: it.thumb || (normalizedMediaType(it) === 'image' && (it.thumbnail || it.filename) ? `media/${encodeURIComponent(it.thumbnail || it.filename)}` : '')} : null; return `<div class="pk-host"><span>${label}</span><div data-compare-mf="${side}">${window.LCNDA_PICKER?.mediaField ? window.LCNDA_PICKER.mediaField({name: '', types: ['image', 'document'], value, title: T('Choisir {x}', {x: label.toLowerCase()}), okLabel: T('Comparer')}) : ''}</div></div>`; };
            content.innerHTML = `${modeToggle}<div class="search-box comparison-pickers">${mfSide('left', T('L’image A'))}<button type="button" class="button small secondary cmp-swap-btn" data-cmp-swap title="${escapeHtml(T('Inverser A et B'))}">⇄ ${escapeHtml(T('Inverser'))}</button>${mfSide('right', T('L’image B'))}</div>${savedHtml}`;
            footer.innerHTML = `<button class="button small secondary" id="clear-image-comparison">↺ ${escapeHtml(T('Remettre comme au départ'))}</button>`;
            content.addEventListener('media-change', async event => {
                const side = event.target.closest('[data-compare-mf]')?.dataset.compareMf; if (!side) return;
                const it = event.detail.item;
                state.imageCompare[side] = it ? await fetchMediaCompareInfo({...it, thumbnail: it.thumbnail || it.filename, document_reference: it.cote || it.document_reference || '', date_text: it.date_text || ''}) : null;
                persistUiState(); await renderComparison();
            }, sig);
            $('#clear-image-comparison').addEventListener('click', async () => { state.imageCompare = {left: null, right: null, query: '', scope: '', results: [], personId: 0, personName: '', personSuggestions: []}; persistUiState(); renderSidebar(); await renderComparison(); }, sig);
            return;
        }
        const c = cmp();
        const pk = (key, label, id, name) => `<div class="pk-host"><span>${escapeHtml(label)}</span><div data-compare-pk="${key}">${(window.LCNDA_PICKER?.pickerField({name: 'compare_' + key, kind: 'person', allowCreate: false, value: id ? {id, title: name || '', kind: 'person'} : null}) || '').replace(` name="compare_${key}"`, '')}</div></div>`;
        if (mode === 'acte') {
            content.innerHTML = `${modeToggle}<div class="search-box comparison-pickers">${pk('left', T('Personne A'), Number(c.left) || 0, c.leftName)}<label class="pk-host"><span>📜 ${escapeHtml(T('L’acte transcrit'))}</span><select id="cmp-act-select"><option value="0">${escapeHtml(T('Chargement…'))}</option></select></label></div>${savedHtml}`;
            api('act_transcriptions').then(d => {
                const sel = $('#cmp-act-select'); if (!sel) return;
                const items = d.items || [], cur = Number(state.actCompare?.id) || 0;
                sel.innerHTML = `<option value="0">${escapeHtml(items.length ? T('Choisir un acte…') : T('Aucun acte transcrit pour l’instant.'))}</option>${items.map(it => `<option value="${Number(it.id)}" ${Number(it.id) === cur ? 'selected' : ''}>${escapeHtml([it.title || T('Acte'), it.date_text, it.place].filter(Boolean).join(' · '))}</option>`).join('')}`;
            }).catch(() => {});
            content.addEventListener('change', async e => { if (e.target.id !== 'cmp-act-select') return; state.actCompare = {id: Number(e.target.value) || 0}; persistUiState(); await renderComparison(); }, sig);
        } else {
            content.innerHTML = `${modeToggle}<div class="search-box comparison-pickers">${pk('left', T('Personne A'), Number(c.left) || 0, c.leftName)}<button type="button" class="button small secondary cmp-swap-btn" data-cmp-swap data-shortcut="Mod+Shift+X" title="${escapeHtml(T('Inverser A et B'))}">⇄ ${escapeHtml(T('Inverser'))}</button>${pk('right', T('Personne B'), Number(c.right) || 0, c.rightName)}${c.extra.map((x, i) => `<div class="cmp-extra">${pk('x' + i, T('Personne {l}', {l: LETTERS[i + 2]}), Number(x.id) || 0, x.name)}<button type="button" class="icon-button" data-cmp-rm-extra="${i}" title="${escapeHtml(T('Retirer cette fiche de la comparaison'))}" aria-label="${escapeHtml(T('Retirer cette fiche de la comparaison'))}">×</button></div>`).join('')}${c.extra.length < MAX_EXTRA ? `<button type="button" class="button small secondary cmp-add-btn" data-cmp-add>＋ ${escapeHtml(T('Ajouter une fiche ({l})', {l: LETTERS[c.extra.length + 2]}))}</button>` : ''}</div>${savedHtml}`;
        }
        footer.innerHTML = (mode === 'acte' ? `<small>${escapeHtml(T('Les actes viennent de Listes → Transcriptions d’actes.'))}</small><br>` : '') + `<button class="button small secondary" id="clear-comparison">↺ ${escapeHtml(T('Remettre comme au départ'))}</button>`;
        content.addEventListener('picker-change', async event => {
            const key = event.target.closest('[data-compare-pk]')?.dataset.comparePk; if (!key) return;
            const it = event.detail.item, id = it && !it.free ? Number(it.id) : 0, name = it ? it.title : '';
            if (key === 'left' || key === 'right') { c[key] = id; c[`${key}Name`] = name; } else { const i = Number(key.slice(1)); if (c.extra[i]) c.extra[i] = {id, name}; }
            mergeOpen = false; persistUiState(); await renderComparison();
        }, sig);
        $('#clear-comparison').addEventListener('click', async () => { state.comparison = {left: 0, right: 0, leftName: '', rightName: '', query: '', extra: []}; state.actCompare = {id: 0}; persistUiState(); renderSidebar(); await renderComparison(); }, sig);
    }
    async function swap() {
        if (state.comparisonMode === 'images') { const ic = state.imageCompare; [ic.left, ic.right] = [ic.right, ic.left]; }
        else { const c = cmp(); [c.left, c.right, c.leftName, c.rightName] = [c.right, c.left, c.rightName, c.leftName]; }
        persistUiState(); renderSidebar(); await renderComparison();
    }

    /* ═════ 🧮 Ressemblance et ↔ alignement par sorte d'événement ═════ */
    const eventKey = e => String(e.gedcom_tag || '').toUpperCase() || fold(e.type);
    const BIRTH = [['BIRT', 'BAPM', 'CHR'], /^(naissance|bapteme)/], DEATH = [['DEAT', 'BURI'], /^(deces|inhumation|sepulture)/];
    const firstOf = (item, [tags, re]) => { const evs = item?.events || []; return evs.find(e => tags.includes(String(e.gedcom_tag || '').toUpperCase())) || evs.find(e => re.test(fold(e.type))) || null; };
    function lev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let prev = Array.from({length: n + 1}, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
    const textSim = (a, b) => { a = fold(a); b = fold(b); if (!a || !b) return null; if (a === b) return 1; const ta = new Set(a.split(' ')), tb = new Set(b.split(' ')); const common = [...ta].filter(x => tb.has(x)).length; const jac = common / new Set([...ta, ...tb]).size; return Math.max(jac, 1 - lev(a, b) / Math.max(a.length, b.length)); };
    const yearGap = (a, b) => { const ya = Number(a?.year) || 0, yb = Number(b?.year) || 0; if (!ya || !yb) return null; const g = Math.abs(ya - yb); return g === 0 ? 1 : g <= 2 ? 0.8 : g <= 5 ? 0.5 : g <= 10 ? 0.2 : 0; };
    const placeSim = (a, b) => { const pa = fold(a?.place), pb = fold(b?.place); if (!pa || !pb) return null; if (pa === pb) return 1; return pa.split(' ')[0] === pb.split(' ')[0] ? 0.5 : 0; };
    /** note de ressemblance de deux fiches : {pct, parts:[{label, value(0..1|null), text}]} */
    function similarity(l, r) {
        if (!l || !r) return null;
        const pl = l.person, pr = r.person;
        const bl = firstOf(l, BIRTH), br = firstOf(r, BIRTH), dl = firstOf(l, DEATH), dr = firstOf(r, DEATH);
        const names = (() => { const f = textSim(pl.first_name, pr.first_name), n = textSim(pl.last_name, pr.last_name); const v = [f, n].filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; })();
        const dates = (() => { const v = [yearGap(bl, br), yearGap(dl, dr)].filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; })();
        const places = (() => { const v = [placeSim(bl, br), placeSim(dl, dr)].filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; })();
        const parents = (() => {
            const of = it => (it.relations || []).filter(x => x.role === 'parent');
            const a = of(l), b = of(r); if (!a.length || !b.length) return null;
            const key = x => `${Number(x.id)}`, nm = x => fold(x.name);
            const same = a.filter(x => b.some(y => key(y) === key(x) || (nm(x) && nm(y) === nm(x)))).length;
            return same / Math.max(a.length, b.length);
        })();
        const parts = [
            {label: T('Noms'), w: 35, value: names, text: A().personName(pl) + ' / ' + A().personName(pr)},
            {label: T('Dates'), w: 30, value: dates, text: [bl && br ? T('naissance : {a} / {b}', {a: bl.year || '?', b: br.year || '?'}) : '', dl && dr ? T('décès : {a} / {b}', {a: dl.year || '?', b: dr.year || '?'}) : ''].filter(Boolean).join(' · ')},
            {label: T('Lieux'), w: 15, value: places, text: [bl?.place && br?.place ? `${bl.place} / ${br.place}` : '', dl?.place && dr?.place ? `${dl.place} / ${dr.place}` : ''].filter(Boolean).join(' · ')},
            {label: T('Parents en commun'), w: 20, value: parents, text: ''},
        ];
        const used = parts.filter(p => p.value != null);
        let pct = used.length ? Math.round(100 * used.reduce((s, p) => s + p.w * p.value, 0) / used.reduce((s, p) => s + p.w, 0)) : 0;
        const gl = pl.gender, gr = pr.gender, genderClash = ['male', 'female'].includes(gl) && ['male', 'female'].includes(gr) && gl !== gr;
        if (genderClash) pct = Math.round(pct * 0.3);
        return {pct, parts, genderClash};
    }
    /** les lignes d'événements alignées par sorte : [{key, label, cells:[event|null, …]}] dans l'ordre des années */
    function alignedRows(items) {
        const groups = new Map();
        items.forEach((it, col) => (it?.events || []).forEach(e => { const k = eventKey(e); const g = groups.get(k) || groups.set(k, {key: k, label: e.type, cols: items.map(() => [])}).get(k); g.cols[col].push(e); }));
        const rows = [];
        groups.forEach(g => { const n = Math.max(...g.cols.map(c => c.length)); for (let i = 0; i < n; i++) rows.push({key: g.key, label: g.label, cells: g.cols.map(c => c[i] || null)}); });
        const yr = r => Math.min(...r.cells.filter(Boolean).map(e => Number(e.year) || 9999));
        return rows.sort((a, b) => yr(a) - yr(b) || a.label.localeCompare(b.label));
    }
    const sameEvent = (a, b) => a && b && fold(a.date_text || a.year) === fold(b.date_text || b.year) && fold(a.place) === fold(b.place);

    /* ═════ Personnes ═════ */
    let mergeOpen = false, lastData = null;
    async function renderComparison(token = ++state.workspaceToken) {
        if (state.comparisonMode === 'images') return renderComparisonImages(token);
        if (state.comparisonMode === 'acte') return renderComparisonAct(token);
        const c = cmp();
        if (!$('#workspace .cmp-page')) $('#workspace').innerHTML = `<section class="page cmp-page">${UI().spinner ? UI().spinner(T('Chargement de la comparaison…')) : ''}</section>`; // R10
        const ids = [Number(c.left) || 0, Number(c.right) || 0, ...c.extra.map(x => Number(x.id) || 0)];
        let data, extras;
        try {
            data = await api('comparison', {a: ids[0], b: ids[1]});
            extras = await Promise.all(ids.slice(2).map(id => (id ? api('comparison', {a: id, b: 0}).then(d => d.left) : null)));
        } catch (error) { if (token === state.workspaceToken) $('#workspace').innerHTML = empty(error.message, {icon: '⚠️'}); return; }
        if (token !== state.workspaceToken || state.module !== 'comparaison') return;
        const left = data.left, right = data.right, items = [left, right, ...extras];
        lastData = {items};
        const score = similarity(left, right);
        const both = !!(left && right);
        const actions = [
            `<button type="button" class="button secondary" data-cmp-swap-head data-shortcut="Mod+Shift+X" title="${escapeHtml(T('Inverser A et B'))}" ${both ? '' : 'disabled'}>⇄ ${escapeHtml(T('Inverser'))}</button>`,
            `<button type="button" class="button secondary" data-cmp-export data-shortcut="Mod+E" title="${escapeHtml(T('Exporter la comparaison (⌘E)'))}">⤓ ${escapeHtml(T('Exporter'))} ▾</button>`,
            `<button type="button" class="button secondary" data-cmp-print data-shortcut="Mod+P" title="${escapeHtml(T('Imprimer la comparaison (⌘P)'))}">🖨 ${escapeHtml(T('Imprimer'))}</button>`,
        ];
        const primary = both && !kiosk() ? `<button type="button" class="button" data-cmp-merge-open title="${escapeHtml(T('Garder une seule fiche : choisis la valeur de A ou de B ligne à ligne'))}">🔀 ${escapeHtml(T('Fusionner…'))}</button>` : '';
        const more = kiosk() ? [] : [`<button type="button" data-cmp-save-view data-shortcut="Mod+S">💾 ${escapeHtml(T('Enregistrer la vue'))}</button>`];
        const cols = items.length;
        $('#workspace').innerHTML = `<section class="page cmp-page">${UI().pageHeader({title: T('Comparer des fiches'), help: T('Pour décider si deux fiches sont des doublons, des homonymes ou deux branches distinctes.'), primary, actions, more})}
            ${score ? scoreHtml(score) : ''}
            <div class="comparison-grid cmp-cols-${Math.min(cols, 6)}">${items.map((it, i) => comparisonPanel(LETTERS[i], it, i === 0 ? c.leftName : i === 1 ? c.rightName : c.extra[i - 2]?.name, i >= 2 && it && left ? similarity(left, it) : null)).join('')}</div>
            ${both ? comparisonTable(items) : empty(T('Choisis une personne A et une personne B dans la colonne de gauche.'), {icon: '⚖️'})}
            <div id="cmp-merge-slot">${both && mergeOpen && !kiosk() ? mergePanelHtml(left, right) : ''}</div></section>`;
        const ws = $('#workspace');
        $$('[data-open-person]', ws).forEach(button => button.addEventListener('click', () => { state.currentPersonId = Number(button.dataset.openPerson); setModule('personnes'); }));
        $('[data-cmp-swap-head]', ws)?.addEventListener('click', swap);
        $('[data-cmp-export]', ws)?.addEventListener('click', openExport);
        $('[data-cmp-print]', ws)?.addEventListener('click', printComparison);
        $('[data-cmp-save-view]', ws)?.addEventListener('click', saveView);
        $('[data-cmp-merge-open]', ws)?.addEventListener('click', () => { mergeOpen = !mergeOpen; const slot = $('#cmp-merge-slot'); slot.innerHTML = mergeOpen ? mergePanelHtml(left, right) : ''; bindMerge(left, right); slot.scrollIntoView?.({behavior: 'smooth', block: 'start'}); });
        bindMerge(left, right);
    }
    function scoreHtml(s) {
        const lvl = s.pct >= 75 ? 'is-high' : s.pct >= 45 ? 'is-mid' : 'is-low';
        const word = s.pct >= 75 ? T('Sans doute la même personne') : s.pct >= 45 ? T('Peut-être la même personne') : T('Sans doute deux personnes différentes');
        return `<section class="card span-12 cmp-score ${lvl}" data-cmp-score="${s.pct}"><div class="cmp-score-main"><b>🧮 ${escapeHtml(T('Ressemblance {n} %', {n: s.pct}))}</b><span>${escapeHtml(word)}</span></div><ul class="cmp-score-parts">${s.parts.map(p => `<li><span>${escapeHtml(p.label)}</span><meter min="0" max="1" value="${p.value ?? 0}"></meter><small>${p.value == null ? escapeHtml(T('rien à comparer')) : `${Math.round(p.value * 100)} %`}${p.text ? ` · ${escapeHtml(p.text)}` : ''}</small></li>`).join('')}${s.genderClash ? `<li class="cmp-score-warn">⚠️ ${escapeHtml(T('Sexes différents'))}</li>` : ''}</ul><p class="cmp-score-note">${escapeHtml(T('Une aide pour décider, pas une preuve : regarde aussi les sources.'))}</p></section>`;
    }
    function comparisonPanel(label, item, fallback, sim = null) {
        if (!item) return `<article class="card span-6"><header class="card-head"><div class="card-title"><span class="card-index">${label}</span><h3>${escapeHtml(T('À choisir'))}</h3></div></header><div class="card-body">${empty(T('Choisis cette personne dans la colonne de gauche.'), {icon: '👤'})}</div></article>`;
        const p = item.person;
        return `<article class="card span-6"><header class="card-head"><div class="card-title"><span class="card-index">${label}</span><h3>${escapeHtml(personName(p) || fallback)}</h3></div><button class="button small secondary" data-open-person="${p.id}">${escapeHtml(T('Ouvrir'))}</button></header><div class="card-body">${sim ? `<p class="cmp-sim-chip">🧮 ${escapeHtml(T('Ressemblance avec A : {n} %', {n: sim.pct}))}</p>` : ''}<dl class="data-list">${dataRow(T('Dates'), years(p))}${dataRow(T('Genre'), genderText(p.gender))}${dataRow(T('Groupe'), p.surname_group || '—')}${dataRow(T('Médias'), item.counts.media_count || 0)}${dataRow(T('Sources'), item.counts.source_count || 0)}${dataRow(T('Preuves'), item.counts.evidence_count || 0)}${dataRow(T('Hypothèses'), item.counts.hypothesis_count || 0)}</dl></div></article>`;
    }
    function comparisonTable(items) {
        const live = items.filter(Boolean);
        const rows = alignedRows(items).map(r => { const diff = r.cells.filter(Boolean).length < live.length || !r.cells.filter(Boolean).every(e => sameEvent(e, r.cells.find(Boolean))); return `<tr class="${diff ? 'is-diff' : 'is-same'}" data-cmp-key="${escapeHtml(r.key)}"><th scope="row">${escapeHtml(r.label)}</th>${r.cells.map((e, i) => (items[i] ? `<td>${compareEvent(e)}</td>` : '')).join('')}</tr>`; }).join('');
        const relText = item => item.relations.reduce((acc, row) => { (acc[row.role] ??= []).push(row.name); return acc; }, {});
        return `<section class="card span-12 comparison-table"><header class="card-head"><div class="card-title"><span class="card-index">Δ</span><h3>${escapeHtml(T('Différences visibles'))}</h3></div><small class="muted">${escapeHtml(T('Naissance en face de naissance, décès en face de décès ; les lignes différentes sont marquées.'))}</small></header><div class="card-body cmp-table-wrap"><table><thead><tr><th>${escapeHtml(T('Sorte'))}</th>${items.map((it, i) => (it ? `<th>${LETTERS[i]} · ${escapeHtml(personName(it.person))}</th>` : '')).join('')}</tr></thead><tbody><tr><th scope="row">${escapeHtml(T('Relations'))}</th>${items.map(it => (it ? `<td>${compareRelations(relText(it))}</td>` : '')).join('')}</tr>${rows}</tbody></table></div></section>`;
    }
    function compareEvent(event) { return event ? `<strong>${escapeHtml(event.type)}</strong><br><small>${escapeHtml(event.date_text || event.year || '?')} · ${escapeHtml(placeDisplay(event) || T('lieu inconnu'))}</small>` : '—'; }
    function compareRelations(rel) { return `<small>${escapeHtml(T('Parents : {x}', {x: (rel.parent || []).join(', ') || '—'}))}</small><br><small>${escapeHtml(T('Conjoints : {x}', {x: (rel.spouse || []).join(', ') || '—'}))}</small><br><small>${escapeHtml(T('Enfants : {x}', {x: (rel.child || []).join(', ') || '—'}))}</small>`; }

    /* ═════ 🔀 Fusionner depuis la comparaison (merge_people) ═════ */
    const FIELDS = [['first_name', 'Prénom'], ['middle_name', 'Autres prénoms'], ['last_name', 'Nom'], ['gender', 'Sexe'], ['occupation', 'Métier']];
    const showField = (f, v) => (f === 'gender' ? genderText(v) : String(v || '')) || '—';
    function mergePanelHtml(left, right) {
        const pl = left.person, pr = right.person;
        const fieldRows = FIELDS.filter(([f]) => fold(pl[f]) !== fold(pr[f]) && (pl[f] || pr[f]) && !(f === 'gender' && (pl[f] || 'unknown') === (pr[f] || 'unknown'))).map(([f, lab]) => {
            const def = pl[f] && !(f === 'gender' && pl[f] === 'unknown') ? 'a' : 'b';
            return `<tr data-merge-field="${f}"><th scope="row">${escapeHtml(T(lab))}</th><td><label class="checkbox-line"><input type="radio" name="mf-${f}" value="a" ${def === 'a' ? 'checked' : ''}> ${escapeHtml(showField(f, pl[f]))}</label></td><td><label class="checkbox-line"><input type="radio" name="mf-${f}" value="b" ${def === 'b' ? 'checked' : ''}> ${escapeHtml(showField(f, pr[f]))}</label></td><td></td></tr>`;
        });
        const evRows = alignedRows([left, right]).filter(r => r.cells[0] && r.cells[1]).map((r, i) => {
            const [a, b] = r.cells, def = sameEvent(a, b) ? 'a' : 'both';
            return `<tr data-merge-event data-ev-a="${Number(a.id)}" data-ev-b="${Number(b.id)}"><th scope="row">${escapeHtml(r.label)}</th><td><label class="checkbox-line"><input type="radio" name="me-${i}" value="a" ${def === 'a' ? 'checked' : ''}> ${escapeHtml([a.date_text || a.year, placeDisplay(a)].filter(Boolean).join(' · ') || '?')}</label></td><td><label class="checkbox-line"><input type="radio" name="me-${i}" value="b"> ${escapeHtml([b.date_text || b.year, placeDisplay(b)].filter(Boolean).join(' · ') || '?')}</label></td><td><label class="checkbox-line"><input type="radio" name="me-${i}" value="both" ${def === 'both' ? 'checked' : ''}> ${escapeHtml(T('Les deux'))}</label></td></tr>`;
        });
        const alone = alignedRows([left, right]).filter(r => !r.cells[0] || !r.cells[1]).length;
        return `<section class="card span-12 cmp-merge" id="cmp-merge"><header class="card-head"><div class="card-title"><span class="card-index">🔀</span><h3>${escapeHtml(T('Fusionner ces deux fiches'))}</h3></div></header><div class="card-body">
            <p>${escapeHtml(T('Pour chaque ligne, choisis la valeur à garder. Les sources, médias, notes, liens de famille des deux fiches sont tous gardés.'))}</p>
            <div class="cmp-merge-keep" role="radiogroup"><b>${escapeHtml(T('Fiche gardée :'))}</b> <label class="checkbox-line"><input type="radio" name="merge-keep" value="a" checked> A · ${escapeHtml(personName(pl))}</label> <label class="checkbox-line"><input type="radio" name="merge-keep" value="b"> B · ${escapeHtml(personName(pr))}</label></div>
            <div class="cmp-table-wrap"><table class="cmp-merge-table"><thead><tr><th></th><th>A</th><th>B</th><th></th></tr></thead><tbody>${fieldRows.join('') || ''}${evRows.join('')}</tbody></table></div>
            ${!fieldRows.length && !evRows.length ? `<p class="muted">${escapeHtml(T('Rien à choisir : les deux fiches ne se contredisent pas.'))}</p>` : ''}
            ${alone ? `<p class="muted">${escapeHtml(T('{n} événement(s) présent(s) sur une seule fiche : gardé(s) tel(s) quel(s).', {n: alone}))}</p>` : ''}
            <div class="modal-actions"><button type="button" class="button secondary" data-cmp-merge-cancel>${escapeHtml(T('Annuler'))}</button><button type="button" class="button" data-cmp-merge-run>🔀 ${escapeHtml(T('Fusionner'))}</button></div></div></section>`;
    }
    function bindMerge(left, right) {
        const box = $('#cmp-merge'); if (!box || !left || !right) return;
        $('[data-cmp-merge-cancel]', box)?.addEventListener('click', () => { mergeOpen = false; $('#cmp-merge-slot').innerHTML = ''; });
        $('[data-cmp-merge-run]', box)?.addEventListener('click', () => runMerge(left, right, box));
    }
    /** la fusion : merge_people (tout passe sur la fiche gardée), puis les valeurs choisies sur la fiche gardée, puis les événements en double retirés (↶) */
    async function runMerge(left, right, box) {
        if (kiosk()) return;
        const keepA = ($('input[name="merge-keep"]:checked', box)?.value || 'a') === 'a';
        const target = keepA ? left : right, source = keepA ? right : left;
        const choices = {fields: {}, drop: []};
        $$('[data-merge-field]', box).forEach(tr => { const v = $('input:checked', tr)?.value; const f = tr.dataset.mergeField; choices.fields[f] = (v === 'a' ? left : right).person[f] ?? ''; });
        $$('[data-merge-event]', box).forEach(tr => { const v = $('input:checked', tr)?.value; if (v === 'a') choices.drop.push(Number(tr.dataset.evB)); else if (v === 'b') choices.drop.push(Number(tr.dataset.evA)); });
        const ok = await A().confirmBox?.({title: T('Fusionner les deux fiches ?'), message: T('« {b} » sera fusionnée dans « {a} » : tout ce qui la concerne passe sur « {a} », puis elle disparaît. Une fusion ne peut pas être annulée.', {a: personName(target.person), b: personName(source.person)}), okLabel: T('🔀 Fusionner'), danger: true});
        if (!ok) return;
        const tid = Number(target.person.id), sid = Number(source.person.id);
        try { await api('merge_people', {}, {method: 'POST', body: {target_id: tid, source_id: sid}}); }
        catch (error) { toast(error.message, 'error'); return; }
        // les valeurs choisies (seulement celles qui changent la fiche gardée)
        const patch = {}; Object.entries(choices.fields).forEach(([f, v]) => { if (String(v ?? '') !== String(target.person[f] ?? '')) patch[f] = v; });
        if (Object.keys(patch).length) {
            try {
                const fresh = (await api('comparison', {a: tid, b: 0})).left?.person || target.person;
                const keep = {}; ['outside_genealogy', 'is_artist', 'artist_discipline', 'artist_events_display', 'show_military_block'].forEach(k => { keep[k] = fresh[k] ?? ''; });
                await api('save_person', {}, {method: 'POST', body: {id: tid, ...keep, ...patch}});
            } catch (error) { toast(T('Fusion faite, mais une valeur n’a pas pu être reprise : {err}', {err: error.message}), 'error'); }
        }
        const dropped = [];
        for (const id of choices.drop.filter(Boolean)) { try { await api('delete_event', {}, {method: 'POST', body: {id}}); dropped.push(id); } catch (_) { /* déjà parti avec un couple fusionné */ } }
        const c = cmp(); c.left = tid; c.leftName = personName(target.person); c.right = 0; c.rightName = ''; mergeOpen = false; persistUiState();
        try { await A().reloadBootstrap?.(); } catch (_) {}
        renderSidebar(); await renderComparison();
        const again = async () => { renderSidebar(); await renderComparison(); };
        if (dropped.length) A().undoToast?.(T('Fiches fusionnées : {n} événement(s) en double retiré(s)', {n: dropped.length}), {undoneText: T('événements en double remis'), undo: async () => { for (const id of dropped) await api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'event', entity_id: id}}); await again(); }, redo: async () => { for (const id of dropped) await api('delete_event', {}, {method: 'POST', body: {id}}); await again(); }});
        else toast(T('Fiches fusionnées.'));
    }

    /* ═════ 📜 Comparer une personne avec un acte transcrit ═════ */
    async function renderComparisonAct(token) {
        const c = cmp(), actId = Number(state.actCompare?.id) || 0;
        let person = null, act = null;
        try {
            [person, act] = await Promise.all([Number(c.left) ? api('comparison', {a: c.left, b: 0}).then(d => d.left) : null, actId ? api('act_transcription', {id: actId}) : null]);
        } catch (error) { if (token === state.workspaceToken) $('#workspace').innerHTML = empty(error.message, {icon: '⚠️'}); return; }
        if (token !== state.workspaceToken || state.module !== 'comparaison' || state.comparisonMode !== 'acte') return;
        const clues = person && act ? actClues(person, act) : null;
        const actions = [`<button type="button" class="button secondary" data-cmp-print data-shortcut="Mod+P">🖨 ${escapeHtml(T('Imprimer'))}</button>`];
        const body = act ? highlight(String(act.body || ''), clues?.words || []) : '';
        $('#workspace').innerHTML = `<section class="page cmp-page">${UI().pageHeader({title: T('Comparer avec un acte'), help: T('Cet acte parle-t-il de cette personne ? Les noms, années et lieux de la fiche sont cherchés dans le texte.'), actions})}
            ${clues ? `<section class="card span-12 cmp-score ${clues.pct >= 60 ? 'is-high' : clues.pct >= 30 ? 'is-mid' : 'is-low'}" data-cmp-act-score="${clues.pct}"><div class="cmp-score-main"><b>📜 ${escapeHtml(T('Concordance {n} %', {n: clues.pct}))}</b><span>${escapeHtml(clues.pct >= 60 ? T('Cet acte parle sans doute de cette personne') : clues.pct >= 30 ? T('Cet acte parle peut-être de cette personne') : T('Peu d’indices dans cet acte'))}</span></div><ul class="cmp-score-parts">${clues.items.map(x => `<li class="${x.ok ? 'is-ok' : 'is-no'}"><span>${x.ok ? '✓' : '✗'} ${escapeHtml(x.label)}</span><small>${escapeHtml(x.text)}</small></li>`).join('')}</ul></section>` : ''}
            <div class="comparison-grid cmp-cols-2">${comparisonPanel('A', person, c.leftName)}
            <article class="card span-6 cmp-act"><header class="card-head"><div class="card-title"><span class="card-index">📜</span><h3>${escapeHtml(act ? act.title || T('Acte') : T('À choisir'))}</h3></div></header><div class="card-body">${act ? `<p class="muted">${escapeHtml([act.kind, act.date_text, act.place, act.source].filter(Boolean).join(' · '))}</p><div class="cmp-act-text">${body || `<em>${escapeHtml(T('Texte vide.'))}</em>`}</div>` : empty(T('Choisis un acte transcrit dans la colonne de gauche.'), {icon: '📜'})}</div></article></div></section>`;
        $$('[data-open-person]').forEach(b => b.addEventListener('click', () => { state.currentPersonId = Number(b.dataset.openPerson); setModule('personnes'); }));
        $('[data-cmp-print]')?.addEventListener('click', printComparison);
    }
    function actClues(item, act) {
        const p = item.person, text = fold([act.body, act.title, act.place, act.date_text, JSON.stringify(act.data?.people || '')].join(' '));
        const has = w => { const f = fold(w); return f.length >= 2 && new RegExp(`(^| )${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(text); };
        const firsts = String(p.first_name || '').split(/[\s,-]+/).filter(x => x.length > 1), last = String(p.last_name || '').trim();
        const evYears = (item.events || []).map(e => Number(e.year)).filter(Boolean), places = [...new Set((item.events || []).map(e => e.place).filter(Boolean))];
        const ay = (String(act.date_text || '').match(/(1\d{3}|20\d\d)/) || [])[1], actYear = Number(ay) || 0;
        const born = Math.min(...evYears), died = Math.max(...evYears);
        const items = [
            {label: T('Nom'), w: 40, ok: !!last && has(last), text: last || '—'},
            {label: T('Prénom'), w: 25, ok: firsts.some(has), text: firsts.join(' ') || '—'},
            {label: T('Année de l’acte dans sa vie'), w: 15, ok: !!actYear && evYears.length > 0 && actYear >= born - 1 && actYear <= died + 1, text: actYear ? T('acte de {y}, fiche {a}–{b}', {y: actYear, a: evYears.length ? born : '?', b: evYears.length ? died : '?'}) : T('acte sans année')},
            {label: T('Même année qu’un événement'), w: 10, ok: !!actYear && evYears.includes(actYear), text: actYear ? String(actYear) : '—'},
            {label: T('Lieu'), w: 10, ok: places.some(pl => has(String(pl).split(',')[0])), text: places.slice(0, 3).join(', ') || '—'},
        ];
        const pct = Math.round(items.reduce((s, x) => s + (x.ok ? x.w : 0), 0));
        return {pct, items, words: [last, ...firsts, ...places.map(pl => String(pl).split(',')[0]), ...evYears.map(String)].filter(w => w && String(w).length > 1)};
    }
    function highlight(text, words) {
        let html = escapeHtml(text).replace(/\n/g, '<br>');
        const ws = [...new Set(words.map(w => escapeHtml(String(w))))].sort((a, b) => b.length - a.length);
        if (!ws.length) return html;
        const re = new RegExp(`(${ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        return html.split(/(<[^>]+>)/).map(part => (part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>'))).join('');
    }

    /* ═════ Images ═════ */
    function comparisonImagePane(label, item, slot) {
        if (!item) return `<section class="media-compare-pane is-empty" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span></div></header><p>${escapeHtml(T('Choisis un média à gauche pour {x}.', {x: slot === 'left' ? T('Document A') : T('Document B')}))}</p></section>`;
        const title = escapeHtml(item.title || item.attachment_label || item.filename || T('Média'));
        const body = normalizedMediaType(item) === 'pdf'
            ? `<iframe src="media/${encodeURIComponent(item.filename)}" title="${title}"></iframe>`
            : `<div class="media-compare-zoom-wrap" data-compare-zoom="${slot}"><img class="media-compare-zoom-img" src="media/${encodeURIComponent(item.filename)}" alt="${title}" draggable="false"></div>`;
        return `<section class="media-compare-pane" data-slot="${slot}"><header><div><span>${escapeHtml(label)}</span><strong>${title}</strong><small class="media-compare-pane-link">${escapeHtml(mediaCompareLinkInfo(item))}</small></div><div class="media-compare-pane-actions">${kiosk() ? '' : `<button type="button" class="button small danger" data-image-remove="${slot}">${escapeHtml(T('Retirer'))}</button>`}</div></header>${body}</section>`;
    }
    /** superposition : transparence, ⇹ rideau (curseur vertical à glisser) ou ◧ différence (ce qui change ressort, le reste est noir) */
    function comparisonOverlayHtml(left, right) {
        if (!left || !right || normalizedMediaType(left) === 'pdf' || normalizedMediaType(right) === 'pdf') return '';
        const leftTitle = escapeHtml(left.title || left.filename || T('Document A')), rightTitle = escapeHtml(right.title || right.filename || T('Document B'));
        const m = state.imageOverlayMode || 'fade';
        return `<section class="media-compare-overlay cmp-overlay is-${m}" data-overlay-mode="${m}"><header><div><span class="eyebrow">${escapeHtml(T('SIGNATURES'))}</span><h3>${escapeHtml(T('Superposition'))}</h3><p>${leftTitle} + ${rightTitle}</p></div><div class="segmented" role="radiogroup">${[['fade', '◐', T('Transparence')], ['curtain', '⇹', T('Rideau')], ['diff', '◧', T('Différence')]].map(([k, ic, lab]) => `<button type="button" class="${m === k ? 'is-active' : ''}" data-overlay-set="${k}">${ic} ${escapeHtml(lab)}</button>`).join('')}</div><label>${escapeHtml(m === 'curtain' ? T('Place du rideau') : T('Opacité B'))}<input id="signature-overlay-opacity" type="range" min="0" max="100" value="50"></label></header><div class="signature-overlay-stage"><img src="media/${encodeURIComponent(left.filename)}" alt="${leftTitle}"><img class="signature-overlay-top" src="media/${encodeURIComponent(right.filename)}" alt="${rightTitle}" style="${m === 'fade' ? 'opacity:.5' : m === 'curtain' ? 'clip-path:inset(0 0 0 50%)' : ''}">${m === 'curtain' ? '<span class="cmp-curtain-line" style="left:50%"></span>' : ''}</div></section>`;
    }
    function bindOverlay(root) {
        const box = $('.cmp-overlay', root); if (!box) return;
        const top = $('.signature-overlay-top', box), line = $('.cmp-curtain-line', box), range = $('#signature-overlay-opacity', box);
        const set = v => { const m = box.dataset.overlayMode; if (m === 'fade') top.style.opacity = String(v / 100); else if (m === 'curtain') { top.style.clipPath = `inset(0 0 0 ${v}%)`; if (line) line.style.left = `${v}%`; } else top.style.opacity = String(Math.max(0.05, v / 100) * 2 > 1 ? 1 : Math.max(0.05, v / 100) * 2); };
        range?.addEventListener('input', e => set(Number(e.target.value) || 0));
        $$('[data-overlay-set]', box).forEach(b => b.addEventListener('click', () => { state.imageOverlayMode = b.dataset.overlaySet; persistUiState(); renderComparisonImages(); }));
        const stage = $('.signature-overlay-stage', box); let drag = false;
        const at = e => { const r = stage.getBoundingClientRect(); const v = Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))); range.value = v; set(v); };
        stage.addEventListener('pointerdown', e => { if (box.dataset.overlayMode !== 'curtain') return; drag = true; stage.setPointerCapture?.(e.pointerId); at(e); });
        stage.addEventListener('pointermove', e => { if (drag) at(e); });
        stage.addEventListener('pointerup', () => { drag = false; });
    }
    function setupComparisonImageZoom(grid) {
        $$('.media-compare-zoom-wrap', grid).forEach(wrap => {
            const img = wrap.querySelector('img'); if (!img) return;
            let scale = 1, tx = 0, ty = 0, dragging = false, startX = 0, startY = 0;
            const apply = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; wrap.classList.toggle('is-zoomed', scale > 1); };
            const clamp = () => {
                if (scale <= 1) { tx = 0; ty = 0; return; }
                const maxX = (wrap.clientWidth * (scale - 1)) / 2, maxY = (wrap.clientHeight * (scale - 1)) / 2;
                tx = Math.max(-maxX, Math.min(maxX, tx)); ty = Math.max(-maxY, Math.min(maxY, ty));
            };
            wrap.addEventListener('wheel', event => {
                event.preventDefault();
                const prevScale = scale;
                scale = Math.max(1, Math.min(6, scale + (event.deltaY < 0 ? 0.35 : -0.35)));
                if (scale === prevScale) return;
                const rect = wrap.getBoundingClientRect(), cx = event.clientX - rect.left - rect.width / 2, cy = event.clientY - rect.top - rect.height / 2;
                tx -= cx * (scale / prevScale - 1); ty -= cy * (scale / prevScale - 1);
                clamp(); apply();
            }, {passive: false});
            wrap.addEventListener('dblclick', () => { scale = 1; tx = 0; ty = 0; apply(); });
            wrap.addEventListener('mousedown', event => {
                if (scale <= 1) return;
                dragging = true; wrap.classList.add('is-dragging'); startX = event.clientX - tx; startY = event.clientY - ty; event.preventDefault();
            });
            // écouteurs posés le temps du glisser seulement (sinon ils s'accumulent à chaque comparaison)
            const move = event => { tx = event.clientX - startX; ty = event.clientY - startY; clamp(); apply(); };
            const up = () => { dragging = false; wrap.classList.remove('is-dragging'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
            wrap.addEventListener('mousedown', () => { if (dragging) { window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); } });
            wrap.addEventListener('click', event => {
                if (scale > 1) return; // un clic en zoom sert à faire glisser, pas à re-zoomer
                scale = 2.5;
                clamp(); apply();
                event.stopPropagation();
            });
        });
    }
    const imageActions = () => [`<button type="button" class="button secondary" data-cmp-swap-head data-shortcut="Mod+Shift+X" title="${escapeHtml(T('Inverser A et B'))}">⇄ ${escapeHtml(T('Inverser'))}</button>`, `<button type="button" class="button secondary" data-cmp-print data-shortcut="Mod+P">🖨 ${escapeHtml(T('Imprimer'))}</button>`];
    const imageMore = () => (kiosk() ? [] : [`<button type="button" data-cmp-save-view data-shortcut="Mod+S">💾 ${escapeHtml(T('Enregistrer la vue'))}</button>`]);
    function bindImageHead(ws) {
        $('[data-cmp-swap-head]', ws)?.addEventListener('click', swap);
        $('[data-cmp-print]', ws)?.addEventListener('click', printComparison);
        $('[data-cmp-save-view]', ws)?.addEventListener('click', saveView);
    }
    async function renderComparisonImages(token = ++state.workspaceToken) {
        if (token !== state.workspaceToken || state.module !== 'comparaison' || state.comparisonMode !== 'images') return;
        let left = state.imageCompare.left, right = state.imageCompare.right;
        if (left && !left.people_links) left = await fetchMediaCompareInfo(left);
        if (right && !right.people_links) right = await fetchMediaCompareInfo(right);
        if (token !== state.workspaceToken || state.module !== 'comparaison' || state.comparisonMode !== 'images') return;
        state.imageCompare.left = left; state.imageCompare.right = right;
        const ws = $('#workspace');
        // 🔍 deux photos : l'outil « Comparer deux photos » dans la page (fondu, rideau, yeux alignés, ressemblance) + ◧ la différence ; un PDF garde les deux cases
        if (left && right && normalizedMediaType(left) === 'image' && normalizedMediaType(right) === 'image' && window.LCNDA_EXT?.mountPhotoCompare) {
            state._photoCompareTool?.destroy?.();
            ws.innerHTML = `<section class="page cmp-page">${UI().pageHeader({icon: '🔍', title: T('Comparer deux photos'), help: T('Côte à côte, en fondu ou en rideau, avec le même zoom ; aligne les yeux pour juger une ressemblance. Change les photos ici ou dans la colonne de gauche.'), actions: imageActions(), more: imageMore()})}<div class="h-pc-inline" id="comparison-photo-tool"></div>${comparisonOverlayHtml(left, right)}</section>`;
            state._photoCompareTool = window.LCNDA_EXT.mountPhotoCompare($('#comparison-photo-tool'), {inline: true, a: left, b: right});
            bindImageHead(ws); bindOverlay(ws);
            return;
        }
        ws.innerHTML = `<section class="page cmp-page">${UI().pageHeader({title: T('Comparer deux documents'), help: T('Choisis deux médias dans la colonne de gauche (« L’image A », « L’image B » : recherche par titre, cote, personne, lieu ou année) pour les comparer côte à côte, avec zoom indépendant sur chaque image.'), actions: imageActions(), more: imageMore()})}
        <div class="media-compare-grid" id="comparison-image-grid">${comparisonImagePane(T('Document A'), left, 'left')}${comparisonImagePane(T('Document B'), right, 'right')}</div>${comparisonOverlayHtml(left, right)}</section>`;
        const grid = $('#comparison-image-grid');
        setupComparisonImageZoom(grid);
        bindImageHead(ws); bindOverlay(ws);
        $$('[data-image-remove]', grid).forEach(button => button.addEventListener('click', async () => { const side = button.dataset.imageRemove; const before = state.imageCompare[side]; state.imageCompare[side] = null; persistUiState(); const f = document.querySelector(`[data-compare-mf="${side}"] [data-media-field]`); if (f) window.LCNDA_PICKER?.mediaSet?.(f, null); await renderComparisonImages(); A().undoToast?.(T('Image retirée de la comparaison'), {undo: async () => { state.imageCompare[side] = before; persistUiState(); renderSidebar(); await renderComparisonImages(); }}); }));
    }

    /* ═════ 💾 Vues enregistrées (module « comparison ») ═════ */
    const slimMedia = m => (m ? {id: m.id, title: m.title || '', filename: m.filename || '', thumbnail: m.thumbnail || '', media_type: m.media_type || '', mime_type: m.mime_type || ''} : null);
    function viewConfig() { const c = cmp(); return {mode: state.comparisonMode || 'personnes', left: Number(c.left) || 0, right: Number(c.right) || 0, leftName: c.leftName || '', rightName: c.rightName || '', extra: c.extra.filter(x => Number(x.id)), actId: Number(state.actCompare?.id) || 0, images: {left: slimMedia(state.imageCompare?.left), right: slimMedia(state.imageCompare?.right)}, overlay: state.imageOverlayMode || 'fade'}; }
    function viewName() {
        const c = cmp(), m = state.comparisonMode;
        if (m === 'images') return T('{a} et {b}', {a: state.imageCompare?.left?.title || T('Image A'), b: state.imageCompare?.right?.title || T('Image B')});
        if (m === 'acte') return T('{a} et un acte', {a: c.leftName || T('Personne A')});
        return T('{a} et {b}', {a: c.leftName || T('Personne A'), b: c.rightName || T('Personne B')});
    }
    function saveView() { if (!kiosk()) A().openViewDialog?.('comparison', viewConfig(), 0, viewName()); }
    async function applyView(id) {
        const v = savedViews().find(x => Number(x.id) === id); if (!v) return;
        const k = v.config || {};
        state.comparisonMode = k.mode || 'personnes';
        state.comparison = {left: Number(k.left) || 0, right: Number(k.right) || 0, leftName: k.leftName || '', rightName: k.rightName || '', query: '', extra: Array.isArray(k.extra) ? k.extra : []};
        state.actCompare = {id: Number(k.actId) || 0};
        if (k.images) state.imageCompare = {...(state.imageCompare || {}), left: k.images.left, right: k.images.right};
        state.imageOverlayMode = k.overlay || 'fade';
        mergeOpen = false; persistUiState(); renderSidebar(); await renderComparison();
        toast(T('Vue « {name} » affichée.', {name: v.name}));
    }
    function viewMenu(id, anchor, ev = null) {
        const v = savedViews().find(x => Number(x.id) === id); if (!v) return;
        const items = [{icon: '↗', label: T('Afficher'), run: () => applyView(id)}];
        if (!kiosk()) items.push({icon: '✎', label: T('Renommer'), run: () => A().openViewDialog?.('comparison', v.config || viewConfig(), id, v.name)}, '-', {icon: '🗑', label: T('Supprimer'), danger: true, run: () => A().deleteWithUndo?.({action: 'delete_view', body: {id}, type: 'view', id, message: T('Vue « {name} » supprimée', {name: v.name}), after: async () => { await A().reloadBootstrap?.(); renderSidebar(); }})});
        if (ev) UI().contextMenu?.(ev, items, {title: `« ${v.name} »`}); else UI().menuAt?.(anchor, items, {title: `« ${v.name} »`});
    }

    /* ═════ ⤓ Exporter · 🖨 Imprimer (R4) ═════ */
    const exportTitle = () => (state.comparisonMode === 'images' ? T('Comparaison de deux images') : state.comparisonMode === 'acte' ? T('Comparaison avec un acte') : T('Comparaison : {x}', {x: viewName()}));
    function printComparison() {
        const page = $('#workspace .cmp-page'); if (!page) return;
        const clone = page.cloneNode(true); clone.querySelectorAll('.page-actions, .ui-ph-actions, #cmp-merge-slot, .no-export').forEach(n => n.remove());
        const css = A().graphExportCss ? A().graphExportCss() : '';
        const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(exportTitle())}</title><style>${css}@page{margin:12mm}body{background:#fff;color:#000}</style></head><body>${clone.outerHTML}</body></html>`;
        if (UI().openPrintDialog) return UI().openPrintDialog({title: exportTitle(), key: 'comparaison', html: doc, photos: state.comparisonMode === 'images'});
        window.print(); // secours (sans LCNDA_UI)
    }
    function csvText() {
        const items = lastData?.items || [], cell = v => (A().csvCell ? A().csvCell(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
        const live = items.map((it, i) => [it, i]).filter(([it]) => it);
        const head = [T('Ligne'), ...live.map(([it, i]) => `${LETTERS[i]} · ${personName(it.person)}`)];
        const ev = e => (e ? [e.date_text || e.year || '?', placeDisplay(e)].filter(Boolean).join(' · ') : '');
        const rows = [
            [T('Dates'), ...live.map(([it]) => years(it.person))],
            [T('Genre'), ...live.map(([it]) => genderText(it.person.gender))],
            ...alignedRows(items).map(r => [r.label, ...live.map(([, i]) => ev(r.cells[i]))]),
        ];
        const s = similarity(items[0], items[1]); if (s) rows.push([T('Ressemblance A–B'), `${s.pct} %`]);
        return '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
    }
    function openExport() {
        const fileName = ext => `${A().safeExportFilename ? A().safeExportFilename(exportTitle(), 'comparaison') : 'comparaison'}.${ext}`;
        const csv = {id: 'csv', label: '📊 CSV', hint: T('tableur'), ext: 'csv', quality: false, run: async o => { const a = document.createElement('a'); a.download = o?.filename || fileName('csv'); a.href = URL.createObjectURL(new Blob([csvText()], {type: 'text/csv;charset=utf-8'})); document.body.appendChild(a); a.click(); a.remove(); }};
        if (!UI().openExportDialog) return csv.run();
        UI().openExportDialog({title: exportTitle(), defaultName: exportTitle(), quality: false, formats: [
            {id: 'pdf', hint: T('par l’impression : « Enregistrer en PDF »'), ext: '', run: async () => printComparison()},
            ...(state.comparisonMode === 'personnes' || !state.comparisonMode ? [csv] : []),
            {id: 'print', run: async () => printComparison()},
        ]});
    }
    // ⌘P imprime, ⌘E exporte, ⌘S enregistre la vue, ⌘⇧X inverse A et B (R5) — seulement dans la Comparaison, sans fenêtre ouverte
    window.addEventListener('keydown', e => {
        if (state.module !== 'comparaison' || !(e.metaKey || e.ctrlKey) || e.altKey || e.repeat || document.querySelector('dialog[open]')) return;
        const k = e.key?.toLowerCase();
        const run = e.shiftKey ? (k === 'x' ? swap : null) : k === 'p' ? printComparison : k === 'e' && state.comparisonMode !== 'images' && state.comparisonMode !== 'acte' ? openExport : k === 's' && !kiosk() ? saveView : null;
        if (!run) return; e.preventDefault(); e.stopPropagation(); run();
    }, true);

    window.LCNDA_PARTS = window.LCNDA_PARTS || {};
    Object.assign(window.LCNDA_PARTS, {renderComparison, renderComparisonSidebar, setupComparisonImageZoom});
    window.LCNDA_EXT = window.LCNDA_EXT || {};
    window.LCNDA_EXT.comparaison = {similarity, alignedRows, actClues, csvText};
    if (state.module === 'comparaison' && state.bootstrap) renderSidebar(); // la colonne de gauche attendait ce fichier (sinon le démarrage s'en charge)
})();
