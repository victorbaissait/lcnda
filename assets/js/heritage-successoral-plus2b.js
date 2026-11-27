/* LCNDA — ⚖️ Successoral, quinze outils de plus : écrans, partie 2 (maquette docs/design/successoral-plus-2.html, outils 5, 6, 7, 9, 10).
 * 🧾 Devis et factures (registre du cabinet, numéros sans trou, facture émise non modifiable, avoir) · 🏢 Mon cabinet ·
 * 💶 Suivi des fonds par héritier (aucun actif net : seulement les montants versés que tu tapes) · 📈 Activité (vue de ⚖️ Successions) ·
 * 📝 Ton contrat (tes versions, aucun texte de l'app) · 🤝 Copie pour le notaire (chiffrée dans le navigateur, page autonome).
 * Ce que l'app ne fait pas : elle ne choisit ni le taux de TVA ni les mentions de ta facture (c'est toi, avec ton comptable).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, S = () => window.LCNDA_SUCC_CORE, OC = () => window.LCNDA_SUCC_OUTILS, C = () => window.LCNDA_SUCC_P2;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const SP = ext.succPlus2 = ext.succPlus2 || {};
    const H = () => SP.h;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const cfg = () => SP.cfg();
    const T = {get: (...a) => H().get(...a), post: (...a) => H().post(...a)};
    const toast = (...a) => A().toast(...a);
    const money = c => H().money(c);
    const eurIn = c => (c == null || c === '' ? '' : (Number(c) / 100).toFixed(2).replace('.', ','));

    /* ═════ 🏢 Mon cabinet (Réglages → ⚖️ Successoral) ═════ */
    const REQ = [['name', 'Nom'], ['address', 'Adresse'], ['siret', 'SIRET'], ['vat', 'N° de TVA'], ['mentions', 'Mentions']];
    SP.cabinetHtml = cab => `<details class="sp2-set-group" id="sp2-cabinet"><summary><b>🏢 ${esc(i18n('Mon cabinet (factures)'))}</b></summary>
        ${UI().notice('info', i18n('L’app ne connaît ni ton statut, ni ton régime de TVA, ni les mentions que ta facture doit porter : c’est toi qui les écris, avec ton comptable. L’app les recopie telles quelles.'))}
        <div class="succ-form sp2-cab">${REQ.slice(0, 4).map(([k, l]) => `<label>${esc(i18n(l))}<input data-sp2-cab="${k}" maxlength="${k === 'address' ? 400 : 160}" value="${esc(cab[k] || '')}"></label>`).join('')}
        <label>${esc(i18n('Mentions à imprimer sur chaque facture (ton texte)'))}<textarea data-sp2-cab="mentions" rows="4" maxlength="3000" placeholder="${esc(i18n('vide : à écrire avec ton comptable'))}">${esc(cab.mentions || '')}</textarea></label>
        <div><b>${esc(i18n('Champs obligatoires pour émettre une facture'))}</b> ${REQ.map(([k, l]) => `<label class="succ-radio"><input type="checkbox" data-sp2-cabreq="${k}"${(cab.required || ['name']).includes(k) ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</div>
        <p class="ui-hint">${esc(i18n('Un champ que tu as déclaré obligatoire et laissé vide : la facture n’est pas émise.'))}</p></div></details>`;
    document.addEventListener('change', e => {
        const t = e.target; if (!t.closest?.('#sp2-cabinet')) return;
        if (t.dataset.sp2Cab) return SP.saveSetting({[t.dataset.sp2Cab]: t.value}, i18n('🏢 Mon cabinet'), 'cabinet');
        if (t.dataset.sp2Cabreq !== undefined) { const req = [...document.querySelectorAll('#sp2-cabinet [data-sp2-cabreq]:checked')].map(x => x.dataset.sp2Cabreq); return SP.saveSetting({required: req}, i18n('Champs obligatoires pour émettre une facture'), 'cabinet'); }
    });

    /* ═════ 9. 📝 Ton contrat : le brouillon de l'app retiré par défaut ; tes modèles et leurs versions ═════ */
    SP.contractText = builtin => {
        if (cfg().contract_builtin === 'example') return `⚠️ ${i18n('EXEMPLE NON JURIDIQUE — à faire écrire ou relire par ton conseil avant tout usage.')}\n\n${builtin()}`;
        return `[${i18n('ton titre')}]\n\n{civilité} {prénom} {nom}\n{adresse}\n\n{expéditeur} · SIRET {siret}\n\n[${i18n('ton texte : écrit ou relu par ton conseil')} · {pourcentage}]\n\n{dossier} · {date}`;
    };
    SP.contractButton = () => `<button type="button" class="button secondary" data-sp2-contract>📝 ${esc(i18n('Mes modèles de contrat'))}</button>`;
    SP.afterLetters = async (D, ids, kind) => {
        const m = String(kind || '').match(/^t(\d+)$/); if (!m || !ids?.length) return;
        const v = (await T.get('p2_tpl_versions', {id: m[1]})).items?.[0]; if (!v) return;
        await T.post({op: 'p2_courrier_tpl', ids, tpl: `${m[1]}:${v.version}`});
    };
    async function contractDialog(D, R) {
        let mine = []; try { mine = ((await T.get('tpl_list')).items || []).filter(x => x.kind === 'contrat'); } catch (_) {}
        let cur = mine[0] || null, versions = [];
        const heirs = R && !R.error ? OC().recipients(D, R) : [];
        const fields = OC().FIELDS.map(f => `<button type="button" class="succ-chip" data-sp2-field="${esc(f)}">{${esc(f)}}</button>`).join('');
        ext.openDialog({eyebrow: '📝', title: i18n('Ton contrat, avec des champs que l’app remplit'), wide: true, submitLabel: i18n('Enregistrer la version'),
            body: `${UI().notice('warn', i18n('L’app ne fournit aucun texte de contrat : c’est un acte qui t’engage et qui engage l’héritier, à faire écrire ou relire par ton conseil. L’app remplit des champs et garde l’historique de tes versions.'))}
                <div class="succ-form"><div class="succ-2"><label>${esc(i18n('Modèle'))}<select name="tpl"><option value="">${esc(i18n('＋ Nouveau modèle'))}</option>${mine.map(m => `<option value="${m.id}"${cur?.id === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><label>${esc(i18n('Nom'))}<input name="name" maxlength="120" value="${esc(cur?.name || i18n('Mon contrat'))}"></label></div>
                <label>${esc(i18n('Versions'))}<select name="ver" data-sp2-vers><option value="">—</option></select></label>
                <div class="succ-chips">${fields}</div><textarea name="body" rows="14" class="cl-letter" maxlength="20000" placeholder="${esc(i18n('Écris ou importe ton contrat'))}">${esc(cur?.body || '')}</textarea>
                <div data-sp2-cwarn></div>
                <div class="cl-out"><button type="button" class="button small secondary" data-sp2-cimport>⤒ ${esc(i18n('Importer un .docx / .txt'))}</button>${heirs.length ? `<button type="button" class="button small secondary" data-sp2-cprev>👁 ${esc(i18n('Aperçu pour un héritier'))}</button>` : ''}</div>
                <div class="succ-serial-page" data-sp2-cpage hidden data-i18n-off></div>
                <p class="ui-hint">${esc(i18n('{defunt} n’existe pas : le nom du défunt n’est jamais dans un courrier envoyé avant signature. {pourcentage} vient de 💶 « Honoraires d’un contrat ».'))} ${H().setLink('contract_builtin')}</p></div>`,
            onOpen: d => {
                const f = d.querySelector('form'); let at = 0;
                const loadV = async () => { const sel = d.querySelector('[data-sp2-vers]'); versions = cur ? ((await T.get('p2_tpl_versions', {id: cur.id})).items || []) : []; sel.innerHTML = versions.length ? versions.map(v => `<option value="${v.version}">${esc(i18n('version {n}', {n: v.version}))} · ${esc(H().fmtDate(String(v.saved_at).slice(0, 10)))}</option>`).join('') : '<option value="">—</option>'; };
                const warn = () => { const b = OC().unknownFields(f.body.value); d.querySelector('[data-sp2-cwarn]').innerHTML = b.length ? UI().notice('warn', i18n('Champ inconnu : {f} (ligne {l}). Corrige-le avant d’enregistrer.', {f: b.map(x => `{${x.name}}`).join(', '), l: b.map(x => x.line).join(', ')})) : ''; return b; };
                loadV(); warn();
                f.body.addEventListener('input', warn);
                f.tpl.addEventListener('change', async () => { cur = mine.find(m => String(m.id) === f.tpl.value) || null; f.name.value = cur?.name || i18n('Mon contrat'); f.body.value = cur?.body || ''; warn(); await loadV(); });
                f.ver.addEventListener('change', () => { const v = versions.find(x => String(x.version) === f.ver.value); if (v) { f.body.value = v.body; warn(); } });
                d.addEventListener('click', async e => {
                    const fl = e.target.closest('[data-sp2-field]'); if (fl) { const ta = f.body, tok = `{${fl.dataset.sp2Field}}`, a = ta.selectionStart ?? ta.value.length; ta.setRangeText(tok, a, ta.selectionEnd ?? a, 'end'); ta.focus(); warn(); return; }
                    if (e.target.closest('[data-sp2-cimport]')) {
                        const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                        input.addEventListener('change', async () => {
                            const file = input.files?.[0]; if (!file) return; if (file.size > 5e6) return toast(i18n('Fichier trop gros.'), 'error');
                            if (/\.txt$/i.test(file.name)) { f.body.value = await file.text(); warn(); return; }
                            const u8 = new Uint8Array(await file.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
                            try { f.body.value = (await T.post({op: 'p2_docx_text', data: btoa(bin)})).text; warn(); } catch (err) { toast(err.message, 'error'); }
                        });
                        input.click(); return;
                    }
                    if (e.target.closest('[data-sp2-cprev]')) {
                        const page = d.querySelector('[data-sp2-cpage]'); page.hidden = false;
                        const ok = heirs.filter(h => (D.fees || []).some(x => x.kind === 'percent' && Number(x.person_id) === h.id));
                        const list = ok.length ? ok : heirs; at = (at + 1) % Math.max(1, list.length); const h = list[at];
                        const vals = OC().letterValues(D, h, {t: i18n, date: H().fmtDate(H().today()), sender: (SP.cabinet()?.name || '')});
                        const fill = OC().fillLetter(f.body.value, vals);
                        page.innerHTML = `<p><b>${esc(h.name)}</b> · ${at + 1} / ${list.length}${vals.pourcentage ? '' : ` · ${H().badge(i18n('% à noter'), 'yellow')}`}${fill.empty.length ? ` · ${H().badge(i18n('Champ vide : {f}', {f: fill.empty.join(', ')}), 'yellow')}` : ''}</p><div class="succ-serial-text">${fill.parts.map(p => p.empty ? `<mark class="succ-empty">{${esc(p.field)}}</mark>` : p.field ? `<span class="succ-filled">${esc(p.text)}</span>` : esc(p.text)).join('')}</div>`;
                    }
                });
            },
            onSubmit: async f => {
                if (!f.body.value.trim()) return UI().fail(f.body, i18n('Écris ou importe ton contrat'));
                if (OC().unknownFields(f.body.value).length) return UI().fail(f.body, i18n('Corrige d’abord le champ inconnu.'));
                let r; try { r = await T.post({op: 'p2_contract_save', id: Number(f.tpl.value) || 0, name: f.name.value, body: f.body.value}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Version {n} enregistrée (Mes modèles)', {n: r.version}), {undo: async () => { await T.post({op: 'p2_contract_undo', id: r.id, version: r.version, prev: r.prev}); }});
            }});
    }

    /* ═════ 10. 💶 Suivi des fonds par héritier ═════ */
    const SENS = [['recu', '⬇', 'Reçu du notaire'], ['commission', '✂', 'Commission'], ['frais', '🧾', 'Frais refacturés'], ['reverse', '⬆', 'Reversé à l’héritier']];
    const pctOf = (D, pid) => { const f = (D.fees || []).find(x => x.kind === 'percent' && Number(x.person_id) === Number(pid)); return f ? f.percent : null; };
    function fundsHtml(D, R, ro) {
        const rows = D.p2?.funds || [], F = C().funds(rows);
        const heirs = (R?.rows || []).filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const ids = [...new Set([...heirs.map(h => h.id), ...rows.map(r => r.person_id)])];
        const cell = c => `<td class="sp2-num">${c ? money(c) : '—'}</td>`;
        return `<section class="succ-box sp2-funds"><div class="succ-box-head"><h3>💶 ${esc(i18n('Fonds par héritier'))}</h3>${H().setLink('funds_commission')}</div>
            ${UI().notice('info', i18n('Aucun montant de succession : l’app ne connaît ni l’actif, ni le passif. On note seulement des mouvements réels que tu as vus passer.'))}
            <div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Héritier'))}</th><th>${esc(i18n('Contrat'))}</th><th>${esc(i18n('Reçu du notaire'))}</th><th>${esc(i18n('Commission'))}</th><th>${esc(i18n('Frais refacturés'))}</th><th>${esc(i18n('Reversé'))}</th><th>${esc(i18n('Reste dû'))}</th><th></th></tr></thead><tbody>
            ${ids.map(pid => { const x = F[pid] || {recu: 0, commission: 0, frais: 0, reverse: 0, rest: 0}, p = pctOf(D, pid);
                return `<tr class="${x.over ? 'sp2-over' : ''}"><td><button type="button" class="table-link" data-h-person="${pid}">${esc(H().nameOf(D, pid))}</button></td><td>${p != null ? esc(`${String(p).replace('.', ',')} %`) : `<small class="muted">${esc(i18n('pas de contrat'))}</small>`}</td>${cell(x.recu)}${cell(x.commission)}${cell(x.frais)}${cell(x.reverse)}
                <td class="sp2-num"><b>${money(x.rest)}</b> ${x.over ? H().badge(i18n('reversé de trop : {s}', {s: money(-x.rest)}), 'red') : x.settled ? H().badge(i18n('✓ soldé'), 'green') : x.rest > 0 ? H().badge(i18n('à reverser'), 'yellow') : ''}</td>
                <td><button type="button" class="button small secondary" data-sp2-fund-open="${pid}">${esc(i18n('Mouvements'))}</button>${ro ? '' : ` <button type="button" class="icon-button small" data-sp2-fund-add="${pid}" aria-label="${esc(i18n('＋ Noter un mouvement'))}" title="${esc(i18n('＋ Noter un mouvement'))}">＋</button>`}</td></tr>`; }).join('')}</tbody></table></div>
            <p class="ui-hint">${esc(i18n('Commission = % du contrat × montant reçu. Reste dû = reçu − commission − frais − reversé.'))}</p></section>`;
    }
    function fundDialog(D, pid, row = null) {
        const x = row || {}, p = pctOf(D, pid), F = C().funds(D.p2?.funds || [])[pid] || {recu: 0};
        const sug = cfg().funds_commission === 'calc' && p != null ? C().commission(F.recu, p) : null;
        ext.openDialog({eyebrow: `💶 ${H().nameOf(D, pid)}`, title: row ? i18n('✎ Corriger un mouvement') : i18n('＋ Noter un mouvement'), submitLabel: i18n('Noter'),
            body: `<div class="succ-form"><span class="pk-lab">${esc(i18n('Sens'))}</span>${H().seg('sens', SENS.map(([k, ic, l]) => [k, `${ic} ${l}`]), x.sens || 'recu')}
                <div class="succ-2"><label>${esc(i18n('Date'))}<input type="date" name="day" value="${esc(x.day || H().today())}"></label><label>${esc(i18n('Montant (€)'))}<input name="amount" inputmode="decimal" value="${esc(eurIn(x.cents))}" data-sp2-amount></label></div>
                <p class="ui-hint" data-sp2-sug hidden>${sug != null ? esc(i18n('Commission proposée : {p} % de {r} = {c} (modifiable)', {p: String(p).replace('.', ','), r: money(F.recu), c: money(sug)})) : ''}</p>
                <div class="succ-2"><label>${esc(i18n('Moyen'))}<input name="moyen" maxlength="60" value="${esc(x.moyen || '')}" placeholder="${esc(i18n('virement, chèque…'))}"></label><label>${esc(i18n('Versé à (représentant, si mineur ou sous tutelle)'))}<input name="paid_to" maxlength="200" value="${esc(x.paid_to || '')}"></label></div>
                <label>${esc(i18n('Note'))}<input name="note" maxlength="400" value="${esc(x.note || '')}"></label></div>`,
            onOpen: d => { const f = d.querySelector('form'); const paint = () => { const s = f.querySelector('[name=sens]:checked')?.value; const h = d.querySelector('[data-sp2-sug]'); h.hidden = s !== 'commission' || sug == null; if (s === 'commission' && sug != null && !f.amount.value) f.amount.value = eurIn(sug); }; d.addEventListener('change', paint); paint(); },
            onSubmit: async f => {
                const c = C().cents(f.amount.value); if (!c || c <= 0) return UI().fail(f.amount, i18n('Montant incorrect.'));
                let r; try { r = await T.post({op: 'p2_fund_save', case_id: D.id, id: x.id || 0, person_id: pid, sens: f.querySelector('[name=sens]:checked')?.value, day: f.day.value, cents: c, moyen: f.moyen.value, paid_to: f.paid_to.value, note: f.note.value}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(row ? i18n('Mouvement corrigé') : i18n('Mouvement noté'), {undo: async () => { await T.post(row ? {op: 'p2_fund_undo_edit', case_id: D.id, prev: r.prev} : {op: 'p2_fund_delete', case_id: D.id, id: r.id}); H().reload(); }});
                H().reload();
            }});
    }
    function fundsPerson(D, pid) {
        const F = C().funds(D.p2?.funds || [])[pid] || {lines: [], rest: 0};
        const ic = s => (SENS.find(x => x[0] === s) || SENS[0])[1];
        const list = `<ul class="sp2-calls">${F.lines.map(l => `<li><div class="sp2-call-when"><b>${esc(H().fmtDate(l.day))}</b></div><div class="sp2-call-ico">${ic(l.sens)}</div><div class="sp2-call-body"><b>${esc(i18n((SENS.find(x => x[0] === l.sens) || SENS[0])[2]))}</b> <span class="sp2-num">${l.sens === 'recu' ? '' : '−'}${money(l.cents)}</span>${l.moyen ? ` · ${esc(l.moyen)}` : ''}${l.paid_to ? ` · ${esc(i18n('versé à {n}', {n: l.paid_to}))}` : ''}${l.note ? `<p>${esc(l.note)}</p>` : ''}</div>${D.archived ? '' : `<div class="sp2-call-act"><button type="button" class="icon-button small" data-sp2-fund-edit="${l.id}" aria-label="${esc(i18n('✎ Modifier'))}">✎</button><button type="button" class="icon-button small" data-sp2-fund-del="${l.id}" aria-label="${esc(i18n('Supprimer'))}">🗑</button></div>`}</li>`).join('')}</ul>`;
        const decompte = () => `<section data-k-page style="font:11pt Georgia,serif"><h1 style="font-size:15pt">${esc(i18n('Décompte — {n}', {n: H().nameOf(D, pid)}))}</h1><p>${esc(SP.cabinet()?.name || '')}<br>${esc(i18n('Dossier {n}', {n: D.number}))}</p><table style="width:100%;border-collapse:collapse">${F.lines.map(l => `<tr><td style="padding:1.5mm;border-bottom:.5px solid #999">${esc(H().fmtDate(l.day))}</td><td style="padding:1.5mm;border-bottom:.5px solid #999">${esc(i18n((SENS.find(x => x[0] === l.sens) || SENS[0])[2]))}</td><td style="padding:1.5mm;border-bottom:.5px solid #999;text-align:right">${l.sens === 'recu' ? '' : '−'}${money(l.cents)}</td></tr>`).join('')}</table><p style="text-align:right"><b>${esc(i18n('Reste dû'))} : ${money(F.rest)}</b></p></section>`;
        ext.openDialog({eyebrow: '💶', title: H().nameOf(D, pid), wide: true, submitLabel: i18n('Fermer'),
            body: `${F.lines.length ? list : A().empty(i18n('Aucun mouvement noté.'), {icon: '💶'})}<p><b>${esc(i18n('Reste à reverser'))} : ${money(F.rest)}</b></p>
                <div class="cl-out">${D.archived ? '' : `<button type="button" class="button small" data-sp2-fund-add="${pid}">＋ ${esc(i18n('Noter un mouvement'))}</button>`}${cfg().funds_print === 'print' ? `<button type="button" class="button small secondary" data-sp2-decompte>🖨 ${esc(i18n('Décompte pour l’héritier'))}</button>` : ''}${D.archived ? '' : `<button type="button" class="button small secondary" data-sp2-inv-commission="${pid}">🧾 ${esc(i18n('Facturer la commission'))}</button>`}</div>`,
            onOpen: d => d.querySelector('[data-sp2-decompte]')?.addEventListener('click', () => { UI().openPrintDialog({title: i18n('Décompte — {n}', {n: H().nameOf(D, pid)}), key: 'succ-decompte', paper: 'A4', photos: false, html: decompte()}); T.post({op: 'p2_print', what: 'decompte', case_id: D.id}).catch(() => {}); })});
    }

    /* ═════ 5. 🧾 Devis et factures ═════ */
    let INV = null;
    const loadInv = async q => { INV = await T.get('p2_invoices', q || {}); return INV; };
    function invoiceHtml(x, cab) {
        const c = x.cabinet || cab || {};
        const row = (l, v) => `<tr><td style="padding:1.5mm;border-bottom:.5px solid #999">${esc(l)}</td><td style="padding:1.5mm;border-bottom:.5px solid #999;text-align:right">${v}</td></tr>`;
        const kind = {facture: i18n('Facture'), avoir: i18n('Avoir'), devis: i18n('Devis')}[x.kind];
        return `<section data-k-page style="font:10.5pt Georgia,serif"><div style="display:flex;justify-content:space-between;gap:8mm"><div><b>${esc(c.name || '')}</b><br>${esc(c.address || '').replace(/\n/g, '<br>')}${c.siret ? `<br>SIRET ${esc(c.siret)}` : ''}${c.vat ? `<br>${esc(i18n('N° de TVA'))} ${esc(c.vat)}` : ''}</div>
            <div style="text-align:right"><b style="font-size:14pt">${esc(kind)} ${esc(x.number || i18n('BROUILLON'))}</b><br>${esc(H().fmtDate(x.day))}${x.number ? `<br><b>${esc(x.kind === 'devis' ? i18n('ÉMIS') : i18n('ÉMISE'))}</b>` : ''}</div></div>
            <p style="margin-top:8mm"><b>${esc(i18n('Client'))}</b><br>${esc(x.client_name)}<br>${esc(x.client_address).replace(/\n/g, '<br>')}</p><p>${esc(i18n('Dossier {n}', {n: x.case_number}))}</p>
            <table style="width:100%;border-collapse:collapse">${x.lines.map(l => row(`${l.label}${l.qty !== 1 ? ` × ${String(l.qty).replace('.', ',')}` : ''}`, C().money(l.total_cents))).join('')}
            ${row(i18n('Total HT'), C().money(x.ht))}${x.rate_text !== '' ? row(i18n('TVA {r} %', {r: x.rate_text}), C().money(x.vat)) : ''}${row(`<b>${esc(i18n('Total TTC'))}</b>`, `<b>${C().money(x.ttc)} €</b>`)}</table>
            ${x.mentions || c.mentions ? `<p style="margin-top:8mm;white-space:pre-wrap;font-size:9pt">${esc(x.number ? x.mentions : (cab?.mentions || ''))}</p>` : ''}</section>`;
    }
    const printInv = (x, caseId) => { UI().openPrintDialog({title: `${x.number || i18n('BROUILLON')}`, key: 'succ-invoice', paper: 'A4', photos: false, html: invoiceHtml(x, SP.cabinet())}); T.post({op: 'p2_print', what: 'invoice', case_id: caseId || 0}).catch(() => {}); };
    /** proposer les lignes : commission (d'après 💶 le reçu réellement versé), temps (décoché s'il y a une commission : réglage), frais */
    function proposeLines(D, pid) {
        const out = [];
        const p = pctOf(D, pid), F = C().funds(D.p2?.funds || [])[pid];
        if (p != null) out.push({label: F?.recu ? i18n('Commission du contrat de révélation ({p} % de la part reçue : {r})', {p: String(p).replace('.', ','), r: money(F.recu)}) : i18n('Commission du contrat de révélation ({p} %)', {p: String(p).replace('.', ',')}), qty: 1, unit_cents: F?.recu ? C().commission(F.recu, p) : 0, on: true, kind: 'commission'});
        const Fe = S().fees(D.fees || []);
        if (Fe.minutes) out.push({label: i18n('Temps passé ({h} h {m})', {h: Fe.hours, m: String(Fe.mins).padStart(2, '0')}), qty: Math.round(Fe.minutes / 60 * 100) / 100, unit_cents: 0, on: cfg().inv_time === 'checked' || p == null, kind: 'time'});
        for (const f of (D.fees || []).filter(x => x.kind === 'cost')) out.push({label: f.label || i18n('Frais'), qty: 1, unit_cents: f.amount_cents, on: true, kind: 'cost'});
        return out;
    }
    async function invoiceDialog(D, R, {kind = 'facture', pid = 0, inv = null} = {}) {
        try { await loadInv({}); } catch (e) { return toast(e.message, 'error'); }
        const x = inv || {kind, lines: [], rate_text: INV.last_rate || ''};
        const heirs = R && !R.error ? OC().recipients(D, R) : [];
        let lines = inv ? inv.lines.map(l => ({...l, on: true})) : (D ? proposeLines(D, pid || heirs[0]?.id || 0) : []);
        const who = inv ? null : heirs.find(h => h.id === pid) || heirs[0];
        const cab = SP.cabinet();
        ext.openDialog({eyebrow: x.kind === 'devis' ? i18n('🧾 DEVIS') : i18n('🧾 FACTURE'), title: inv?.number ? i18n('{k} {n}', {k: x.kind === 'devis' ? i18n('Devis') : i18n('Facture'), n: inv.number}) : i18n('Brouillon, pas encore numéroté'), wide: true, submitLabel: i18n('Garder en brouillon'),
            body: `${UI().notice('info', i18n('Ce que l’app ne fait pas : elle ne connaît ni ton statut, ni ton régime de TVA, ni les mentions que ta facture doit porter. C’est toi qui choisis le taux et qui écris les mentions (avec ton comptable). L’app numérote sans trou, interdit de modifier une facture émise, fait les additions et garde tout.'))}
                ${INV.cabinet_missing?.length ? UI().notice('warn', i18n('🏢 Mon cabinet : des champs obligatoires sont vides ({f}) : la facture ne pourra pas être émise.', {f: INV.cabinet_missing.map(k => i18n((REQ.find(x => x[0] === k) || [k, k])[1])).join(', ')})) : ''}
                <div class="succ-form"><div class="succ-2"><label>${esc(i18n('Client'))}<input name="client_name" maxlength="200" value="${esc(inv?.client_name || who?.name || '')}"></label><label>${esc(i18n('Date'))}<input type="date" name="day" value="${esc(inv?.day || H().today())}"></label></div>
                <label>${esc(i18n('Adresse du client'))}<textarea name="client_address" rows="2" maxlength="600">${esc(inv?.client_address || (who ? (D.addresses?.[who.id]?.lines || []).join('\n') : ''))}</textarea></label>
                <div class="succ-scroll"><table class="succ-table sp2-lines"><thead><tr><th></th><th>${esc(i18n('Ligne'))}</th><th>${esc(i18n('Qté'))}</th><th>${esc(i18n('Prix HT'))}</th><th>${esc(i18n('Total HT'))}</th></tr></thead><tbody data-sp2-lines></tbody></table></div>
                <button type="button" class="button small secondary" data-sp2-line-add>＋ ${esc(i18n('Une ligne'))}</button>
                <div class="succ-2"><label>${esc(i18n('Taux de TVA (%) — choisi par toi'))}<input name="rate_text" inputmode="decimal" maxlength="8" value="${esc(x.rate_text || '')}" placeholder="${esc(i18n('ton taux'))}"></label><div data-sp2-tot class="sp2-tot"></div></div>
                <p class="ui-hint">${esc(INV.last_rate ? i18n('Repris de ta dernière facture ; jamais deviné.') : i18n('Aucun taux proposé : tape celui que t’a indiqué ton comptable.'))}</p>
                <div class="cl-out"><button type="button" class="button small secondary" data-sp2-inv-preview>🖨 ${esc(i18n('Aperçu'))}</button><button type="button" class="button small" data-sp2-inv-emit>${esc(x.kind === 'devis' ? i18n('Émettre le devis') : i18n('Émettre la facture'))}</button>${H().setLink('inv_numbering')}</div>
                <p class="ui-hint">${esc(i18n('À l’émission, la pièce prend la date du jour et le prochain numéro du registre ; le numéro donné s’affiche une fois émise.'))}</p></div>`,
            onOpen: d => {
                const f = d.querySelector('form'), tb = d.querySelector('[data-sp2-lines]');
                const paint = () => {
                    tb.innerHTML = lines.map((l, i) => `<tr><td><input type="checkbox" data-sp2-lon="${i}"${l.on ? ' checked' : ''} aria-label="${esc(i18n('Sur la facture'))}"></td><td><input data-sp2-ll="${i}" value="${esc(l.label)}" maxlength="300"></td><td><input data-sp2-lq="${i}" value="${esc(String(l.qty).replace('.', ','))}" inputmode="decimal" class="sp2-q"></td><td><input data-sp2-lu="${i}" value="${esc(eurIn(l.unit_cents))}" inputmode="decimal" class="sp2-q" placeholder="${l.kind === 'commission' ? esc(i18n('à remplir')) : ''}"></td><td class="sp2-num" data-sp2-lt="${i}"></td></tr>`).join('') + (lines.some(l => l.kind === 'time' && !l.on) ? `<tr><td colspan="5"><small class="muted">${esc(i18n('⏱ Temps passé : non coché, compris dans la commission'))}</small></td></tr>` : '');
                    tot();
                };
                const read = () => lines.filter(l => l.on && String(l.label).trim()).map(l => ({label: l.label, qty: l.qty, unit_cents: l.unit_cents}));
                const tot = () => { const bp = C().rate(f.rate_text.value); const t = C().totals(read(), bp); d.querySelector('[data-sp2-tot]').innerHTML = `${esc(i18n('Total HT'))} <b>${money(t.ht)}</b><br>${bp != null ? `${esc(i18n('TVA {r} %', {r: f.rate_text.value}))} ${money(t.vat)}<br><b>${esc(i18n('Total TTC'))} ${money(t.ttc)}</b>` : `<small class="muted">${esc(i18n('taux à choisir'))}</small>`}`; lines.forEach((l, i) => { const c = d.querySelector(`[data-sp2-lt="${i}"]`); if (c) c.textContent = l.on ? money(C().totals([l], null).ht) : '—'; }); };
                d.addEventListener('input', e => { const t = e.target; const i = Number(t.dataset.sp2Ll ?? t.dataset.sp2Lq ?? t.dataset.sp2Lu ?? -1); if (i >= 0) { if (t.dataset.sp2Ll != null) lines[i].label = t.value; if (t.dataset.sp2Lq != null) lines[i].qty = Number(String(t.value).replace(',', '.')) || 0; if (t.dataset.sp2Lu != null) lines[i].unit_cents = C().cents(t.value) ?? 0; } tot(); });
                d.addEventListener('change', e => { const c = e.target.closest('[data-sp2-lon]'); if (c) { lines[Number(c.dataset.sp2Lon)].on = c.checked; paint(); } });
                d.querySelector('[data-sp2-line-add]').addEventListener('click', () => { lines.push({label: '', qty: 1, unit_cents: 0, on: true}); paint(); });
                const save = async () => {
                    const body = {op: 'p2_inv_save', id: x.id || 0, kind: x.kind, day: f.day.value, client_name: f.client_name.value, client_address: f.client_address.value, person_id: who?.id || inv?.person_id || 0, case_number: D?.number || inv?.case_number || '', case_title: D?.title || inv?.case_title || '', rate_text: f.rate_text.value, lines: read()};
                    const r = await T.post(body); x.id = r.id; return r;
                };
                d.querySelector('[data-sp2-inv-preview]').addEventListener('click', () => printInv({...x, number: '', day: f.day.value, client_name: f.client_name.value, client_address: f.client_address.value, rate_text: f.rate_text.value, ...C().totals(read(), C().rate(f.rate_text.value)), lines: C().totals(read(), null).lines, case_number: D?.number || inv?.case_number || ''}, D?.id));
                d.querySelector('[data-sp2-inv-emit]').addEventListener('click', async () => {
                    // le numéro n'est pas annoncé d'avance (un autre poste peut émettre entre-temps) : celui que le serveur donne est affiché ensuite
                    if (!await A().confirmBox(x.kind === 'devis' ? i18n('Émettre le devis ? Il prend la date du jour et le prochain numéro du registre ; il reste modifiable tant qu’il n’est pas accepté.') : i18n('Une facture émise ne peut plus être modifiée ni supprimée. Pour corriger : un avoir. Émettre la facture ? Elle prend la date du jour et le prochain numéro du registre.'), {title: i18n('Émettre'), okLabel: i18n('Émettre')})) return;
                    try { await save(); const r = await T.post({op: 'p2_inv_emit', id: x.id, today: H().today()}); d.close(); toast(i18n('{n} émise le {d}', {n: r.number, d: H().fmtDate(r.day)}), 'success'); H().reload(); } catch (err) { toast(err.message, 'error'); }
                });
                paint();
                d._sp2save = save;
            },
            onSubmit: async f => { try { await f.closest('dialog')._sp2save(); } catch (e) { toast(e.message, 'error'); return false; } toast(i18n('Brouillon gardé')); H().reload(); }});
    }
    async function registryDialog(caseNumber = '') {
        try { await loadInv(caseNumber ? {case_number: caseNumber} : {}); } catch (e) { return toast(e.message, 'error'); }
        const years = [...new Set(INV.items.map(x => String(x.day).slice(0, 4)).filter(Boolean))].sort().reverse(); if (!years.includes(String(new Date().getFullYear()))) years.unshift(String(new Date().getFullYear()));
        const kindTxt = x => ({facture: i18n('Facture'), avoir: i18n('Avoir'), devis: i18n('Devis')}[x.kind]);
        const st = x => !x.number ? H().badge(i18n('brouillon'), 'grey') : x.kind === 'devis' ? H().badge(x.status === 'accepted' ? i18n('accepté') : i18n('émis'), x.status === 'accepted' ? 'green' : 'blue') : x.kind === 'avoir' ? H().badge(i18n('avoir'), 'violet') : x.paid_on ? H().badge(i18n('✓ payée le {d}', {d: H().fmtDate(x.paid_on)}), 'green') : H().badge(i18n('attendue'), 'yellow');
        ext.openDialog({eyebrow: '🧾', title: caseNumber ? i18n('Dossier {n}', {n: caseNumber}) : INV.register === 'cabinet' ? i18n('Tout le cabinet') : i18n('Cette généalogie'), wide: true, submitLabel: i18n('Fermer'),
            body: `${INV.locked ? UI().notice('info', i18n('{n} base(s) verrouillée(s) non lue(s)', {n: INV.locked})) : ''}<div data-sp2-reg></div><div class="cl-out"><label>${esc(i18n('Période'))} <select name="year">${years.map(y => `<option>${esc(y)}</option>`).join('')}</select></label><label class="checkbox-line"><input type="checkbox" name="funds"> ${esc(i18n('avec les mouvements de fonds'))}</label><button type="button" class="button small secondary" data-sp2-csv>⤓ ${esc(i18n('CSV pour le comptable'))}</button></div>
                <p class="ui-hint">${esc(i18n('Une facture émise ne peut plus être modifiée ni supprimée. Pour corriger : un avoir.'))} ${H().setLink('inv_register')}</p>`,
            onOpen: d => {
                const box = d.querySelector('[data-sp2-reg]');
                const bar = UI().listBar({key: 'succ:p2inv', search: {placeholder: i18n('Chercher… (n°, client, dossier)')}, filters: [{id: 'kind', label: i18n('Sorte'), type: 'check', options: [['facture', i18n('Facture')], ['avoir', i18n('Avoir')], ['devis', i18n('Devis')]]}], sort: {options: [['recent', i18n('Les plus récents')], ['old', i18n('Les plus anciens')]], value: 'recent'}, onChange: s => draw(s)});
                box.before(bar);
                const draw = (s = bar.state) => {
                    let list = INV.items.filter(x => UI().listMatch.text(s.q, x.number, x.client_name, x.case_number) && (!s.filters.kind?.length || s.filters.kind.includes(x.kind)));
                    if (s.sort === 'old') list = [...list].reverse();
                    bar.setCount(list.length, 'document', 'documents');
                    box.innerHTML = list.length ? `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('N°'))}</th><th>${esc(i18n('Date'))}</th><th>${esc(i18n('Dossier'))}</th><th>${esc(i18n('Client'))}</th><th>${esc(i18n('TTC'))}</th><th></th><th></th></tr></thead><tbody data-i18n-off>${list.map(x => `<tr><td><b>${esc(x.number || '—')}</b> <small class="muted">${esc(kindTxt(x))}</small></td><td>${esc(H().fmtDate(x.day))}</td><td>${esc(x.case_number)}</td><td>${esc(x.client_name)}</td><td class="sp2-num">${money(x.ttc)}</td><td>${st(x)}</td>
                        <td class="sp2-inv-act"><button type="button" class="icon-button small" data-sp2-inv-print="${x.id}" aria-label="🖨" title="🖨">🖨</button>${!x.number || (x.kind === 'devis' && x.status !== 'accepted') ? `<button type="button" class="icon-button small" data-sp2-inv-edit="${x.id}" aria-label="${esc(i18n('✎ Modifier'))}">✎</button>` : ''}${!x.number ? `<button type="button" class="icon-button small" data-sp2-inv-del="${x.id}" aria-label="${esc(i18n('Supprimer'))}">🗑</button>` : ''}
                        ${x.kind === 'facture' && x.number && !INV.items.some(y => y.kind === 'avoir' && y.ref_id === x.id) ? `<button type="button" class="button small secondary" data-sp2-inv-avoir="${x.id}">${esc(i18n('🧾 Faire un avoir'))}</button>` : ''}${x.kind === 'facture' && x.number ? `<button type="button" class="button small secondary" data-sp2-inv-paid="${x.id}">${esc(i18n('Payée…'))}</button>` : ''}
                        ${x.kind === 'devis' && x.number && x.status !== 'accepted' ? `<button type="button" class="button small secondary" data-sp2-q-accept="${x.id}">${esc(i18n('Accepté'))}</button>` : ''}${x.kind === 'devis' && x.number && !INV.items.some(y => y.kind === 'facture' && y.ref_id === x.id) ? `<button type="button" class="button small secondary" data-sp2-q-transform="${x.id}">${esc(i18n('Transformer en facture'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
                        : A().empty(i18n('Pas encore de facture.'), {icon: '🧾'});
                };
                draw();
                const again = async () => { await loadInv(caseNumber ? {case_number: caseNumber} : {}); draw(); };
                d.addEventListener('click', async e => {
                    const id = n => Number(e.target.closest(n)?.dataset[{'[data-sp2-inv-print]': 'sp2InvPrint', '[data-sp2-inv-edit]': 'sp2InvEdit', '[data-sp2-inv-del]': 'sp2InvDel', '[data-sp2-inv-avoir]': 'sp2InvAvoir', '[data-sp2-inv-paid]': 'sp2InvPaid', '[data-sp2-q-accept]': 'sp2QAccept', '[data-sp2-q-transform]': 'sp2QTransform'}[n]] || 0);
                    const find = n => INV.items.find(x => x.id === n);
                    try {
                        if (e.target.closest('[data-sp2-csv]')) { const a = document.createElement('a'); a.href = `api.php?action=successoral&op=p2_invoice_csv&year=${encodeURIComponent(d.querySelector('[name=year]').value)}&funds=${d.querySelector('[name=funds]').checked ? 1 : 0}&g=${encodeURIComponent(window.LCNDA_GENEALOGY || 'main')}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return; }
                        let n;
                        if ((n = id('[data-sp2-inv-print]'))) return printInv(find(n), H().cur()?.id);
                        if ((n = id('[data-sp2-inv-edit]'))) { d.close(); const D = H().cur(); return invoiceDialog(D, ext.successoral?.currentR?.(), {inv: find(n)}); }
                        if ((n = id('[data-sp2-inv-del]'))) { const r = await T.post({op: 'p2_inv_delete', id: n}); A().undoToast(i18n('Brouillon supprimé (aucun numéro consommé)'), {undo: async () => { await T.post({op: 'p2_inv_save', kind: r.prev.kind, day: r.prev.day, client_name: r.prev.client_name, client_address: r.prev.client_address, person_id: r.prev.person_id, case_number: r.prev.case_number, case_title: r.prev.case_title, rate_text: r.prev.rate_text, lines: r.prev.lines}); }}); return again(); }
                        if ((n = id('[data-sp2-inv-avoir]'))) { if (!await A().confirmBox(i18n('L’avoir reprend les lignes de la facture en négatif, avec son propre numéro. Il ne peut plus être modifié.'), {title: i18n('🧾 Faire un avoir'), okLabel: i18n('Émettre')})) return; const r = await T.post({op: 'p2_inv_avoir', id: n, today: H().today()}); toast(i18n('{n} émise le {d}', {n: r.number, d: H().fmtDate(r.day)}), 'success'); return again(); }
                        if ((n = id('[data-sp2-inv-paid]'))) { const x = find(n); const v = await A().askText({title: i18n('Payée'), message: i18n('Date (AAAA-MM-JJ) et moyen, ex. : 2026-11-20 virement'), value: x.paid_on ? `${x.paid_on} ${x.paid_how}` : `${H().today()} `, okLabel: i18n('Enregistrer')}); if (v == null) return; const [on, ...how] = String(v).trim().split(/\s+/); const r = await T.post({op: 'p2_inv_paid', id: n, paid_on: on || '', paid_how: how.join(' ')}); A().undoToast(i18n('Paiement noté'), {undo: async () => { await T.post({op: 'p2_inv_paid', id: n, ...r.prev}); again(); }}); return again(); }
                        if ((n = id('[data-sp2-q-accept]'))) { await T.post({op: 'p2_inv_accept', id: n}); A().undoToast(i18n('Devis accepté'), {undo: async () => { await T.post({op: 'p2_inv_accept', id: n, undo: 1}); again(); }}); return again(); }
                        if ((n = id('[data-sp2-q-transform]'))) { const r = await T.post({op: 'p2_inv_from_quote', id: n}); toast(i18n('Brouillon de facture prêt')); await again(); const x = INV.items.find(y => y.id === r.id); if (x) { d.close(); invoiceDialog(H().cur(), ext.successoral?.currentR?.(), {inv: x}); } }
                    } catch (err) { toast(err.message, 'error'); }
                });
            }});
    }
    SP.registryDialog = registryDialog;
    SP.boardMoreB = () => [`<button type="button" data-sp2-registry>🧾 ${esc(i18n('Registre des factures'))}</button>`];
    SP.caseMoreB = D => [`<button type="button" data-sp2-registry="${esc(D.number)}">🧾 ${esc(i18n('Factures du dossier'))}</button>`];

    /* ═════ 💶 Temps et frais : fonds et factures ═════ */
    SP.afterB = (tab, body, D, R, P_, ro, after) => {
        if (tab !== 'fees') return;
        const box = after(body, `${fundsHtml(D, R, ro)}<section class="succ-box"><div class="succ-box-head"><h3>🧾 ${esc(i18n('Devis et factures'))}</h3><div class="succ-acts">${ro ? '' : `<button type="button" class="button small" data-sp2-inv-new="devis">🧾 ${esc(i18n('Faire un devis'))}</button><button type="button" class="button small" data-sp2-inv-new="facture">🧾 ${esc(i18n('Faire une facture'))}</button>`}<button type="button" class="button small secondary" data-sp2-registry="${esc(D.number)}">${esc(i18n('Registre'))}</button></div></div><div data-sp2-caseinv>${UI().spinner(i18n('Lecture…'))}</div></section>`, 'fees');
        T.get('p2_invoices', {case_number: D.number}).then(r => {
            const el = box.querySelector('[data-sp2-caseinv]'); if (!el) return;
            el.innerHTML = r.items.length ? `<ul class="sp2-invlist" data-i18n-off>${r.items.map(x => `<li><b>${esc(x.number || i18n('brouillon'))}</b> · ${esc(H().fmtDate(x.day))} · ${esc(x.client_name)} · ${money(x.ttc)}</li>`).join('')}</ul>` : `${window.LCNDA_APP.empty(i18n('Pas encore de facture pour ce dossier.'))}`;
        }).catch(e => { const el = box.querySelector('[data-sp2-caseinv]'); if (el) el.innerHTML = UI().notice('error', e.message); });
    };

    /* ═════ 6. 📈 Tableau de bord de l'activité (lecture seule, aucun nom d'héritier) ═════ */
    let ACT = {period: '', ttc: null, gid: ''};
    SP.activity = async (body, token) => {
        const set = cfg();
        if (!ACT.period) ACT.period = set.act_period === '12m' ? '12m' : 'year';
        if (ACT.ttc == null) ACT.ttc = set.act_amounts !== 'ht';
        let r; try { r = await T.get('p2_activity', {period: ACT.period, genealogy: ACT.gid, from: ACT.from || '', to: ACT.to || ''}); } catch (e) { body.innerHTML = UI().notice('error', e.message); return; }
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const amt = q => (ACT.ttc ? q.ttc : q.ht) || 0, paid = q => (ACT.ttc ? q.paid_ttc : q.paid_ht) || 0;
        const inv = r.invoices, k = ACT.ttc ? i18n('TTC') : i18n('HT');
        const tile = (l, v, sub) => `<div class="sp2-tile"><small>${esc(l)}</small><b>${v}</b>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div>`;
        const maxH = Math.max(1, ...r.time.map(x => x.hours));
        const bars = r.time.map(x => `<div class="sp2-bar"><span class="sp2-bar-l" data-i18n-off>${esc(x.label)}</span><span class="sp2-bar-t"><i style="width:${Math.round(x.hours / maxH * 100)}%"></i></span><b>${esc(String(x.hours).replace('.', ','))}</b></div>`).join('');
        const qs = Object.entries(inv.quarters || {}); const maxQ = Math.max(1, ...qs.map(([, q]) => Math.max(amt(q), (ACT.ttc ? q.paid_ttc : q.paid_ht) || 0)));
        const qbars = qs.map(([q, v]) => `<div class="sp2-qbar"><div class="sp2-qcols"><i class="is-f" style="height:${Math.round(amt(v) / maxQ * 100)}%" title="${esc(money(amt(v)))}"></i><i class="is-p" style="height:${Math.round(((ACT.ttc ? v.paid_ttc : v.paid_ht) || 0) / maxQ * 100)}%"></i></div><small>${esc(q)}</small></div>`).join('');
        const PER = [['month', 'Ce mois'], ['quarter', 'Trimestre'], ['year', String(new Date().getFullYear())], ['12m', '12 mois'], ['custom', 'Choisir…']];
        const c = r.contracts, sum = c.signed + c.refused;
        body.innerHTML = `<div class="sp2-act-bar"><div class="segmented" role="group">${PER.map(([p, l]) => `<button type="button" data-sp2-per="${p}" class="${ACT.period === p ? 'is-active' : ''}" aria-pressed="${ACT.period === p}">${esc(i18n(l))}</button>`).join('')}</div>
            ${set.act_amounts === 'choice' ? `<div class="segmented" role="group"><button type="button" data-sp2-ttc="1" class="${ACT.ttc ? 'is-active' : ''}">${esc(i18n('TTC'))}</button><button type="button" data-sp2-ttc="0" class="${ACT.ttc ? '' : 'is-active'}">${esc(i18n('HT'))}</button></div>` : ''}
            ${ACT.period === 'custom' ? `<label>${esc(i18n('Du'))} <input type="date" data-sp2-from value="${esc(r.from)}"></label><label>${esc(i18n('au'))} <input type="date" data-sp2-to value="${esc(r.to)}"></label>` : ''}<button type="button" class="button small secondary" data-sp2-act-csv>${esc(i18n('⤓ Exporter en CSV'))}</button> ${H().setLink('act_period')}</div>
            ${r.locked ? UI().notice('info', i18n('{n} base(s) verrouillée(s) non lue(s)', {n: r.locked})) : ''}
            <div class="sp2-tiles">${tile(i18n('Dossiers ouverts'), r.opened, i18n('dont {n} clos', {n: r.closed}))}
            ${tile(i18n('Délai moyen (ouvert → remis)'), r.delay != null ? esc(i18n('{n} mois', {n: String(r.delay).replace('.', ',')})) : '—', r.delay != null ? i18n('sur {n} dossiers remis', {n: r.remis}) : i18n('pas assez de dossiers pour une moyenne'))}
            ${tile(i18n('Contrats signés / refusés'), `${c.signed} / ${c.refused}`, sum ? i18n('{p} % signés · {n} sans réponse', {p: Math.round(c.signed / sum * 100), n: c.none + c.later}) : '')}
            ${tile(i18n('Facturé / encaissé ({k})', {k}), inv.count ? money(amt(inv)) : '—', inv.count ? i18n('encaissé {a} · reste {b}', {a: money(paid(inv)), b: money(amt(inv) - paid(inv))}) : i18n('Pas encore de facture : seuls le temps et les contrats sont comptés'))}</div>
            ${r.open_n ? `<p class="muted">${esc(r.open_age != null ? i18n('{n} en cours depuis {m} mois en moyenne', {n: r.open_n, m: String(r.open_age).replace('.', ',')}) : i18n('{n} en cours', {n: r.open_n}))}</p>` : ''}
            <div class="succ-grid2"><section class="succ-box"><h3>${esc(i18n('Temps passé par dossier (heures)'))}</h3>${bars || `${window.LCNDA_APP.empty(i18n('Aucun temps noté.'))}`}
                <details><summary>▦ ${esc(i18n('Voir en tableau'))}</summary><table class="succ-table" data-i18n-off>${r.time.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(String(x.hours).replace('.', ','))}</td></tr>`).join('')}</table></details></section>
            <section class="succ-box"><h3>${esc(i18n('Facturé et encaissé par trimestre ({k})', {k}))}</h3>${qbars ? `<div class="sp2-qbars">${qbars}</div><p class="sp2-legend"><i class="is-f"></i> ${esc(i18n('Facturé'))} <i class="is-p"></i> ${esc(i18n('Encaissé'))}</p>` : `${window.LCNDA_APP.empty(i18n('Pas encore de facture.'))}`}
                <details><summary>▦ ${esc(i18n('Voir en tableau'))}</summary><table class="succ-table">${qs.map(([q, v]) => `<tr><td>${esc(q)}</td><td>${money(amt(v))}</td><td>${money((ACT.ttc ? v.paid_ttc : v.paid_ht) || 0)}</td></tr>`).join('')}</table></details></section></div>
            <p class="ui-hint">${esc(i18n('Aucun nom d’héritier dans cette vue : des numéros de dossier et des totaux. Rien n’est écrit.'))}</p>`;
        body.querySelectorAll('[data-sp2-per]').forEach(b => b.addEventListener('click', () => { ACT.period = b.dataset.sp2Per; SP.activity(body); }));
        body.querySelectorAll('[data-sp2-ttc]').forEach(b => b.addEventListener('click', () => { ACT.ttc = b.dataset.sp2Ttc === '1'; SP.activity(body); }));
        body.querySelector('[data-sp2-from]')?.addEventListener('change', e => { ACT.from = e.target.value; SP.activity(body); });
        body.querySelector('[data-sp2-to]')?.addEventListener('change', e => { ACT.to = e.target.value; SP.activity(body); });
        body.querySelector('[data-sp2-act-csv]').addEventListener('click', () => { const csvEur = c => C().money(c, '', ',').replace('−', '-'); /* un tableur lit « - », pas « − » (U+2212) */ const q = v => `"${(A().csvSafe || (x => String(x ?? '')))(v).replace(/"/g, '""')}"`; /* pas de formule glissée dans un tableur */ H().dl(`activite-${r.from}-${r.to}.csv`, new Blob(['﻿' + [['dossier', 'heures'], ...r.time.map(x => [x.label, String(x.hours).replace('.', ',')]), [], ['trimestre', 'facturé', 'encaissé'], ...qs.map(([qq, v]) => [qq, csvEur(amt(v)), csvEur((ACT.ttc ? v.paid_ttc : v.paid_ht) || 0)])].map(l => l.map(q).join(';')).join('\r\n')], {type: 'text/csv'})); });
    };

    /* ═════ 7. 🤝 Copie du dossier pour le notaire (chiffrée dans le navigateur ; l'app garde la liste, pas les fichiers) ═════ */
    SP.notaryCopyDialog = async (D, R, P_) => {
        if (!R || R.error) return;
        const set = cfg();
        let media = []; try { media = (await T.get('p2_piece_media', {case_id: D.id})).items || []; } catch (_) {}
        const mb = n => `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`;
        const tot = media.reduce((a, m) => a + (m.size || 0), 0);
        const heirs = R.rows.filter(r => ['heir', 'parent', 'spouse'].includes(r.role) && r.share !== '0');
        const nAddr = heirs.filter(h => D.addresses?.[h.id]).length;
        const priv = (R.privateExcluded || []).length;
        const v = (D.p2?.notary_copies || []).length + 1;
        ext.openDialog({eyebrow: `🤝 ${D.number}`, title: i18n('Pour {n}', {n: D.notary || i18n('le notaire')}), wide: true, submitLabel: i18n('⤓ Fabriquer la copie'),
            body: `<div class="succ-form"><span class="pk-lab">${esc(i18n('Ce qui part'))}</span>
                ${H().ck(i18n('Tableau des héritiers et parts, arbre, chaîne de filiation (comme le PDF)'), 'checked disabled')}
                ${H().ck(i18n('📑 Pièces (images des actes)'), 'name="pieces"', true, `${media.length} · ${mb(tot)}`)}
                ${H().ck(i18n('Adresses des héritiers'), 'name="addresses"', set.nc_addresses === 'yes')}
                ${H().ck(i18n('🕵️ Joindre les recherches faites'), 'name="research"', set.research_join === 'yes')}
                <p class="ui-hint">${esc(i18n('Journal, échanges, temps, factures ne partent jamais.'))}</p>
                <span class="pk-lab">${esc(i18n('Protection'))}</span>${H().ck(i18n('🔐 Mot de passe'), SP.protected() ? 'name="pw_on" disabled' : 'name="pw_on"', SP.protected() || set.nc_password === 'yes')}
                ${SP.protected() ? `<p class="ui-hint">${esc(i18n('Cette généalogie est protégée par un mot de passe : ce qui en sort est toujours chiffré.'))}</p>` : ''}
                <div class="succ-2" data-sp2-ncpw><label>${esc(i18n('Mot de passe'))}<input type="password" name="pw" autocomplete="new-password"></label><label>${esc(i18n('Encore une fois'))}<input type="password" name="pw2" autocomplete="new-password"></label></div>
                <p class="ui-hint">${esc(i18n('Le fichier est chiffré (AES-256) ; la page demande le mot de passe à l’ouverture. Donne-le au notaire par un autre moyen (téléphone, SMS). Oublié = fichier illisible, même pour toi (refais-en un).'))}</p>
                <div data-sp2-ncsum></div><p class="ui-hint">${esc(i18n('Copie v{n} ; l’app garde la liste des copies faites, pas les fichiers.', {n: v}))} ${H().setLink('nc_password')}</p></div>`,
            onOpen: d => {
                const f = d.querySelector('form');
                const paint = () => { d.querySelector('[data-sp2-ncpw]').hidden = !f.pw_on.checked; d.querySelector('[data-sp2-ncsum]').innerHTML = UI().notice('info', i18n('Voilà ce qui part : {h} héritiers, {p} pièces, {a} adresse(s).', {h: heirs.length, p: f.pieces.checked ? media.length : 0, a: f.addresses.checked ? nAddr : 0}) + (priv ? ' ' + i18n('Fiche confidentielle : {n} retirée (calcul inchangé).', {n: priv}) : '')); };
                d.addEventListener('change', paint); paint();
            },
            onSubmit: async f => {
                const enc = f.pw_on.checked || SP.protected();
                if (enc) { if (f.pw.value.length < 8) return UI().fail(f.pw, i18n('Mot de passe trop court (8 caractères au moins).')); if (f.pw.value !== f.pw2.value) return UI().fail(f.pw2, i18n('Les deux mots de passe ne sont pas les mêmes.')); }
                const btn = f.closest('dialog').querySelector('[type=submit]'); if (btn) btn.disabled = true;
                try {
                    const tabs = [{label: i18n('Héritiers'), html: ext.successoral.notaryHtml(D, R, f.addresses.checked)}, {label: i18n('Arbre'), html: ext.successoral.treeSvg(D, R)}];
                    if (R.hypotheses?.length) tabs[0].html = `<p>⚠️ ${esc(i18n('une branche n’est pas tranchée'))}</p>` + tabs[0].html;
                    if (f.pieces.checked && media.length) {
                        let size = 0; const imgs = [];
                        for (const m of media) {
                            try { const b = await (await fetch(`media/${encodeURIComponent(m.filename)}`)).blob(); size += b.size; const u = await new Promise(res => { const r2 = new FileReader(); r2.onload = () => res(r2.result); r2.readAsDataURL(b); }); imgs.push(`<figure><img src="${esc(u)}" alt="${esc(m.title || m.key)}"><figcaption>${esc(m.title || m.key)}</figcaption></figure>`); } catch (_) {}
                        }
                        if (size > 20 * 1048576 && !await A().confirmBox(i18n('Fichier trop lourd pour un courriel (plus de 20 Mo). Continuer quand même ?'), {title: i18n('🤝 Copie pour le notaire'), okLabel: i18n('Continuer')})) { if (btn) btn.disabled = false; return false; }
                        tabs.push({label: i18n('Pièces'), html: imgs.join('')});
                    }
                    if (f.research.checked) {
                        const parts = [];
                        for (const h of heirs) { try { const rr = await T.get('p2_research', {case_id: D.id, person_id: h.id}); if (rr.rows.length) parts.push(`<h3>${esc(h.name)}</h3><table>${rr.rows.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.where)}</td><td>${esc(x.what)}</td><td>${esc(x.result)}</td></tr>`).join('')}</table>`); } catch (_) {} }
                        tabs.push({label: i18n('Recherches'), html: parts.join('') || `<p>—</p>`});
                    }
                    const foot = i18n('Copie v{v} du {d}, calcul indicatif : à vérifier par l’étude.', {v, d: H().fmtDate(H().today())});
                    // chiffrée : ni le titre du dossier ni le nom du défunt en clair (titre, en-tête, nom du fichier) ; le vrai titre est dans la partie chiffrée
                    const full = i18n('{n} · {t}', {n: D.number, t: D.title});
                    if (enc) tabs[0].html = `<h2>${esc(full)}</h2>` + tabs[0].html;
                    const page = C().notaryPage({title: enc ? i18n('Copie chiffrée · {n}', {n: D.number}) : full, foot, tabs, lang: window.LCNDA_I18N?.lang || 'fr', T: {locked: i18n('Copie protégée par un mot de passe.'), password: i18n('Mot de passe'), open: i18n('Ouvrir'), wrong: i18n('Mot de passe incorrect.')}});
                    const html = enc ? page.wrap(page.lockScript(await C().encrypt(page.body, f.pw.value))) : page.wrap(page.body);
                    const last = enc ? '' : String(D.deceased || '').split(' ').pop().replace(/[^A-Za-zÀ-ÿ0-9]+/g, '-');
                    // noté au registre d'abord : s'il refuse, rien n'est téléchargé
                    await T.post({op: 'p2_notary_copy', case_id: D.id, addresses: f.addresses.checked ? 1 : 0, encrypted: enc ? 1 : 0, pieces: f.pieces.checked ? media.length : 0, research: f.research.checked ? 1 : 0});
                    H().dl(`dossier-${D.number}${last ? '-' + last : ''}-notaire-v${v}${enc ? '-chiffree' : ''}.html`, new Blob([html], {type: 'text/html'}));
                    toast(i18n('Copie v{n} fabriquée', {n: v}), 'success'); H().reload();
                } catch (e) { toast(e.message, 'error'); if (btn) btn.disabled = false; return false; }
            }});
    };

    /* ═════ Les clics ═════ */
    document.addEventListener('click', async e => {
        const t = e.target; if (!t.closest || H()?.hidden()) return;
        const rg = t.closest('[data-sp2-registry]'); if (rg) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return registryDialog(rg.dataset.sp2Registry || ''); }
        const D = H().cur(); if (!D || !t.closest('.succ-page, dialog')) return;
        const R = ext.successoral?.currentR?.();
        if (t.closest('[data-sp2-contract]')) return contractDialog(D, R);
        const nw = t.closest('[data-sp2-inv-new]'); if (nw) return invoiceDialog(D, R, {kind: nw.dataset.sp2InvNew});
        const ic = t.closest('[data-sp2-inv-commission]'); if (ic) { t.closest('dialog')?.close(); return invoiceDialog(D, R, {kind: 'facture', pid: Number(ic.dataset.sp2InvCommission)}); }
        const fo = t.closest('[data-sp2-fund-open]'); if (fo) return fundsPerson(D, Number(fo.dataset.sp2FundOpen));
        const fa = t.closest('[data-sp2-fund-add]'); if (fa) { t.closest('dialog')?.close(); return fundDialog(D, Number(fa.dataset.sp2FundAdd)); }
        const fe = t.closest('[data-sp2-fund-edit]'); if (fe) { const row = (D.p2?.funds || []).find(x => x.id === Number(fe.dataset.sp2FundEdit)); if (row) { t.closest('dialog')?.close(); fundDialog(D, row.person_id, row); } return; }
        const fd = t.closest('[data-sp2-fund-del]'); if (fd) { const id = Number(fd.dataset.sp2FundDel); try { await T.post({op: 'p2_fund_delete', case_id: D.id, id}); } catch (err) { return toast(err.message, 'error'); } t.closest('dialog')?.close(); A().undoToast(i18n('Mouvement supprimé'), {undo: async () => { await T.post({op: 'p2_fund_restore', case_id: D.id, id}); H().reload(); }}); return H().reload(); }
    });
})();
