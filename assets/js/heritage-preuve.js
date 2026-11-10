/**
 * ⚖️ Dossiers de preuve et 🛡 solidité des liens — les écrans (données : lib/preuve.php, GET preuve&op=…, POST preuve_write).
 *
 * Construit sur l'existant, sans rien recopier :
 *  - sources et citations par le menu de choix (sortes « citation » et « source »), recherches = dépouillements du Journal
 *    des recherches (sorte « digest »), personnes par le menu de choix ;
 *  - fenêtre ext.openDialog (K6, « Supprimer » à gauche), H7 « ↶ Annuler » partout (A().undoToast), K8 (UI.badge),
 *    K10, K14 (UI.menuAt / UI.contextMenu), H10 (UI.listBar, UI.itemsHtml), L1 (UI.openPrintDialog), traitement de
 *    texte (ext.openTextDoc), widgets (ext.dashboard + A().card), « Ma semaine » (lignes posées par le serveur),
 *    Murs de brique et Où chercher ? (ext.ouChercher).
 * Entrées : fiche (⋯ → « ⚖️ Dossier de preuve… », pastille 🛡 à côté de chaque parent), Graphiques → arbres
 * (interrupteur « 🛡 Vue solidité », clic droit sur une case ou un trait), Listes → Recherche et organisation →
 * « ⚖️ Dossiers de preuve » et « 🛡 Branches fragiles », widget « 🛡 Branches fragiles ».
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const PK = () => window.LCNDA_PICKER || A();
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    ext.dashboard = ext.dashboard || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const api = (...a) => A().api(...a);
    const get = (op, q = {}) => api('preuve', {op, ...q});
    const write = async (op, body) => { const r = await api('preuve_write', {}, {method: 'POST', body: {op, ...body}}); return r?.result || r; };
    const S = () => A().state;
    const toast = (...a) => A().toast(...a);
    const undo = (msg, o) => (A().undoToast ? A().undoToast(msg, o) : toast(msg));
    const plural = (n, w, pl) => (A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const RO = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

    const CERT = {tocheck: ['À vérifier', 'yellow', '❓'], proved: ['Prouvé', 'green', '✅'], probable: ['Probable', 'blue', '👍'], possible: ['Possible', 'yellow', '🤔'], refuted: ['Réfuté', 'red', '⛔']};
    const CERT_HELP = {tocheck: 'pas encore de conclusion', proved: 'les indices concordent, rien ne contredit, la conclusion est écrite', probable: 'les indices vont dans ce sens, sans preuve directe', possible: 'quelques indices, mais rien de sûr', refuted: 'les indices montrent que c’est faux'};
    const SOL = {proved: ['Prouvé', 'green'], probable: ['Probable', 'blue'], supposed: ['Supposé', 'yellow'], unsourced: ['Sans source', 'grey'], refuted: ['Réfuté', 'red']};
    const SUBJ = {parent: ['👪', 'Lien parent-enfant'], couple: ['💍', 'Couple'], date: ['📅', 'Date'], place: ['📍', 'Lieu'], identity: ['👥', 'Même personne'], other: ['❓', 'Autre fait']};
    const EVID = {direct: ['Direct', 'l’acte dit la chose en toutes lettres'], indirect: ['Indirect', 'il faut le déduire en rapprochant plusieurs indices'], negative: ['Négatif', 'une absence qui parle (pas d’acte là où il devrait y en avoir)']};
    const QUAL = {original: ['Originale', 'l’acte lui-même, ou sa photo'], derived: ['Dérivée', 'une copie, un relevé, une table, une transcription'], authored: ['Écrite par un auteur', 'un livre, un arbre en ligne, un souvenir de famille']};
    const KINDS = {for: ['👍', 'Indices pour', 'indice pour'], against: ['👎', 'Indices contre', 'indice contre'], research: ['🔍', 'Recherches faites', 'recherche'], conflict: ['⚡', 'Désaccords entre les sources', 'désaccord']};
    const GUIDE = [
        ['🔎', 'Cherche large', 'Tous les actes qui peuvent répondre : naissance, baptême, mariage, décès, recensements, actes notariés… Note aussi ce que tu n’as pas trouvé.'],
        ['🔖', 'Dis d’où vient chaque indice', 'Chaque indice a sa source (la citation : registre, année, vue, acte).'],
        ['⚖️', 'Pèse chaque indice', 'Direct ou indirect ? L’acte original, une copie, ou un auteur ? Un acte écrit au moment des faits vaut plus qu’un souvenir.'],
        ['⚡', 'Explique les désaccords', 'Deux sources se contredisent ? Écris pourquoi tu en crois une plus que l’autre.'],
        ['✍', 'Écris ta conclusion', 'En quelques phrases, avec ton niveau de certitude. On peut la revoir si un nouvel acte arrive.'],
    ];
    const GUIDE_INTRO = 'La méthode des généalogistes de métier (on parle de « standard de preuve ») tient en cinq étapes : une conclusion est solide quand on a cherché partout, cité ses sources, pesé chaque indice, expliqué les désaccords et écrit son raisonnement.';

    const nm = p => (p?.name || '').trim() || 'Sans nom';
    const certBadge = c => badge(CERT[c]?.[0] || c, CERT[c]?.[1] || 'grey');
    const solBadge = l => badge(SOL[l]?.[0] || l, SOL[l]?.[1] || 'grey');
    const childWord = g => g === 'male' ? 'le fils' : g === 'female' ? 'la fille' : 'l’enfant';
    const ilElle = g => g === 'female' ? 'elle' : 'il';
    const el = n => /^[aeiouyhàâéèêëîïôöûü]/i.test(String(n || '').trim()); // 🌐 « d’ » ou « de » (français) : deux clés, même traduction
    const de = n => (/^[aeiouyhàâéèêëîïôöûü]/i.test(String(n || '').trim()) ? 'd’' : 'de ') + n;

    /** après un changement : la fiche, les listes, l'arbre et les widgets ouverts se redessinent */
    function changed() {
        const st = S(); if (!st) return;
        if (st.module === 'personnes' && st.currentPersonId) decorateFiche(Number(st.currentPersonId), true);
        if (st.module === 'listes' && (st.listType === 'proof_cases' || st.listType === 'fragile_branches')) A().renderList?.();
        if (st.module === 'graphiques') decorateTree(true);
        document.querySelectorAll('[data-pv-widget]').forEach(el => paintWidget(el));
    }

    /* ═════════════════════ 1. ⚖️ Ouvrir un dossier (ou le créer) ═════════════════════ */
    /** {subject, person_id, related_id, event_id} : le dossier déjà ouvert pour cette question, sinon un nouveau (↶ Annuler) */
    async function openFor(q) {
        if (RO()) { toast('Lecture seule : les dossiers de preuve se consultent dans Listes → « ⚖️ Dossiers de preuve ».'); return; }
        let f; try { f = await get('find', q); } catch (e) { toast(e.message, 'error'); return; }
        if (f.case) return openCase(f.case.id);
        let r; try { r = await write('save_case', {...q, question: f.question}); } catch (e) { toast(e.message, 'error'); return; }
        const id = r.case.id;
        undo(i18n('⚖️ Dossier de preuve ouvert : « {nm} »', {nm: r.case.question}), {undo: async () => { await write('delete_case', {id}); document.querySelector(`dialog [data-pv-case="${id}"]`)?.closest('dialog')?.close(); changed(); }});
        changed();
        return openCase(id);
    }

    /** la fenêtre d'un dossier : question, certitude, pour / contre, recherches, désaccords, conclusion */
    async function openCase(id) {
        if (!ext.openDialog) return;
        const ro = RO();
        const dlg = ext.openDialog({eyebrow: '⚖️ DOSSIER DE PREUVE', title: 'Dossier de preuve', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            onDelete: ro ? null : async () => { const c = view.c; if (!c) return true; await write('delete_case', {id}); undo(i18n('🗑 Dossier supprimé : « {nm} »', {nm: c.question}), {undo: async () => { await write('restore_case', {id}); changed(); }}); changed(); return true; },
            body: `<div class="pv-case" data-pv-case="${Number(id)}">${UI().spinner ? UI().spinner('J’ouvre le dossier…') : '…'}</div>`});
        const box = dlg?.querySelector('[data-pv-case]'); if (!box) return;
        dlg.classList.add('pv-dialog');
        const view = {c: null};
        const load = async () => { view.c = await get('case', {id}); };
        const person = p => p ? `<button type="button" class="pv-person" data-pv-person="${p.id}">${UI().avatarOn?.() && UI().avatar ? UI().avatar({id: p.id, first_name: p.first_name, last_name: p.last_name, gender: p.gender}, 22) : ''}<b>${esc(nm(p))}</b>${p.years ? ` <small>${esc(p.years)}</small>` : ''}</button>` : '';
        const refHtml = it => {
            if (!it.ref) return '';
            const ic = {source: '📚', citation: '🔖', digest: '📜'}[it.ref.kind] || '🔗';
            return `<span class="pv-ref" title="${esc(it.ref.meta || '')}"><span aria-hidden="true">${ic}</span> ${esc(it.ref.title)}${it.ref.kind === 'digest' && it.ref.result ? ' ' + badge(it.ref.result, /trouv/i.test(it.ref.result) && !/rien/i.test(it.ref.result) ? 'green' : 'grey') : ''}${it.ref.quay ? ` <small class="pv-quay">qualité ${esc(it.ref.quay)}</small>` : ''}</span>`;
        };
        const itemHtml = it => `<li class="pv-item is-${esc(it.kind)}" data-pv-item="${it.id}">
            <div class="pv-item-main">${it.text ? `<p class="pv-item-text">${esc(it.text)}</p>` : ''}${refHtml(it)}
              <div class="pv-item-tags">${it.evidence && EVID[it.evidence] ? `<span class="pv-tag" title="${esc(EVID[it.evidence][1])}">${esc(EVID[it.evidence][0])}</span>` : ''}${it.quality && QUAL[it.quality] ? `<span class="pv-tag" title="${esc(QUAL[it.quality][1])}">Source ${esc(QUAL[it.quality][0].toLowerCase())}</span>` : ''}</div>
              ${it.kind === 'conflict' ? (it.resolution ? `<p class="pv-resol"><b>Résolu :</b> ${esc(it.resolution)}</p>` : `<p class="pv-resol is-open">${badge('Pas encore résolu', 'yellow')}</p>`) : ''}</div>
            ${ro ? '' : `<span class="pv-item-acts"><button type="button" class="icon-button" data-pv-edit="${it.id}" title="Modifier" aria-label="Modifier">✎</button><button type="button" class="icon-button" data-pv-del="${it.id}" title="Retirer du dossier" aria-label="Retirer du dossier">×</button></span>`}</li>`;
        const col = (kind, items) => `<section class="pv-col is-${kind}"><h4><span aria-hidden="true">${KINDS[kind][0]}</span> ${esc(KINDS[kind][1])} <small>${items.length}</small></h4>
            ${items.length ? `<ul class="pv-items">${items.map(itemHtml).join('')}</ul>` : A().empty(kind === 'for' ? 'Aucun indice pour.' : kind === 'against' ? 'Aucun indice contre — c’est bien d’en chercher aussi.' : kind === 'research' ? 'Aucune recherche notée.' : 'Aucun désaccord entre les sources.', {icon: KINDS[kind][0]})}
            ${ro ? '' : `<button type="button" class="button small secondary" data-pv-add="${kind}">＋ ${kind === 'research' ? 'Ajouter une recherche' : kind === 'conflict' ? 'Ajouter un désaccord' : kind === 'for' ? 'Ajouter un indice pour' : 'Ajouter un indice contre'}</button>`}
            ${kind === 'research' ? '<button type="button" class="link-button" data-pv-journal>↗ Journal des recherches</button>' : ''}</section>`;
        const paint = () => {
            const c = view.c; if (!box.isConnected || !c) return;
            const h = dlg.querySelector('.modal-head h2'); if (h) h.textContent = `${SUBJ[c.subject]?.[0] || '⚖️'} ${SUBJ[c.subject]?.[1] || 'Dossier de preuve'}`;
            const by = k => c.items.filter(i => i.kind === k);
            const open = by('conflict').filter(i => !i.resolution).length;
            box.innerHTML = `<div class="pv-top">
                <div class="pv-people">${person(c.person)}${c.related ? `<span class="pv-arrow" aria-hidden="true">${c.subject === 'parent' ? '← enfant de' : c.subject === 'couple' ? '∞' : c.subject === 'identity' ? '= ?' : '·'}</span>${person(c.related)}` : ''}${c.event ? `<span class="pv-ev">📅 ${esc(c.event.label)}${c.event.date_text ? ' · ' + esc(c.event.date_text) : ''}${c.event.place ? ' · ' + esc(c.event.place) : ''}</span>` : ''}</div>
                <span class="pv-tools"><button type="button" class="button small secondary" data-pv-print>🖨 Imprimer</button><button type="button" class="button small secondary" data-pv-doc title="Un document du traitement de texte, déjà rempli">📝 Dans le traitement de texte</button></span></div>
              <label class="pv-q"><span class="pk-lab">La question</span><textarea data-pv-question rows="2" maxlength="500" ${ro ? 'readonly' : ''}>${esc(c.question)}</textarea></label>
              <div class="pv-cert"><span class="pk-lab">Niveau de certitude</span><div class="segmented pv-cert-seg" role="radiogroup" aria-label="Niveau de certitude">${Object.entries(CERT).map(([k, v]) => `<button type="button" class="${c.certainty === k ? 'is-active' : ''}" data-pv-cert="${k}" aria-pressed="${c.certainty === k}" title="${esc(CERT_HELP[k])}" ${ro ? 'disabled' : ''}>${v[2]} ${esc(v[0])}</button>`).join('')}</div>
                <p class="ui-hint">${certBadge(c.certainty)} ${esc(CERT_HELP[c.certainty] || '')}${c.subject === 'parent' && c.link ? ` · ${i18n('🛡 solidité du lien :')} ${solBadge(c.link.level)}${c.certainty === 'tocheck' ? ' ' + i18n('(calculée : le dossier comptera dès qu’il aura une conclusion)') : ''}` : ''}</p></div>
              <div class="pv-grid">${col('for', by('for'))}${col('against', by('against'))}</div>
              <div class="pv-grid">${col('research', by('research'))}${col('conflict', by('conflict'))}</div>
              ${open ? `<p class="ui-hint is-error">⚠️ ${i18n('{count} : explique-les avant de conclure « prouvé ».', {count: plural(open, 'désaccord n’est pas encore résolu', 'désaccords ne sont pas encore résolus')})}</p>` : ''}
              <label class="pv-concl"><span class="pk-lab">✍ Conclusion</span><textarea data-pv-conclusion rows="4" maxlength="20000" placeholder="Ce que tu conclus, et pourquoi : quels indices pèsent le plus, comment les désaccords s’expliquent…" ${ro ? 'readonly' : ''}>${esc(c.conclusion)}</textarea><span class="ui-hint" data-pv-saved>${ro ? 'Lecture seule.' : 'Gardé tout seul.'}</span></label>
              <details class="pv-guide"><summary>💡 Comment raisonner ? (5 étapes)</summary><p>${esc(GUIDE_INTRO)}</p><ol>${GUIDE.map(([i, t, d]) => `<li><b>${i} ${esc(t)}</b> — ${esc(d)}</li>`).join('')}</ol>
                <p class="ui-hint">Un indice <b>direct</b> : ${esc(EVID.direct[1])} ; <b>indirect</b> : ${esc(EVID.indirect[1])} ; <b>négatif</b> : ${esc(EVID.negative[1])}. Une source <b>originale</b> : ${esc(QUAL.original[1])} ; <b>dérivée</b> : ${esc(QUAL.derived[1])} ; <b>écrite par un auteur</b> : ${esc(QUAL.authored[1])}.</p></details>`;
            UI().scan?.(box);
        };
        try { await load(); paint(); } catch (e) { box.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        const reload = async () => { await load(); paint(); };
        // question et conclusion : gardées toutes seules
        let tq = 0;
        box.addEventListener('input', e => {
            const f = e.target.closest('[data-pv-question], [data-pv-conclusion]'); if (!f || ro) return;
            clearTimeout(tq);
            tq = setTimeout(async () => {
                const body = {id, question: box.querySelector('[data-pv-question]').value, conclusion: box.querySelector('[data-pv-conclusion]').value};
                if (!body.question.trim()) return UI().fail?.(box.querySelector('[data-pv-question]'), 'Écris la question à laquelle le dossier répond.');
                try { const r = await write('save_case', body); view.c.question = r.case.question; view.c.conclusion = r.case.conclusion; const s = box.querySelector('[data-pv-saved]'); if (s) { s.textContent = '✓ Enregistré'; s.classList.add('is-ok'); } }
                catch (err) { toast(err.message, 'error'); }
            }, 650);
        });
        box.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.pvCert && b.dataset.pvCert !== view.c.certainty) {
                const prev = view.c.certainty, now = b.dataset.pvCert;
                try { await write('save_case', {id, certainty: now}); } catch (err) { toast(err.message, 'error'); return; }
                undo(i18n('⚖️ Certitude : {nm}', {nm: i18n(CERT[now][0])}), {undo: async () => { await write('save_case', {id, certainty: prev}); if (box.isConnected) await reload(); changed(); }, redo: async () => { await write('save_case', {id, certainty: now}); if (box.isConnected) await reload(); changed(); }});
                await reload(); changed(); return;
            }
            if (b.dataset.pvAdd) { itemDialog(view.c, b.dataset.pvAdd, null, reload); return; }
            if (b.dataset.pvEdit) { const it = view.c.items.find(x => x.id === Number(b.dataset.pvEdit)); if (it) itemDialog(view.c, it.kind, it, reload); return; }
            if (b.dataset.pvDel) {
                const iid = Number(b.dataset.pvDel), it = view.c.items.find(x => x.id === iid);
                try { await write('delete_item', {id: iid}); } catch (err) { toast(err.message, 'error'); return; }
                undo(`${i18n('🗑 Retiré du dossier :')} ${i18n(KINDS[it?.kind]?.[2] || 'ligne')}${it?.text ? ` « ${it.text.slice(0, 40)} »` : ''}`, {undo: async () => { await write('restore_item', {id: iid}); if (box.isConnected) await reload(); }});
                await reload(); return;
            }
            if (b.dataset.pvPrint !== undefined) return printCase(view.c);
            if (b.dataset.pvDoc !== undefined) return textDoc(view.c);
            if (b.dataset.pvJournal !== undefined) { dlg.close(); if (ext.journal?.open) ext.journal.open(); else { S().researchKind = 'journal'; A().setModule('recherche'); } return; }
            if (b.dataset.pvPerson) { dlg.close(); A().openPersonById ? A().openPersonById(Number(b.dataset.pvPerson)) : (S().currentPersonId = Number(b.dataset.pvPerson), A().setModule('personnes')); }
        });
        return dlg;
    }

    /** ajouter ou modifier une ligne : indice (pour / contre), recherche, désaccord */
    function itemDialog(c, kind, it, after) {
        const isEv = kind === 'for' || kind === 'against';
        const val = it?.ref ? {id: it.ref.id, title: it.ref.title, meta: it.ref.meta, kind: it.ref.kind} : null;
        const radios = (name, map, cur) => `<div class="pv-radios" role="radiogroup">${Object.entries(map).map(([k, [l, d]]) => `<label class="pv-radio"><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(d)}</small></span></label>`).join('')}<label class="pv-radio"><input type="radio" name="${name}" value="" ${!cur ? 'checked' : ''}><span><b>Je ne sais pas</b></span></label></div>`;
        const pkKind = kind === 'research' ? 'digest' : 'citation,source';
        const field = PK().pickerField ? PK().pickerField({name: 'pv_ref', hiddenName: false, kind: pkKind, inline: true, value: val, allowCreate: false}) : '';
        const title = it ? 'Modifier' : kind === 'research' ? 'Nouvelle recherche' : kind === 'conflict' ? 'Nouveau désaccord' : kind === 'for' ? 'Nouvel indice pour' : 'Nouvel indice contre';
        const dlg = ext.openDialog({eyebrow: `⚖️ ${c.question}`, title, submitLabel: it ? 'Enregistrer' : kind === 'research' ? 'Ajouter la recherche' : kind === 'conflict' ? 'Ajouter le désaccord' : 'Ajouter l’indice',
            body: `<div class="pv-form">
                ${isEv ? `<div class="segmented pv-side" role="radiogroup" aria-label="Pour ou contre"><button type="button" data-pv-side="for" class="${kind === 'for' ? 'is-active' : ''}">👍 Pour</button><button type="button" data-pv-side="against" class="${kind === 'against' ? 'is-active' : ''}">👎 Contre</button></div><input type="hidden" name="kind" value="${kind}">` : `<input type="hidden" name="kind" value="${kind}">`}
                <label><span class="pk-lab">${kind === 'research' ? 'Ce qui a été cherché, et le résultat' : kind === 'conflict' ? 'Le désaccord' : 'L’indice'}</span><textarea name="text" rows="3" maxlength="4000" placeholder="${kind === 'research' ? 'Registres de Naves 1780-1790 : pas de baptême de Jean' : kind === 'conflict' ? 'Le baptême dit 1784, le décès donne 70 ans en 1850' : 'Le baptême nomme « Pierre Martin, laboureur » comme père'}">${esc(it?.text || '')}</textarea></label>
                <div><span class="pk-lab">${kind === 'research' ? 'Dépouillement du Journal des recherches (facultatif)' : 'Source ou citation (facultatif)'}</span><div data-pv-ref>${field}</div></div>
                ${isEv ? `<fieldset class="pv-fs"><legend>Sorte d’indice</legend>${radios('evidence', EVID, it?.evidence || '')}</fieldset><fieldset class="pv-fs"><legend>Qualité de la source</legend>${radios('quality', QUAL, it?.quality || '')}</fieldset>` : ''}
                ${kind === 'conflict' ? `<label><span class="pk-lab">Comment il se résout</span><textarea name="resolution" rows="3" maxlength="4000" placeholder="L’âge au décès est souvent arrondi : le baptême, écrit le jour même, est plus sûr.">${esc(it?.resolution || '')}</textarea></label>` : ''}
              </div>`,
            onOpen: d => {
                d.addEventListener('click', e => { const s = e.target.closest('[data-pv-side]'); if (!s) return; d.querySelectorAll('[data-pv-side]').forEach(x => x.classList.toggle('is-active', x === s)); d.querySelector('[name=kind]').value = s.dataset.pvSide; });
                d.addEventListener('picker-change', e => { d._pvRef = e.detail.item || null; });
                d.addEventListener('picker-open', e => { e.preventDefault(); });
            },
            onSubmit: async form => {
                const fd = A().formObject ? A().formObject(form) : Object.fromEntries(new FormData(form));
                const fieldEl = form.querySelector('[data-pv-ref] .pk');
                const v = fieldEl && PK().pickerValue ? PK().pickerValue(fieldEl) : null;
                const refItem = form.closest('dialog')._pvRef !== undefined ? form.closest('dialog')._pvRef : val;
                const refId = Number(v) || 0;
                const refKind = refId ? (kind === 'research' ? 'digest' : (refItem?.kind === 'source' ? 'source' : 'citation')) : '';
                if (!String(fd.text || '').trim() && !refId) return UI().fail ? UI().fail(form.elements.text, kind === 'research' ? 'Écris ce qui a été cherché, ou choisis un dépouillement.' : kind === 'conflict' ? 'Écris le désaccord.' : 'Écris l’indice, ou choisis sa source.') : false;
                const body = {case_id: c.id, kind: fd.kind || kind, text: fd.text || '', ref_kind: refKind, ref_id: refId, evidence: fd.evidence || '', quality: fd.quality || '', resolution: fd.resolution || ''};
                if (it) body.id = it.id;
                const r = await write('save_item', body);
                if (it && r.prev) undo('✎ Ligne du dossier modifiée', {undo: async () => { await write('save_item', {id: it.id, ...r.prev}); await after?.(); }});
                else toast(`${KINDS[body.kind][0]} ${kind === 'research' ? 'Recherche ajoutée' : kind === 'conflict' ? 'Désaccord ajouté' : 'Indice ajouté'}.`, 'success');
                await after?.();
                return true;
            }});
        return dlg;
    }

    /* ═════════════════════ 2. 🖨 Imprimer (L1), 📝 traitement de texte ═════════════════════ */
    function caseHtml(c, ch = {}) {
        const by = k => c.items.filter(i => i.kind === k);
        const ref = it => it.ref ? ` <i>(${esc(it.ref.title)}${it.ref.meta ? ' — ' + esc(it.ref.meta) : ''})</i>` : '';
        const tags = it => [it.evidence && EVID[it.evidence] ? `indice ${EVID[it.evidence][0].toLowerCase()}` : '', it.quality && QUAL[it.quality] ? `source ${QUAL[it.quality][0].toLowerCase()}` : ''].filter(Boolean).join(', ');
        const list = (k, empty) => by(k).length ? `<ul>${by(k).map(it => `<li>${esc(it.text || '')}${ref(it)}${tags(it) ? ` <small>[${esc(tags(it))}]</small>` : ''}${k === 'conflict' ? `<br><b>${i18n('Résolution :')}</b> ${esc(it.resolution || i18n('pas encore résolu'))}` : ''}</li>`).join('')}</ul>` : `<p><i>${esc(empty)}</i></p>`;
        const people = [c.person, c.related].filter(Boolean).map(p => `${esc(nm(p))}${p.years ? ` (${esc(p.years)})` : ''}`).join(c.subject === 'parent' ? ' — enfant de — ' : ' et ');
        return `<h1>${esc(c.question)}</h1>
            <p class="meta">${esc(SUBJ[c.subject]?.[1] || '')} · ${people}${c.event ? ' · ' + esc(c.event.label) + (c.event.date_text ? ' ' + esc(c.event.date_text) : '') : ''}</p>
            <p class="meta"><b>Niveau de certitude :</b> ${esc(CERT[c.certainty]?.[0] || c.certainty)} — ${esc(CERT_HELP[c.certainty] || '')}</p>
            <h2>👍 Indices pour</h2>${list('for', 'Aucun indice pour.')}
            <h2>👎 Indices contre</h2>${list('against', 'Aucun indice contre.')}
            ${ch.research !== false ? `<h2>🔍 Recherches faites</h2>${list('research', 'Aucune recherche notée.')}` : ''}
            ${ch.conflicts !== false ? `<h2>⚡ Désaccords entre les sources</h2>${list('conflict', 'Aucun désaccord.')}` : ''}
            <h2>✍ Conclusion</h2>${c.conclusion ? c.conclusion.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '<p><i>Pas encore écrite.</i></p>'}
            ${ch.guide ? `<h2>💡 Comment raisonner</h2><p>${esc(GUIDE_INTRO)}</p><ol>${GUIDE.map(([, t, d]) => `<li><b>${esc(t)}</b> — ${esc(d)}</li>`).join('')}</ol>` : ''}`;
    }
    function printCase(c) {
        if (!UI().openPrintDialog) return toast('L’impression n’est pas disponible.', 'error');
        const css = 'body{font:11pt/1.45 Georgia,serif;color:#111;margin:0}h1{font-size:17pt;margin:0 0 6px}h2{font-size:12.5pt;margin:16px 0 4px;border-bottom:1px solid #999}.meta{color:#444;margin:2px 0}ul,ol{margin:4px 0 4px 18px;padding:0}li{margin:3px 0}small{color:#555}';
        UI().openPrintDialog({title: i18n('Dossier de preuve — {nm}', {nm: c.question}), key: 'preuve', zone: 'Dossier de preuve', photos: false, margin: 14,
            options: [{key: 'research', label: 'Les recherches faites', checked: true}, {key: 'conflicts', label: 'Les désaccords et leur résolution', checked: true}, {key: 'guide', label: 'Le petit guide « Comment raisonner »', checked: false}],
            html: ch => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(c.question)}</title><style>${css}</style></head><body>${caseHtml(c, ch || {})}</body></html>`});
    }
    function textDoc(c) {
        const Kit = ext.textDocKit, open = ext.openTextDoc;
        if (!Kit?.Editor || !open) return toast('Le traitement de texte n’est pas chargé.', 'error');
        const by = k => c.items.filter(i => i.kind === k);
        const li = it => `<li data-st="normal">${esc(it.text || '')}${it.ref ? ` (${esc(it.ref.title)})` : ''}${it.kind === 'conflict' ? ` — ${i18n('résolution :')} ${esc(it.resolution || i18n('pas encore résolu'))}` : ''}</li>`;
        const sec = (t, k) => `<h1 data-st="h1">${esc(t)}</h1>${by(k).length ? `<ul>${by(k).map(li).join('')}</ul>` : '<p data-st="normal"><span class="wp-ph">Rien pour l’instant.</span></p>'}`;
        const html = `<p data-st="title">Dossier de preuve</p><p data-st="subtitle">${esc(c.question)}</p><p data-st="normal">Niveau de certitude : <b>${esc(CERT[c.certainty]?.[0] || '')}</b></p>${sec('Indices pour', 'for')}${sec('Indices contre', 'against')}${sec('Recherches faites', 'research')}${sec('Désaccords entre les sources', 'conflict')}<h1 data-st="h1">Conclusion</h1>${(c.conclusion || '').split(/\n{2,}/).filter(Boolean).map(p => `<p data-st="normal">${esc(p)}</p>`).join('') || '<p data-st="normal"><span class="wp-ph">Ta conclusion…</span></p>'}`;
        try { const d = new Kit.Editor({data: null}).doc; return open({data: {...d, sections: [{html}]}, name: i18n('Dossier de preuve — {nm}', {nm: nm(c.person)}).slice(0, 160)}); } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════════════════════ 3. Choisir la question (depuis la fiche ou la liste) ═════════════════════ */
    async function chooseQuestion(pid) {
        if (!pid || !ext.openDialog) return;
        let det, mine;
        try { [det, mine] = await Promise.all([api('person', {id: pid}), get('person', {id: pid})]); } catch (e) { toast(e.message, 'error'); return; }
        const p = det.person, name = A().personName ? A().personName(p) : `${p.first_name} ${p.last_name}`;
        const lvl = new Map((mine.parents || []).map(x => [x.parent_id, x.level]));
        const ev = (det.events || []).find(e => ['BIRT', 'BAPM', 'CHR'].includes(String(e.gedcom_tag || '').toUpperCase()));
        const opts = [
            ...(det.parents || []).map(x => ({subject: 'parent', related_id: x.id, ico: '👪', text: (() => { const par = A().personName ? A().personName(x) : x.first_name, v = {nm: name, par}, f = p.gender === 'female'; return f ? (el(par) ? i18n('{nm} est-elle bien la fille d’{par} ?', v) : i18n('{nm} est-elle bien la fille de {par} ?', v)) : p.gender === 'male' ? (el(par) ? i18n('{nm} est-il bien le fils d’{par} ?', v) : i18n('{nm} est-il bien le fils de {par} ?', v)) : (el(par) ? i18n('{nm} est-il bien l’enfant d’{par} ?', v) : i18n('{nm} est-il bien l’enfant de {par} ?', v)); })(), extra: lvl.has(Number(x.id)) ? solBadge(lvl.get(Number(x.id))) : ''})),
            ...(det.partners || []).map(x => ({subject: 'couple', related_id: x.id, ico: '💍', text: i18n('{nm} et {x2} formaient-ils bien un couple ?', {nm: name, x2: A().personName ? A().personName(x) : x.first_name})})),
            ...(ev ? [{subject: 'date', event_id: ev.id, ico: '📅', text: i18n('La date de {ev} ({dt}) est-elle juste ?', {ev: i18n(String(ev.type_label || 'naissance')).toLowerCase(), dt: ev.date_text || i18n('sans date')})}, {subject: 'place', event_id: ev.id, ico: '📍', text: i18n('Le lieu de {ev} ({pl}) est-il juste ?', {ev: i18n(String(ev.type_label || 'naissance')).toLowerCase(), pl: ev.place_name || i18n('sans lieu')})}] : []),
            {subject: 'identity', ico: '👥', text: (p.gender === 'female' ? i18n('{nm} est-elle la même personne qu’une autre fiche ? (choisir…)', {nm: name}) : i18n('{nm} est-il la même personne qu’une autre fiche ? (choisir…)', {nm: name})), pick: true},
            {subject: 'other', ico: '❓', text: 'Une autre question…'},
        ];
        const cases = mine.cases || [];
        const dlg = ext.openDialog({eyebrow: '⚖️ DOSSIER DE PREUVE', title: i18n('Quelle question pour {nm} ?', {nm: name}), submitLabel: 'Fermer', onSubmit: () => true,
            body: `${cases.length ? `<span class="pk-lab">Ses dossiers</span><ul class="pv-choose">${cases.map(x => `<li><button type="button" class="pv-choose-btn" data-pv-go-case="${x.id}"><span aria-hidden="true">${SUBJ[x.subject]?.[0] || '⚖️'}</span><span>${esc(x.question)}</span>${certBadge(x.certainty)}</button></li>`).join('')}</ul>` : ''}
                <span class="pk-lab">${cases.length ? 'Ou une nouvelle question' : 'Une question'}</span><ul class="pv-choose">${opts.map((o, i) => `<li><button type="button" class="pv-choose-btn" data-pv-go="${i}"><span aria-hidden="true">${o.ico}</span><span>${esc(o.text)}</span>${o.extra || ''}</button></li>`).join('')}</ul>
                <p class="ui-hint">Un dossier de preuve rassemble ce qui dit « oui » et ce qui dit « non », puis ta conclusion. Pour un lien parent-enfant, il compte dans la 🛡 solidité du lien.</p>`});
        dlg?.addEventListener('click', async e => {
            const c = e.target.closest('[data-pv-go-case]'); if (c) { dlg.close(); openCase(Number(c.dataset.pvGoCase)); return; }
            const b = e.target.closest('[data-pv-go]'); if (!b) return;
            const o = opts[Number(b.dataset.pvGo)];
            let rel = o.related_id || 0;
            if (o.pick) { const it = await PK().openPicker?.({kind: 'person', title: 'L’autre fiche (la même personne ?)'}); if (!it || !Number(it.id) || Number(it.id) === pid) return; rel = Number(it.id); }
            dlg.close();
            openFor({subject: o.subject, person_id: pid, related_id: rel || '', event_id: o.event_id || ''});
        });
    }

    /* ═════════════════════ 4. 🛡 Un lien : pourquoi ce niveau, choix à la main ═════════════════════ */
    let RULES = null;
    async function openLink(childId, parentId) {
        if (!ext.openDialog) return;
        let d; try { [d, RULES] = await Promise.all([get('link', {child_id: childId, parent_id: parentId}), RULES ? Promise.resolve(RULES) : get('rules')]); } catch (e) { toast(e.message, 'error'); return; }
        if (!d.link) { toast('Ce lien parent-enfant n’existe pas.', 'error'); return; }
        const ro = RO();
        const dlg = ext.openDialog({eyebrow: '🛡 SOLIDITÉ DU LIEN', title: `${nm(d.child)} → ${childWord(d.child?.gender)} ${de(nm(d.parent))}`, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<div class="pv-link" data-pv-link>…</div>`});
        const box = dlg.querySelector('[data-pv-link]');
        const paint = () => {
            const l = d.link, manual = l.manual ? l.level : '';
            box.innerHTML = `<p class="pv-link-now">${solBadge(l.level)} <span>${esc(l.why)}</span></p>
                ${l.relation ? `<p class="ui-hint">${i18n('Lien noté « {rel} » sur la fiche (pas biologique).', {rel: esc(l.relation)})}</p>` : ''}
                <div class="pv-link-acts"><button type="button" class="button small" data-pv-link-case>⚖️ ${l.case_id ? 'Ouvrir le dossier de preuve' : 'Ouvrir un dossier de preuve'}</button>${ext.ouChercher ? `<button type="button" class="button small secondary" data-pv-ouc="${d.child.id}">🌍 Où chercher ?</button>` : ''}</div>
                ${l.code === 'case' ? '<p class="ui-hint">Le dossier de preuve passe devant le calcul et le choix à la main.</p>' : `<fieldset class="pv-fs"><legend>Choisir à la main</legend><div class="pv-radios">${[['', 'Calculé par l’app', 'd’après les sources'], ['proved', 'Prouvé', ''], ['probable', 'Probable', ''], ['supposed', 'Supposé', ''], ['unsourced', 'Sans source', '']].map(([k, t, h]) => `<label class="pv-radio"><input type="radio" name="pv_manual" value="${k}" ${manual === k ? 'checked' : ''} ${ro ? 'disabled' : ''}><span><b>${esc(t)}</b>${h ? `<small>${esc(h)}</small>` : ''}</span></label>`).join('')}</div></fieldset>`}
                <details class="pv-guide"><summary>Les règles, en clair</summary><ul>${(RULES.rules || []).map(([k, t, w]) => `<li>${solBadge(k)} ${esc(w)}</li>`).join('')}</ul><p class="ui-hint">Rien n’est changé dans ta base : c’est seulement un repère.</p></details>`;
        };
        paint();
        box.addEventListener('change', async e => {
            if (e.target.name !== 'pv_manual') return;
            const level = e.target.value;
            let r; try { r = await write('manual_set', {child_id: childId, parent_id: parentId, level}); } catch (err) { toast(err.message, 'error'); return; }
            d.link = r.link; paint(); changed();
            undo(level ? i18n('🛡 Lien marqué « {nm} » à la main', {nm: i18n(SOL[level][0])}) : '🛡 Lien de nouveau calculé par l’app', {undo: async () => { const x = await write('manual_restore', {child_id: childId, parent_id: parentId, prev: r.prev}); d.link = x.link; if (box.isConnected) paint(); changed(); }});
        });
        box.addEventListener('click', e => {
            if (e.target.closest('[data-pv-link-case]')) { dlg.close(); if (d.link.case_id) openCase(d.link.case_id); else openFor({subject: 'parent', person_id: childId, related_id: parentId}); return; }
            const o = e.target.closest('[data-pv-ouc]'); if (o) { dlg.close(); ext.ouChercher.openPerson(Number(o.dataset.pvOuc)); }
        });
    }

    /* ═════════════════════ 5. La fiche : pastille 🛡 à côté de chaque parent, ⋯ ═════════════════════ */
    async function decorateFiche(pid, fresh = false) {
        let d; try { d = await get('person', {id: pid}); } catch (_) { return; }
        if (S().module !== 'personnes' || Number(S().currentPersonId) !== pid) return;
        const groups = [...document.querySelectorAll('#workspace .relation-group')].filter(g => g.querySelector('.relation-heading span')?.textContent.trim() === 'Parents');
        groups.forEach(g => {
            if (fresh) g.querySelectorAll('[data-pv-sol]').forEach(x => x.remove());
            (d.parents || []).forEach(l => {
                const chip = g.querySelector(`.relation-chip[data-open-person="${l.parent_id}"]`); if (!chip || chip.parentElement.querySelector('[data-pv-sol]')) return;
                chip.insertAdjacentHTML('afterend', `<button type="button" class="pv-sol" data-pv-sol="${pid}:${l.parent_id}" title="${esc(i18n('🛡 Solidité du lien : {lvl} — {why}', {lvl: i18n(SOL[l.level][0]), why: l.why}))}" aria-label="${esc(i18n('Solidité du lien avec {nm} : {lvl}', {nm: nm(l.parent), lvl: i18n(SOL[l.level][0])}))}">${solBadge(l.level)}</button>`);
            });
        });
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal') return; decorateFiche(Number(p.id)); });
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal') return null; return {icon: '⚖️', label: 'Dossier de preuve…', run: () => chooseQuestion(Number(p.id))}; });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-pv-sol]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        const [c, p] = b.dataset.pvSol.split(':').map(Number); openLink(c, p);
    }, true);

    /* ═════════════════════ 6. Graphiques : « 🛡 Vue solidité » dans les arbres ═════════════════════ */
    const TREE_KEY = 'genealogie-tree-solidite';
    const treeOn = () => lsGet(TREE_KEY, '0') === '1';
    const TREE_MODES = ['ancestors', 'descendants', 'hourglass'];
    const legendHtml = () => `<div class="lc-sol-legend" data-pv-legend role="note" aria-label="Légende de la vue solidité">${Object.entries(SOL).map(([k, [l]]) => `<span class="lc-sol-key is-${k}"><i aria-hidden="true"></i>${esc(l)}</span>`).join('')}<span class="ui-hint">Clic droit sur une case ou un trait : le dossier de preuve, le pourquoi.</span></div>`;
    /** pour un <li> de l'arbre : [personne de ce li, personne du li au-dessus] */
    const liPerson = li => Number(li?.querySelector(':scope > .tree-node-shell .tree-person-unit > .tree-card:not(.tree-partner-card)')?.dataset.treePerson || 0);
    const linkOfLi = li => {
        const up = li?.parentElement?.closest('li'); if (!up || !up.closest('.tree')) return null;
        const a = liPerson(up), b = liPerson(li); if (!a || !b) return null;
        const tree = li.closest('.tree'), sec = tree.closest('.hourglass-grid > section');
        const desc = S().graphMode === 'descendants' || (sec && sec.parentElement.lastElementChild === sec);
        return desc ? {child: b, parent: a} : {child: a, parent: b};
    };
    let treeBusy = 0;
    async function decorateTree(force = false) {
        const st = S(); if (!st || st.module !== 'graphiques' || !TREE_MODES.includes(st.graphMode)) return;
        const strip = document.querySelector('#workspace .graph-layout .tool-strip'); if (!strip) return;
        if (!strip.querySelector('[data-pv-tree]')) {
            const spacer = strip.querySelector('.spacer');
            const t = document.createElement('label'); t.className = 'ui-toggle'; t.title = 'Couleur et épaisseur des traits selon la solidité de chaque lien parent-enfant';
            t.innerHTML = `<input type="checkbox" data-pv-tree ${treeOn() ? 'checked' : ''}><i></i>🛡 Vue solidité`;
            (spacer || strip.lastChild) ? strip.insertBefore(t, spacer || null) : strip.appendChild(t);
            t.querySelector('input').addEventListener('change', ev => { lsSet(TREE_KEY, ev.target.checked ? '1' : '0'); decorateTree(true); });
        }
        const trees = [...document.querySelectorAll('#workspace .graph-layout .tree')];
        document.querySelector('#workspace [data-pv-legend]')?.remove();
        if (!treeOn()) { trees.forEach(t => { t.classList.remove('lc-sol-on'); t.querySelectorAll('li[data-sol]').forEach(li => { li.removeAttribute('data-sol'); li.removeAttribute('title'); }); }); return; }
        strip.insertAdjacentHTML('afterend', legendHtml());
        const ids = [...new Set([...document.querySelectorAll('#workspace .graph-layout .tree .tree-card[data-tree-person]')].map(b => Number(b.dataset.treePerson)).filter(Boolean))];
        if (!ids.length) return;
        const my = ++treeBusy;
        let d; try { d = await get('pairs', {ids: ids.join(',')}); } catch (_) { return; }
        if (my !== treeBusy || !treeOn()) return;
        trees.forEach(t => {
            t.classList.add('lc-sol-on');
            t.querySelectorAll('li').forEach(li => {
                const l = linkOfLi(li); if (!l) return;
                const v = d.links?.[`${l.child}:${l.parent}`];
                li.dataset.sol = v ? v[0] : 'none';
                li.title = v ? `🛡 ${SOL[v[0]][0]}` : '';
            });
        });
    }
    ext.preuveTree = {decorate: decorateTree, linkOfLi};
    const ws0 = () => document.getElementById('workspace');
    const watchWs = () => {
        const ws = ws0(); if (!ws) return setTimeout(watchWs, 300);
        let t = 0;
        new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { if (S()?.module === 'graphiques' && document.querySelector('#workspace .graph-layout .tree') && !document.querySelector('#workspace [data-pv-tree]')) decorateTree(); }, 40); }).observe(ws, {childList: true});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchWs); else watchWs();
    // clic droit sur une case ou un trait d'un arbre de Graphiques (K14)
    document.addEventListener('contextmenu', e => {
        if (e.shiftKey || !UI().contextMenu || RO()) return;
        const tree = e.target.closest?.('#workspace .graph-layout .tree'); if (!tree || !TREE_MODES.includes(S()?.graphMode)) return;
        const card = e.target.closest('.tree-card[data-tree-person]');
        const li = card ? card.closest('li') : e.target.closest('li');
        if (!li) return;
        const name = id => tree.querySelector(`.tree-card[data-tree-person="${id}"] strong`)?.textContent.trim() || `n° ${id}`;
        const links = [];
        if (!card || !card.classList.contains('tree-partner-card')) {
            const up = linkOfLi(li); if (up) links.push(up);
            if (card) li.querySelectorAll(':scope > ul > li').forEach(x => { const l = linkOfLi(x); if (l) links.push(l); });
        }
        if (!links.length && !card) return;
        e.preventDefault(); e.stopPropagation();
        const items = [];
        links.forEach(l => {
            items.push({icon: '⚖️', label: (el(name(l.parent)) ? i18n('Dossier de preuve : {nm} → enfant d’{par}', {nm: name(l.child), par: name(l.parent)}) : i18n('Dossier de preuve : {nm} → enfant de {par}', {nm: name(l.child), par: name(l.parent)})), run: () => openFor({subject: 'parent', person_id: l.child, related_id: l.parent})});
            items.push({icon: '🛡', label: (el(name(l.parent)) ? i18n('Solidité du lien : {nm}, enfant d’{par}', {nm: name(l.child), par: name(l.parent)}) : i18n('Solidité du lien : {nm}, enfant de {par}', {nm: name(l.child), par: name(l.parent)})), run: () => openLink(l.child, l.parent)});
        });
        if (card) { if (items.length) items.push('-'); items.push({icon: '↗', label: 'Ouvrir la fiche', run: () => A().openPersonById?.(Number(card.dataset.treePerson))}); items.push({icon: '⚖️', label: 'Autre question (dossier de preuve)…', run: () => chooseQuestion(Number(card.dataset.treePerson))}); }
        UI().contextMenu(e, items, {title: card ? name(Number(card.dataset.treePerson)) : 'Lien'});
    }, true);

    /* ═════════════════════ 7. Listes : « ⚖️ Dossiers de preuve » ═════════════════════ */
    const cache = {cases: null, frag: null};
    ext.lists.proof_cases = async token => {
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page pv-page">${UI().pageHeader({where: 'Listes · Recherche et organisation', icon: '⚖️', title: 'Dossiers de preuve',
            help: 'Une question (« Jean est-il bien le fils de Pierre ? »), ce qui dit oui, ce qui dit non, les recherches faites, puis ta conclusion et ton niveau de certitude.',
            primary: RO() ? '' : '<button type="button" class="button" data-pv-new>＋ Nouveau dossier de preuve</button>', actions: ['<button type="button" class="button secondary" data-pv-to-frag>🛡 Branches fragiles</button>']})}
            <div data-pv-bar></div><div data-pv-list>${UI().spinner ? UI().spinner('Je lis les dossiers…') : '…'}</div><div data-pv-more></div></section>`;
        ws.querySelector('[data-pv-to-frag]').addEventListener('click', () => { S().listType = 'fragile_branches'; A().renderSidebar?.(); A().renderList?.(); });
        ws.querySelector('[data-pv-new]')?.addEventListener('click', async () => { const it = await PK().openPicker?.({kind: 'person', title: 'Le dossier de qui ?'}); if (it && Number(it.id)) chooseQuestion(Number(it.id)); });
        let d; try { d = cache.cases = await get('list'); } catch (e) { ws.querySelector('[data-pv-list]').innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        if (token !== S().workspaceToken) return;
        const list = ws.querySelector('[data-pv-list]'), more = ws.querySelector('[data-pv-more]');
        if (!d.items.length) { list.innerHTML = A().emptyState({icon: '⚖️', text: 'Aucun dossier de preuve', hint: 'Ouvre-en un depuis une fiche (⋯ → « ⚖️ Dossier de preuve… »), en cliquant la pastille 🛡 d’un parent, ou par un clic droit dans un arbre.', action: RO() ? null : {label: '＋ Nouveau dossier de preuve', attrs: 'data-empty-click="[data-pv-new]"'}}); return; }
        const c = d.counts;
        let shown = 40;
        const bar = UI().listBar({key: 'listes:proof_cases', search: {placeholder: 'Chercher… (ex. Martin, baptême)'},
            filters: [{id: 'cert', label: 'Certitude', type: 'check', options: Object.entries(CERT).map(([k, v]) => [k, v[0], v[0], c[k] || 0])},
                {id: 'subj', label: 'Sorte de question', type: 'check', options: Object.entries(SUBJ).map(([k, v]) => [k, `${v[0]} ${v[1]}`, v[1], c['s_' + k] || 0])},
                {id: 'open', label: 'Désaccords pas encore résolus', chipLabel: '⚡ Désaccords à résoudre', type: 'check'}],
            view: {dflt: 'list', what: 'fiches'},
            sort: {options: [['recent', 'Plus récents'], ['old', 'Plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'},
            onChange: () => { shown = 40; paint(); }});
        ws.querySelector('[data-pv-bar]').appendChild(bar);
        const M = UI().listMatch;
        const rows = () => {
            const st = bar.state, f = st.filters;
            let l = cache.cases.items.filter(x => (!st.q || (M?.text ? M.text(st.q, x.question, nm(x.person), nm(x.related), x.conclusion) : `${x.question} ${nm(x.person)}`.toLowerCase().includes(st.q.toLowerCase())))
                && (!f.cert?.length || f.cert.includes(x.certainty)) && (!f.subj?.length || f.subj.includes(x.subject)) && (!f.open || x.n_open > 0));
            return UI().sortItems ? UI().sortItems(l, st.sort, {name: x => x.question, date: x => x.updated_at}) : l;
        };
        const paint = () => {
            const st = bar.state, l = rows(), part = l.slice(0, shown);
            bar.setCount(l.length, 'dossier');
            const cards = st.view === 'cards';
            list.innerHTML = l.length ? UI().itemsHtml(st.view, part.map(x => {
                const l1 = [nm(x.person), x.related ? nm(x.related) : ''].filter(Boolean).join(x.subject === 'parent' ? ' → enfant de ' : ' · ');
                const l2 = [`👍 ${x.n_for}`, `👎 ${x.n_against}`, x.n_research ? `🔍 ${plural(x.n_research, 'recherche')}` : '', x.n_open ? `⚡ ${plural(x.n_open, 'désaccord à résoudre', 'désaccords à résoudre')}` : '', x.conclusion ? '✍ conclusion écrite' : ''].filter(Boolean).join(' · ');
                return {thumb: `<span class="ui-card-ico" aria-hidden="true">${SUBJ[x.subject]?.[0] || '⚖️'}</span>`, name: x.question, open: `data-pv-open="${x.id}"`, attrs: `data-pv-row="${x.id}"`,
                    lines: cards ? [l1, l2] : [{html: `${certBadge(x.certainty)} ${esc(l1)}`}, l2],
                    badges: cards ? [{text: CERT[x.certainty][0], kind: CERT[x.certainty][1]}] : [], when: x.updated_at, whenLabel: 'Modifié',
                    actions: `<button type="button" class="button small secondary" data-pv-open="${x.id}">Ouvrir</button>`};
            })) : A().emptyState({icon: '🔍', text: 'Aucun dossier ne correspond', hint: 'Retire un filtre ou change la recherche.'});
            more.innerHTML = '';
            if (l.length > shown && UI().moreButton) more.appendChild(UI().moreButton({remaining: l.length - shown, step: 40, onClick: () => { shown += 40; paint(); }}));
        };
        list.addEventListener('click', e => { const b = e.target.closest('[data-pv-open]'); if (b) { e.preventDefault(); openCase(Number(b.dataset.pvOpen)); } });
        paint();
    };
    // K14 : clic droit sur un dossier de la liste
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('[data-pv-row]'); if (!row || e.shiftKey || !UI().contextMenu) return;
        const id = Number(row.dataset.pvRow), x = cache.cases?.items.find(c => c.id === id); if (!x) return;
        e.preventDefault(); e.stopPropagation();
        const full = async fn => { try { fn(await get('case', {id})); } catch (err) { toast(err.message, 'error'); } };
        UI().contextMenu(e, [{icon: '↗', label: 'Ouvrir', run: () => openCase(id)}, {icon: '🖨', label: 'Imprimer…', run: () => full(printCase)}, {icon: '📝', label: 'Dans le traitement de texte', run: () => full(textDoc)},
            ...(RO() ? [] : ['-', {icon: '🗑', label: 'Supprimer', danger: true, run: async () => { try { await write('delete_case', {id}); } catch (err) { toast(err.message, 'error'); return; } undo(i18n('🗑 Dossier supprimé : « {nm} »', {nm: x.question}), {undo: async () => { await write('restore_case', {id}); changed(); }}); changed(); }}])], {title: x.question});
    }, true);

    /* ═════════════════════ 8. Listes : « 🛡 Branches fragiles » ═════════════════════ */
    const avatarOf = p => (UI().avatarOn?.() && UI().avatar ? UI().avatar({id: p.id, first_name: p.first_name, last_name: p.last_name, gender: p.gender}, 34)
        : `<span class="pv-av is-${p.gender === 'female' ? 'f' : p.gender === 'male' ? 'm' : 'u'}" aria-hidden="true">${esc(((p.first_name || '?')[0] + ((p.last_name || '')[0] || '')).toUpperCase())}</span>`);
    ext.lists.fragile_branches = async token => {
        const ws = document.getElementById('workspace');
        ws.innerHTML = `<section class="page pv-frag">${UI().pageHeader({where: 'Listes · Recherche et organisation', icon: '🛡', title: 'Branches fragiles',
            help: 'Tes ancêtres (numéros Sosa) dont le lien avec leur enfant n’est pas encore appuyé sur une source : supposé, sans source ou réfuté. Les plus proches de toi d’abord.',
            primary: '<button type="button" class="button secondary" data-pv-rules>🛡 Les règles</button>', actions: [ext.ouChercher ? '<button type="button" class="button secondary" data-pv-walls>🧩 Murs de brique</button>' : '', '<button type="button" class="button secondary" data-pv-to-cases>⚖️ Dossiers de preuve</button>']})}
            <div data-pv-counts></div><div data-pv-bar></div><div data-pv-list>${UI().spinner ? UI().spinner('Je pèse chaque lien…') : '…'}</div><div data-pv-more></div></section>`;
        ws.querySelector('[data-pv-walls]')?.addEventListener('click', () => ext.ouChercher.openPerson(0, 'murs'));
        ws.querySelector('[data-pv-to-cases]').addEventListener('click', () => { S().listType = 'proof_cases'; A().renderSidebar?.(); A().renderList?.(); });
        ws.querySelector('[data-pv-rules]').addEventListener('click', rulesDialog);
        let d; try { d = cache.frag = await get('fragiles'); } catch (e) { ws.querySelector('[data-pv-list]').innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; }
        if (token !== S().workspaceToken) return;
        const c = d.counts;
        ws.querySelector('[data-pv-counts]').innerHTML = d.total ? `<div class="pv-counts">${Object.entries(SOL).map(([k, [l, kk]]) => `<span class="pv-count is-${k}">${badge(`${c[k] || 0} ${l}`, kk)}</span>`).join('')}<span class="muted">sur ${plural(d.total, 'lien')} de ta lignée</span></div>` : '';
        const list = ws.querySelector('[data-pv-list]'), more = ws.querySelector('[data-pv-more]');
        if (!d.items.length) { list.innerHTML = A().emptyState({icon: '🎉', text: d.total ? 'Aucune branche fragile' : 'Pas encore de lignée', hint: d.total ? 'Chaque lien de ta lignée s’appuie sur au moins une source.' : 'Choisis la personne de départ (Sosa 1) et ajoute ses parents.'}); return; }
        let shown = 40;
        const gens = [...new Set(d.items.map(x => x.generation))].sort((a, b) => a - b);
        const bar = UI().listBar({key: 'listes:fragile_branches', search: {placeholder: 'Chercher un nom… (ex. Martin)'},
            filters: [{id: 'level', label: 'Solidité', type: 'check', options: ['supposed', 'unsourced', 'refuted'].map(k => [k, SOL[k][0], SOL[k][0], c[k] || 0])},
                {id: 'gen', label: 'Génération', type: 'radio', options: [['', 'Toutes'], ...gens.map(g => [String(g), `Génération ${g}`])], dflt: ''}],
            view: {dflt: 'list', what: 'fiches'},
            sort: {options: [['gen', 'Génération, puis Sosa'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'gen'},
            onChange: () => { shown = 40; paint(); }});
        ws.querySelector('[data-pv-bar]').appendChild(bar);
        const M = UI().listMatch;
        const rows = () => {
            const st = bar.state, f = st.filters;
            let l = cache.frag.items.filter(x => (!st.q || (M?.text ? M.text(st.q, nm(x.parent), nm(x.child)) : `${nm(x.parent)} ${nm(x.child)}`.toLowerCase().includes(st.q.toLowerCase())))
                && (!f.level?.length || f.level.includes(x.level)) && (!f.gen || String(x.generation) === f.gen));
            if (st.sort === 'az' || st.sort === 'za') l = UI().sortItems ? UI().sortItems(l, st.sort, {name: x => `${x.parent.last_name} ${x.parent.first_name}`}) : l;
            return l;
        };
        const paint = () => {
            const st = bar.state, l = rows(), part = l.slice(0, shown);
            bar.setCount(l.length, 'lien');
            const cards = st.view === 'cards';
            list.innerHTML = l.length ? UI().itemsHtml(st.view, part.map(x => {
                const l1 = (el(nm(x.child)) ? i18n('Sosa {sosa} · génération {gen} · parent d’{par}', {sosa: String(x.sosa), gen: x.generation, par: nm(x.child)}) : i18n('Sosa {sosa} · génération {gen} · parent de {par}', {sosa: String(x.sosa), gen: x.generation, par: nm(x.child)}));
                return {thumb: avatarOf(x.parent), name: `${nm(x.parent)}${x.parent.years ? ` (${x.parent.years})` : ''}`, open: `data-pv-link-open="${x.child_id}:${x.parent_id}"`, openLabel: 'Pourquoi ?', attrs: `data-pv-frow="${x.child_id}:${x.parent_id}"`,
                    lines: cards ? [l1, x.why] : [{html: `${solBadge(x.level)} ${esc(l1)}`}, x.why],
                    badges: cards ? [{text: `Sosa ${x.sosa}`, kind: 'sosa'}, {text: SOL[x.level][0], kind: SOL[x.level][1]}] : [],
                    actions: `<button type="button" class="button small secondary" data-pv-frag-case="${x.child_id}:${x.parent_id}">⚖️ Dossier</button>${ext.ouChercher ? `<button type="button" class="button small secondary" data-pv-ouc="${x.child_id}">🌍 Où chercher ?</button>` : ''}`};
            })) : A().emptyState({icon: '🔍', text: 'Aucun lien ne correspond', hint: 'Retire un filtre ou change la recherche.'});
            more.innerHTML = '';
            if (l.length > shown && UI().moreButton) more.appendChild(UI().moreButton({remaining: l.length - shown, step: 40, onClick: () => { shown += 40; paint(); }}));
        };
        list.addEventListener('click', e => {
            const lo = e.target.closest('[data-pv-link-open]'); if (lo) { e.preventDefault(); const [a, b] = lo.dataset.pvLinkOpen.split(':').map(Number); openLink(a, b); return; }
            const fc = e.target.closest('[data-pv-frag-case]'); if (fc) { e.preventDefault(); const [a, b] = fc.dataset.pvFragCase.split(':').map(Number); const x = cache.frag.items.find(i => i.child_id === a && i.parent_id === b); if (x?.case_id) openCase(x.case_id); else openFor({subject: 'parent', person_id: a, related_id: b}); return; }
            const o = e.target.closest('[data-pv-ouc]'); if (o) { e.preventDefault(); ext.ouChercher.openPerson(Number(o.dataset.pvOuc)); }
        });
        paint();
    };
    document.addEventListener('contextmenu', e => {
        const row = e.target.closest?.('[data-pv-frow]'); if (!row || e.shiftKey || !UI().contextMenu) return;
        const [c, p] = row.dataset.pvFrow.split(':').map(Number), x = cache.frag?.items.find(i => i.child_id === c && i.parent_id === p); if (!x) return;
        e.preventDefault(); e.stopPropagation();
        UI().contextMenu(e, [{icon: '↗', label: 'Pourquoi ce niveau ?', run: () => openLink(c, p)}, {icon: '⚖️', label: 'Dossier de preuve', run: () => x.case_id ? openCase(x.case_id) : openFor({subject: 'parent', person_id: c, related_id: p})},
            ...(ext.ouChercher ? [{icon: '🌍', label: i18n('Où chercher ? ({nm})', {nm: nm(x.child)}), run: () => ext.ouChercher.openPerson(c)}] : []), '-', {icon: '↗', label: i18n('Fiche de {nm}', {nm: nm(x.parent)}), run: () => A().openPersonById?.(p)}, {icon: '↗', label: i18n('Fiche de {nm}', {nm: nm(x.child)}), run: () => A().openPersonById?.(c)}], {title: nm(x.parent)});
    }, true);
    async function rulesDialog() {
        try { RULES = RULES || await get('rules'); } catch (e) { toast(e.message, 'error'); return; }
        ext.openDialog?.({eyebrow: '🛡 SOLIDITÉ DES LIENS', title: 'Comment l’app pèse chaque lien', submitLabel: 'Fermer', onSubmit: () => true,
            body: `<p>${i18n('Pour chaque lien parent-enfant, l’app regarde dans cet ordre :')}</p><ol class="pv-rules-order"><li>${i18n('<b>Le dossier de preuve</b> de ce lien, s’il a une conclusion : il passe devant tout.')}</li><li>${i18n('<b>Ton choix à la main</b> (pastille 🛡 à côté du parent, sur la fiche).')}</li><li>${i18n('<b>Les sources citées</b> : sur la naissance ou le baptême de l’enfant, son mariage, sa fiche, la famille ; leur qualité (0 à 3, venue de ton ancien logiciel) si elle est notée.')}</li></ol>
                <ul class="pv-rules">${RULES.rules.map(([k, t, w]) => `<li>${solBadge(k)} ${esc(w)}</li>`).join('')}</ul><p class="ui-hint">Rien n’est changé dans ta base : c’est seulement un repère, recalculé dès qu’une source change.</p>`});
    }

    /* ═════════════════════ 9. Le widget « 🛡 Branches fragiles » ═════════════════════ */
    function widgetBody(d, limit) {
        if (!d) return A().empty('La solidité des liens n’a pas pu être calculée.', {icon: '⛔'});
        const c = d.counts || {};
        const pills = Object.entries(SOL).filter(([k]) => c[k]).map(([k, [l, kk]]) => badge(`${c[k]} ${l}`, kk)).join(' ');
        if (!d.total) return A().empty('Pas encore de lignée : choisis la personne de départ et ajoute ses parents.', {icon: '🌳'});
        if (!d.fragile) return `<div class="pv-w-counts">${pills}</div>${A().empty('Chaque lien de ta lignée s’appuie sur une source, bravo !', {icon: '🎉'})}`;
        return `<div class="pv-w-counts">${pills}</div><ul class="pv-w-list">${(d.top || []).slice(0, limit).map(x => `<li><button type="button" class="pv-w-row" data-pv-w-link="${x.child_id}:${x.parent_id}">${avatarOf(x.parent)}<span><b>${esc(nm(x.parent))}</b><small class="muted">${esc((el(nm(x.child)) ? i18n('Sosa {sosa} · parent d’{par}', {sosa: String(x.sosa), par: nm(x.child)}) : i18n('Sosa {sosa} · parent de {par}', {sosa: String(x.sosa), par: nm(x.child)})))}</small></span>${solBadge(x.level)}</button></li>`).join('')}</ul>`;
    }
    function paintWidget(el) { get('summary').then(d => { el.innerHTML = widgetBody(d, Number(el.dataset.limit) || 5); }).catch(() => {}); }
    ext.dashboard.fragile_widget = {
        load: () => get('summary').catch(() => null),
        render: (index, widget, span, data) => {
            const limit = Math.max(1, Math.min(8, Number(widget?.limit) || 5));
            return A().card(index, '🛡 Branches fragiles', data ? data.fragile : '', `<div data-pv-widget data-limit="${limit}">${widgetBody(data, limit)}</div>`, span,
                '<button type="button" class="button small secondary" data-pv-frag-all title="Tous les liens fragiles de ta lignée (Listes)">Tout voir ↗</button>');
        },
    };
    document.addEventListener('click', e => {
        const w = e.target.closest?.('[data-pv-w-link]'); if (w) { e.preventDefault(); const [a, b] = w.dataset.pvWLink.split(':').map(Number); openLink(a, b); return; }
        if (e.target.closest?.('[data-pv-frag-all]')) { e.preventDefault(); S().listType = 'fragile_branches'; A().setModule('listes'); }
    });

    /* ═════════════════════ au catalogue des listes et des widgets ═════════════════════ */
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === 'proof_cases')) app.defaultListTypes.push(['proof_cases', '33b', 'Dossiers de preuve']);
        if (!app.defaultListTypes.some(x => x[0] === 'fragile_branches')) app.defaultListTypes.push(['fragile_branches', '33c', 'Branches fragiles']);
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'fragile_widget')) { app.defaultDashboardBlocks.push(['fragile_widget', '🛡 Branches fragiles']); if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.fragile_widget = '6'; }
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);

    ext.preuve = {openFor, openCase, openLink, chooseQuestion, printCase, textDoc, caseHtml, decorateFiche, decorateTree, rulesDialog, CERT, SOL};
})();
