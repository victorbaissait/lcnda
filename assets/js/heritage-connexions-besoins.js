/* LCNDA — 🧩 Les besoins (maquette validée docs/design/connexions-besoins.html, étapes 3 et 4 ; réponses retenues : celles conseillées).
 * Serveur : lib/connexions_besoins.php (tables cx_needs, cx_map_items). Essai : tests/test-connexions-besoins.js
 *
 *  · Une piste « à explorer » dit ce qui lui manque : quoi (acte de naissance…), pour qui, où, quand — écrit (« 🧩 Ce qui manque… »,
 *    ⋯ de la piste, ou « ＋ Ajouter → 🧩 Un besoin… ») ou deviné d'après son titre (les modèles d'enquête le donnent déjà). Gardé comme
 *    une requête vivante : à l'ouverture de l'enquête, les fournisseurs hors ligne répondent (✓ je l'ai : Atelier, Médias ;
 *    🚫 déjà cherché : Journal ; 🔎 je peux le trouver : Où chercher ?, Courriers). Une pastille « 🧩 N » seulement s'il y a des « ✓ ».
 *  · Quand un acte vient d'être transcrit (Atelier, « ✓ Ajouter à la généalogie » ou 💾) ou des médias importés : « Cet acte répond au
 *    besoin de… » — un seul message (regroupé), réglable : seulement si c'est presque sûr (au départ), à chaque ressemblance, ou jamais
 *    (« ⚙ » dans le message, et Réglages → 🧺 Panier et connexions). Jamais rangé tout seul : « Ranger dans l'enquête », « ↶ Annuler ».
 *  · Le livre, la carte et la monographie disent ce qui leur manque, en une ligne repliée ; « 🗓 Ma semaine » → onglet « 🧩 Ce qui manque ».
 *  · 📍 « Mettre dans… » → 🗺 une carte : la couche « 📌 Mis sur la carte » (LCNDA_EXT.mapLayerSources, toutes les cartes) et les
 *    épingles de la Carte ; ce qui n'a pas de position reste dans le panier.
 * Réglages : genealogie-connexions-besoins {on, msg: sure | close | off, book, map, mono}. Tout coupé = l'app comme avant.
 *   window.LCNDA_EXT.cxNeeds = {announce, paintInvestigation, edit, semaineHtml, bookHint, settings, …}
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const P = () => window.LCNDA_PICKER || A();
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const api = (a, q) => A().api(a, q);
    const post = (op, body = {}) => A().api('cx_write', {}, {method: 'POST', body: {op, ...body}}).then(r => r?.result ?? r);
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${nf(n)} ${n > 1 ? (many || one + 's') : one}`);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const S = () => A().state || {};

    /* ═════════ réglages ═════════ */
    const KEY = 'genealogie-connexions-besoins';
    const DEF = {on: true, msg: 'sure', book: true, map: true, mono: true};
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const settings = () => ({...DEF, ...(readJ(KEY, {}) || {})});
    const enabled = () => settings().on !== false && ext.connexions?.enabled?.() !== false;
    function saveSettings(next, msg) {
        const before = readJ(KEY, null); writeJ(KEY, next); ext.connexions?.redrawSettings?.();
        undoToast(msg, {icon: '🧩', undo: async () => { if (before == null) { try { localStorage.removeItem(KEY); } catch (_) {} } else writeJ(KEY, before); ext.connexions?.redrawSettings?.(); }});
    }

    /* ═════════ ce qui manque : les sortes ═════════ */
    const WHAT = {birth: ['📜', 'Acte de naissance'], marriage: ['💍', 'Acte de mariage'], death: ['✝️', 'Acte de décès'], census: ['🏠', 'Recensement'], military: ['🎖', 'Registre matricule'],
        notarial: ['⚖️', 'Acte notarié'], photo: ['🖼', 'Photo'], source: ['🔖', 'Source'], other: ['📄', 'Document']};
    const LETTER = {birth: 'naissance', marriage: 'mariage', death: 'deces'};
    const years = n => (n.year_from && n.year_to ? (n.year_from === n.year_to ? String(n.year_from) : `${n.year_from}–${n.year_to}`) : n.year_from ? T('après {y}', {y: n.year_from}) : n.year_to ? T('avant {y}', {y: n.year_to}) : '');
    const needTitle = n => `${T((WHAT[n.what] || WHAT.other)[1])}${n.person ? ` — ${n.person}` : ''}`;
    const needMeta = n => [n.place || '', years(n)].filter(Boolean).join(' · ');
    const needText = n => [needTitle(n), needMeta(n)].filter(Boolean).join(' · ');
    const guessFields = n => ({what: n.what, person_id: n.person_id, place_id: n.place_id, place_name: n.place_id ? '' : n.place, year_from: n.year_from, year_to: n.year_to});
    const PROV = {atelier: ['📜', 'Atelier'], media: ['🖼', 'Médias'], journal: ['📒', 'Journal'], ou_chercher: ['🌍', 'Où chercher ?'], courrier: ['📮', 'Courriers']};
    const openInv = (id, itemId = 0) => { const st = S(); Object.assign(st, {enquetesTab: 'enquetes', currentInvestigationId: Number(id), investigationFolderId: 0}); if (itemId) st.cxFocusItem = Number(itemId); A().persistUiState?.(); A().setModule?.('enquetes'); };

    /* ═════════ 🕵️ l'enquête : une ligne par piste qui dit ce qui lui manque ═════════ */
    let invData = null; // {id, needs, hypotheses, reload}
    function answerHtml(n, a, i) {
        const [pi, pl] = PROV[a.provider] || ['•', a.provider];
        const tag = a.have === 'yes' ? `<span class="cx-ans-tag is-yes">✓ ${esc(T('je l’ai'))}</span>` : a.have === 'searched' ? `<span class="cx-ans-tag is-no">🚫 ${esc(T('déjà cherché'))}</span>` : `<span class="cx-ans-tag is-find">🔎 ${esc(T('trouver'))}</span>`;
        let what = '', btns = '';
        if (a.have === 'yes') {
            what = `${pi} ${esc(T(pl))} : « <span data-i18n-off>${esc(a.title)}</span> »${a.value ? ` <small class="muted" data-i18n-off>${esc(a.value)}</small>` : ''}`;
            btns = kiosk() ? '' : `<button type="button" class="button small" data-cx-ans-file="${i}">${esc(T('Ranger'))}</button>${a.kind === 'act' ? `<button type="button" class="button small secondary" data-cx-ans-view="${i}">${esc(T('Voir'))}</button>` : ''}<button type="button" class="link-button" data-cx-ans-skip="${i}">${esc(T('Pas lui'))}</button>`;
        } else if (a.have === 'searched') {
            what = `${pi} ${esc(T(pl))} : <span data-i18n-off>${esc(a.title)}</span>${a.value ? ` — <small class="muted" data-i18n-off>${esc(String(a.value).slice(0, 120))}</small>` : ''}${a.at ? ` <small class="muted">(${esc(a.at)})</small>` : ''}`;
        } else if (a.provider === 'ou_chercher') {
            what = `${pi} ${esc(T(pl))} ${esc(T('les registres en ligne et les archives pour cette personne'))}`; btns = `<button type="button" class="button small secondary" data-cx-ans-ouc="${n.person_id}">↗</button>`;
        } else if (a.provider === 'courrier') {
            what = `${pi} ${esc(T(pl))} : ${esc(T('demander une copie de l’acte'))}`; btns = kiosk() ? '' : `<button type="button" class="button small secondary" data-cx-ans-letter>✉</button>`;
        }
        return `<div class="cx-ans" data-cx-ans="${i}">${tag}<span class="cx-ans-what">${what}</span><span class="cx-ans-btns">${btns}</span></div>`;
    }
    function needHtml(n) {
        const [ic] = WHAT[n.what] || WHAT.other;
        if (n.state === 'done') return `<div class="cx-need is-done" data-cx-need="${n.item_id}"><span>✓ ${esc(T('Trouvé :'))} <span data-i18n-off>${esc(n.filled?.title || needTitle(n))}</span></span>${kiosk() ? '' : `<button type="button" class="link-button" data-cx-need-edit>${esc(T('Rouvrir'))}</button>`}</div>`;
        const yes = (n.answers || []).filter(a => a.have === 'yes').length, meta = needMeta(n);
        return `<div class="cx-need" data-cx-need="${n.item_id}"><span class="cx-need-t" title="${esc(n.guessed ? T('Deviné d’après le titre de la piste : ✎ pour le préciser') : T('Ce que cette piste cherche'))}">🧩 <b>${esc(T('Il manque :'))}</b> ${ic} <span data-i18n-off>${esc(needTitle(n))}</span>${meta ? ` <small class="muted" data-i18n-off>· ${esc(meta)}</small>` : ''}${n.guessed ? ` <small class="muted">${esc(T('(deviné)'))}</small>` : ''}${n.hypothesis_id ? ` <button type="button" class="link-button cx-need-hyp" data-cx-need-hyp="${n.hypothesis_id}" title="${esc(T('Pour trancher l’hypothèse'))}">🤔 <span data-i18n-off>${esc(String(n.hypothesis || '').slice(0, 60))}</span></button>` : ''}</span>
            ${yes ? `<button type="button" class="cx-need-yes" data-cx-need-open aria-expanded="false" title="${esc(T('Ce que l’app a déjà : voir'))}">✓ ${nf(yes)}</button>` : `<button type="button" class="link-button cx-need-more" data-cx-need-open aria-expanded="false">${esc(T('Où le trouver ?'))}</button>`}
            ${kiosk() ? '' : `<button type="button" class="icon-button small" data-cx-need-edit title="${esc(T('Préciser ce qui manque'))}" aria-label="${esc(T('Préciser ce qui manque'))}">✎</button>`}
            <div class="cx-need-ans" hidden>${(n.answers || []).map((a, i) => answerHtml(n, a, i)).join('') || `<p class="muted">${esc(T('Rien pour l’instant.'))}</p>`}</div></div>`;
    }
    async function paintInvestigation(page, data, id, reload) {
        if (!page || !enabled()) return;
        let r; try { r = await api('cx_needs', {investigation_id: id}); } catch (_) { return; }
        if (!page.isConnected) return;
        invData = {id: Number(id), needs: r.needs || [], hypotheses: r.hypotheses || [], reload, inv: data?.investigation || {}};
        const by = new Map(invData.needs.map(n => [Number(n.item_id), n]));
        page.querySelectorAll('.investigation-item[data-enq-piste]').forEach(el => {
            el.querySelector(':scope .cx-need')?.remove();
            const n = by.get(Number(el.dataset.enqPiste)); if (!n) return;
            const head = el.querySelector('.investigation-item-head'); (head || el.firstElementChild)?.insertAdjacentHTML('afterend', needHtml(n));
        });
        // la pastille de l'en-tête : seulement s'il y a des « ✓ je l'ai »
        page.querySelector('.cx-needs-pill')?.remove();
        if (r.have) {
            const h = page.querySelector('.page-header h2, h2');
            h?.insertAdjacentHTML('beforeend', ` <button type="button" class="cx-needs-pill" data-cx-needs-pill title="${esc(T('{n} : l’app a déjà de quoi répondre à ce qui manque (cliquer pour voir)', {n: plural(r.have, T('réponse'), T('réponses'))}))}">🧩 ${nf(r.have)}</button>`);
        }
        if (!page.dataset.cxNeedsBound) { page.dataset.cxNeedsBound = '1'; page.addEventListener('click', onInvClick); }
        const f = S().cxFocusItem; if (f) { S().cxFocusItem = 0; const el = page.querySelector(`[data-cx-need="${f}"]`); if (el) { toggleAns(el, true); el.scrollIntoView({block: 'center', behavior: 'smooth'}); } }
    }
    const toggleAns = (el, on) => { const box = el.querySelector('.cx-need-ans'); if (!box) return; box.hidden = on === undefined ? !box.hidden : !on; el.querySelector('[data-cx-need-open]')?.setAttribute('aria-expanded', String(!box.hidden)); };
    async function onInvClick(e) {
        const page = e.currentTarget, D = invData; if (!D) return;
        if (e.target.closest('[data-cx-needs-pill]')) { const all = [...page.querySelectorAll('.cx-need')].filter(x => x.querySelector('.cx-need-yes')); const open = all.some(x => x.querySelector('.cx-need-ans')?.hidden); all.forEach(x => toggleAns(x, open)); all[0]?.scrollIntoView({block: 'center', behavior: 'smooth'}); return; }
        const box = e.target.closest('[data-cx-need]'); if (!box) return;
        e.stopPropagation();
        const n = D.needs.find(x => Number(x.item_id) === Number(box.dataset.cxNeed)); if (!n) return;
        if (e.target.closest('[data-cx-need-open]')) return toggleAns(box);
        if (e.target.closest('[data-cx-need-edit]')) return edit({need: n, investigation_id: D.id, hypotheses: D.hypotheses, after: D.reload});
        const hyp = e.target.closest('[data-cx-need-hyp]'); if (hyp) return ext.hypotheses?.open?.(Number(hyp.dataset.cxNeedHyp));
        const ans = e.target.closest('[data-cx-ans]'), a = ans ? n.answers[Number(ans.dataset.cxAns)] : null; if (!a) return;
        if (e.target.closest('[data-cx-ans-file]')) return fileAnswer(n, a, D.reload);
        if (e.target.closest('[data-cx-ans-view]')) return ext.openActTranscriber?.({id: a.ref_id});
        if (e.target.closest('[data-cx-ans-skip]')) return skipAnswer(n, `${a.kind}:${a.ref_id}`, D.reload);
        if (e.target.closest('[data-cx-ans-ouc]')) return ext.ouChercher?.openPerson?.(n.person_id);
        if (e.target.closest('[data-cx-ans-letter]')) return ext.openActLetter?.({person_id: n.person_id, item_id: n.item_id, item_title: n.item_title, act: LETTER[n.what] || 'naissance'});
    }
    const provLabel = a => T((PROV[a.provider] || ['', a.provider])[1]);
    /** « Ranger » : la pièce sur la piste, le besoin rempli ; ↶ Annuler défait les deux */
    async function fileAnswer(n, a, after) {
        try {
            const r = await post('need_file', {need_id: n.id || 0, item_id: n.item_id, need: guessFields(n), item: {kind: a.kind, ref_id: a.ref_id, title: a.title, value: a.value || '', origin: {kind: a.kind, id: a.ref_id, label: provLabel(a)}}});
            await after?.();
            undoToast(T('🕵️ Rangé dans la piste « {p} »', {p: n.item_title || ''}), {icon: '🧩', undo: async () => { await post('need_file_undo', r); await after?.(); }});
            if (n.hypothesis_id && ext.hypotheses?.open) toast(T('Ce besoin servait à trancher l’hypothèse « {h} ».', {h: n.hypothesis || ''}), '', {action: {label: T('⚖️ Ouvrir l’hypothèse'), run: () => ext.hypotheses.open(n.hypothesis_id)}});
            return r;
        } catch (err) { toast(err.message, 'error'); return null; }
    }
    async function skipAnswer(n, key, after) {
        try {
            const r = await post('need_skip', {need_id: n.id || 0, item_id: n.item_id, need: guessFields(n), key});
            await after?.();
            undoToast(T('Ne sera plus proposé pour ce besoin'), {icon: '🧩', undo: async () => { await post('need_unskip', {need_id: r.need_id, key, created: r.created ? 1 : 0}); await after?.(); }});
        } catch (err) { toast(err.message, 'error'); }
    }

    /* ── ✎ « Ce qui manque… » : quoi · qui · où · quand (et pour quelle hypothèse) ── */
    async function edit({need = null, item = null, investigation_id = 0, hypotheses = null, person_id = 0, after = null} = {}) {
        if (kiosk()) return;
        const n = need || {item_id: Number(item?.id) || 0, what: 'birth', person_id: Number(person_id) || 0, place_id: 0, place: '', year_from: null, year_to: null, note: '', state: 'open', guessed: true};
        if (!n.item_id && !item) { // « ＋ Ajouter → 🧩 Un besoin… » : une piste nouvelle qui porte le besoin
            n.newItem = true;
        }
        if (hypotheses == null && investigation_id) { try { hypotheses = (await api('cx_needs', {investigation_id})).hypotheses || []; } catch (_) { hypotheses = []; } }
        const pv = n.place_id ? n.place_id : n.place ? `txt:${n.place}` : null;
        const sel = Object.entries(WHAT).map(([k, [ic, l]]) => `<option value="${k}" ${n.what === k ? 'selected' : ''}>${ic} ${esc(T(l))}</option>`).join('');
        const hyp = (hypotheses || []).length ? `<label>🤔 ${esc(T('Pour trancher une hypothèse'))} <select name="hyp"><option value="0">${esc(T('— aucune —'))}</option>${hypotheses.map(h => `<option value="${h.id}" ${Number(n.hypothesis_id) === h.id ? 'selected' : ''}>${esc(h.title)}</option>`).join('')}</select></label>` : '';
        return new Promise(res => {
            let done = false;
            ext.openDialog?.({eyebrow: '🧩 ' + T('CE QUI MANQUE'), title: n.newItem ? T('Un besoin') : T('Ce que cette piste cherche'), submitLabel: T('Enregistrer'),
                body: `<div class="cx-need-form">${n.newItem ? `<label>${esc(T('Titre de la piste'))}<input name="title" maxlength="200" placeholder="${esc(T('Acte de naissance'))}"></label>` : ''}
                    <label>${esc(T('Quoi'))} <select name="what">${sel}</select></label>
                    <div><span class="pk-lab">${esc(T('Pour qui'))}</span>${P().pickerField?.({name: 'person', kind: 'person', value: n.person_id || null}) || ''}</div>
                    <div><span class="pk-lab">${esc(T('Où'))}</span>${P().pickerField?.({name: 'place', kind: 'place', value: pv, allowFree: true}) || ''}</div>
                    <div class="cx-need-years"><label>${esc(T('De'))} <input type="number" name="y0" min="1000" max="2100" value="${n.year_from ?? ''}" inputmode="numeric"></label><label>${esc(T('à'))} <input type="number" name="y1" min="1000" max="2100" value="${n.year_to ?? ''}" inputmode="numeric"></label></div>
                    ${hyp}<label>${esc(T('Note'))}<input name="note" maxlength="1000" value="${esc(n.note || '')}"></label>
                    <p class="ui-hint">${esc(T('Quand un acte transcrit ou un média importé y répond, l’app le dit (« Cet acte répond à… ») : jamais rangé tout seul.'))}</p></div>`,
                onDelete: n.id ? async () => { done = true; const r = await post('need_remove', {id: n.id}); await after?.(); undoToast(T('Besoin retiré'), {undo: async () => { await post('need_restore', {id: n.id, prev: r.prev}); await after?.(); }}); res(null); } : undefined,
                onOpen: d => d.addEventListener('close', () => { if (!done) res(null); }),
                onSubmit: async f => {
                    const place = P().pickerValue?.(f.querySelector('[data-picker="place"]')), person = P().pickerValue?.(f.querySelector('[data-picker="person"]'));
                    const body = {what: f.elements.what.value, person_id: typeof person === 'number' ? person : Number(person?.id) || 0,
                        place_id: typeof place === 'number' ? place : 0, place_name: typeof place === 'string' && place.startsWith('txt:') ? place.slice(4) : '',
                        year_from: f.elements.y0.value, year_to: f.elements.y1.value, note: f.elements.note.value, hypothesis_id: Number(f.elements.hyp?.value) || 0, id: n.id || 0};
                    let createdItem = 0;
                    if (n.newItem) {
                        const title = f.elements.title.value.trim() || `${T((WHAT[body.what] || WHAT.other)[1])}`;
                        const ri = await post('inv_receive', {investigation_id, mode: 'one', title, items: [{kind: 'datum', title: T('Ce qui manque'), value: title}]});
                        createdItem = ri.item_id; body.item_id = createdItem;
                    } else body.item_id = n.item_id;
                    const r = await post('need_set', body); done = true;
                    await after?.();
                    undoToast(T('🧩 Ce qui manque est noté : {w}', {w: T((WHAT[body.what] || WHAT.other)[1])}), {undo: async () => { await post('need_restore', {id: r.id, prev: r.prev}); if (createdItem) await A().api('delete_investigation_item', {}, {method: 'POST', body: {id: createdItem}}).catch(() => {}); await after?.(); }});
                    res(r);
                }});
        });
    }
    /** « ＋ Ajouter » de l'enquête ouverte : « 🧩 Un besoin… » */
    function addMenuItems() {
        const st = S(); if (!enabled() || kiosk() || st.module !== 'enquetes' || !Number(st.currentInvestigationId)) return [];
        const id = Number(st.currentInvestigationId);
        return [{icon: '🧩', label: T('Un besoin… (quoi · qui · où · quand)'), run: () => edit({investigation_id: id, person_id: invData?.id === id ? invData.inv.person_id : 0, after: () => A().refreshScreen?.()})}];
    }

    /* ═════════ 📜 quand quelque chose arrive : « Cet acte répond au besoin de… » ═════════ */
    const proposed = new Set(); // ce qui a déjà été proposé pendant la session (pas deux fois le même message)
    const WHAT_OF_KIND = {naissance: 'birth', bapteme: 'birth', mariage: 'marriage', deces: 'death', sepulture: 'death', recensement: 'census', militaire: 'military', notarial: 'notarial', notoriete: 'notarial'};
    /**
     * o = {kind: 'act' | 'media', ref_id, what (sorte de l'acte : naissance…), person_ids, names, year, date, place, title, text}
     * → les besoins auxquels il répond, un seul message (regroupé) ; rien si coupé, ou si rien n'est presque sûr (réglage).
     */
    async function announce(o) {
        if (!enabled() || kiosk() || !o?.ref_id) return [];
        const s = settings(); if (s.msg === 'off') return [];
        const what = WHAT_OF_KIND[o.what] || o.what; if (!WHAT[what] || what === 'other') return [];
        let r; try { r = await post('need_match', {...o, what}); } catch (_) { return []; }
        const list = (r.matches || []).filter(m => (s.msg === 'close' || m.level === 'sure') && !proposed.has(`${m.item_id || m.id}|${o.kind}:${o.ref_id}`));
        if (!list.length) return [];
        list.forEach(m => proposed.add(`${m.item_id || m.id}|${o.kind}:${o.ref_id}`));
        const item = {kind: o.kind, ref_id: o.ref_id, title: o.title || T('Acte transcrit'), value: [o.date, o.place].filter(Boolean).join(' · '), origin: {kind: o.kind, id: o.ref_id, label: o.kind === 'act' ? T('Atelier de transcription') : T('Médias')}};
        const thing = o.kind === 'act' ? T('Cet acte que tu viens de transcrire') : T('Ce média que tu viens d’ajouter');
        const gear = {label: '⚙', title: T('Régler ce message'), close: false, run: e => msgMenu(e?.currentTarget || document.body)};
        if (list.length === 1) {
            const m = list[0];
            toast(T('{thing} répond au besoin de l’enquête « {inv} » ({what}).', {thing, inv: m.investigation_title || '', what: T((WHAT[m.what] || WHAT.other)[1]).toLowerCase()}) + (m.level === 'close' ? ` ${T('(à vérifier)')}` : ''), '', {duration: 15000, actions: [
                {label: T('🕵️ Ranger dans l’enquête'), run: () => fileAnswer(m, {kind: item.kind, ref_id: item.ref_id, title: item.title, value: item.value, provider: o.kind === 'act' ? 'atelier' : 'media'}, () => refreshInv(m.investigation_id))},
                {label: T('Voir'), run: () => openInv(m.investigation_id, m.item_id)},
                {label: T('Pas lui'), run: () => skipAnswer(m, `${o.kind}:${o.ref_id}`, () => refreshInv(m.investigation_id))}, gear]});
        } else {
            toast(T('{n} attendaient ceci — voir', {n: plural(list.length, T('besoin'), T('besoins'))}), '', {duration: 15000, actions: [{label: T('Voir'), run: () => openMatches(list, item, o)}, gear]});
        }
        return list;
    }
    const refreshInv = id => { const st = S(); if (st.module === 'enquetes' && Number(st.currentInvestigationId) === Number(id)) A().refreshScreen?.(); };
    function msgMenu(anchor) {
        const s = settings(), set = (v, m) => saveSettings({...settings(), msg: v}, m);
        UI().menuAt?.(anchor, [
            {icon: s.msg === 'sure' ? '●' : '○', label: T('Seulement quand c’est presque sûr (même personne, même sorte d’acte)'), run: () => set('sure', T('Le message ne viendra que quand c’est presque sûr'))},
            {icon: s.msg === 'close' ? '●' : '○', label: T('À chaque ressemblance'), run: () => set('close', T('Le message viendra à chaque ressemblance'))},
            {icon: s.msg === 'off' ? '●' : '○', label: T('Ne plus proposer'), run: () => set('off', T('Le message « Cet acte répond à… » ne sera plus proposé'))},
        ], {title: T('Le message « Cet acte répond à… »')});
    }
    function openMatches(list, item, o) {
        const rows = list.map((m, i) => `<div class="cx-ans"><span class="cx-ans-tag ${m.level === 'sure' ? 'is-yes' : 'is-find'}">${m.level === 'sure' ? '✓' : '≈'}</span><span class="cx-ans-what">🕵️ <b data-i18n-off>${esc(m.investigation_title)}</b> — <span data-i18n-off>${esc(m.item_title || '')}</span><br><small class="muted" data-i18n-off>${esc(needText(m))}</small></span><span class="cx-ans-btns"><button type="button" class="button small" data-cx-m="${i}">${esc(T('Ranger'))}</button></span></div>`).join('');
        ext.openDialog?.({eyebrow: '🧩', title: T('Ce qui attendait « {t} »', {t: item.title}), submitLabel: T('Fermer'), body: `<div class="cx-matches">${rows}</div>`, onSubmit: () => true,
            onOpen: d => d.addEventListener('click', async e => { const b = e.target.closest('[data-cx-m]'); if (!b) return; b.disabled = true; const m = list[Number(b.dataset.cxM)]; const r = await fileAnswer(m, {...item, provider: o.kind === 'act' ? 'atelier' : 'media'}, () => refreshInv(m.investigation_id)); if (r) b.textContent = '✓'; })});
    }
    // 🖼 des médias importés (lcnda:media-changed, app-media-limits.js) : rattachés à une personne qui attendait une photo ou ce document
    let mediaT = 0; const mediaSeen = [];
    document.addEventListener('lcnda:media-changed', e => {
        if (!enabled() || settings().msg === 'off' || !/upload|api/.test(e.detail?.source || '')) return;
        clearTimeout(mediaT); mediaT = setTimeout(async () => {
            let r; try { r = await post('need_media_recent', {seen: mediaSeen.slice(-200)}); } catch (_) { return; }
            (r.seen || []).forEach(id => mediaSeen.push(id));
            const list = (r.matches || []).filter(x => !proposed.has(`${x.need.item_id || x.need.id}|media:${x.media.id}`)); if (!list.length) return;
            if (list.length === 1) { const x = list[0]; proposed.add(`${x.need.item_id || x.need.id}|media:${x.media.id}`);
                return toast(T('{thing} répond au besoin de l’enquête « {inv} » ({what}).', {thing: T('Ce média que tu viens d’ajouter'), inv: x.need.investigation_title || '', what: T((WHAT[x.need.what] || WHAT.other)[1]).toLowerCase()}), '', {duration: 15000, actions: [
                    {label: T('🕵️ Ranger dans l’enquête'), run: () => fileAnswer(x.need, {kind: 'media', ref_id: x.media.id, title: x.media.title, provider: 'media'}, () => refreshInv(x.need.investigation_id))},
                    {label: T('Voir'), run: () => openInv(x.need.investigation_id, x.need.item_id)}, {label: '⚙', title: T('Régler ce message'), close: false, run: ev => msgMenu(ev?.currentTarget || document.body)}]}); }
            list.forEach(x => proposed.add(`${x.need.item_id || x.need.id}|media:${x.media.id}`));
            toast(T('{n} répondent à des besoins — voir', {n: plural(list.length, T('nouvelle chose'), T('nouvelles choses'))}), '', {duration: 15000, actions: [{label: T('Voir'), run: () => openSemaine()}]});
        }, 1800);
    });

    /* ═════════ 🗓 Ma semaine → 🧩 Ce qui manque (le tableau central) ═════════ */
    let SEM = null, semFilter = 'all';
    async function semaineHtml(host, {reload = false} = {}) {
        if (!host) return;
        if (!enabled()) { host.innerHTML = A().empty ? A().empty(T('Les besoins sont éteints (Réglages → 🧺 Panier et connexions).'), {icon: '🧩'}) : ''; return; }
        if (!SEM || reload) { host.innerHTML = UI().spinner ? UI().spinner(T('Ce qui manque…')) : '…'; try { SEM = await api('cx_needs_all'); } catch (e) { host.innerHTML = UI().notice ? UI().notice('error', e.message) : esc(e.message); return; } }
        drawSemaine(host);
    }
    function drawSemaine(host) {
        const d = SEM, c = d.counts || {};
        const rows = (d.rows || []).filter(n => semFilter === 'all' || n.bucket === semFilter);
        const comp = (d.computed || []).filter(() => semFilter === 'all' || semFilter === 'find');
        const pills = [['all', T('Tout')], ['have', `✓ ${T('Je l’ai déjà')}`], ['find', `🔎 ${T('Je peux le trouver')}`], ['none', T('Sans réponse')]]
            .map(([k, l]) => `<button type="button" class="${semFilter === k ? 'is-active' : ''}" data-cx-sf="${k}">${esc(l)} (${nf(c[k] || 0)})</button>`).join('');
        const who = a => { const [pi, pl] = PROV[a.provider] || ['•', a.provider]; return `<span class="cx-who ${a.have === 'yes' ? 'is-yes' : a.have === 'searched' ? 'is-no' : ''}">${a.have === 'yes' ? '✓' : a.have === 'searched' ? '🚫' : ''} ${pi} ${esc(T(pl))}</span>`; };
        const line = (n, i) => { const yes = (n.answers || []).find(a => a.have === 'yes');
            return `<tr><td>${(WHAT[n.what] || WHAT.other)[0]} <span data-i18n-off>${esc(needTitle(n))}</span>${needMeta(n) ? ` <small class="muted" data-i18n-off>· ${esc(needMeta(n))}</small>` : ''}</td>
                <td>${n.investigation_id ? `🕵️ <span data-i18n-off>${esc(n.investigation_title || '')}</span>` : ''}${n.hypothesis_id ? ` 🤔 <span data-i18n-off>${esc(n.hypothesis || '')}</span>` : ''}</td>
                <td>${(n.answers || []).map(who).join(' ') || `<span class="muted">${esc(T('rien pour l’instant'))}</span>`}</td>
                <td class="cx-sem-act">${yes && !kiosk() ? `<button type="button" class="button small" data-cx-sfile="${i}">${esc(T('Ranger'))}</button>` : ''}${n.investigation_id ? `<button type="button" class="button small secondary" data-cx-sopen="${i}">${esc(T('Voir'))}</button>` : n.hypothesis_id ? `<button type="button" class="button small secondary" data-cx-shyp="${n.hypothesis_id}">${esc(T('Voir'))}</button>` : ''}</td></tr>`; };
        const compLine = x => (x.tool === 'map' ? `<tr><td>📍 ${esc(T('{n} sans coordonnées', {n: plural(x.count, T('lieu'), T('lieux'))}))}</td><td>🗺 ${esc(T('Carte'))}</td><td><span class="cx-who">🏛 ${esc(T('Communes'))}</span></td><td class="cx-sem-act">${kiosk() ? '' : `<button type="button" class="button small" data-lap-open>${esc(T('📍 Placer'))}</button>`}</td></tr>` : '');
        const list = rows.map(n => line(n, d.rows.indexOf(n))).join('') + comp.map(compLine).join('');
        host.innerHTML = `<div class="cx-sem"><div class="ui-filters cx-sem-filters" role="tablist">${pills}</div>
            ${list ? `<div class="cx-sem-scroll"><table class="cx-sem-table"><thead><tr><th>${esc(T('Ce qui manque'))}</th><th>${esc(T('Pour'))}</th><th>${esc(T('Qui peut répondre'))}</th><th></th></tr></thead><tbody>${list}</tbody></table></div>`
                : (A().empty ? A().empty(T('Rien ne manque ici : les pistes « à explorer » de tes enquêtes diront ce qu’elles cherchent.'), {icon: '🧩'}) : '')}
            <p class="ui-hint">${esc(T('Les pistes « à explorer » des enquêtes ouvertes, les besoins écrits (✎ sur une piste) et ce que les outils calculent. Rien n’est rangé tout seul.'))}</p></div>`;
        if (host.dataset.cxSemBound) return; host.dataset.cxSemBound = '1';
        host.addEventListener('click', async e => {
            const f = e.target.closest('[data-cx-sf]'); if (f) { semFilter = f.dataset.cxSf; drawSemaine(host); return; }
            const o = e.target.closest('[data-cx-sopen]'); if (o) { const n = SEM.rows[Number(o.dataset.cxSopen)]; host.closest('dialog')?.close(); return openInv(n.investigation_id, n.item_id); }
            const h = e.target.closest('[data-cx-shyp]'); if (h) return ext.hypotheses?.open?.(Number(h.dataset.cxShyp));
            const fl = e.target.closest('[data-cx-sfile]'); if (fl) { const n = SEM.rows[Number(fl.dataset.cxSfile)], a = n.answers.find(x => x.have === 'yes'); fl.disabled = true; await fileAnswer(n, a, () => semaineHtml(host, {reload: true})); }
        });
    }
    function openSemaine() {
        if (ext.semaine?.openNeeds) return ext.semaine.openNeeds();
        ext.openDialog?.({eyebrow: '🗓', title: T('🧩 Ce qui manque'), wide: true, submitLabel: T('Fermer'), body: '<div data-cx-sem-host></div>', onSubmit: () => true, onOpen: d => semaineHtml(d.querySelector('[data-cx-sem-host]'), {reload: true})});
    }

    /* ═════════ 📖 le Livre de famille : « il me manque… » (une ligne repliée) ═════════ */
    function bookHint(form) {
        if (!form || !enabled() || !settings().book) return;
        const fs = form.querySelector('fieldset'); if (!fs || form.querySelector('[data-cx-book-hint]')) return;
        const box = document.createElement('details'); box.className = 'cx-hint'; box.dataset.cxBookHint = ''; box.hidden = true; fs.after(box);
        let t = 0, seq = 0;
        const run = async () => {
            const my = ++seq, scope = form.elements.scope?.value || 'all', root = (P().pickerValue?.(form.querySelector('[data-picker="person"]')) ?? form.elements.book_root?.value) || A().state?.bootstrap?.startPersonId || '';
            let r; try { r = await api('cx_hints', {tool: 'book', scope, root_id: String(typeof root === 'object' ? root?.id || '' : root), generations: form.elements.generations?.value || '6'}); } catch (_) { return; }
            if (my !== seq || !box.isConnected) return;
            box.hidden = !r.total;
            const ppl = list => (list || []).map(p => `<button type="button" class="link-button" data-open-person-id="${p.id}" data-i18n-off>${esc(p.name)}</button>`).join(', ');
            const ROW = {photo: x => `🖼 ${esc(T('Pas de photo : {n}', {n: plural(x.count, T('fiche'))}))} ${ppl(x.people)}${x.count > (x.people || []).length ? ' …' : ''}`,
                source: x => `🔖 ${esc(T('{n} (naissance, mariage, décès) sans source', {n: plural(x.count, T('événement'), T('événements'))}))}`,
                date: x => `🗓 ${esc(T('Aucune date : {n}', {n: plural(x.count, T('fiche'))}))} ${ppl(x.people)}${x.count > (x.people || []).length ? ' …' : ''}`};
            box.innerHTML = `<summary>🧩 <b>${nf(r.total)}</b> ${esc(T('il manque des choses au livre'))}</summary><ul>${(r.rows || []).map(x => `<li>${(ROW[x.what] || (() => ''))(x)}</li>`).join('')}</ul>
                <p class="ui-hint">${esc(T('Calculé pour la branche choisie. 📥 « Prendre depuis… » va chercher des photos, des actes, des sources.'))} ${ext.connexions?.openTake && !kiosk() ? `<button type="button" class="link-button" data-cx-hint-take>📥 ${esc(T('Prendre depuis…'))}</button>` : ''}</p>`;
        };
        box.addEventListener('click', e => {
            const p = e.target.closest('[data-open-person-id]'); if (p) { e.preventDefault(); const st = S(); st.currentPersonId = Number(p.dataset.openPersonId); A().setModule?.('personnes'); return; }
            if (e.target.closest('[data-cx-hint-take]')) { e.preventDefault(); ext.connexions.openTake({tab: 'media'}); }
        });
        const soon = () => { clearTimeout(t); t = setTimeout(run, 400); };
        form.addEventListener('change', e => { if (e.target.closest('[name="scope"], [name="generations"], [data-picker]')) soon(); });
        form.addEventListener('picker-change', soon);
        (window.requestIdleCallback || (f => setTimeout(f, 200)))(run);
    }

    /* ═════════ 📜 la monographie : une partie « 🧩 Ce qui manque » (seulement s'il manque quelque chose) ═════════ */
    (ext.monographSections = ext.monographSections || []).push({id: 'cx_manque', icon: '🧩', label: 'Ce qui manque', group: 'Le lieu', defaultOn: true,
        enabled: () => enabled() && settings().mono,
        render: async (place, host) => {
            let r; try { r = await api('cx_hints', {tool: 'place', place_id: place.id}); } catch (_) { return false; }
            if (!r.total) return false;
            const ROW = {digest: x => `📜 ${esc(T('Pas de dépouillement pour les années où ta famille est là : {y}', {y: x.years.join(', ')}))}${x.count > x.years.length ? ' …' : ''}`,
                digest_todo: x => `📜 ${esc(T('Dépouillements commencés, pas finis : {y}', {y: x.years.join(', ')}))}`,
                gap: x => `🕳 ${esc(T('Registres manquants : {l}', {l: x.items.join(' ; ')}))}`,
                source: x => `🔖 ${esc(T('{n} ici sans source', {n: plural(x.count, T('événement'), T('événements'))}))}`,
                needs: x => `🧩 ${esc(T('{n} dans tes enquêtes', {n: plural(x.count, T('besoin ouvert'), T('besoins ouverts'))}))} <button type="button" class="link-button" data-cx-mono-needs>${esc(T('voir'))}</button>`,
                coords: () => `📍 ${esc(T('Pas encore sur la carte (pas de position)'))}${kiosk() ? '' : ` <button type="button" class="link-button" data-lap-open="${place.id}">${esc(T('📍 Placer'))}</button>`}`};
            host.innerHTML = `<details class="cx-hint"><summary>🧩 ${esc(T('Il manque {n} à cette monographie', {n: plural(r.total, T('chose'), T('choses'))}))}</summary><ul>${r.rows.map(x => `<li>${(ROW[x.what] || (() => ''))(x)}</li>`).join('')}</ul></details>`;
            host.querySelector('[data-cx-mono-needs]')?.addEventListener('click', openSemaine);
            return true;
        }});

    /* ═════════ 🗺 la Carte : « je peux les placer », et ce qu'on a « 📍 Mis sur la carte » ═════════ */
    for (const k of ['mapSetup', 'mapDraw']) ext[k] = ext[k] || [];
    let lapCount = null, pins = null, showPins = false, lastView = null;
    const loadPins = async (force = false) => { if (pins && !force) return pins; try { pins = (await api('cx_map')).items || []; } catch (_) { pins = []; } return pins; };
    ext.mapSetup.push(() => {
        if (!enabled()) return;
        const strip = document.querySelector('.map-layout .tool-strip'); if (!strip) return;
        // ✓ « les communes savent les placer » : une fois par session, après l'affichage
        if (settings().map && !kiosk()) (window.requestIdleCallback || (f => setTimeout(f, 300)))(async () => {
            if (lapCount == null) { try { const r = await api('lieux_a_placer', {}); const it = r.items || r.places || []; lapCount = {sure: it.filter(x => x.status === 'sure').length, all: it.length}; } catch (_) { lapCount = {sure: 0, all: 0}; } }
            const s2 = document.querySelector('.map-layout .tool-strip'); if (!s2 || s2.querySelector('.cx-maphint') || !lapCount.sure) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'button small secondary cx-maphint'; b.dataset.lapOpen = '';
            b.textContent = `🧩 ✓ ${nf(lapCount.sure)}`; b.title = T('{n} sans position : les communes livrées avec l’app savent en placer {s} ; les autres, à la main (« 🗺 Choisir sur la carte »)', {n: plural(lapCount.all, T('lieu'), T('lieux')), s: nf(lapCount.sure)});
            s2.insertBefore(b, s2.querySelector('.spacer'));
        });
        // 📌 ce qu'on a mis sur la carte : un bouton seulement s'il y en a
        loadPins().then(list => {
            const s2 = document.querySelector('.map-layout .tool-strip'); if (!s2 || !list.length || s2.querySelector('.cx-pins-btn')) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = `button small secondary cx-pins-btn${showPins ? ' is-active' : ''}`; b.setAttribute('aria-pressed', String(showPins));
            b.textContent = `📌 ${nf(list.length)}`; b.title = T('Ce que tu as « 📍 Mis sur la carte » : montrer ou cacher (clic droit : tout retirer)');
            b.addEventListener('click', () => { showPins = !showPins; b.classList.toggle('is-active', showPins); b.setAttribute('aria-pressed', String(showPins)); drawPins(); });
            b.addEventListener('contextmenu', e => { e.preventDefault(); if (kiosk()) return; UI().menuAt?.(b, [{icon: '🗑', label: T('Tout retirer de la carte'), danger: true, run: async () => { const r = await post('map_remove', {all: 1}); pins = []; drawPins(); b.remove();
                undoToast(T('{n} retirés de la carte', {n: plural(r.removed.length, T('point'))}), {undo: async () => { await post('map_restore', {rows: r.removed}); await loadPins(true); A().drawMap?.(); }}); }}], {title: T('Mis sur la carte')}); });
            s2.insertBefore(b, s2.querySelector('.spacer'));
        });
    });
    function drawPins() {
        const st = document.getElementById('map-stage'); let svg = document.getElementById('cx-pins');
        if (!showPins || !pins?.length || !lastView || !st || !A().lngToX) { svg?.remove(); return; }
        if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'cx-pins'; svg.setAttribute('class', 'cx-pins'); st.appendChild(svg); }
        const v = lastView; svg.setAttribute('viewBox', `0 0 ${v.width} ${v.height}`);
        svg.innerHTML = pins.map(p => { const x = A().lngToX(p.lon, v.z) - v.left, y = A().latToY(p.lat, v.z) - v.top; if (x < -20 || y < -20 || x > v.width + 20 || y > v.height + 20) return '';
            return `<g transform="translate(${Math.round(x)},${Math.round(y)})"><title>${esc(p.title)}${p.value ? ` — ${esc(p.value)}` : ''}</title><path d="M0 0 L-6 -14 A7 7 0 1 1 6 -14 Z" fill="#c62828" stroke="#fff" stroke-width="1.5"/><circle cy="-16" r="2.6" fill="#fff"/></g>`; }).join('');
    }
    ext.mapDraw.push(v => { lastView = v; drawPins(); });
    // la couche commune des cartes (« ＋ Données » des diagrammes de cartes, Mes cartes, le dessin vectoriel)
    (ext.mapLayerSources = ext.mapLayerSources || []).push({id: 'cx_map', icon: '📌', label: T('Mis sur la carte (« 📍 Mettre dans… »)'), group: 'Ta famille', kind: 'points', source: T('Ta base'),
        run: async ({q} = {}) => { const list = await loadPins(true); const f = String(q || '').toLowerCase(); return {features: list.filter(p => !f || `${p.title} ${p.value}`.toLowerCase().includes(f)).map(p => ({type: 'pt', lat: p.lat, lon: p.lon, label: p.title})), source: T('Ta base')}; }});
    // 📍 « Mettre dans… » → 🗺 une carte (ce qui n'a pas de position reste dans le panier)
    const DT = ext.dropTargets = ext.dropTargets || [];
    DT.push({id: 'map', icon: '🗺', label: 'Une carte…', group: 'Créer', kinds: ['place', 'event', 'datum', 'row', 'set', 'data', 'media'],
        enabled: () => enabled(),
        here: () => (S().module === 'carte' ? {label: T('Ici : sur la carte')} : null),
        choose: async () => ({}),
        explain: items => T('{n} sur la carte (couche « 📌 Mis sur la carte ») ; sans position : reste dans le panier', {n: plural(items.length, T('chose'), T('choses'))}),
        receive: async items => {
            const r = await post('map_add', {items});
            const left = (r.left || []).map(i => items[i]).filter(Boolean);
            pins = null; showPins = true;
            const after = () => { if (S().module === 'carte') loadPins(true).then(() => { A().drawMap?.(); drawPins(); }); };
            const names = left.slice(0, 3).map(x => `« ${x.title} »`).join(', ');
            return {left, after,
                message: (r.ids.length ? T('🗺 {n} sur la carte', {n: plural(r.ids.length, T('point'))}) : T('Rien n’a de position : rien n’est mis sur la carte.')) + (left.length ? ` ${T('{names} : pas de position.', {names})}` : ''),
                undo: r.ids.length ? async () => { await post('map_remove', {ids: r.ids}); pins = null; after(); } : null};
        }});

    /* ═════════ ⚙️ Réglages → 🧺 Panier et connexions : « 🧩 Les besoins » ═════════ */
    function settingsHtml() {
        const s = settings(), K = UI().toggleHtml;
        const tg = (k, label, sub) => (K ? `<div class="cx-tg">${K(T(label), {checked: !!s[k], attrs: `data-cxn-tg="${k}"`, sub: T(sub)})}</div>` : `<label class="checkbox-line"><input type="checkbox" data-cxn-tg="${k}" ${s[k] ? 'checked' : ''}> ${esc(T(label))}</label>`);
        const r = (v, l, sub) => `<label class="checkbox-line"><input type="radio" name="cxn-msg" value="${v}" ${s.msg === v ? 'checked' : ''}> <span><b>${esc(T(l))}</b>${sub ? `<br><small class="muted">${esc(T(sub))}</small>` : ''}</span></label>`;
        return `<div class="maintenance-panel cx-needs-settings"><h3>🧩 ${esc(T('Les besoins'))}</h3>${tg('on', 'Les pistes disent ce qui leur manque', 'Une ligne « 🧩 Il manque… » sur les pistes à explorer, ce que l’app a déjà (✓), et l’onglet « Ce qui manque » de Ma semaine.')}
            <h4>${esc(T('Le message « Cet acte répond à… »'))}</h4>${r('sure', 'Seulement quand c’est presque sûr', 'Même personne et même sorte d’acte (conseillé).')}${r('close', 'À chaque ressemblance', 'Aussi quand seuls l’année et le lieu vont.')}${r('off', 'Jamais', 'Les réponses attendent dans l’enquête et dans Ma semaine.')}
            <h4>${esc(T('Ce qui manque aux outils (une ligne repliée)'))}</h4>${tg('book', '📖 Le Livre de famille', 'Fiches sans photo, événements sans source, fiches sans date.')}${tg('map', '🗺 La Carte', '« ✓ N » : les lieux sans position que les communes savent placer.')}${tg('mono', '📜 La monographie', 'Années sans dépouillement, registres manquants, événements sans source.')}</div>`;
    }
    function bindSettings(ws) {
        ws.querySelectorAll('[data-cxn-tg]').forEach(el => { const inp = el.matches('input') ? el : el.querySelector('input'); (inp || el).addEventListener('change', e => { const k = el.dataset.cxnTg, v = !!(e.target.checked ?? inp?.checked); saveSettings({...settings(), [k]: v}, v ? T('Activé') : T('Éteint')); }); });
        ws.querySelectorAll('[name="cxn-msg"]').forEach(x => x.addEventListener('change', e => saveSettings({...settings(), msg: e.target.value}, T('Message réglé'))));
    }

    ext.cxNeeds = {announce, paintInvestigation, edit, addMenuItems, semaineHtml, openSemaine, bookHint, settings, enabled, settingsHtml, bindSettings, WHAT, needText, loadPins, msgMenu};
})();
