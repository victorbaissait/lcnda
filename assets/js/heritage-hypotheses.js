/**
 * ⚖️ Hypothèses à comparer (F2) — sur les hypothèses qui existaient déjà (table hypotheses, fenêtre « Nouvelle hypothèse »
 * d'index.php, Maintenance → Hypothèses) : « Jean né à Naves ou à Tulle ? ».
 *  - bloc de fiche « ⚖️ Hypothèses » (réglable comme les autres : Maintenance → Apparence → blocs des fiches) : les hypothèses de
 *    la personne, leur état, la réponse en tête, « ⚖️ Comparer », ✎, 🗑 (↶ Annuler) et « ＋ Nouvelle hypothèse » ;
 *  - la fenêtre « Comparer » : une colonne par réponse (un lieu, une date ou un texte), les preuves pour et contre (une source,
 *    un média, un dépouillement avec le menu de choix, ou un texte libre) et leur poids, le total de chaque colonne,
 *    puis « ✓ Retenir … » qui met la fiche à jour (lieu ou date de l'événement) avec « ↶ Annuler » ;
 *  - « Fiche liée » de la fenêtre « Nouvelle hypothèse » : le menu de choix des personnes (au lieu d'un numéro à taper).
 * Serveur : lib/hypothesis_compare.php. ext.hypotheses.open(id).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.personBlocks = ext.personBlocks || {};
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const post = (action, body) => A().api(action, {}, {method: 'POST', body});
    const TYPES = {identity: 'Identité / doublon', relationship: 'Relation familiale', date: 'Date', place: 'Lieu', other: 'Autre'};
    const STATUS = {open: ['Ouverte', 'blue'], confirmed: ['Confirmée', 'green'], rejected: ['Rejetée', 'grey']};
    const WEIGHTS = [[1, 'Faible'], [2, 'Moyen'], [3, 'Fort']];
    const statusBadge = s => UI().badge(...(STATUS[s] || STATUS.open));
    const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
    const refreshPerson = async pid => { if (S().module === 'personnes' && Number(S().currentPersonId) === Number(pid)) await A().selectPerson?.(pid, false); };

    /* ─────────── Bloc de fiche « ⚖️ Hypothèses » ─────────── */
    ext.personBlocks.hypotheses = (index, detail, {isLocked = false, editOnly = h => h} = {}) => {
        const pid = Number(detail.person?.id) || 0;
        if (!pid || detail.person?.kind === 'animal') return '';
        const list = detail.hypotheses || [];
        const ab = A().actionButton || ((k, l, attrs) => `<button type="button" class="icon-button small" ${attrs} title="${esc(l)}" aria-label="${esc(l)}">${k === 'edit' ? '✎' : '🗑'}</button>`);
        const body = list.length ? UI().rowsHtml(list.map(h => ({thumb: '<span class="ui-card-ico" aria-hidden="true">⚖️</span>', name: h.title, open: `data-hcomp-open="${h.id}"`,
            lines: [[TYPES[h.type] || 'Hypothèse', h.event_label && `${h.event_label}${h.event_date ? ` — ${h.event_date}` : ''}`, h.related_name && `lié à ${h.related_name}`].filter(Boolean).join(' · '), {html: `<span data-hcomp-sum="${h.id}" data-hcomp-pid="${pid}"></span>`}],
            when: h.updated_at, whenLabel: 'Modifié',
            actions: `${statusBadge(h.status)}<button type="button" class="button small secondary" data-hcomp-open="${h.id}">⚖️ Comparer</button>${editOnly(`${ab('edit', 'Modifier', `data-edit-hypothesis="${h.id}"`)}${ab('delete', 'Supprimer', `data-delete-hypothesis="${h.id}"`)}`)}`})))
            : A().empty('Aucune hypothèse : une question à trancher (« né à Naves ou à Tulle ? »), avec les preuves pour et contre.', {icon: '⚖️', action: isLocked ? null : {label: '＋ Nouvelle hypothèse', attrs: 'data-add-event-hypothesis=""'}});
        return A().card(index, '⚖️ Hypothèses', list.length ? list.length : '', `<div class="h-hc-block">${body}</div>`, 'span-12',
            editOnly(`<button type="button" class="icon-button small" data-add-event-hypothesis="" title="＋ Nouvelle hypothèse" aria-label="Nouvelle hypothèse">＋</button>`));
    };
    // la réponse en tête de chaque hypothèse (« Naves +3 · Tulle −1 »)
    const filled = new WeakSet();
    async function fillSummaries() {
        const spans = [...document.querySelectorAll('[data-hcomp-sum]')].filter(s => !filled.has(s));
        if (!spans.length) return;
        spans.forEach(s => filled.add(s));
        const byPid = {};
        spans.forEach(s => { (byPid[s.dataset.hcompPid || 'all'] ||= []).push(s); });
        for (const [pid, list] of Object.entries(byPid)) {
            let d; try { d = await A().api('hypotheses', pid === 'all' ? {} : {person_id: pid}); } catch (_) { continue; }
            list.forEach(s => {
                const opts = (d.compare || {})[s.dataset.hcompSum] || [];
                if (!opts.length) { s.textContent = 'Pas encore de réponses à comparer'; return; }
                const best = Math.max(...opts.map(o => o.score));
                s.innerHTML = opts.map(o => `<span class="h-hc-sum${o.proofs && o.score === best && opts.filter(x => x.score === best).length === 1 ? ' is-lead' : ''}">${esc(o.label)} ${esc(signed(o.score))}</span>`).join(' · ');
            });
        }
    }
    new MutationObserver(() => { if (document.querySelector('[data-hcomp-sum]')) fillSummaries(); }).observe(document.documentElement, {childList: true, subtree: true});
    const addBlock = () => { const L = A()?.defaultPersonBlocks; if (!Array.isArray(L) || L.some(b => b[0] === 'hypotheses')) return; const i = L.findIndex(b => b[0] === 'already_searched'), j = L.findIndex(b => b[0] === 'investigations'); L.splice(i >= 0 ? i + 1 : j >= 0 ? j + 1 : L.length, 0, ['hypotheses', '⚖️ Hypothèses à comparer']); };

    /* ─────────── La fenêtre « Comparer » ─────────── */
    function proofHtml(p, ro) {
        const ico = p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc(p.icon || '•')}</span>`;
        return `<div class="h-hc-proof${p.missing ? ' is-missing' : ''}" data-hc-proof="${p.id}"><span class="h-hc-ico">${ico}</span><div class="h-hc-pt"><strong>${esc(p.title)}</strong><small>${esc([p.meta, p.note].filter(Boolean).join(' · '))}</small></div>
            ${ro ? `<span class="h-hc-w">${esc(WEIGHTS.find(w => w[0] === p.weight)?.[1] || '')}</span>` : `<select data-hc-weight aria-label="Poids de la preuve" title="Poids de la preuve">${WEIGHTS.map(([v, l]) => `<option value="${v}"${v === p.weight ? ' selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="icon-button small" data-hc-note title="✎ Note sur cette preuve" aria-label="Note sur cette preuve">✎</button><button type="button" class="icon-button small" data-hc-proof-del title="Retirer cette preuve" aria-label="Retirer cette preuve">×</button>`}</div>`;
    }
    function sideHtml(o, stance, ro) {
        const list = o.proofs.filter(p => p.stance === stance);
        const sum = stance === 'for' ? o.for : o.against;
        return `<div class="h-hc-side is-${stance}"><h4>${stance === 'for' ? '👍 Pour' : '👎 Contre'} <small>(${sum ? (stance === 'for' ? '+' : '−') + sum : '0'})</small></h4>${list.map(p => proofHtml(p, ro)).join('') || `<p class="h-hc-none">${stance === 'for' ? 'Aucune preuve pour.' : 'Rien contre.'}</p>`}
            ${ro ? '' : `<div class="h-hc-add" data-hc-add="${o.id}" data-hc-stance="${stance}">${P().pickerField({name: '', hiddenName: false, kind: 'source,media,digest', allowFree: true, inline: true})}</div>`}</div>`;
    }
    function colHtml(d, o, ro) {
        const concluded = !!d.hypothesis.can_undo;
        const val = d.field === 'event_place' ? (o.place_name ? `📍 ${esc(o.place_name)}${o.place_county ? ` <small>(${esc(o.place_county)})</small>` : ''}` : '<span class="h-hc-warn">⚠️ pas de lieu choisi</span>')
            : d.field === 'event_date' ? (o.value_text ? `📅 ${esc(o.value_text)}` : '<span class="h-hc-warn">⚠️ pas de date</span>') : '';
        return `<section class="h-hc-col${Number(d.leader) === o.id ? ' is-leader' : ''}${o.chosen ? ' is-chosen' : ''}" data-hc-opt="${o.id}">
            <header><h3>${esc(o.label)}</h3>${ro ? '' : `<button type="button" class="icon-button small" data-hc-rename title="✎ Renommer" aria-label="Renommer cette réponse">✎</button><button type="button" class="icon-button small" data-hc-opt-del title="Retirer cette réponse" aria-label="Retirer cette réponse">×</button>`}</header>
            <p class="h-hc-score"><b>${esc(signed(o.score))}</b> ${Number(d.leader) === o.id ? UI().badge('En tête', 'green') : ''}${o.chosen ? UI().badge('Retenue', 'blue') : ''}${val ? `<span class="h-hc-val">${val}</span>` : ''}</p>
            ${sideHtml(o, 'for', ro)}${sideHtml(o, 'against', ro)}
            <footer>${o.chosen && concluded ? `<span class="muted">★ Retenue ${UI().when ? UI().when(d.hypothesis.concluded_at) : esc(d.hypothesis.concluded_at)}</span>` : ro ? '' : `<button type="button" class="button" data-hc-conclude ${concluded ? 'disabled' : ''}>✓ Retenir « ${esc(o.label)} »</button>`}</footer></section>`;
    }
    function newColHtml(d) {
        const f = d.field;
        return `<section class="h-hc-col h-hc-new"><header><h3>＋ Une autre réponse</h3></header>
            ${f === 'event_place' ? `<span class="pk-lab">Le lieu</span>${P().pickerField({name: '', hiddenName: false, kind: 'place', inline: true})}<p class="muted">Choisis le lieu : la colonne s’ajoute toute seule.</p>`
            : `<label>${f === 'event_date' ? 'La date (comme dans un acte)' : 'La réponse'}<input data-hc-new ${f === 'event_date' ? 'data-ui-date="nocal" placeholder="7 mai 1825, vers 1784…"' : 'placeholder="Ex. « fils de Pierre BORIE »"'} maxlength="${f === 'event_date' ? 120 : 200}"></label><button type="button" class="button secondary" data-hc-new-add>＋ Ajouter la réponse</button>`}</section>`;
    }
    function bodyHtml(d) {
        const h = d.hypothesis, e = d.event, ro = d.person.locked;
        const ev = e ? [e.type_label, e.date_text, e.place_name].filter(Boolean).join(' — ') : '';
        const how = d.field ? `Retenir une réponse met à jour <b>${esc(d.field_label)}</b> sur la fiche${d.current ? ` (aujourd’hui : « ${esc(d.current)} »)` : ''} ; « ↶ Annuler » remet tout comme avant.`
            : `Retenir une réponse confirme l’hypothèse${(h.type === 'place' || h.type === 'date') && !e ? ' (relie-la à un événement avec ✎ Modifier pour que la fiche se mette à jour toute seule)' : ' ; la fiche ne change pas'}.`;
        return `<div class="h-hc-head"><p><button type="button" class="table-link" data-open-person="${d.person.id}"><strong>${esc(d.person.title)}</strong></button>${ev ? ` · ${esc(ev)}` : ''} · ${statusBadge(h.status)}</p>
            ${h.statement ? `<p class="h-hc-statement">${esc(h.statement)}</p>` : ''}<p class="muted">${how} Poids : faible = 1, moyen = 2, fort = 3 ; la colonne en tête a le plus grand total (pour − contre).</p>
            ${ro ? UI().notice('info', 'Cette fiche est verrouillée : la comparaison se lit seulement.') : ''}
            ${h.can_undo ? `<div class="ui-notice ui-notice-ok" role="status"><span class="ui-notice-ico" aria-hidden="true">✓</span><span>Conclue : « ${esc(d.options.find(o => o.chosen)?.label || '')} » retenue. ${ro ? '' : '<button type="button" class="button small secondary" data-hc-undo>↶ Revenir sur la conclusion</button>'}</span></div>` : ''}</div>
            <div class="h-hc-cols">${d.options.map(o => colHtml(d, o, ro)).join('')}${ro || d.options.length >= 8 ? '' : newColHtml(d)}</div>`;
    }

    async function openCompare(id) {
        let d;
        try { d = await A().api('hypothesis_compare', {id}); } catch (e) { A().toast(e.message || 'Hypothèse introuvable.', 'error'); return; }
        const pid = d.person.id;
        // première ouverture : la valeur de la fiche devient la première colonne
        if (!d.options.length && !d.person.locked && d.event && ((d.field === 'event_place' && d.event.place_id) || (d.field === 'event_date' && d.event.date_text))) {
            try { await post('hypothesis_option_save', d.field === 'event_place' ? {hypothesis_id: id, place_id: d.event.place_id} : {hypothesis_id: id, value_text: d.event.date_text}); d = await A().api('hypothesis_compare', {id}); } catch (_) {}
        }
        let changed = false, dlg = null;
        const reload = async () => {
            try { d = await A().api('hypothesis_compare', {id}); } catch (e) { A().toast(e.message, 'error'); return; }
            if (dlg?.isConnected) { const box = dlg.querySelector('[data-hc-body]'); const y = dlg.querySelector('.h-dialog-body')?.scrollTop || 0; box.innerHTML = bodyHtml(d); const b = dlg.querySelector('.h-dialog-body'); if (b) b.scrollTop = y; }
        };
        const after = async () => { changed = true; if (dlg?.isConnected) await reload(); else await refreshPerson(pid); };
        const optOf = el => d.options.find(o => o.id === Number(el.closest('[data-hc-opt]')?.dataset.hcOpt));
        const proofOf = el => { const id2 = Number(el.closest('[data-hc-proof]')?.dataset.hcProof); for (const o of d.options) { const p = o.proofs.find(x => x.id === id2); if (p) return p; } return null; };
        const run = async fn => { try { await fn(); } catch (e) { A().toast(e.message || 'Impossible.', 'error'); } };
        dlg = ext.openDialog({eyebrow: 'HYPOTHÈSES À COMPARER', title: `⚖️ ${d.hypothesis.title}`, wide: true, body: `<div data-hc-body>${bodyHtml(d)}</div>`,
            onOpen: dg => {
                dg.classList.add('h-hc-dialog');
                dg.addEventListener('close', () => { if (changed) refreshPerson(pid); });
                dg.addEventListener('picker-change', e => {
                    const add = e.target.closest?.('[data-hc-add]');
                    if (add) {
                        const v = e.detail?.value; if (v == null || v === '') return;
                        const it = e.detail.item || {};
                        const isTxt = typeof v === 'string' && v.startsWith('txt:');
                        return run(async () => { await post('hypothesis_proof_save', {option_id: Number(add.dataset.hcAdd), stance: add.dataset.hcStance, weight: 2, ref_kind: isTxt ? '' : (it.kind || ''), ref_id: v}); await after(); });
                    }
                    if (e.target.closest?.('.h-hc-new') && d.field === 'event_place') {
                        const v = Number(e.detail?.value) || 0; if (!v) return;
                        return run(async () => { await post('hypothesis_option_save', {hypothesis_id: id, place_id: v}); await after(); });
                    }
                });
                dg.addEventListener('change', e => {
                    const w = e.target.closest?.('[data-hc-weight]'); if (!w) return;
                    const p = proofOf(w); if (!p) return;
                    run(async () => { await post('hypothesis_proof_save', {id: p.id, weight: Number(w.value)}); await after(); });
                });
                dg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-hc-new]')) { e.preventDefault(); dg.querySelector('[data-hc-new-add]')?.click(); } });
                dg.addEventListener('click', e => {
                    const t = e.target.closest?.('[data-hc-conclude],[data-hc-undo],[data-hc-opt-del],[data-hc-proof-del],[data-hc-note],[data-hc-rename],[data-hc-new-add]'); if (!t) return;
                    e.preventDefault();
                    if (t.matches('[data-hc-new-add]')) {
                        const inp = dg.querySelector('[data-hc-new]'); const v = inp?.value.trim() || '';
                        if (!v) { UI().fieldError ? UI().fieldError(inp, d.field === 'event_date' ? 'Écris la date de cette réponse.' : 'Écris cette réponse.') : A().toast('Écris cette réponse.', 'error'); inp?.focus(); return; }
                        return run(async () => { await post('hypothesis_option_save', d.field === 'event_date' ? {hypothesis_id: id, value_text: v} : {hypothesis_id: id, label: v}); await after(); });
                    }
                    if (t.matches('[data-hc-conclude]')) {
                        const o = optOf(t); if (!o) return;
                        return run(async () => {
                            const r = await post('hypothesis_conclude', {id, option_id: o.id});
                            const res = r.result || r;
                            await after();
                            A().undoToast(`« ${o.label} » retenue${res.changed ? ` — fiche mise à jour (${res.changed})` : ' — hypothèse confirmée'}`, {
                                undo: async () => { await post('hypothesis_conclusion_undo', {id}); await after(); },
                                redo: async () => { await post('hypothesis_conclude', {id, option_id: o.id}); await after(); }});
                        });
                    }
                    if (t.matches('[data-hc-undo]')) return run(async () => { await post('hypothesis_conclusion_undo', {id}); await after(); A().toast('↶ Conclusion annulée : la fiche est comme avant.'); });
                    if (t.matches('[data-hc-opt-del]')) {
                        const o = optOf(t); if (!o) return;
                        return run(async () => { await post('hypothesis_option_delete', {id: o.id}); await after();
                            A().undoToast(`Réponse « ${o.label} » retirée`, {undo: async () => { await post('hypothesis_compare_restore', {kind: 'option', id: o.id}); await after(); }, redo: async () => { await post('hypothesis_option_delete', {id: o.id}); await after(); }}); });
                    }
                    if (t.matches('[data-hc-proof-del]')) {
                        const p = proofOf(t); if (!p) return;
                        return run(async () => { await post('hypothesis_proof_delete', {id: p.id}); await after();
                            A().undoToast(`Preuve « ${p.title} » retirée`, {undo: async () => { await post('hypothesis_compare_restore', {kind: 'proof', id: p.id}); await after(); }, redo: async () => { await post('hypothesis_proof_delete', {id: p.id}); await after(); }}); });
                    }
                    if (t.matches('[data-hc-note]')) {
                        const p = proofOf(t); if (!p) return;
                        return run(async () => { const v = await A().askText({title: '✎ Note sur la preuve', message: `« ${p.title} » : pourquoi elle compte (ou pas).`, value: p.note || '', okLabel: 'Enregistrer'}); if (v === null || v === undefined) return; await post('hypothesis_proof_save', {id: p.id, note: String(v)}); await after(); });
                    }
                    if (t.matches('[data-hc-rename]')) {
                        const o = optOf(t); if (!o) return;
                        return run(async () => { const v = await A().askText({title: '✎ Renommer la réponse', value: o.label, okLabel: 'Enregistrer'}); if (!v || !String(v).trim()) return; await post('hypothesis_option_save', {id: o.id, label: String(v).trim(), value_text: o.value_text, place_id: o.place_id || ''}); await after(); });
                    }
                });
            }});
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-hcomp-open]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        openCompare(Number(b.dataset.hcompOpen));
    }, true);

    /* ─────────── « Fiche liée » : le menu de choix des personnes ─────────── */
    function relatedPicker(dlg) {
        const form = dlg.querySelector('#hypothesis-form'); if (!form) return;
        const el = form.elements.related_person_id; if (!el) return;
        const val = Number(el.value) || null;
        let host = form.querySelector('.h-hc-related');
        if (!host) {
            const label = el.closest('label');
            host = document.createElement('div'); host.className = 'h-hc-related';
            (label || el).replaceWith(host);
        }
        host.innerHTML = `<span class="pk-lab">Fiche liée, si besoin <small>(l’autre personne d’un doublon, d’une filiation…)</small></span>${P().pickerField({name: 'related_person_id', kind: 'person', value: val})}`;
    }
    const watchHyp = () => {
        const dlg = document.getElementById('hypothesis-dialog'); if (!dlg || dlg.dataset.hcWatch) return;
        dlg.dataset.hcWatch = '1';
        new MutationObserver(() => { if (dlg.open) relatedPicker(dlg); }).observe(dlg, {attributes: true, attributeFilter: ['open']});
    };

    ext.hypotheses = {open: openCompare};
    const boot = () => { if (!A()) return; addBlock(); watchHyp(); };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true}); setTimeout(boot, 0);
})();
