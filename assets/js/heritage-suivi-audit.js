/* LCNDA — 🐾 Suivi des animaux : ce que l'audit des onglets a ajouté (docs/design/audit-onglets.html, §3).
 * Chargé après heritage-suivi.js (ext.suivi.U : les données et petits morceaux communs).
 *  - bloc « 📊 Retours » (sv_return) : la part des animaux vus une année (cohorte) et revus l'année suivante, par site ;
 *  - bloc « 🔔 Pas revu depuis… » (sv_unseen) : un seuil par espèce (réglage genealogie-suivi-seuils, suit la base),
 *    les animaux en retard colorés (jaune : seuil passé ; rouge : deux fois le seuil) ;
 *  - « ⚡ Saisie d'une séance » : une feuille de terrain — le lieu, le site, la date et l'observateur une seule fois, puis une
 *    ligne par animal vu ; tout s'enregistre d'un coup (suivi_write save_obs) et « ↶ Annuler » retire toute la séance ;
 *  - « 🖨 Fiche de terrain » : les animaux attendus sur un site, leurs bagues et marques, des cases à cocher (UI.openPrintDialog).
 * Le domaine vital (enveloppe et hectares) est dans la carte en grand (heritage-suivi.js, openBigMap).
 */
(() => {
    'use strict';
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['dashboard', 'dashboardConfig']) ext[k] = ext[k] || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER, S = () => ext.suivi || {}, U = () => ext.suivi?.U || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const RO = () => document.body.classList.contains('is-kiosk');
    const toast = (...a) => A().toast(...a);
    const plural = (n, w, p) => (A()?.plural ? A().plural(n, w, p) : `${n} ${w}`);
    const SEUILS = 'genealogie-suivi-seuils';
    const readSeuils = () => { try { const v = JSON.parse(localStorage.getItem(SEUILS) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const card = (index, widget, dflt, count, body, span, actions = '') => { const t = String(widget?.config?.title || '').trim() || i18n(dflt); return A().card(index, A().state.module === 'dashboard' ? `🐾 ${t}` : t, count, body, span, actions); };
    const noData = () => A().empty(i18n('Le suivi n’a pas pu se charger.'), {icon: '⚠️'});
    const load = () => (S().overview ? S().overview().catch(() => null) : Promise.resolve(null));

    /* ═════════ les deux blocs ═════════ */
    const WIDGETS = [
        ['sv_return', '📊 Retours (recapture)', '📊', '6', 'La part des animaux vus une année et revus l’année suivante, par cohorte et par site (indicateur de survie du baguage).'],
        ['sv_unseen', '🔔 Pas revu depuis…', '🔔', '6', 'Un délai par espèce : les animaux pas revus à temps, en jaune, et en rouge au double du délai.'],
    ];
    function register() {
        const app = A(); if (!app?.defaultDashboardBlocks) return;
        WIDGETS.forEach(([k, l, , w, info]) => {
            if (!app.defaultDashboardBlocks.some(x => x[0] === k)) app.defaultDashboardBlocks.push([k, l]);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans[k] = w;
            if (app.dashboardWidgetInfo) app.dashboardWidgetInfo[k] = info;
        });
        if (app.defaultDashboardBlockLimits) Object.assign(app.defaultDashboardBlockLimits, {sv_unseen: 8});
    }
    register(); document.addEventListener('DOMContentLoaded', register, {once: true});

    /** 📊 Les retours : pour chaque animal, sa première année (baguage, sinon première observation) et les années où on l'a revu */
    function returnsOf(D, widget) {
        const s = S().scope ? S().scope(D, widget) : {animals: D.animals || [], obs: D.observations || []};
        const years = new Map(), site0 = new Map();
        (D.observations || []).filter(o => o.pet_id && /^\d{4}/.test(o.iso || '')).sort((a, b) => String(a.iso).localeCompare(String(b.iso))).forEach(o => {
            const y = Number(o.iso.slice(0, 4)); if (!years.has(o.pet_id)) years.set(o.pet_id, new Set()); years.get(o.pet_id).add(y);
            if (!site0.has(o.pet_id)) site0.set(o.pet_id, o.site_id || 0);
        });
        const sites = Object.fromEntries((D.sites || []).map(x => [x.id, x.name]));
        const rows = new Map(); // « année|site » → {y, site, n, back}
        s.animals.forEach(a => {
            const ys = years.get(a.id); if (!ys && !a.ringed_date) return;
            const ry = Number(String(a.ringed_date || '').match(/\b(1[89]\d\d|20\d\d)\b/)?.[0]) || 0;
            const first = Math.min(...[...(ys || [])], ry || 9999); if (first === 9999) return;
            const site = site0.get(a.id) || 0, key = `${first}|${site}`;
            if (!rows.has(key)) rows.set(key, {y: first, site, siteName: site ? sites[site] || i18n('Site n° {n}', {n: site}) : i18n('Sans site'), n: 0, back: 0});
            const r = rows.get(key); r.n++; if (ys?.has(first + 1)) r.back++;
        });
        const thisYear = new Date().getFullYear();
        return [...rows.values()].filter(r => r.y < thisYear).sort((a, b) => b.y - a.y || a.siteName.localeCompare(b.siteName, 'fr'));
    }
    ext.dashboard.sv_return = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, '📊 Retours (recapture)', '', noData(), span);
        const rows = returnsOf(D, widget), tot = rows.reduce((t, r) => ({n: t.n + r.n, back: t.back + r.back}), {n: 0, back: 0});
        const pct = r => (r.n ? Math.round(r.back / r.n * 100) : 0);
        const body = rows.length ? `<p class="sv-ret-sum"><b>${pct(tot)} %</b> ${esc(i18n('revus l’année suivante ({b} sur {n})', {b: tot.back, n: tot.n}))}</p>
            <table class="data-table sv-ret" data-sv-returns><thead><tr><th>${esc(i18n('Cohorte'))}</th><th>${esc(i18n('Site'))}</th><th>${esc(i18n('Vus'))}</th><th>${esc(i18n('Revus l’année suivante'))}</th></tr></thead>
            <tbody>${rows.slice(0, Math.max(4, Number(widget.limit) || 12)).map(r => `<tr><td>${r.y}</td><td>${esc(r.siteName)}</td><td>${r.n}</td><td><span class="sv-ret-bar"><i style="width:${pct(r)}%"></i></span> ${r.back} · <b>${pct(r)} %</b></td></tr>`).join('')}</tbody></table>`
            : A().empty(i18n('Pas encore assez d’années d’observations pour calculer les retours.'), {icon: '📊'});
        return card(index, widget, '📊 Retours (recapture)', rows.length ? `<span class="sv-per">${esc(plural(rows.length, i18n('cohorte')))}</span>` : '', body, span);
    }};
    ext.suivi = ext.suivi || {}; ext.suivi.returnsOf = returnsOf; // (essais)

    /** 🔔 le délai d'une espèce (réglage), sinon celui du bloc, sinon 30 jours */
    const seuilOf = (a, widget) => { const s = readSeuils(), k = a?.species || ''; return Math.max(1, Number(s[k]) || Number(widget?.config?.days) || 30); };
    ext.dashboard.sv_unseen = {load, render: (index, widget, span, D) => {
        if (!D) return card(index, widget, '🔔 Pas revu depuis…', '', noData(), span);
        const u = U(), s = S().scope ? S().scope(D, widget) : {animals: D.animals || []}, lim = Math.max(1, Number(widget.limit) || 8);
        const rows = s.animals.filter(a => !a.deceased).map(a => { const l = u.lastSeen?.(a), d = l ? u.daysSince?.(l.iso) : null, seuil = seuilOf(a, widget); return {a, l, d: d ?? 99999, seuil}; })
            .filter(x => x.d >= x.seuil).sort((x, y) => y.d / y.seuil - x.d / x.seuil);
        const level = x => (x.d >= 2 * x.seuil ? 'red' : 'yellow');
        const html = rows.slice(0, lim).map(x => `<div class="sv-row sv-unseen is-${level(x)}" data-sv-pet="${x.a.id}" role="button" tabindex="0" data-sv-level="${level(x)}"><span class="sv-what"><b>${esc(u.speciesIcon?.(x.a.species) || '🐾')} ${esc(x.a.title)}</b> <small class="muted">${esc(i18n('délai : {n}', {n: plural(x.seuil, i18n('jour'))}))}</small></span>${u.badge ? u.badge(x.l ? u.ago(x.l.iso) : i18n('jamais vu'), level(x)) : ''}</div>`).join('');
        const tools = RO() ? '' : `<button type="button" class="icon-action" data-sv-seuils title="${esc(i18n('Délais par espèce'))}" aria-label="${esc(i18n('Délais par espèce'))}">⚙</button>`;
        return card(index, widget, '🔔 Pas revu depuis…', rows.length ? rows.length : '', rows.length ? `<div class="sv-rows">${html}</div>` : A().empty(i18n('Tous ont été revus à temps.'), {icon: '✓'}), span, tools);
    }};
    /** ⚙ les délais par espèce : une case par espèce présente */
    async function editSeuils() {
        const D = await load(); const u = U();
        const species = [...new Set((D?.animals || []).filter(a => a.tracked).map(a => a.species || ''))].sort();
        if (!species.length) return toast(i18n('Aucun animal suivi pour l’instant.'));
        const cur = readSeuils();
        ext.openDialog?.({eyebrow: i18n('SUIVI DES ANIMAUX'), title: i18n('🔔 Délais par espèce'), submitLabel: i18n('Enregistrer'),
            body: `<p class="muted">${esc(i18n('Au bout de combien de jours sans nouvelles un animal est-il « en retard » ? Rouge au double du délai.'))}</p><div class="form-grid">${species.map(sp => `<label>${esc(`${u.speciesIcon?.(sp) || '🐾'} ${ext.speciesLabel?.(sp) || sp || i18n('Espèce inconnue')}`)}<input type="number" min="1" max="3660" name="s_${esc(sp)}" value="${Number(cur[sp]) || ''}" placeholder="30" data-unit="${esc(i18n('jours'))}"></label>`).join('')}</div>`,
            onSubmit: form => {
                const next = {...cur};
                species.forEach(sp => { const v = Number(form.elements[`s_${sp}`]?.value) || 0; if (v) next[sp] = Math.min(3660, v); else delete next[sp]; });
                A().undoLocalChange(i18n('Délais par espèce changés'), [SEUILS], () => localStorage.setItem(SEUILS, JSON.stringify(next)), () => A().renderDashboard?.());
                A().renderDashboard?.();
            }});
    }

    /* ═════════ ⚡ Saisie d'une séance ═════════ */
    function rowHtml(i) {
        return `<div class="sv-sess-row" data-sv-sess-row="${i}"><div class="sv-sess-pet">${P().pickerField({name: `pet_${i}`, kind: 'pet', allowCreate: false, placeholder: i18n('Animal (nom, bague…)')})}</div>
            <input name="reading_${i}" maxlength="40" placeholder="${esc(i18n('ou bague lue'))}" aria-label="${esc(i18n('Bague lue'))}">
            <input name="time_${i}" data-ui-time maxlength="5" placeholder="${esc(i18n('heure'))}" aria-label="${esc(i18n('Heure'))}">
            <input name="count_${i}" type="number" min="0" max="100000" placeholder="${esc(i18n('nb'))}" aria-label="${esc(i18n('Nombre vus'))}">
            <input name="note_${i}" maxlength="400" placeholder="${esc(i18n('note'))}" aria-label="${esc(i18n('Note'))}">
            <button type="button" class="icon-button small" data-sv-sess-del aria-label="${esc(i18n('Retirer la ligne'))}" title="${esc(i18n('Retirer la ligne'))}">×</button></div>`;
    }
    function openSession() {
        if (RO()) return toast(i18n('Mode consultation : rien à modifier.'));
        if (!P()?.pickerField) return toast(i18n('Le menu de choix n’est pas encore chargé.'), 'error');
        const now = new Date(), M = U().MONTHS_L || [], dflt = `${now.getDate()} ${M[now.getMonth()] || now.getMonth() + 1} ${now.getFullYear()}`;
        let n = 0;
        ext.openDialog({eyebrow: i18n('SUIVI DES ANIMAUX'), title: i18n('⚡ Saisie d’une séance'), wide: true, submitLabel: i18n('Tout enregistrer'),
            body: `<p class="muted">${esc(i18n('Le lieu, la date et l’observateur une seule fois ; puis une ligne par animal vu (ou par bague lue, si tu ne sais pas encore qui c’est).'))}</p>
                <div class="form-grid"><label>${esc(i18n('Date'))}<input name="date" data-ui-date value="${esc(dflt)}" required></label>
                <div><span class="pk-lab">${esc(i18n('Site de suivi'))}</span>${P().pickerField({name: 'site_id', kind: 'tsite', value: Number(A().state.svSite) || null})}</div>
                <div><span class="pk-lab">${esc(i18n('Lieu'))}</span>${P().pickerField({name: 'place_id', kind: 'place'})}</div>
                <div><span class="pk-lab">${esc(i18n('Observateur'))}</span>${P().pickerField({name: 'observer', kind: 'person', allowFree: true})}</div></div>
                <div class="sv-sess-head" aria-hidden="true"><span>${esc(i18n('Animal'))}</span><span>${esc(i18n('Bague lue'))}</span><span>${esc(i18n('Heure'))}</span><span>${esc(i18n('Nb'))}</span><span>${esc(i18n('Note'))}</span><span></span></div>
                <div class="sv-sess-rows" data-sv-sess-rows>${[0, 1, 2].map(() => rowHtml(n++)).join('')}</div>
                <button type="button" class="button small secondary" data-sv-sess-add>${esc(i18n('＋ Une ligne'))}</button>`,
            onOpen: d => d.addEventListener('click', e => {
                if (e.target.closest('[data-sv-sess-add]')) { const box = d.querySelector('[data-sv-sess-rows]'); box.insertAdjacentHTML('beforeend', rowHtml(n++)); box.lastElementChild.querySelector('.pk-input, input')?.focus(); }
                const del = e.target.closest('[data-sv-sess-del]'); if (del) { const r = del.closest('[data-sv-sess-row]'); if (d.querySelectorAll('[data-sv-sess-row]').length > 1) r.remove(); else r.querySelectorAll('input').forEach(x => { x.value = ''; }); }
            }),
            onSubmit: async form => {
                const v = new FormData(form), date = String(v.get('date') || '').trim();
                if (!date) { toast(i18n('Dis quand a eu lieu la séance.'), 'error'); return false; }
                const site = Number(v.get('site_id')) || 0, place = Number(v.get('place_id')) || 0, observer = String(v.get('observer') || '');
                if (!site && !place) { toast(i18n('Choisis un site ou un lieu pour la séance.'), 'error'); return false; }
                const rows = [...form.querySelectorAll('[data-sv-sess-row]')].map(r => { const i = r.dataset.svSessRow; return {pet: Number(form.elements[`pet_${i}`]?.value) || 0, reading: String(v.get(`reading_${i}`) || '').trim(), time: String(v.get(`time_${i}`) || '').trim(), count: v.get(`count_${i}`), note: String(v.get(`note_${i}`) || '').trim()}; })
                    .filter(r => r.pet || r.reading || r.count);
                if (!rows.length) { toast(i18n('Ajoute au moins un animal vu.'), 'error'); return false; }
                const ids = [];
                try {
                    for (const r of rows) {
                        const res = await U().write('save_obs', {id: 0, pet_id: r.pet, date, time: r.time, place_id: place, site_id: site, lat: '', lon: '', behaviors: [], count: r.count ?? '', with: [], observer, media_ids: [], note: r.note, source: 'manuel',
                            reading: r.reading, reading_detail: {chars: [], colors: null, number: r.reading}, reliability: r.reading ? 'partial' : '', sea: {}});
                        const id = Number(res?.id || res?.obs?.id || 0); if (id) ids.push(id);
                    }
                } catch (err) { toast(err.message, 'error'); }
                await U().refreshView?.();
                if (!ids.length) return;
                A().undoToast?.(i18n('Séance enregistrée : {n}', {n: plural(ids.length, i18n('observation'))}), {
                    undo: async () => { for (const id of ids) await A().api('suivi_write', {}, {method: 'POST', body: {op: 'delete', type: 'animal_obs', id}}); await U().refreshView?.(); },
                    redo: async () => { for (const id of ids) await A().api('restore_last_delete', {}, {method: 'POST', body: {entity_type: 'animal_obs', entity_id: id}}); await U().refreshView?.(); }});
            }});
    }

    /* ═════════ 🖨 Fiche de terrain ═════════ */
    async function fieldSheet() {
        const D = await load(); if (!D) return toast(i18n('Le suivi n’a pas pu se charger.'), 'error');
        const sites = D.sites || [];
        ext.openDialog?.({eyebrow: i18n('SUIVI DES ANIMAUX'), title: i18n('🖨 Fiche de terrain'), submitLabel: i18n('Aperçu et impression'),
            body: `<p class="muted">${esc(i18n('Les animaux attendus sur un site (ceux qu’on y a déjà vus), avec leurs bagues et marques, et des cases à cocher : pour une sortie sans ordinateur.'))}</p>
                <div class="form-grid one-column"><label>${esc(i18n('Site'))}<select name="site"><option value="0">${esc(i18n('Tous les animaux suivis'))}</option>${sites.map(x => `<option value="${x.id}" ${Number(A().state.svSite) === x.id ? 'selected' : ''}>🏞 ${esc(x.name)}</option>`).join('')}</select></label></div>`,
            onSubmit: form => { const site = Number(new FormData(form).get('site')) || 0; setTimeout(() => printSheet(D, site), 30); }});
    }
    function expectedOn(D, site) {
        const u = U(), last = new Map();
        (D.observations || []).filter(o => o.pet_id && (!site || o.site_id === site)).forEach(o => { const p = last.get(o.pet_id); if (!p || String(o.iso) > String(p)) last.set(o.pet_id, o.iso); });
        return (D.animals || []).filter(a => a.tracked && !a.deceased && last.has(a.id)).map(a => ({a, iso: last.get(a.id), code: u.codeOf?.(a) || '', marks: (a.marks || []).filter(m => !m.end_iso && !m.end_date)}))
            .sort((x, y) => String(y.iso).localeCompare(String(x.iso)));
    }
    ext.suivi.expectedOn = expectedOn; // (essais)
    function printSheet(D, site) {
        const u = U(), list = expectedOn(D, site), sname = site ? ((D.sites || []).find(x => x.id === site)?.name || '') : i18n('Tous les sites');
        if (!list.length) return toast(i18n('Aucun animal déjà vu sur ce site.'), 'error');
        if (!UI().openPrintDialog) return toast(i18n('La fenêtre « Imprimer » n’est pas chargée.'), 'error');
        const markTxt = m => [window.LCNDA_SUIVI?.MARKS?.[m.kind]?.label || m.kind, m.code, m.position].filter(Boolean).join(' ');
        UI().openPrintDialog({title: i18n('Fiche de terrain — {s}', {s: sname}), key: 'suivi-terrain', zone: i18n('Fiche de terrain'),
            options: [{key: 'last', label: i18n('Date de la dernière observation'), checked: true}, {key: 'notes', label: i18n('Une colonne pour les notes'), checked: true}],
            html: o => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(sname)}</title><style>body{font-family:system-ui,sans-serif;color:#111;margin:0}h1{font-size:17px;margin:0 0 4px}p{margin:0 0 8px;font-size:11px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee}.box{width:16px;height:16px;border:1.5px solid #111;display:inline-block}td.n{width:34%}</style></head><body>
                <h1>🐾 ${esc(i18n('Fiche de terrain'))} — ${esc(sname)}</h1><p>${esc(i18n('Date : ____________  Observateur : ____________________  Météo : ____________'))}</p>
                <table><thead><tr><th>${esc(i18n('Vu'))}</th><th>${esc(i18n('Animal'))}</th><th>${esc(i18n('Bagues et marques'))}</th>${o.last ? `<th>${esc(i18n('Dernière fois'))}</th>` : ''}<th>${esc(i18n('Heure'))}</th>${o.notes ? `<th class="n">${esc(i18n('Notes'))}</th>` : ''}</tr></thead>
                <tbody>${list.map(x => `<tr><td><span class="box"></span></td><td><b>${esc(x.a.title)}</b>${x.a.species ? `<br><small>${esc(ext.speciesLabel?.(x.a.species) || x.a.species)}</small>` : ''}</td><td>${esc(x.code)}${x.marks.length ? `<br><small>${esc(x.marks.map(markTxt).join(' · '))}</small>` : ''}</td>${o.last ? `<td>${esc(u.dateFr ? u.dateFr(x.iso) : x.iso)}</td>` : ''}<td></td>${o.notes ? '<td></td>' : ''}</tr>`).join('')}
                ${Array.from({length: 6}, () => `<tr><td><span class="box"></span></td><td>&nbsp;</td><td></td>${o.last ? '<td></td>' : ''}<td></td>${o.notes ? '<td></td>' : ''}</tr>`).join('')}</tbody></table></body></html>`});
    }

    document.addEventListener('click', e => {
        const t = e.target.closest?.('[data-sv-session], [data-sv-fieldsheet], [data-sv-seuils]'); if (!t) return;
        e.preventDefault(); e.stopPropagation(); t.closest('details')?.removeAttribute('open');
        if (t.matches('[data-sv-session]')) return openSession();
        if (t.matches('[data-sv-fieldsheet]')) return fieldSheet();
        if (t.matches('[data-sv-seuils]')) return editSeuils();
    }, true);
    Object.assign(ext.suivi, {openSession, fieldSheet, editSeuils});
})();
