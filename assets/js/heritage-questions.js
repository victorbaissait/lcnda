/**
 * 💬 Questions aux proches (F9) — serveur : lib/questions_proches.php (structure n°49).
 * Listes → « Questions aux proches » : préparer un questionnaire « Te souviens-tu de… » pour un cousin, le télécharger en un
 * seul fichier .html (hors ligne, photos intégrées) ou l'imprimer, suivre son envoi (préparé / envoyé / répondu / rangé, relance),
 * puis « ⤒ Importer les réponses » (le .json qu'il renvoie, ou une réponse collée d'un e-mail) : chaque réponse devient un
 * témoignage sur une fiche ou un souvenir de la Mémoire familiale (family_memories).
 * Aussi : « 💬 Poser des questions sur elle » (fiche, bloc Témoignages / souvenirs), « 💬 Questionnaire » (Répertoire des vivants).
 * Chargé après app.js, heritage.js (openDialog), app-picker.js et app-media-picker.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const nl = v => esc(v).replace(/\n/g, '<br>');
    const api = (...a) => A().api(...a);
    const write = (op, body = {}) => api('qp_write', {}, {method: 'POST', body: {op, ...body}});
    const S = () => A().state;
    const toast = (...a) => A().toast(...a);
    const plural = (n, one, many) => (A().plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const KEY = 'listes:family_questions';
    const STATUS = {prepared: ['Préparé', 'yellow'], sent: ['Envoyé', 'blue'], answered: ['Répondu', 'green'], filed: ['Rangé', 'grey']};
    const badge = q => (q.to_remind ? UI().badge('À relancer', 'red') : UI().badge((STATUS[q.status] || STATUS.prepared)[0], (STATUS[q.status] || STATUS.prepared)[1]));
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const when = (d, label) => (d ? UI().whenText(d, {label}) : '');
    const DEFAULT_INTRO = 'Je fais l’histoire de notre famille et tes souvenirs comptent beaucoup. Réponds à ce que tu veux, avec tes mots : une phrase suffit, et tu peux en écrire autant que tu veux.';
    const KIND_LABEL = {text: 'Question', person: '👤 Sur une personne', photo: '📷 Avec une photo'};
    const DEST = [['testimony', '💬 Témoignage sur la fiche'], ['memory', '📖 Mémoire familiale'], ['skip', 'Ne pas importer']];
    let TEMPLATES = null;
    const loadTemplates = async (force = false) => { if (!TEMPLATES || force) TEMPLATES = (await api('qp_templates')).themes || []; return TEMPLATES; };

    /* ─────────────── le petit téléchargement (un fichier fait dans le navigateur) ─────────────── */
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], {type}));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
    async function copyText(text, field) {
        try { await navigator.clipboard.writeText(text); }
        catch (_) { if (field) { field.select(); document.execCommand('copy'); } }
        toast('Message copié : colle-le dans un e-mail, et joins le questionnaire.');
    }
    function openListPage(edit = null) {
        if (edit) S().qpEdit = edit;
        S().listType = 'family_questions'; S().precisePlaceKey = '';
        if (S().module === 'listes') { A().renderSidebar?.(); A().renderList(); } else A().setModule('listes');
    }

    /* ═════════════════════════════ La liste ═════════════════════════════ */
    ext.lists.family_questions = async token => {
        const st = S();
        if (st.qpEdit) { const e = st.qpEdit; st.qpEdit = null; return renderEditor(token, e); }
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page qp-list">${UI().spinner('Chargement des questionnaires…')}</section>`;
        let data;
        try { data = await api('qp_list'); } catch (e) { ws.innerHTML = `<section class="page">${A().empty(e.message, {icon: '⛔'})}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        let rows = data.questionnaires || [];
        ws.innerHTML = `<section class="page qp-list">${UI().pageHeader({title: 'Questions aux proches', icon: '💬',
            help: 'Un questionnaire « Te souviens-tu de… » qu’un proche remplit chez lui ; ses réponses reviennent en témoignages.',
            primary: kiosk() ? '' : '<button type="button" class="button" data-qp="new">＋ Nouveau questionnaire</button>',
            actions: kiosk() ? [] : ['<button type="button" class="button secondary" data-qp="import">⤒ Importer les réponses</button>'],
            more: kiosk() ? [] : ['<button type="button" data-qp="mine">✎ Mes questions</button>']})}
            <div data-qp-bar></div><div data-qp-body></div><div data-qp-more></div></section>`;
        const page = ws.querySelector('.qp-list'), body = page.querySelector('[data-qp-body]');
        let st2 = {q: '', filters: {}, sort: 'recent'}, view = 'list', limit = 40;
        const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const filtered = () => {
            const f = st2.filters || {}, q = fold(st2.q);
            const contact = f.contact && typeof f.contact === 'object' ? Number(f.contact.id) : 0;
            let l = rows.filter(r => (!q || fold(`${r.title} ${r.recipient_name} ${r.person?.name || ''}`).includes(q))
                && (!f.state || (f.state === 'remind' ? r.to_remind : r.status === f.state)) && (!contact || r.contact_id === contact));
            return UI().sortItems(l, st2.sort, {name: r => r.title, date: r => r.updated_at});
        };
        const item = r => ({name: r.title, open: `data-qp-open="${r.id}"`, thumb: '<span class="ui-card-ico">💬</span>',
            lines: [[`Pour ${r.recipient_name || 'quelqu’un'}`, r.person ? `sur ${r.person.name}` : '', plural(r.question_count, 'question')].filter(Boolean).join(' · '),
                r.status === 'prepared' ? 'Pas encore envoyé' : r.status === 'sent' ? [when(r.sent_at, 'Envoyé'), r.remind_at ? when(r.remind_at, 'relance') : ''].filter(Boolean).join(' · ') : [when(r.answered_at, 'Répondu'), plural(r.answer_count, 'réponse')].filter(Boolean).join(' · ')],
            badges: [badge(r)], when: r.updated_at, whenLabel: 'Modifié',
            actions: kiosk() ? '' : `<button type="button" class="button small secondary" data-qp-open="${r.id}">✎ Modifier</button><button type="button" class="button small secondary" data-qp-dl="${r.id}">⤓ Télécharger</button><button type="button" class="icon-button small" data-qp-del="${r.id}" title="Supprimer le questionnaire" aria-label="Supprimer">🗑</button>`});
        const draw = () => {
            const l = filtered();
            bar.setCount(l.length, 'questionnaire');
            const more = page.querySelector('[data-qp-more]'); more.innerHTML = '';
            if (!rows.length) { body.innerHTML = A().emptyState({icon: '💬', text: 'Aucun questionnaire pour l’instant', hint: 'Choisis un proche, quelques questions toutes prêtes (enfance, maison, métiers, guerre, fêtes, recettes, photos…), et envoie-lui un fichier qu’il remplit chez lui.', action: kiosk() ? null : {label: '＋ Nouveau questionnaire', attrs: 'data-qp="new"'}}); return; }
            body.innerHTML = l.length ? UI().itemsHtml(view, l.slice(0, limit).map(item)) : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">🔍</span><span class="empty-line-text">Rien ne correspond : retire un filtre ou change la recherche.</span></p>';
            if (view !== 'cards') body.querySelectorAll('.ui-row').forEach((el, i) => { const r = l[i]; if (r) el.querySelector('.ui-row-main')?.insertAdjacentHTML('beforeend', `<span class="qp-row-badge">${badge(r)}</span>`); });
            if (l.length > limit) more.appendChild(UI().moreButton({remaining: l.length - limit, step: 40, onClick: () => { limit += 40; draw(); }}));
        };
        const bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher un questionnaire… (ex. Anne, guerre, Marie)'},
            filters: [{id: 'state', label: 'État', type: 'radio', options: [['', 'Tous'], ['prepared', 'Préparés', 'Préparés'], ['sent', 'Envoyés', 'Envoyés'], ['remind', 'À relancer', 'À relancer'], ['answered', 'Répondus', 'Répondus'], ['filed', 'Rangés', 'Rangés']], dflt: ''},
                {id: 'contact', label: 'Destinataire', kind: 'contact', allowFree: false, chipPrefix: 'Pour'}],
            view: {what: 'questionnaires', dflt: 'list', onChange: v => { view = v; draw(); }},
            sort: {options: [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'},
            onChange: (b, {what}) => { st2 = b; view = b.view || view; if (what !== 'view') { limit = 40; draw(); } }});
        st2 = bar.state; view = bar.state.view || view;
        page.querySelector('[data-qp-bar]').replaceWith(bar);
        if (S().qpContactFilter) { const c = S().qpContactFilter; S().qpContactFilter = null; bar.setFilter('contact', c); st2 = bar.state; }
        draw();
        const refresh = async () => { try { rows = (await api('qp_list')).questionnaires || []; } catch (_) {} if (page.isConnected) draw(); };
        page.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const d = b.dataset;
            if (d.qp === 'new') return renderEditor(++S().workspaceToken, {id: 0});
            if (d.qp === 'import') return importAnswers({after: refresh});
            if (d.qp === 'mine') return openModels(null);
            if (d.qpOpen) return renderEditor(++S().workspaceToken, {id: Number(d.qpOpen)});
            if (d.qpDl) return downloadFile(Number(d.qpDl), refresh);
            if (d.qpDel) { const r = rows.find(x => x.id === Number(d.qpDel)); if (r) removeQuestionnaire(r, refresh); }
        });
    };

    async function removeQuestionnaire(r, after) {
        try {
            await write('delete', {id: r.id});
            after?.();
            A().undoToast(`Questionnaire « ${r.title} » supprimé`, {undo: async () => { await write('restore', {id: r.id}); after?.(); }});
        } catch (e) { toast(e.message, 'error'); }
    }
    async function downloadFile(id, after) {
        try {
            const r = await write('render', {id, mode: 'file'});
            download(r.filename, r.html, 'text/html;charset=utf-8');
            toast(r.missing_photos ? `Questionnaire téléchargé (${plural(r.missing_photos, 'photo')} n’a pas pu être jointe).` : 'Questionnaire téléchargé : joins-le à un e-mail.', r.missing_photos ? 'error' : '');
            after?.(r);
        } catch (e) { toast(e.message, 'error', {retry: () => downloadFile(id, after)}); }
    }

    /* ═════════════════════════════ Préparer un questionnaire ═════════════════════════════ */
    const personItem = p => (p && p.id ? {id: Number(p.id), title: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(), kind: 'person', gender: p.gender} : null);
    const mediaItem = m => (m && m.id ? {id: Number(m.id), title: m.title || m.filename || 'Photo', filename: m.filename, thumb: m.thumbnail ? `media/${m.thumbnail}` : (m.filename ? `media/${m.filename}` : '')} : null);
    async function blankFrom(e) {
        const ed = {id: 0, title: '', intro: DEFAULT_INTRO, recipient: null, person: null, questions: [], status: 'prepared', email: ''};
        if (e.contactId) ed.recipient = Number(e.contactId);
        if (e.personId) {
            try {
                const p = (await api('person', {id: e.personId})).person;
                ed.person = personItem({...p, name: A().personName ? A().personName(p) : `${p.first_name} ${p.last_name}`});
                ed.title = `Tes souvenirs de ${p.first_name || ed.person.title}`;
                const th = (await loadTemplates()).find(t => t.key === 'personne');
                ed.questions = (th?.questions || []).slice(0, 4).map(q => ({id: '', text: q.text, kind: 'person', theme: 'personne', person: ed.person, person_id: ed.person.id}));
            } catch (_) {}
        }
        return ed;
    }
    function fromServer(q) {
        return {id: q.id, uid: q.uid, title: q.title, intro: q.intro, status: q.status, sent_at: q.sent_at, remind_at: q.remind_at, answered_at: q.answered_at, answered_by: q.answered_by,
            recipient: q.contact_id ? {id: q.contact_id, title: q.contact?.name || q.recipient_name, kind: 'contact', email: q.contact?.email || ''} : (q.recipient_text ? `txt:${q.recipient_text}` : null),
            person: personItem(q.person), email: q.email || '', contact: q.contact, answers: q.answers || {}, memories: q.memories || [], can_undo_import: q.can_undo_import,
            questions: (q.questions || []).map(x => ({id: x.id, text: x.text, kind: x.kind, theme: x.theme, person_id: x.person_id, person: personItem(x.person), media_id: x.media_id, media: mediaItem(x.media)}))};
    }
    const payload = ed => ({id: ed.id, title: ed.title, intro: ed.intro, person_id: ed.person?.id || 0,
        recipient: ed.recipient == null ? '' : typeof ed.recipient === 'object' ? String(ed.recipient.id) : String(ed.recipient),
        questions: ed.questions.map(q => ({id: q.id || '', text: q.text, kind: q.kind || 'text', theme: q.theme || '', person_id: q.person?.id || q.person_id || 0, media_id: q.media?.id || q.media_id || 0}))});

    async function renderEditor(token, e) {
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page qp-page">${UI().spinner('Ouverture du questionnaire…')}</section>`;
        let ed;
        try { ed = e.id ? fromServer((await api('qp_get', {id: e.id})).questionnaire) : await blankFrom(e); }
        catch (x) { ws.innerHTML = `<section class="page">${A().empty(x.message, {icon: '⛔'})}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'listes') return;
        let dirty = !ed.id, seq = 0, timer = 0;
        const draw = () => {
            const isNew = !ed.id;
            ws.innerHTML = `<section class="page qp-page">${UI().pageHeader({title: isNew ? 'Nouveau questionnaire' : ed.title || 'Questionnaire', icon: '💬', detail: true,
                help: 'Choisis à qui tu l’envoies, écris un petit mot, range les questions. À droite : ce que ton proche verra.',
                primary: kiosk() ? '' : `<button type="button" class="button" data-qp-save data-shortcut="⌘S">💾 ${isNew ? 'Créer le questionnaire' : 'Enregistrer'}</button>`,
                actions: ['<button type="button" class="button secondary" data-qp-back>← Tous les questionnaires</button>'],
                more: isNew || kiosk() ? [] : [`<button type="button" class="danger" data-qp-delete>🗑 Supprimer le questionnaire</button>`]})}
            <div class="qp-grid">
                <form class="maintenance-panel qp-form" id="qp-form" novalidate>
                    <h3><span class="qp-step">1</span> Pour qui ?</h3>
                    <div class="qp-field" data-qp-recipient><span class="pk-lab">Destinataire</span>${P().pickerField({name: '', hiddenName: false, kind: 'contact', allowFree: true, value: ed.recipient, placeholder: 'Un contact du Répertoire des vivants, ou son nom…'})}<small class="muted">Choisis-le dans le Répertoire des vivants, ou garde son nom écrit (« ✎ Garder le texte »).</small></div>
                    <div class="qp-field" data-qp-person><span class="pk-lab">Les questions portent sur <small>(facultatif)</small></span>${P().pickerField({name: '', hiddenName: false, kind: 'person', value: ed.person})}<small class="muted">« [Prénom] » dans une question devient son prénom.</small></div>
                    <h3><span class="qp-step">2</span> Le mot d’accueil</h3>
                    <label>Titre<input name="title" required maxlength="200" value="${esc(ed.title)}" placeholder="Tes souvenirs de mémé Marie" data-error="Donne un titre au questionnaire."></label>
                    <label>Mot d’accueil <small class="muted">(après « Bonjour ${esc(greetOf(ed) || 'Anne')}, »)</small><textarea name="intro" rows="4" maxlength="4000">${esc(ed.intro)}</textarea></label>
                    <h3><span class="qp-step">3</span> Les questions <small class="muted" data-qp-count>${esc(plural(ed.questions.length, 'question'))}</small></h3>
                    <ol class="qp-qs" data-qp-qs></ol>
                    <div class="page-actions qp-add"><button type="button" class="button secondary" data-qp-models>＋ Ajouter des questions</button><button type="button" class="button secondary" data-qp-own>＋ Ma question</button></div>
                </form>
                <aside class="qp-side">
                    <section class="maintenance-panel qp-prev-box"><h3>Aperçu <small class="muted">tel que ${esc(greetOf(ed) || 'ton proche')} le verra</small></h3><div class="qp-prev"><iframe sandbox="allow-scripts" title="Aperçu du questionnaire" data-qp-frame></iframe></div></section>
                    <section class="maintenance-panel qp-send"><h3><span class="qp-step">4</span> Envoyer</h3>${sendHtml(ed)}</section>
                    <section class="maintenance-panel qp-back"><h3><span class="qp-step">5</span> Les réponses</h3>${backHtml(ed)}</section>
                </aside>
            </div></section>`;
            drawQuestions();
            preview(0);
        };
        const greetOf = x => { const r = x.recipient; if (r && typeof r === 'object') return String(r.first_name || r.title || '').split(/\s+/)[0]; if (typeof r === 'string') return r.replace(/^txt:/, '').trim().split(/\s+/)[0]; return ''; };
        const sendHtml = x => {
            if (!x.id) return UI().notice('info', 'Crée d’abord le questionnaire (bouton bleu en haut) : tu pourras ensuite le télécharger, l’imprimer et copier le message à envoyer.');
            const email = x.contact?.email || (x.recipient && typeof x.recipient === 'object' ? x.recipient.email : '');
            return `<div class="qp-actions"><button type="button" class="button" data-qp-file>⤓ Télécharger le questionnaire (.html)</button><button type="button" class="button secondary" data-qp-print>🖨 Version imprimable</button></div>
                <label class="qp-mail">Le message à envoyer avec le fichier<textarea rows="8" readonly data-qp-mail>${esc(x.email)}</textarea></label>
                <div class="qp-actions"><button type="button" class="button secondary" data-qp-copy>📋 Copier le message</button>${email ? `<a class="button secondary" data-qp-mailto href="mailto:${esc(encodeURIComponent(email))}?subject=${esc(encodeURIComponent(x.title))}&amp;body=${esc(encodeURIComponent(x.email))}">✉ Écrire à ${esc(email)}</a>` : ''}</div>
                <div class="qp-state"><span>${badge({status: x.status, to_remind: x.status === 'sent' && x.remind_at && x.remind_at <= today()})}</span>
                ${x.status === 'prepared' ? '<button type="button" class="button" data-qp-sent>📤 Marquer comme envoyé</button>' : ''}
                <label>État<select data-qp-status>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}"${x.status === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
                ${x.status !== 'prepared' ? `<div class="qp-dates"><label>Envoyé le<input type="date" data-qp-date="sent_at" value="${esc(x.sent_at)}"></label><label>Relancer le<input type="date" data-qp-date="remind_at" value="${esc(x.remind_at)}"></label></div>` : ''}`;
        };
        const backHtml = x => {
            if (!x.id) return A().empty('Les réponses arriveront ici.', {icon: '📬'});
            const n = Object.values(x.answers || {}).filter(a => a && String(a.answer || '').trim()).length;
            return `<div class="qp-actions"><button type="button" class="button${x.status === 'sent' ? '' : ' secondary'}" data-qp-import>⤒ Importer les réponses</button><button type="button" class="button secondary" data-qp-paste>✎ Coller une réponse reçue par e-mail</button></div>
                ${n ? `<p class="qp-got">${UI().badge('Répondu', 'green')} <b>${esc(plural(n, 'réponse'))}</b>${x.answered_by ? ` de ${esc(x.answered_by)}` : ''}${x.answered_at ? ` · ${esc(when(x.answered_at, 'reçues'))}` : ''}</p>` : A().empty('Pas encore de réponse.', {icon: '📬'})}
                ${x.memories.length ? `<ul class="qp-mems">${x.memories.map(m => `<li><span class="ui-badge is-${m.kind === 'testimony' ? 'blue' : 'green'}">${esc(m.kind_label)}</span> ${esc(m.title)}</li>`).join('')}</ul><div class="qp-actions"><button type="button" class="button small secondary" data-h-open-list="family_memories">↗ Mémoire familiale</button>${x.status === 'answered' ? '<button type="button" class="button small secondary" data-qp-file-away>🗄 Ranger le questionnaire</button>' : ''}</div>` : ''}`;
        };
        const rowHtml = (q, i, n) => `<li class="qp-qrow" data-i="${i}">
            <span class="qp-grip order-grip" draggable="true" title="Glisser pour ranger" aria-hidden="true">⠿</span><span class="qp-num">${i + 1}</span>
            <div class="qp-qmain"><textarea data-qp-text rows="2" maxlength="1000" aria-label="Question ${i + 1}" placeholder="Écris la question…">${esc(q.text)}</textarea>
                <div class="qp-qextra"><select data-qp-kind aria-label="Sorte de question">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}"${(q.kind || 'text') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
                ${q.kind === 'person' ? `<div class="qp-qpk" data-qp-qperson>${P().pickerField({name: '', hiddenName: false, kind: 'person', value: q.person || (q.person_id ? Number(q.person_id) : null), placeholder: ed.person ? `Sinon : ${ed.person.title}` : 'La personne…'})}</div>` : ''}
                ${q.kind === 'photo' ? `<div class="qp-qpk" data-qp-qphoto>${P().mediaField({name: '', types: ['image'], value: q.media || (q.media_id ? Number(q.media_id) : null), person: ed.person?.id || undefined, title: 'La photo de la question', okLabel: 'Prendre cette photo'})}</div>` : ''}</div></div>
            <span class="qp-qbtns"><button type="button" class="icon-button small" data-qp-up aria-label="Monter" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-button small" data-qp-down aria-label="Descendre" ${i < n - 1 ? '' : 'disabled'}>↓</button><button type="button" class="icon-button small" data-qp-rm title="Retirer la question" aria-label="Retirer la question">×</button></span></li>`;
        const drawQuestions = () => {
            const ol = ws.querySelector('[data-qp-qs]'); if (!ol) return;
            ol.innerHTML = ed.questions.length ? ed.questions.map((q, i) => rowHtml(q, i, ed.questions.length)).join('') : `<li class="qp-noq">${A().empty('Pas encore de question.', {icon: '❓', action: {label: '＋ Ajouter des questions', attrs: 'data-empty-click="[data-qp-models]"'}})}</li>`;
            const c = ws.querySelector('[data-qp-count]'); if (c) c.textContent = plural(ed.questions.length, 'question');
        };
        const touch = (redrawRows = false) => { dirty = true; if (redrawRows) drawQuestions(); preview(); };
        const preview = (delay = 650) => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const my = ++seq, fr = ws.querySelector('[data-qp-frame]'); if (!fr) return;
                try { const r = await write('preview', payload(ed)); if (my !== seq || !fr.isConnected) return; fr.srcdoc = r.html; if (!ed.id) ed.email = r.email; }
                catch (x) { if (my === seq && fr.isConnected) fr.srcdoc = `<p style="font:16px Arial;padding:16px">${esc(x.message)}</p>`; }
            }, delay);
        };
        const save = async (quiet = false) => {
            const form = ws.querySelector('#qp-form');
            ed.title = form.elements.title.value.trim(); ed.intro = form.elements.intro.value;
            if (!ed.title) { UI().fail(form.elements.title, 'Donne un titre au questionnaire.'); return false; }
            try {
                const wasNew = !ed.id;
                const r = await write('save', payload(ed));
                const keep = ed;
                ed = fromServer(r.questionnaire);
                ed.answers = r.questionnaire.answers || keep.answers || {};
                dirty = false;
                if (!quiet || wasNew) { const y = window.scrollY; draw(); window.scrollTo(0, y); }
                if (!quiet) toast(wasNew ? 'Questionnaire créé : tu peux le télécharger et l’envoyer.' : 'Enregistré', wasNew ? '' : 'success');
                return true;
            } catch (x) { toast(x.message, 'error', {retry: () => save(quiet)}); return false; }
        };
        const ensureSaved = async () => (dirty || !ed.id ? save(true) : true);
        draw();
        // ── saisie ──
        ws.addEventListener('input', ev => {
            const t = ev.target;
            if (t.name === 'title' || t.name === 'intro') { ed[t.name] = t.value; touch(); return; }
            if (t.matches('[data-qp-text]')) { const i = Number(t.closest('[data-i]').dataset.i); ed.questions[i].text = t.value; touch(); }
        });
        ws.addEventListener('change', async ev => {
            const t = ev.target;
            if (t.matches('[data-qp-kind]')) { const i = Number(t.closest('[data-i]').dataset.i); ed.questions[i].kind = t.value; if (t.value === 'person' && !ed.questions[i].person && ed.person) ed.questions[i].person = ed.person; touch(true); return; }
            if (t.matches('[data-qp-status]')) return setStatus({status: t.value});
            if (t.matches('[data-qp-date]')) return setStatus({status: ed.status, sent_at: ws.querySelector('[data-qp-date="sent_at"]')?.value || '', remind_at: ws.querySelector('[data-qp-date="remind_at"]')?.value || ''});
        });
        ws.addEventListener('picker-change', ev => {
            const box = ev.target.closest?.('[data-qp-recipient],[data-qp-person],[data-qp-qperson]'); if (!box) return;
            const it = ev.detail.item || null, v = ev.detail.value;
            if (box.matches('[data-qp-recipient]')) { ed.recipient = it && !it.free && it.id ? {...it, id: Number(it.id)} : (typeof v === 'string' && v.startsWith('txt:') ? v : null); touch(); return; }
            if (box.matches('[data-qp-person]')) { ed.person = it && it.id ? {id: Number(it.id), title: it.title, kind: 'person'} : null; touch(); return; }
            const i = Number(box.closest('[data-i]').dataset.i); ed.questions[i].person = it && it.id ? {id: Number(it.id), title: it.title, kind: 'person'} : null; ed.questions[i].person_id = ed.questions[i].person?.id || 0; touch();
        });
        ws.addEventListener('media-change', ev => {
            const box = ev.target.closest?.('[data-qp-qphoto]'); if (!box) return;
            const i = Number(box.closest('[data-i]').dataset.i), it = ev.detail.item || null;
            ed.questions[i].media = it ? {id: Number(it.id), title: it.title, filename: it.filename, thumb: it.thumb} : null; ed.questions[i].media_id = ed.questions[i].media?.id || 0; touch();
        });
        // ── ⠿ glisser pour ranger ──
        let dragFrom = -1;
        ws.addEventListener('dragstart', ev => { const g = ev.target.closest?.('.qp-grip'); if (!g) return; dragFrom = Number(g.closest('[data-i]').dataset.i); g.closest('li').classList.add('is-dragging'); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', String(dragFrom)); } catch (_) {} });
        ws.addEventListener('dragover', ev => { const li = ev.target.closest?.('.qp-qrow'); if (dragFrom < 0 || !li) return; ev.preventDefault(); ws.querySelectorAll('.qp-qrow.is-over').forEach(x => x.classList.remove('is-over')); li.classList.add('is-over'); });
        ws.addEventListener('dragend', () => { dragFrom = -1; ws.querySelectorAll('.is-dragging,.is-over').forEach(x => x.classList.remove('is-dragging', 'is-over')); });
        ws.addEventListener('drop', ev => { const li = ev.target.closest?.('.qp-qrow'); if (dragFrom < 0 || !li) return; ev.preventDefault(); const to = Number(li.dataset.i); if (to !== dragFrom) { const [m] = ed.questions.splice(dragFrom, 1); ed.questions.splice(to, 0, m); touch(true); } dragFrom = -1; });
        // ── boutons ──
        ws.addEventListener('click', async ev => {
            const b = ev.target.closest('button'); if (!b || !ws.contains(b)) return;
            const li = b.closest('[data-i]'), i = li ? Number(li.dataset.i) : -1;
            if (b.matches('[data-qp-up]') && i > 0) { [ed.questions[i - 1], ed.questions[i]] = [ed.questions[i], ed.questions[i - 1]]; touch(true); ws.querySelector(`[data-i="${i - 1}"] [data-qp-up]`)?.focus(); return; }
            if (b.matches('[data-qp-down]') && i < ed.questions.length - 1) { [ed.questions[i + 1], ed.questions[i]] = [ed.questions[i], ed.questions[i + 1]]; touch(true); ws.querySelector(`[data-i="${i + 1}"] [data-qp-down]`)?.focus(); return; }
            if (b.matches('[data-qp-rm]')) {
                const [gone] = ed.questions.splice(i, 1); touch(true);
                A().undoToast('Question retirée', {undo: () => { ed.questions.splice(Math.min(i, ed.questions.length), 0, gone); touch(true); }});
                return;
            }
            if (b.matches('[data-qp-own]')) { ed.questions.push({id: '', text: '', kind: 'text', theme: 'mine'}); touch(true); ws.querySelector(`[data-i="${ed.questions.length - 1}"] [data-qp-text]`)?.focus(); return; }
            if (b.matches('[data-qp-models]')) return openModels(ed, list => { ed.questions.push(...list); touch(true); });
            if (b.matches('[data-qp-save]')) return save(false);
            if (b.matches('[data-qp-back]')) { if (dirty && ed.id && !await A().confirmBox('Tes derniers changements ne sont pas enregistrés.', {title: 'Quitter sans enregistrer ?', okLabel: 'Quitter sans enregistrer'})) return; return A().renderList(); }
            if (b.matches('[data-qp-delete]')) return removeQuestionnaire({id: ed.id, title: ed.title}, () => A().renderList());
            if (b.matches('[data-qp-file]')) {
                if (!await ensureSaved()) return;
                return downloadFile(ed.id, () => { if (ed.status === 'prepared') toast('Joins-le à un e-mail, puis note qu’il est parti :', '', {action: {label: '📤 Marquer comme envoyé', run: () => setStatus({status: 'sent', sent_at: today()})}}); });
            }
            if (b.matches('[data-qp-print]')) {
                if (!await ensureSaved()) return;
                return UI().openPrintDialog({title: `Questionnaire « ${ed.title} » à imprimer`, html: async () => (await write('preview', {...payload(ed), mode: 'print'})).html});
            }
            if (b.matches('[data-qp-copy]')) return copyText(ed.email, ws.querySelector('[data-qp-mail]'));
            if (b.matches('[data-qp-sent]')) return setStatus({status: 'sent', sent_at: today()});
            if (b.matches('[data-qp-file-away]')) return setStatus({status: 'filed'});
            if (b.matches('[data-qp-import]')) { if (!await ensureSaved()) return; return importAnswers({after: reload}); }
            if (b.matches('[data-qp-paste]')) { if (!await ensureSaved()) return; return pasteAnswer(ed, reload); }
        });
        const setStatus = async body => {
            if (!await ensureSaved()) return;
            const before = {status: ed.status, sent_at: ed.sent_at, remind_at: ed.remind_at};
            try {
                const r = await write('status', {id: ed.id, ...body});
                Object.assign(ed, {status: r.questionnaire.status, sent_at: r.questionnaire.sent_at, remind_at: r.questionnaire.remind_at});
                redrawSide();
                const label = (STATUS[ed.status] || STATUS.prepared)[0];
                A().undoToast(body.status !== before.status ? `Questionnaire : ${label.toLowerCase()}${ed.status === 'sent' && ed.remind_at ? ` (relance ${when(ed.remind_at)})` : ''}` : 'Dates enregistrées', {icon: '📤', undo: async () => { const u = await write('status', {id: ed.id, ...before}); Object.assign(ed, {status: u.questionnaire.status, sent_at: u.questionnaire.sent_at, remind_at: u.questionnaire.remind_at}); redrawSide(); }});
            } catch (x) { toast(x.message, 'error'); }
        };
        const redrawSide = () => { const s1 = ws.querySelector('.qp-send'), s2 = ws.querySelector('.qp-back'); if (s1) s1.innerHTML = `<h3><span class="qp-step">4</span> Envoyer</h3>${sendHtml(ed)}`; if (s2) s2.innerHTML = `<h3><span class="qp-step">5</span> Les réponses</h3>${backHtml(ed)}`; };
        const reload = async () => {
            if (!ws.querySelector('.qp-page')) return;
            try { const q = (await api('qp_get', {id: ed.id})).questionnaire; const keepQ = dirty ? ed.questions : null; const n = fromServer(q); if (keepQ) n.questions = keepQ; ed = n; redrawSide(); } catch (_) {}
        };
        ws.addEventListener('keydown', ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's' && ws.querySelector('.qp-page') && !kiosk()) { ev.preventDefault(); save(false); } });
    }

    /* ═════════════════════════════ Modèles de questions ═════════════════════════════ */
    async function openModels(ed, onAdd = null) {
        let themes;
        try { themes = await loadTemplates(); } catch (e) { toast(e.message, 'error'); return; }
        let cur = ed ? (themes[0]?.key || '') : 'mine';
        const first = ed?.person?.title ? ed.person.title.split(/\s+/)[0] : '';
        const shown = t => (first ? t.replace(/\[Pr[ée]nom\]/gi, first) : t);
        const checked = new Set();
        const all = () => themes.flatMap(t => t.questions.map(q => ({...q, theme: t.key})));
        const body = `<div class="qp-models"><div class="ui-filters" data-qpm-filters></div><div class="qp-mlist" data-qpm-list></div>
            <fieldset class="qp-mown"><legend>✎ Écrire ma question</legend><textarea rows="2" maxlength="1000" data-qpm-text placeholder="Te souviens-tu de la ferme de la Borie ?"></textarea>
            <div class="qp-mown-row"><label>Sorte<select data-qpm-kind>${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><button type="button" class="button secondary" data-qpm-keep>＋ Garder dans mes questions</button></div>
            <small class="muted">Écris « [Prénom] » pour mettre le prénom de la personne choisie.</small></fieldset></div>`;
        const dlg = ext.openDialog({eyebrow: 'QUESTIONS AUX PROCHES', title: ed ? 'Ajouter des questions' : 'Mes questions', wide: true, body,
            submitLabel: ed ? 'Ajouter les questions cochées' : 'Fermer',
            onSubmit: () => {
                if (!ed) return true;
                const list = all().filter(q => checked.has(q.k)).map(q => ({id: '', text: q.text, kind: q.kind || 'text', theme: q.theme === 'mine' ? 'mine' : q.theme, person: q.kind === 'person' ? ed.person : null, person_id: q.kind === 'person' ? ed.person?.id || 0 : 0}));
                if (!list.length) return UI().fail(dlg.querySelector('[data-qpm-k]') || dlg.querySelector('[data-qpm-text]'), 'Coche au moins une question (ou écris la tienne en dessous).');
                onAdd?.(list);
                toast(`${plural(list.length, 'question ajoutée', 'questions ajoutées')}.`);
                return true;
            }});
        const $ = s => dlg.querySelector(s);
        const paint = () => {
            $('[data-qpm-filters]').innerHTML = themes.map(t => `<button type="button" class="${cur === t.key ? 'is-active' : ''}" data-qpm-theme="${esc(t.key)}">${esc(t.icon)} ${esc(t.label)} (${t.questions.length})</button>`).join('');
            const th = themes.find(t => t.key === cur) || themes[0];
            $('[data-qpm-list]').innerHTML = th.questions.length ? th.questions.map(q => `<div class="qp-model">${ed ? `<label class="checkbox-line"><input type="checkbox" data-qpm-k="${esc(q.k)}"${checked.has(q.k) ? ' checked' : ''}> <span>${esc(shown(q.text))}</span></label>` : `<span>${esc(q.text)}</span>`}
                ${q.kind && q.kind !== 'text' ? `<small class="muted">${esc(KIND_LABEL[q.kind])}</small>` : ''}${q.mine ? `<button type="button" class="icon-button small" data-qpm-del="${q.id}" title="Supprimer cette question de mes questions" aria-label="Supprimer">🗑</button>` : ''}</div>`).join('')
                : A().empty('Pas encore de question à toi : écris-la juste en dessous.', {icon: '✎', action: {label: '＋ Écrire ma question', attrs: 'data-empty-focus="[data-qpm-text]"'}});
            label();
        };
        const label = () => { const sub = dlg.querySelector('[type=submit]'); if (sub && ed) sub.textContent = checked.size ? `Ajouter ${plural(checked.size, 'question')}` : 'Ajouter les questions cochées'; };
        paint();
        dlg.addEventListener('change', e => { const c = e.target.closest('[data-qpm-k]'); if (c) { if (c.checked) checked.add(c.dataset.qpmK); else checked.delete(c.dataset.qpmK); label(); } });
        dlg.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.qpmTheme) { cur = b.dataset.qpmTheme; paint(); return; }
            if (b.matches('[data-qpm-keep]')) {
                const ta = $('[data-qpm-text]'); const text = ta.value.trim();
                if (!text) { UI().fail(ta, 'Écris la question.'); return; }
                try { const r = await write('template_save', {text, kind: $('[data-qpm-kind]').value, theme: 'mine'}); TEMPLATES = themes = r.themes; ta.value = ''; cur = 'mine'; if (ed) checked.add('t' + r.id); paint(); toast('Question gardée dans « Mes questions ».', 'success'); }
                catch (x) { toast(x.message, 'error'); }
                return;
            }
            if (b.dataset.qpmDel) {
                try {
                    const r = await write('template_delete', {id: Number(b.dataset.qpmDel)}); TEMPLATES = themes = r.themes; checked.delete('t' + b.dataset.qpmDel); paint();
                    const gone = r.removed;
                    A().undoToast('Question supprimée de mes questions', {undo: async () => { const u = await write('template_save', {text: gone.text, kind: gone.kind, theme: gone.theme}); TEMPLATES = themes = u.themes; if (dlg.isConnected) paint(); }});
                } catch (x) { toast(x.message, 'error'); }
            }
        });
    }

    /* ═════════════════════════════ Le retour des réponses ═════════════════════════════ */
    function choicesHtml(r) {
        const kinds = Object.entries(r.kinds || {});
        return `<div class="qp-imp">${r.answers.map(a => {
            const s = a.suggest || {dest: 'memory', kind: 'story'};
            const person = a.person ? {id: a.person.id, title: a.person.name, kind: 'person'} : null;
            return `<article class="qp-ans" data-qp-ans="${esc(a.id)}"><p class="qp-ans-q">${esc(a.question)}</p><blockquote class="qp-ans-a">${nl(a.answer.length > 900 ? a.answer.slice(0, 900) + '…' : a.answer)}</blockquote>
                <div class="qp-ans-dest"><label>Où la ranger<select data-qp-dest>${DEST.map(([k, l]) => `<option value="${k}"${s.dest === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <div class="qp-ans-person" data-qp-dperson ${s.dest === 'testimony' ? '' : 'hidden'}><span class="pk-lab">Sur la fiche de</span>${P().pickerField({name: '', hiddenName: false, kind: 'person', value: person, inline: true})}</div>
                <label class="qp-ans-kind" data-qp-dkind ${s.dest === 'memory' ? '' : 'hidden'}>Sorte<select data-qp-kindsel>${kinds.map(([k, l]) => `<option value="${esc(k)}"${s.kind === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div></article>`;
        }).join('')}</div>`;
    }
    function bindChoices(box) {
        box.addEventListener('change', e => {
            const sel = e.target.closest('[data-qp-dest]'); if (!sel) return;
            const art = sel.closest('[data-qp-ans]');
            art.querySelector('[data-qp-dperson]').hidden = sel.value !== 'testimony';
            art.querySelector('[data-qp-dkind]').hidden = sel.value !== 'memory';
        });
    }
    function readChoices(box) {
        const out = []; let bad = null;
        box.querySelectorAll('[data-qp-ans]').forEach(art => {
            const dest = art.querySelector('[data-qp-dest]').value;
            const pk = art.querySelector('[data-qp-dperson] .pk');
            const v = pk ? P().pickerValue(pk) : null;
            const pid = typeof v === 'number' ? v : Number(v) || 0;
            if (dest === 'testimony' && !pid && !bad) bad = pk;
            out.push({id: art.dataset.qpAns, dest, person_id: dest === 'testimony' ? pid : 0, kind: art.querySelector('[data-qp-kindsel]')?.value || 'story'});
        });
        return {choices: out, bad};
    }
    /** ⤒ Importer les réponses : la fenêtre commune en 3 étapes (K13). paste : réponse collée d'un e-mail. */
    function importAnswers({files = null, paste = null, after = null} = {}) {
        return UI().openImportDialog({title: 'Importer les réponses', accept: '.json,application/json', what: 'le fichier « reponses-….json »', noun: 'réponse', feminine: true, files,
            intro: 'Le fichier de réponses que ton proche t’a renvoyé (il s’appelle « reponses-… .json »).',
            analyze: async fl => {
                let body;
                if (paste) body = {paste};
                else {
                    const f = fl[0];
                    if (!f) throw new Error('Aucun fichier.');
                    if (f.size > 600 * 1024) throw new Error('ce fichier est trop gros pour un fichier de réponses (600 Ko au plus).');
                    body = {file: await f.text()};
                }
                const r = await write('analyze', body);
                const n = r.answers.length;
                return {count: n, noun: 'réponse', feminine: true, ok: n > 0, data: {body, r},
                    summaryHtml: n ? `<b>${esc(plural(n, 'réponse'))}</b> de <b>${esc(r.from || 'ton proche')}</b> au questionnaire « ${esc(r.questionnaire.title)} » (${esc(r.date_label)}). Choisis où va chacune` : 'Aucune réponse écrite dans ce fichier',
                    notices: r.unknown ? [{kind: 'warn', text: `${plural(r.unknown, 'réponse')} à une question retirée depuis l’envoi : mise de côté.`}] : [],
                    preview: n ? choicesHtml(r) : '', onShow: bindChoices, goLabel: n ? `⤒ Importer ${plural(n, 'réponse')}` : '⤒ Importer'};
            },
            run: async (an, fl, box) => {
                const {choices, bad} = readChoices(box);
                if (bad) { UI().fail(bad.querySelector('input[type=hidden]') || bad, 'Choisis la personne concernée (ou « Mémoire familiale »).'); return {keepOpen: true}; }
                const res = await write('import', {...an.data.body, choices});
                after?.(res);
                const c = res.counts || {};
                const parts = [c.testimony ? plural(c.testimony, 'témoignage') : '', c.memory ? plural(c.memory, 'souvenir') : ''].filter(Boolean);
                return {message: parts.length ? `${parts.join(' et ')} ${c.testimony + c.memory > 1 ? 'ajoutés' : 'ajouté'} (réponses de ${res.from || 'ton proche'})` : 'Réponses gardées avec le questionnaire.',
                    undo: async () => { await write('undo_import', {id: res.id}); after?.(); A().refreshPersonIfOpen?.(); }};
            }});
    }
    /** ✎ Coller une réponse reçue par e-mail : le texte, la question à laquelle il répond, l'auteur et la date. */
    function pasteAnswer(ed, after) {
        const qs = ed.questions.filter(q => q.id);
        ext.openDialog({eyebrow: 'QUESTIONS AUX PROCHES', title: 'Coller une réponse reçue par e-mail', submitLabel: 'Continuer →',
            body: `<p class="muted">Colle ici ce que ${esc(greet(ed) || 'ton proche')} t’a répondu. Si c’est le contenu d’un fichier de réponses (.json), il est lu comme le fichier.</p>
                <label>Elle répond à<select name="qid"><option value="free">Tout le message (une seule réponse)</option>${qs.map((q, i) => `<option value="${esc(q.id)}">${i + 1}. ${esc(q.text.length > 90 ? q.text.slice(0, 90) + '…' : q.text)}</option>`).join('')}</select></label>
                <label>Le texte reçu<textarea name="text" rows="9" required maxlength="20000" data-error="Colle le texte de la réponse."></textarea></label>
                <div class="form-grid"><label>De<input name="from" maxlength="120" value="${esc(ed.answered_by || (ed.recipient && typeof ed.recipient === 'object' ? ed.recipient.title : String(ed.recipient || '').replace(/^txt:/, '')))}"></label><label>Reçue le<input type="date" name="date" value="${today()}"></label></div>`,
            onSubmit: form => {
                const text = form.elements.text.value.trim();
                if (!text) return UI().fail(form.elements.text, 'Colle le texte de la réponse.');
                if (/^\s*\{[\s\S]*"format"\s*:\s*"lcnda-reponses"/.test(text)) { setTimeout(() => importAnswers({files: [new File([text], 'reponses.json', {type: 'application/json'})], after}), 0); return true; }
                const paste = {questionnaire_id: ed.id, from: form.elements.from.value.trim(), date: form.elements.date.value, answers: [{id: form.elements.qid.value, answer: text}]};
                setTimeout(() => importAnswers({files: [new File([text], 'réponse collée.txt', {type: 'text/plain'})], paste, after}), 0);
                return true;
            }});
    }
    const greet = ed => { const r = ed.recipient; if (r && typeof r === 'object') return String(r.title || '').split(/\s+/)[0]; return String(r || '').replace(/^txt:/, '').trim().split(/\s+/)[0]; };

    /* ═════════════════════════════ Fiche et Répertoire des vivants ═════════════════════════════ */
    document.addEventListener('click', e => {
        const a = e.target.closest?.('[data-qp-ask-person]');
        if (a) { e.preventDefault(); openListPage({id: 0, personId: Number(a.dataset.qpAskPerson)}); return; }
        const c = e.target.closest?.('[data-qp-new-contact]');
        if (c) { e.preventDefault(); openListPage({id: 0, contactId: Number(c.dataset.qpNewContact)}); return; }
        const l = e.target.closest?.('[data-qp-contact-list]');
        if (l) { e.preventDefault(); S().qpContactFilter = {id: Number(l.dataset.qpContactList), title: l.dataset.qpContactName || 'Contact', kind: 'contact'}; openListPage(); }
    });
    /** la case « Questionnaires » du Répertoire des vivants (app-listes.js) */
    ext.qpContactCell = row => {
        const list = String(row.questionnaire_statuses || '').split(',').filter(Boolean);
        if (!list.length) return '<small class="muted">—</small>';
        const n = {}; list.forEach(s => { n[s] = (n[s] || 0) + 1; });
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
        return `<button type="button" class="table-link" data-qp-contact-list="${Number(row.id)}" data-qp-contact-name="${esc(name)}">${esc(plural(list.length, 'questionnaire'))}</button> <span class="qp-cell-badges">${Object.keys(STATUS).filter(k => n[k]).map(k => UI().badge(`${n[k]} ${STATUS[k][0].toLowerCase()}`, STATUS[k][1])).join(' ')}</span>`;
    };
    // ↗ Ouvrir d'un contact (menu de choix) : le Répertoire des vivants
    document.addEventListener('picker-open', e => { if (e.detail?.kind !== 'contact') return; e.preventDefault(); S().listType = 'living_contacts'; A().setModule('listes'); });

    // au catalogue des listes (même point d'enregistrement que les autres modules)
    const reg = () => {
        const app = A(); if (!app?.defaultListTypes) return false;
        if (!app.defaultListTypes.some(x => x[0] === 'family_questions')) app.defaultListTypes.push(['family_questions', '19b', 'Questions aux proches']);
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg);
    window.LCNDA_QUESTIONS = {importAnswers, openModels, openListPage};
})();
