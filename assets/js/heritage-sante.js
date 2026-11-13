/* LCNDA — 🩺 Santé de la famille : les maladies, handicaps, causes de décès et épidémies traversées connus dans la famille,
 * et comment ils se répartissent dans les branches. De la mémoire et de l'histoire familiale : aucun conseil médical, aucun
 * calcul de risque ni pourcentage — seulement ce qui a été noté et des nombres de personnes.
 *  - bloc « 🩺 Santé » de la fiche (rangé comme les autres blocs) : lignes notées (date C4, source, note, « à vérifier »),
 *    la cause écrite sur l'acte de décès (lue seulement), les épidémies de son vivant (« Le monde autour ») avec « ＋ Noter » ;
 *  - Listes → « 🩺 Santé de la famille » : barre H10, et l'onglet « 🌳 Par branches » (éventail des ancêtres coloré par la
 *    maladie choisie avec le menu de choix, et les quatre côtés des grands-parents, en nombres de personnes) ;
 *  - Réglages → Données → « 🩺 Santé de la famille » (K2) : caché au départ ; tant que c'est caché, ni bloc, ni liste, ni
 *    recherche (le serveur ne renvoie rien : lib/sante.php) ; jamais exporté, sauf la case du GEDCOM ; jamais imprimé avec la fiche.
 * Serveur : lib/sante.php (GET action=sante, POST sante_write). API : ext.sante.{shown, open(pid), add(pid)}.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['personBlocks', 'lists', 'maintenance']) ext[k] = ext[k] || {};
    ext.afterExport = ext.afterExport || [];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-sante';
    const KINDS = [['maladie', '🤒', 'Maladie'], ['handicap', '♿', 'Handicap'], ['deces', '🕯', 'Cause de décès'], ['epidemie', '🦠', 'Épidémie traversée'], ['autre', '🩺', 'Autre']];
    const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[4];
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const settings = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const shown = () => !!settings().show && !kiosk();
    const epiOn = () => settings().epidemics !== false;
    const get = (op, q = {}) => A().api('sante', {op, ...q});
    const post = async body => { const r = await A().api('sante_write', {}, {method: 'POST', body}); return r && typeof r === 'object' && 'result' in r ? r.result : r; };
    const plural = (n, w, many) => A().plural ? A().plural(n, w, many) : `${n} ${w}`;
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const years = r => (r.birth || r.death ? `${r.birth || '?'}–${r.death || ''}` : '');
    const legacyAv = p => { const g = p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u'; const ini = String(p.name || p.person || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase(); return `<span class="pk-av ${g}" aria-hidden="true">${esc(ini || '?')}</span>`; };
    const avatar = (p, size = 34) => (UI()?.avatarOr ? UI().avatarOr({id: p.id || p.person_id, name: p.name || p.person, gender: p.gender}, size, legacyAv(p)) : legacyAv(p));
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    /** la grande famille d'une maladie (même classement que le diagramme « 🎗 Causes de décès ») */
    const familyOf = label => { try { return window.LCNDA_EXT?.diagramCartes2?.familyOf?.(label) || ''; } catch (_) { return ''; } };

    // une liste privée cachée n'apparaît nulle part (app.js : orderedListTypes)
    const prevShown = ext.listShown;
    ext.listShown = k => (k === 'health_family' ? shown() : prevShown ? prevShown(k) : true);

    /* ═════════ Le bloc de la fiche ═════════ */
    const addBlock = () => { const L = A()?.defaultPersonBlocks; if (!Array.isArray(L) || L.some(b => b[0] === 'health')) return; const i = L.findIndex(b => b[0] === 'cemetery'); L.splice(i >= 0 ? i + 1 : L.length, 0, ['health', '🩺 Santé (privé)']); };
    ext.personBlocks.health = (index, detail, {isLocked = false, editOnly = h => h} = {}) => {
        const p = detail.person || {}, pid = Number(p.id) || 0;
        if (!pid || p.kind === 'animal' || !shown()) return '';
        const locked = isLocked || kiosk();
        return A().card(index, '🩺 Santé', '', `<div class="h-sante" data-sante-host="${pid}" data-sante-ro="${locked ? 1 : 0}">${UI().spinner('Lecture de la santé…')}</div>`, 'span-12 h-sante-card',
            `<button type="button" class="button small secondary" data-sante-branches="${pid}" title="Voir comment c’est réparti chez ses ancêtres">🌳 Par branches</button>${locked ? '' : editOnly(`<button type="button" class="button small secondary" data-sante-new="${pid}">＋ Ajouter</button>`)}`);
    };
    const recordRow = (r, ro, withPerson = false) => {
        const [, ico, kl] = kindOf(r.kind), acte = r.origin === 'acte';
        const src = [r.source_title && `📚 ${r.source_title}`, r.citation].filter(Boolean).join(', ');
        const badges = [r.to_check ? UI().badge('À vérifier', 'yellow') : '', acte ? UI().badge('Acte de décès', 'grey', {title: 'La cause écrite sur l’acte de décès (bloc Événements) : elle se modifie là-bas'}) : ''].join('');
        const menu = ro || acte ? '' : `<details class="ui-more"><summary class="icon-button small" title="Plus d’actions" aria-label="Plus d’actions">⋯</summary><div class="ui-ph-menu" role="menu"><button type="button" data-sante-edit="${r.id}">✎ Modifier</button><hr><button type="button" class="danger" data-sante-del="${r.id}">🗑 Supprimer</button></div></details>`;
        return {thumb: withPerson ? avatar(r) : `<span class="ui-card-ico" aria-hidden="true">${ico}</span>`, name: r.label,
            open: acte ? `data-h-person="${r.person_id}"` : ro ? '' : `data-sante-edit="${r.id}"`, attrs: `data-sante-row="${esc(r.id)}"${ro || acte ? '' : ' data-ctx-menu'}`,
            lines: [withPerson ? [r.person, years(r)].filter(Boolean).join(' · ') : '', [`${ico} ${kl}`, r.date_text, acte ? 'd’après l’acte de décès' : ''].filter(Boolean).join(' · '), src, r.note ? {html: `<span class="h-sante-note">${esc(r.note)}</span>`} : ''].filter(Boolean),
            when: acte ? '' : r.updated_at, whenLabel: 'Modifié', actions: `${badges}${withPerson ? `<button type="button" class="button small secondary" data-h-person="${r.person_id}" title="Ouvrir la fiche">↗ Fiche</button>` : ''}${menu}`, badges: [r.to_check ? {text: 'À vérifier', kind: 'yellow'} : null, acte ? {text: 'Acte de décès', kind: 'grey'} : null].filter(Boolean)};
    };
    const cache = new Map();
    async function fillHost(host) {
        const pid = Number(host.dataset.santeHost), ro = host.dataset.santeRo === '1';
        host.dataset.filled = '1';
        let d; try { d = await get('person', {person_id: pid}); } catch (e) { host.innerHTML = UI().notice('error', e.message || 'Lecture impossible.'); return; }
        if (!d.visible) { host.closest('.h-sante-card')?.remove(); return; }
        cache.set(pid, d);
        const rows = [...d.records, ...d.acts];
        const noted = new Set(d.records.map(r => r.world_id).filter(Boolean));
        const epi = epiOn() ? d.epidemics : [];
        host.innerHTML = `${rows.length ? UI().rowsHtml(rows.map(r => recordRow(r, ro))) : A().empty('Rien de noté sur sa santé pour l’instant', {icon: '🩺', action: ro ? null : {label: '＋ Ajouter une information', attrs: `data-sante-new="${pid}"`}})}
            ${epi.length ? `<details class="h-sante-epi"${d.records.length ? '' : ' open'}><summary class="section-label">${d.person.gender === 'female' ? i18n('🦠 Épidémies de son vivant, là où elle a vécu') : i18n('🦠 Épidémies de son vivant, là où il a vécu')} <small class="muted">(${epi.length})</small></summary>
                <p class="ui-hint">${i18n('D’après « 🌍 Le monde autour ». On ne sait pas si {nm} a été malade : « ＋ Noter » la garde comme épidémie traversée.', {nm: esc(d.person.first || i18n('cette personne'))})}</p>
                <ul class="h-sante-epi-list">${epi.map(e => `<li><b>${esc(e.title)}</b> <small class="muted">${e.from}${e.to > e.from ? '–' + e.to : ''}${e.local ? ' · ' + i18n('dans sa région') : ''}</small>${e.phrase ? `<br><small>${esc(e.phrase)}</small>` : ''}${e.hint ? `<br><small class="h-sante-hint">${esc(e.hint)}</small>` : ''}
                    <span class="h-sante-epi-act">${noted.has(e.id) ? UI().badge('Noté', 'green') : ro ? '' : `<button type="button" class="button small secondary" data-sante-epi="${esc(e.id)}">＋ Noter</button>`}</span></li>`).join('')}</ul></details>` : ''}`;
    }
    new MutationObserver(() => { document.querySelectorAll('[data-sante-host]:not([data-filled])').forEach(h => fillHost(h)); }).observe(document.documentElement, {childList: true, subtree: true});
    const refresh = async () => {
        cache.clear();
        const st = A().state;
        if (st?.module === 'listes' && st.listType === 'health_family') return ext.lists.health_family?.();
        document.querySelectorAll('[data-sante-host]').forEach(h => { h.removeAttribute('data-filled'); fillHost(h); });
    };
    const findRow = id => { for (const d of cache.values()) { const r = d.records.find(x => String(x.id) === String(id)); if (r) return r; } return listRows.find(x => String(x.id) === String(id)) || null; };

    /* ═════════ La fenêtre « Nouvelle information de santé » ═════════ */
    async function openEdit({pid = 0, row = null, preset = {}} = {}) {
        if (kiosk()) return A().toast('Mode consultation : rien ne peut être modifié.');
        if (!shown()) return A().toast('« 🩺 Santé de la famille » est cachée : montre-la d’abord dans les Réglages.');
        const r = {kind: 'maladie', label: '', date_text: '', source_id: null, citation: '', note: '', to_check: false, world_id: '', ...preset, ...(row || {})};
        let kind = r.kind;
        let labels = [];
        try { labels = (await get('labels')).labels || []; } catch (_) {}
        const seg = `<div class="sv-tags h-sante-kinds" data-seg="kind" role="radiogroup" aria-label="Sorte">${KINDS.map(([k, ic, l]) => `<button type="button" class="sv-tag${k === kind ? ' is-on' : ''}" data-v="${k}" role="radio" aria-checked="${k === kind}">${ic} ${esc(l)}</button>`).join('')}</div>`;
        const sugg = labels.slice(0, 12);
        const pidNow = pid || r.person_id || 0;
        const dlg = ext.openDialog({eyebrow: '🩺 SANTÉ DE LA FAMILLE · PRIVÉ', title: row ? 'Modifier l’information de santé' : 'Nouvelle information de santé', submitLabel: row ? 'Enregistrer' : 'Ajouter',
            body: `<div class="h-sante-form">${pidNow ? '' : `<div><span class="pk-lab">La personne</span>${P().pickerField({name: 'person_id', kind: 'person', animals: false})}</div>`}
                <div><span class="pk-lab">Sorte</span>${seg}</div>
                <label>Ce que c’était<input name="label" maxlength="200" required value="${esc(r.label)}" placeholder="phtisie, diabète, sourd de naissance, grippe espagnole…" autocomplete="off"></label>
                ${sugg.length ? `<div class="h-sante-sugg"><small class="muted">${i18n('Déjà noté dans la famille :')}</small> ${sugg.map(s => `<button type="button" class="sv-tag" data-sante-label="${esc(s.label)}" title="${esc(plural(s.people, 'personne'))}">${esc(s.label)} <small>${s.people}</small></button>`).join('')}</div>` : ''}
                <label>Quand<input name="date_text" data-ui-date maxlength="120" value="${esc(r.date_text)}" placeholder="vers 1890, 1918, entre 1880 et 1885…"></label>
                <div class="h-sante-2"><div><span class="pk-lab">Source</span>${P().pickerField({name: 'source_id', kind: 'source', value: r.source_id || null})}</div><label>Page, cote, passage<input name="citation" maxlength="300" value="${esc(r.citation)}" placeholder="acte n° 12, lettre de 1921…"></label></div>
                <label>Note<textarea name="note" rows="3" maxlength="4000" placeholder="Ce que la famille en dit, ce qu’on a lu…">${esc(r.note)}</textarea></label>
                ${UI().checkHtml('À vérifier (on l’a entendu dire, sans preuve)', {checked: !!r.to_check, attrs: 'name="to_check"'})}
                <p class="ui-hint">🔒 Privé : caché ailleurs que sur ta fiche et dans cette liste, jamais exporté sans le demander.</p></div>`,
            onSubmit: async form => {
                const person = pidNow || Number(form.elements.person_id?.value) || 0;
                const errs = [];
                if (!person) errs.push([form.querySelector('.pk') || form.elements.label, 'Choisis la personne.']);
                if (!String(form.elements.label.value).trim()) errs.push([form.elements.label, 'Écris ce que c’était (une maladie, un handicap, une cause de décès…).']);
                if (errs.length) { if (errs.length > 1 && UI().formErrors) UI().formErrors(form, errs); else UI().fail(errs[0][0], errs[0][1]); return false; }
                await post({op: 'save', id: row?.id || 0, person_id: person, kind, label: form.elements.label.value, date_text: form.elements.date_text.value, source_id: Number(form.elements.source_id?.value) || 0,
                    citation: form.elements.citation.value, note: form.elements.note.value, to_check: form.elements.to_check.checked ? 1 : 0, world_id: r.world_id || ''});
                A().toast(row ? 'Information de santé enregistrée.' : 'Information de santé ajoutée.', 'success');
                await refresh();
            },
            onDelete: row ? async () => { await del(row); } : null});
        dlg.addEventListener('click', e => {
            const b = e.target.closest('[data-seg] [data-v]');
            if (b) { kind = b.dataset.v; dlg.querySelectorAll('[data-seg] [data-v]').forEach(x => { const on = x.dataset.v === kind; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); }); return; }
            const s = e.target.closest('[data-sante-label]'); if (s) { const f = dlg.querySelector('[name=label]'); f.value = s.dataset.santeLabel; f.dispatchEvent(new Event('input', {bubbles: true})); f.focus(); }
        });
        return dlg;
    }
    /** supprimer tout de suite, « ↶ Annuler » la remet (H7) */
    async function del(row) {
        let r; try { r = await post({op: 'delete', id: row.id}); } catch (e) { A().toast(e.message, 'error'); return false; }
        await refresh();
        A().undoToast(i18n('Information de santé supprimée : « {label} »', {label: row.label}), {undo: async () => { await post({op: 'restore', row: r.row}); await refresh(); }, redo: async () => { await post({op: 'delete', id: row.id}); await refresh(); }});
        return true;
    }

    /* ═════════ Clics (fiche, liste) ═════════ */
    document.addEventListener('click', async e => {
        const t = e.target;
        const n = t.closest?.('[data-sante-new]'); if (n) { e.preventDefault(); openEdit({pid: Number(n.dataset.santeNew) || 0}); return; }
        const ed = t.closest?.('[data-sante-edit]'); if (ed) { e.preventDefault(); ed.closest('details')?.removeAttribute('open'); const r = findRow(ed.dataset.santeEdit); if (r) openEdit({row: r, pid: r.person_id}); return; }
        const dl = t.closest?.('[data-sante-del]'); if (dl) { e.preventDefault(); dl.closest('details')?.removeAttribute('open'); const r = findRow(dl.dataset.santeDel); if (r) del(r); return; }
        const ep = t.closest?.('[data-sante-epi]'); if (ep) {
            e.preventDefault(); const host = ep.closest('[data-sante-host]'), pid = Number(host?.dataset.santeHost) || 0, d = cache.get(pid), ev = d?.epidemics.find(x => x.id === ep.dataset.santeEpi); if (!ev) return;
            openEdit({pid, preset: {kind: 'epidemie', label: ev.title, date_text: ev.to > ev.from ? `entre ${ev.from} et ${ev.to}` : String(ev.from), world_id: ev.id}}); return;
        }
        const br = t.closest?.('[data-sante-branches]'); if (br) { e.preventDefault(); branchState.root = {id: Number(br.dataset.santeBranches)}; tab = 'branches'; openList(); return; }
        const go = t.closest?.('[data-sante-settings]'); if (go) { e.preventDefault(); const st = A().state; st.maintenanceTab = 'sante'; A().persistUiState?.(); A().setModule('maintenance'); }
    });
    // K14 : clic droit sur une ligne = le menu de son ⋯
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('[data-sante-row][data-ctx-menu]'); if (!row || e.shiftKey || e.target.closest('input, textarea')) return;
        const r = findRow(row.dataset.santeRow); if (!r || !UI()?.contextMenu) return;
        e.stopPropagation();
        UI().contextMenu(e, [{icon: '✎', label: 'Modifier', run: () => openEdit({row: r, pid: r.person_id})}, ...(r.person_id ? [{icon: '↗', label: 'Ouvrir la fiche', run: () => { A().state.currentPersonId = r.person_id; A().setModule('personnes'); }}] : []), '-', {icon: '🗑', label: 'Supprimer', danger: true, run: () => del(r)}]);
    }, true);
    const openList = () => { const st = A().state; st.listType = 'health_family'; st.precisePlaceKey = ''; if (st.module === 'listes') { A().renderSidebar?.(); ext.lists.health_family(); } else A().setModule('listes'); };

    /* ═════════ Listes → « 🩺 Santé de la famille » ═════════ */
    let listRows = [], tab = 'list', pendingQ = '';
    const branchState = {root: null, label: null, gens: 6, view: 'fan'};
    const hidden = ws => { ws.innerHTML = `<section class="page">${UI().pageHeader({title: 'Santé de la famille', icon: '🩺', where: 'Listes · Personnes et familles', help: 'Les maladies et causes de décès connues dans la famille, et leur place dans les branches.'})}
        ${A().emptyState({icon: '🔒', text: kiosk() ? 'Pas en mode consultation' : 'Cette liste est cachée', hint: kiosk() ? 'Les informations de santé sont privées : elles ne se montrent pas en mode consultation.' : 'Ce sont des informations privées : montre-les d’abord dans les Réglages.', action: kiosk() ? null : {label: '⚙️ Ouvrir les Réglages', attrs: 'data-sante-settings'}})}</section>`; };
    ext.lists.health_family = async (token = A().state?.workspaceToken) => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (!shown()) return hidden(ws);
        ws.innerHTML = `<section class="page h-sante-page">${UI().pageHeader({title: 'Santé de la famille', icon: '🩺', where: 'Listes · Personnes et familles', help: 'Les maladies, handicaps, causes de décès et épidémies notés dans la famille. De la mémoire familiale, privée : jamais exportée.',
            actions: [kiosk() ? '' : '<button type="button" class="button" data-sante-new="0">＋ Ajouter</button>'], more: ['<button type="button" data-sante-settings>⚙️ Réglages de la santé</button>']})}
            <div class="segmented h-sante-tabs" role="tablist"><button type="button" role="tab" data-sante-tab="list" class="${tab === 'list' ? 'is-active' : ''}" aria-selected="${tab === 'list'}">📋 Tout ce qui est noté</button><button type="button" role="tab" data-sante-tab="branches" class="${tab === 'branches' ? 'is-active' : ''}" aria-selected="${tab === 'branches'}">🌳 Par branches</button></div>
            <div data-sante-body>${UI().spinner('Lecture de la santé de la famille…')}</div></section>`;
        ws.querySelector('.h-sante-tabs').addEventListener('click', e => { const b = e.target.closest('[data-sante-tab]'); if (!b || b.dataset.santeTab === tab) return; tab = b.dataset.santeTab; ext.lists.health_family(); });
        const body = ws.querySelector('[data-sante-body]');
        if (tab === 'branches') return drawBranches(body, token);
        let d; try { d = await get('list'); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        if (!d.visible) return hidden(ws);
        listRows = d.rows;
        if (!listRows.length) { body.innerHTML = A().emptyState({icon: '🩺', text: 'Rien de noté pour l’instant', hint: 'Une maladie dont on parlait dans la famille, un handicap, la cause d’un décès, une épidémie traversée… Les causes écrites sur les actes de décès apparaissent ici toutes seules.', action: kiosk() ? null : {label: '＋ Ajouter une information', attrs: 'data-sante-new="0"'}}); return; }
        const fams = [...new Set(listRows.map(r => familyOf(r.label)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        const bar = UI().listBar({key: 'listes:health_family', search: {placeholder: 'Chercher… (ex. phtisie, Borie, 1918)'},
            filters: [{id: 'kind', label: 'Sorte', type: 'check', options: KINDS.map(([k, ic, l]) => [k, `${ic} ${l}`])},
                {id: 'origin', label: 'D’où ça vient', type: 'check', options: [['sante', 'Noté dans la santé'], ['acte', 'Écrit sur l’acte de décès']]},
                {id: 'check', label: 'À vérifier', type: 'check', text: 'Seulement « à vérifier »', chipLabel: 'À vérifier'},
                {id: 'person', label: 'Personne', kind: 'person', chipPrefix: 'Pour'},
                ...(fams.length > 1 ? [{id: 'family', label: 'Grande famille de maladies', type: 'check', options: fams.map(f => [f, f])}] : [])],
            view: {dflt: 'list', what: 'lignes'}, sort: {options: [['old', 'Plus anciens'], ['recent', 'Plus récents'], ['az', 'A → Z'], ['za', 'Z → A'], ['person', 'Par personne']], value: 'old'},
            onChange: st => draw(st)});
        body.innerHTML = '<div data-sante-sum></div><div data-sante-list></div>';
        body.prepend(bar);
        if (pendingQ) { const q = bar.querySelector('.ui-listbar-search input'); if (q) { q.value = pendingQ; q.dispatchEvent(new Event('input', {bubbles: true})); } pendingQ = ''; }
        const M = UI().listMatch;
        function draw(st = bar.state) {
            const f = st.filters || {};
            let rows = listRows.filter(r => M.text(st.q, r.label, r.person, r.date_text, r.note, r.source_title, r.citation)
                && (!f.kind?.length || f.kind.includes(r.kind)) && (!f.origin?.length || f.origin.includes(r.origin)) && (!f.check || r.to_check)
                && M.pick(f.person, [r.person_id], [r.person]) && (!f.family?.length || f.family.includes(familyOf(r.label))));
            const y = r => r.year || 9999;
            rows = st.sort === 'recent' ? [...rows].sort((a, b) => (b.year || 0) - (a.year || 0)) : st.sort === 'az' ? UI().sortItems(rows, 'az', {name: r => r.label}) : st.sort === 'za' ? UI().sortItems(rows, 'za', {name: r => r.label})
                : st.sort === 'person' ? [...rows].sort((a, b) => String(a.person).localeCompare(String(b.person), 'fr') || y(a) - y(b)) : [...rows].sort((a, b) => y(a) - y(b));
            bar.setCount(rows.length, 'ligne');
            // les plus notées : un nombre de personnes, jamais un pourcentage
            const by = new Map(); rows.forEach(r => { const k = fold(r.label); const o = by.get(k) || {label: r.label, people: new Set()}; o.people.add(r.person_id); by.set(k, o); });
            const top = [...by.values()].filter(o => o.people.size > 1).sort((a, b) => b.people.size - a.people.size).slice(0, 6);
            body.querySelector('[data-sante-sum]').innerHTML = top.length ? `<p class="h-sante-top"><b>${i18n('Le plus souvent noté :')}</b> ${top.map(o => `<button type="button" class="ui-chip h-sante-chip" data-sante-see="${esc(o.label)}" title="Voir la répartition dans les branches">${esc(o.label)} <small>${esc(plural(o.people.size, 'personne'))}</small></button>`).join(' ')}</p>` : '';
            const box = body.querySelector('[data-sante-list]');
            box.innerHTML = rows.length ? UI().itemsHtml(st.view, rows.map(r => recordRow(r, kiosk(), true))) : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Aucune ligne ne correspond.</span></p>`;
        }
        draw();
        body.addEventListener('click', e => { const b = e.target.closest('[data-sante-see]'); if (!b) return; branchState.label = {id: 0, title: b.dataset.santeSee}; tab = 'branches'; ext.lists.health_family(); });
    };

    /* ═════════ 🌳 Par branches : l'éventail des ancêtres coloré par la maladie choisie ═════════ */
    const TAU = Math.PI * 2;
    function fanSvg(d) {
        const G = d.gens, R0 = 46, ring = Math.max(34, Math.min(62, 300 / G)), Rmax = R0 + ring * (G - 1), A0 = -Math.PI * 7 / 6, SPAN = Math.PI * 4 / 3; // 240°, ouvert en bas
        const W = Rmax * 2 + 20, H = Rmax + Rmax * Math.sin(Math.PI / 6) + 30, cx = W / 2, cy = Rmax + 10;
        const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        const f = n => n.toFixed(1);
        const arc = (r0, r1, a0, a1) => { const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0), big = a1 - a0 > Math.PI ? 1 : 0; return `M${f(x0)} ${f(y0)}A${f(r1)} ${f(r1)} 0 ${big} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${f(r0)} ${f(r0)} 0 ${big} 0 ${f(x3)} ${f(y3)}Z`; };
        const by = new Map(d.nodes.map(n => [n.sosa, n]));
        const cls = n => (n ? (n.match ? 'is-hit' : n.labels.length ? 'is-other' : 'is-known') : 'is-empty');
        const tip = n => (n ? `${n.name}${years(n) ? ' (' + years(n) + ')' : ''}${n.hits.length ? ' — ' + n.hits.join(', ') : n.labels.length ? ' — ' + n.labels.join(', ') : ''}` : 'Ancêtre pas encore trouvé');
        let out = '';
        for (let g = 1; g < G; g++) {
            const count = 2 ** g, step = SPAN / count, r0 = R0 + ring * (g - 1), r1 = r0 + ring;
            for (let i = 0; i < count; i++) {
                const s = count + i, n = by.get(s), a0 = A0 + i * step, a1 = a0 + step;
                const label = n && g <= 4 && step * (r0 + ring / 2) > 26 ? (g <= 2 ? n.first || n.name : n.first || n.last) : '';
                const mid = (a0 + a1) / 2, [tx, ty] = pt(r0 + ring / 2, mid);
                let rot = mid * 180 / Math.PI + 90; if (g >= 3) rot -= 90; if (rot > 90 && rot < 270) rot -= 180; if (rot < -90) rot += 180;
                out += `<g class="h-sante-seg ${cls(n)}"${n ? ` data-h-person="${n.id}" tabindex="0" role="button"` : ''} aria-label="${esc(tip(n))}"><title>${esc(tip(n))}</title><path d="${arc(r0, r1, a0, a1)}"/>${label ? `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${f(rot)} ${f(tx)} ${f(ty)})">${esc(String(label).slice(0, 14))}</text>` : ''}</g>`;
            }
        }
        const root = by.get(1);
        out += `<g class="h-sante-seg is-root ${cls(root)}"${root ? ` data-h-person="${root.id}" tabindex="0" role="button"` : ''}><title>${esc(tip(root))}</title><circle cx="${f(cx)}" cy="${f(cy)}" r="${R0 - 4}"/><text x="${f(cx)}" y="${f(cy)}">${esc(String(root?.first || root?.name || '').slice(0, 12))}</text></g>`;
        return `<svg class="h-sante-fan" viewBox="0 0 ${f(W)} ${f(H)}" role="img" aria-label="${esc(i18n('Éventail des ancêtres de {nm}', {nm: root?.name || ''}))}">${out}</svg>`;
    }
    const pill = p => `<button type="button" class="h-sante-pill" data-h-person="${p.id}" title="${esc((p.hits || []).join(', '))}">${avatar(p, 22)}<b>${esc(p.name)}</b>${years(p) ? `<small>${esc(years(p))}</small>` : ''}${p.to_check ? UI().badge('À vérifier', 'yellow') : ''}</button>`;
    async function drawBranches(body, token) {
        const st = A().state;
        if (!branchState.root) { const id = Number(A().sosaRootId?.() || 0) || Number(st?.currentPersonId) || 0; if (id) branchState.root = {id}; }
        let labels = []; try { labels = (await get('labels')).labels || []; } catch (_) {}
        if (!branchState.label && labels.length) branchState.label = {id: labels[0].id, title: labels[0].label};
        body.innerHTML = `<div class="h-sante-ctl">
                <div><span class="pk-lab">La personne du centre</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', animals: false, value: branchState.root || null})}</div>
                <div><span class="pk-lab">La maladie à colorer</span>${P().pickerField({name: '', hiddenName: false, kind: 'health', value: branchState.label || null})}</div>
                <label><span class="pk-lab">Générations</span><select data-sante-gens>${[3, 4, 5, 6, 7, 8].map(g => `<option value="${g}"${g === branchState.gens ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
                <div><span class="pk-lab">Affichage</span><div class="segmented" data-sante-view><button type="button" data-v="fan" class="${branchState.view === 'fan' ? 'is-active' : ''}">Éventail</button><button type="button" data-v="sides" class="${branchState.view === 'sides' ? 'is-active' : ''}">Les quatre côtés</button></div></div></div>
            <div data-sante-out>${UI().spinner('Lecture des ancêtres…')}</div>`;
        const [rootF, labelF] = body.querySelectorAll('.h-sante-ctl .pk');
        rootF?.addEventListener('picker-change', e => { branchState.root = e.detail.value ? (e.detail.item || {id: Number(e.detail.value)}) : null; paint(); });
        labelF?.addEventListener('picker-change', e => { branchState.label = e.detail.value ? (e.detail.item || null) : null; paint(); });
        // « ↗ Ouvrir » sur la maladie : la liste, cherchée sur ce mot
        labelF?.addEventListener('picker-open', e => { e.preventDefault(); pendingQ = e.detail.item?.title || ''; tab = 'list'; ext.lists.health_family(); });
        body.querySelector('[data-sante-gens]').addEventListener('change', e => { branchState.gens = Number(e.target.value) || 6; paint(); });
        body.querySelector('[data-sante-view]').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; branchState.view = b.dataset.v; body.querySelectorAll('[data-sante-view] [data-v]').forEach(x => x.classList.toggle('is-active', x === b)); paint(); });
        let seq = 0;
        async function paint() {
            const out = body.querySelector('[data-sante-out]'), my = ++seq;
            if (!branchState.root?.id) { out.innerHTML = A().empty('Choisis la personne du centre : ses ancêtres forment l’éventail.', {icon: '🌳'}); return; }
            out.innerHTML = UI().spinner('Lecture des ancêtres…');
            let d; try { d = await get('branches', {root: branchState.root.id, gens: branchState.gens, label: branchState.label?.title || ''}); } catch (e) { out.innerHTML = UI().notice('error', e.message); return; }
            if (my !== seq || (token !== undefined && A().state && token !== A().state.workspaceToken && A().state.module !== 'listes')) return;
            if (!d.visible) return;
            const lab = d.label, known = d.nodes.length;
            const sum = lab ? `<p class="h-sante-sum">${i18n('<b>{count}</b> avec « {label} » parmi {known} sur {gens} générations.', {count: esc(plural(d.total, 'personne')), label: esc(lab), known: esc(plural(known, 'personne connue', 'personnes connues')), gens: d.gens})}</p>`
                : '<p class="h-sante-sum">Choisis une maladie pour la voir en couleur. En gris : ce qui est noté d’autre.</p>';
            const legend = `<p class="h-sante-legend"><span><i class="is-hit"></i>${lab ? `« ${esc(lab)} »` : 'La maladie choisie'}</span><span><i class="is-other"></i>Autre chose de noté</span><span><i class="is-known"></i>Rien de noté</span><span><i class="is-empty"></i>Ancêtre pas encore trouvé</span></p>`;
            if (branchState.view === 'fan') { out.innerHTML = `${sum}${legend}<div class="h-sante-fan-wrap">${fanSvg(d)}</div>`; return; }
            const side = b => `<section class="h-sante-side"><h4>${esc(b.title)}</h4><p class="muted">${b.head ? `${pill(b.head)}` : 'Pas encore trouvé'} · ${esc(plural(b.known, 'personne connue', 'personnes connues'))}</p>
                ${lab ? (b.matches.length ? `<p><b>${esc(plural(b.matches.length, 'personne'))}</b> avec « ${esc(lab)} » :</p><div class="h-sante-pills">${b.matches.map(pill).join('')}</div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">·</span><span class="empty-line-text">${i18n('Personne avec « {label} » de ce côté.', {label: esc(lab)})}</span></p>`) : ''}</section>`;
            out.innerHTML = `${sum}${d.center.length ? `<div class="h-sante-center"><b>${d.gens >= 3 ? i18n('Au centre et chez ses parents :') : i18n('Au centre :')}</b> <div class="h-sante-pills">${d.center.map(pill).join('')}</div></div>` : ''}<div class="h-sante-sides">${d.branches.map(side).join('')}</div>`;
        }
        paint();
    }

    /* ═════════ Réglages → Données → « 🩺 Santé de la famille » (K2) ═════════ */
    const setShow = async on => { const s = settings(); s.show = !!on; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} try { await post({op: 'show', show: on ? 1 : 0}); } catch (e) { A().toast(e.message, 'error'); } };
    ext.maintenance.sante = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        let st = {visible: false, count: 0}; try { st = await get('state'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const draw = () => {
            const s = settings(), on = !!s.show;
            ws.innerHTML = `<section class="page h-sante-settings">${UI().pageHeader({title: 'Santé de la famille', icon: '🩺', attrs: 'data-ph-title', where: 'Réglages · Données', saved: true, help: 'Noter les maladies et causes de décès connues dans la famille. Des informations privées : cachées au départ, jamais exportées.'})}
                <section class="card h-sante-set-card"><h3>Ce qu’on montre</h3>
                    ${UI().toggleHtml('Montrer « 🩺 Santé de la famille »', {checked: on, attrs: 'data-sante-show', disabled: kiosk(), sub: 'Le bloc « 🩺 Santé » des fiches et la liste dans Listes → Personnes et familles.'})}
                    ${UI().toggleHtml('Proposer les épidémies de son vivant sur la fiche', {checked: s.epidemics !== false, attrs: 'data-sante-epi-tg', disabled: !on, sub: 'D’après « 🌍 Le monde autour » : elles ne sont notées que si tu cliques « ＋ Noter ».'})}
                    ${on && st.count ? `<p class="ui-hint">${esc(plural(st.count, 'information notée', 'informations notées'))}. <button type="button" class="table-link" data-h-open-list="health_family">Voir la liste ↗</button></p>` : ''}
                    <p class="ui-hint">Le bloc se range comme les autres : Réglages → Apparence → Fiches personnes et animaux.</p></section>
                <section class="card h-sante-set-card"><h3>🔒 Ce qui reste privé</h3>
                    ${UI().notice('info', 'C’est de la mémoire familiale, pas un avis médical : l’app ne calcule aucun risque ni aucun pourcentage.')}
                    <ul class="h-sante-private"><li>Jamais dans le GEDCOM, sauf si tu coches « 🩺 Inclure la santé de la famille » au moment de l’export.</li><li>Jamais sur le site web, dans le partage avec la famille, les paquets, les livres, le mode simple ni les jeux.</li>
                        <li>Pas imprimée avec la fiche.</li><li>Cachée : ni bloc, ni liste, ni résultat dans la recherche.</li><li>En mode consultation 🔒 : rien ne se montre.</li>
                        <li>Les causes écrites sur les actes de décès restent des événements : elles sont exportées comme avant.</li></ul></section></section>`;
        };
        draw();
        ws.__santeDraw = draw;
        const redraw = async () => { await setShow(!!settings().show); ws.__santeDraw?.(); A().renderSidebar?.(); };
        if (ws.__santeBound) return void UI().autoSave?.(ws, {redraw});
        ws.__santeBound = true;
        ws.addEventListener('change', async e => {
            const t = e.target; if (!t.closest?.('.h-sante-settings')) return;
            if (t.matches('[data-sante-show]')) { await setShow(t.checked); ws.__santeDraw?.(); A().renderSidebar?.(); return; }
            if (t.matches('[data-sante-epi-tg]')) { const s = settings(); s.epidemics = t.checked; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
        });
        // ↶ Annuler (K2) remet la clé d'avant : le serveur suit
        UI().autoSave?.(ws, {redraw});
    };

    /* ═════════ ⤓ Export GEDCOM : la case « Inclure la santé » seulement quand elle est montrée ═════════ */
    ext.afterExport.push(() => { const box = document.querySelector('[data-sante-export]'); if (box) box.hidden = !shown(); });

    ext.sante = {shown, open: pid => { if (pid) branchState.root = {id: Number(pid)}; tab = 'list'; openList(); }, add: pid => openEdit({pid}), KINDS};
    const boot = () => { if (!A()) return setTimeout(boot, 50); addBlock(); };
    boot();
})();
