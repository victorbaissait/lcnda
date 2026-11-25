/* LCNDA — 🤖 L'assistant IA (serveur : lib/assistant_ia.php ; style : assets/css/assistant-ia.css ; maquette validée :
 * docs/design/assistant-ia.html). L'IA tourne SUR CET ORDINATEUR (Ollama, le même que pour la lecture approfondie des actes) :
 *  - 🤖 Assistant : bouton de la barre du haut (et « ⋯ → 🤖 Demander à propos de cette personne » sur une fiche) → une fenêtre à
 *    côté de l'arbre ; la réponse cite les fiches (puces bleues) et les sources (puces vertes) ; le jaune marque ce qui est supposé ;
 *    les actions proposées (ajouter seulement) passent par « voici exactement ce qui sera écrit », puis ↶ Annuler ;
 *  - 🕵️ Généalogiste IA (⋯ de la fiche) : ce qu'il fait, sur l'ordinateur ou 🌐 Open Archives, puis les pistes avec leur preuve ;
 *  - ✍️ Récit de vie par l'IA (⋯ de la fiche) → une note « 📖 Biographie à relire » ;
 *  - Réglages → « 🤖 IA » : sur cet ordinateur / en ligne (bientôt) / éteint, le modèle, le test d'Ollama, l'installation guidée,
 *    Open Archives, l'historique, le journal des envois (localStorage « genealogie-assistant-ia »).
 * Pour d'autres fichiers : LCNDA_EXT.assistantIA. Essai : tests/test-assistant-ia.js
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const A = () => root.LCNDA_APP || {};
    const UI = () => root.LCNDA_UI || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => (r && r.result !== undefined ? r.result : r));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : null);
    const KEY = 'genealogie-assistant-ia';
    const TAB = ['assistant_ia', '26b', '🤖 IA'];
    const DEF = {mode: 'local', model: '', openarch: true, history: true};
    function settings() { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } return {...DEF, ...s}; }
    function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
    const isOn = () => settings().mode === 'local';
    const model = () => settings().model || (() => { try { return localStorage.getItem('genealogie-tx-deep-model') || ''; } catch (_) { return ''; } })();
    const link = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label));
    const notice = (kind, html) => `<div class="aia-notice is-${kind}">${html}</div>`;
    const fmtDate = s => { try { return new Date(s).toLocaleString(document.documentElement.lang || 'fr', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); } catch (_) { return String(s || ''); } };

    /* ═════════ Ollama est-il là ? ═════════ */
    let STATUS = null, STATUS_AT = 0;
    async function status(force = false) {
        if (!force && STATUS && Date.now() - STATUS_AT < 60000) return STATUS;
        try { STATUS = await get('aia_status', {model: model()}); } catch (e) { STATUS = {ready: false, message: e.message, ollama: null}; }
        STATUS_AT = Date.now();
        return STATUS;
    }
    const whereLine = st => (st?.ready ? `🖥 ${esc(T('Sur cet ordinateur'))} · ${esc(st.model?.label || st.model?.tag || '')}` : `🖥 ${esc(T('IA pas prête'))}`);
    function setup() { // l'installation guidée : celle de la lecture approfondie (Ollama + modèle, lib/htr_setup.php, tx_deep_pull)
        if (ext.txActe?.openDeep) return ext.txActe.openDeep({setupOnly: true});
        root.open(STATUS?.setup_url || 'https://ollama.com/download', '_blank', 'noopener');
    }
    /** le message clair quand l'IA n'est pas prête (Ollama absent, arrêté, sans modèle) */
    function offHtml(st) {
        const o = st?.ollama || {};
        const head = o.local_only === false ? T('L’adresse d’Ollama n’est pas sur cet ordinateur : l’assistant reste éteint.')
            : !o.installed ? T('L’IA n’est pas encore installée sur cet ordinateur.') : !o.running ? T('Ollama est installé mais ne tourne pas.') : T('Aucun modèle d’IA n’est encore téléchargé.');
        return notice('info', `<b>${esc(head)}</b> ${esc(T('L’assistant utilise l’IA qui tourne sur ton ordinateur (Ollama), la même que pour la lecture approfondie des actes : rien ne part sur Internet.'))}
            <div class="aia-row"><button type="button" class="button small" data-aia-setup>🧭 ${esc(T('Installation guidée'))}</button><button type="button" class="button small secondary" data-aia-recheck>↻ ${esc(T('Vérifier à nouveau'))}</button>${!o.installed ? link(st?.setup_url || 'https://ollama.com/download', '↗ ollama.com') : ''}</div>`);
    }

    /* ═════════ une réponse vérifiée → du HTML (puces bleues : fiches ; vertes : sources ; jaune : supposé) ═════════ */
    const foldTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function answerHtml(ans, {how = null} = {}) {
        if (!ans) return '';
        const names = Object.fromEntries((ans.persons || []).map(p => [p.id, p.name]));
        const paras = (ans.paras || []).map(p => {
            const body = p.sents.map(s => {
                let before = '';
                const inner = s.segs.map(g => {
                    if (g.t === 'txt') { before += g.s; return esc(g.s); }
                    if (g.t === 'p') { const n = names[g.id] || ''; const last = foldTxt(n.split(' ').pop()); const short = last && foldTxt(before.slice(-80)).includes(last);
                        return ` <button type="button" class="aia-chip is-p" data-aia-person="${g.id}" title="${esc(T('Ouvrir la fiche de {n}', {n}))}">👤${short ? '' : ' ' + esc(n)}</button>`; }
                    return `<button type="button" class="aia-chip is-s" data-aia-source="${g.id}" title="${esc(T('Ouvrir la source'))}">S${g.n}</button>`;
                }).join('');
                return s.k === 'supposed' ? `<span class="aia-sup" title="${esc(s.invented ? T('Supposé : un renvoi inventé a été retiré de cette phrase') : T('Supposé : aucune fiche ni source ne le prouve'))}">${inner}</span>` : `<span>${inner}</span>`;
            }).join(' ');
            return p.bullet ? `<li>${body}</li>` : `<p>${body}</p>`;
        });
        let html = ''; let list = [];
        paras.forEach(h => { if (h.startsWith('<li>')) list.push(h); else { if (list.length) { html += `<ul>${list.join('')}</ul>`; list = []; } html += h; } });
        if (list.length) html += `<ul>${list.join('')}</ul>`;
        const src = ans.sources?.length ? `<div class="aia-sources"><b>${esc(T('Sources citées'))}</b>${ans.sources.map(s => `<button type="button" class="aia-srcline" data-aia-source="${s.id}"><span class="aia-chip is-s">S${s.n}</span> ${esc(s.title || T('Source n° {n}', {n: s.id}))}</button>`).join('')}</div>` : '';
        const warn = ans.removed?.length ? `<p class="aia-warn">⚠️ ${esc(T('{n} renvoi(s) inventé(s) retiré(s) : {l}. La phrase est marquée « supposé ».', {n: ans.removed.length, l: ans.removed.join(', ')}))}</p>` : '';
        const legend = ans.supposed ? `<p class="aia-legend">${esc(T('Le jaune marque ce qui est supposé.'))}</p>` : '';
        const howHtml = how?.length ? `<details class="aia-how"><summary>${esc(T('Comment j’ai trouvé ({n} recherches dans ta base)', {n: how.filter(x => x.tool).length || how.length}))}</summary><ul>${how.map(stepLi).join('')}</ul></details>` : '';
        return `<div class="aia-answer">${html}</div>${warn}${legend}${src}${howHtml}`;
    }
    const WHERE = {local: () => T('sur l’ordinateur'), net: () => `🌐 ${T('Internet')}`, links: () => T('liens seulement')};
    const stepLi = x => `<li class="aia-step"><span class="aia-step-i">${esc(x.icon || '✓')}</span> <span><b>${esc(x.label)}</b>${x.detail ? ` <small class="muted">${esc(x.detail)}</small>` : ''}</span>${x.where ? ` <span class="aia-tag is-${esc(x.where)}">${esc((WHERE[x.where] || (() => x.where))())}</span>` : ''}</li>`;

    /* ═════════ les actions proposées : « voici exactement ce qui sera écrit », puis ↶ ═════════ */
    function proposalHtml(p) {
        const st = p.status === 'added' ? `<p class="aia-done">✓ ${esc(T('Fait, noté dans le journal.'))} <button type="button" class="button small secondary" data-aia-undo="${esc(p.batch)}">↶ ${esc(T('Annuler'))}</button></p>`
            : p.status === 'ignored' ? `<p class="aia-done is-no">${esc(T('Laissé tel quel.'))} <button type="button" class="button small secondary" data-aia-unignore="${p.id}">↶</button></p>`
            : `<div class="aia-row"><button type="button" class="button small" data-aia-prop="${p.id}">✓ ${esc(T('Voir et ajouter'))}</button><button type="button" class="button small secondary" data-aia-ignore="${p.id}">${esc(T('Non'))}</button><button type="button" class="button small secondary" data-aia-person="${p.person_id}">${esc(T('Ouvrir la fiche'))}</button></div>`;
        return `<div class="aia-prop is-${esc(p.status)}" data-aia-propbox="${p.id}"><p><b>${esc(T('Action proposée :'))}</b> ${esc(p.summary)}${p.raison ? ` <small class="muted">— ${esc(p.raison)}</small>` : ''}</p>${st}</div>`;
    }
    const FIELD_LABELS = {date: () => T('Date'), lieu: () => T('Lieu'), titre: () => T('Titre'), texte: () => T('Texte'), raison: () => T('Pourquoi (la preuve)')};
    function openProposal(conv, p, after) {
        const fields = p.quoi === 'evenement' ? ['date', 'lieu', 'raison'] : p.quoi === 'note' || p.quoi === 'source' ? ['titre', 'texte', 'raison'] : ['titre', 'texte', 'raison'];
        const val = k => (k === 'raison' ? p.raison : p.fields[k]) || '';
        const body = `<div class="aia-preview"><p class="muted">${esc(T('Voici exactement ce qui sera écrit :'))}</p><ul class="aia-lines">${p.lines.map(([ic, t]) => `<li>${ic ? `<span>${esc(ic)}</span> ` : ''}${esc(t)}${/à vérifier/.test(t) ? '' : ''}</li>`).join('')}</ul>
            <details class="aia-edit"><summary>✎ ${esc(T('Changer d’abord'))}</summary>${fields.map(k => `<label class="aia-field">${esc(FIELD_LABELS[k]())}${k === 'texte' ? `<textarea name="${k}" rows="6">${esc(val(k))}</textarea>` : `<input name="${k}" value="${esc(val(k))}">`}</label>`).join('')}</details>
            <p class="ui-hint">${esc(T('Tu peux changer chaque ligne avant d’accepter. Après, « ↶ » enlève tout d’un coup. Tout est marqué « proposé par l’assistant » et « à vérifier ».'))}</p></div>`;
        ext.openDialog({eyebrow: T('ASSISTANT IA'), title: `＋ ${T('Ajouter à la fiche de {n}', {n: p.person})}`, wide: false, body, submitLabel: `✓ ${T('Ajouter')}`, onSubmit: async form => {
            const f = {}; fields.forEach(k => { const el = form.querySelector(`[name="${k}"]`); if (el) f[k] = el.value; });
            const r = await post('aia_apply', {conv_id: conv.id, proposal: p.id, fields: f});
            A().undoToast?.(T('Ajouté à la fiche de {n} : {s}', {n: p.person, s: r.summary}), {icon: '🤖', undo: async () => { await post('aia_undo', {batch: r.batch}); after?.(); }});
            after?.(r);
            return true;
        }});
    }
    async function onPropClick(e, getConv, redraw) {
        const b = e.target.closest('[data-aia-prop], [data-aia-ignore], [data-aia-unignore], [data-aia-undo]'); if (!b) return false;
        const conv = getConv(); if (!conv) return true;
        try {
            if (b.dataset.aiaProp) { const p = conv.proposals.find(x => x.id === Number(b.dataset.aiaProp)); if (p) openProposal(conv, p, () => redraw(true)); }
            else if (b.dataset.aiaIgnore) { const id = Number(b.dataset.aiaIgnore); await post('aia_proposal_mark', {conv_id: conv.id, proposal: id, status: 'ignored'}); A().undoToast?.(T('Laissé tel quel.'), {undo: async () => { await post('aia_proposal_mark', {conv_id: conv.id, proposal: id, status: 'proposed'}); redraw(true); }}); redraw(true); }
            else if (b.dataset.aiaUnignore) { await post('aia_proposal_mark', {conv_id: conv.id, proposal: Number(b.dataset.aiaUnignore), status: 'proposed'}); redraw(true); }
            else if (b.dataset.aiaUndo) { await post('aia_undo', {batch: b.dataset.aiaUndo}); toast(T('Ajout retiré de la fiche.')); redraw(true); }
        } catch (err) { toast(err.message, 'error'); }
        return true;
    }
    /** une source citée : son titre, son texte, son adresse, les fiches qui la citent */
    async function openSource(id) {
        let r; try { r = await get('aia_source', {id}); } catch (e) { return toast(e.message, 'error'); }
        const s = r.source;
        const dlg = ext.openDialog({eyebrow: T('SOURCE CITÉE'), title: s.title || T('Source n° {n}', {n: s.id}), submitLabel: T('Fermer'), onSubmit: () => true,
            body: `<div class="aia-srcbox">${s.author || s.agency ? `<p class="muted">${esc([s.author, s.agency].filter(Boolean).join(' · '))}</p>` : ''}${s.url ? `<p>${link(s.url, '↗ ' + T('ouvrir la source'))}</p>` : ''}${s.text ? `<pre class="aia-srctext">${esc(s.text)}</pre>` : ''}
                ${s.people?.length ? `<p>${esc(T('Citée sur :'))} ${s.people.map(p => `<button type="button" class="aia-chip is-p" data-aia-person="${p.id}">👤 ${esc(p.name)}</button>`).join(' ')}</p>` : ''}</div>`});
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-aia-person]'); if (b) { dlg.close(); A().openPersonById?.(Number(b.dataset.aiaPerson)); } });
    }
    function onChipClick(e) {
        const p = e.target.closest('[data-aia-person]'); if (p) { A().openPersonById?.(Number(p.dataset.aiaPerson)); return true; }
        const s = e.target.closest('[data-aia-source]'); if (s) { openSource(Number(s.dataset.aiaSource)); return true; }
        return false;
    }

    /** avance pas à pas jusqu'à la réponse (chaque pas : un appel au modèle, ou une étape du généalogiste) */
    async function runSteps(conv, onUpdate) {
        for (let i = 0; i < 60; i++) {
            const t = conv.turns[conv.turns.length - 1];
            if (!t || t.state !== 'working') return conv;
            const r = await post('aia_step', {conv_id: conv.id, openarch: settings().openarch});
            conv = r.conv; onUpdate?.(conv, r);
        }
        return conv;
    }

    /* ═════════ 🤖 la fenêtre de l'assistant ═════════ */
    let PANEL = null, CONV = null, BUSY = false, PERSON = 0;
    const SUGGEST = () => [T('Qui de mes ancêtres a vécu en Bretagne avant 1800 ?'), T('Quels métiers revenaient le plus ?'), T('Qu’est-ce qui cloche dans mon arbre ?'), T('Résume la branche maternelle')];
    function panelEl() {
        if (PANEL?.isConnected) return PANEL;
        PANEL = document.createElement('aside');
        PANEL.className = 'aia-panel'; PANEL.setAttribute('role', 'dialog'); PANEL.setAttribute('aria-label', T('Assistant IA'));
        PANEL.innerHTML = `<header class="aia-head"><div><b>🤖 ${esc(T('Assistant'))}</b><small class="aia-where" data-aia-where></small></div>
                <div class="aia-head-acts"><button type="button" class="aia-ibtn" data-aia-new title="${esc(T('Nouvelle conversation'))}">＋</button><button type="button" class="aia-ibtn" data-aia-hist title="${esc(T('🤖 Mes conversations'))}">🕘</button><button type="button" class="aia-ibtn" data-aia-settings title="${esc(T('Réglages'))}">⚙️</button><button type="button" class="aia-ibtn" data-aia-close title="${esc(T('Fermer'))}" aria-label="${esc(T('Fermer'))}">×</button></div></header>
            <div class="aia-thread" data-aia-thread></div>
            <div class="aia-suggest" data-aia-suggest></div>
            <form class="aia-ask" data-aia-form><textarea name="q" rows="2" placeholder="${esc(T('Pose ta question…'))}"></textarea><button type="submit" class="button">${esc(T('Envoyer'))}</button></form>
            <p class="aia-foot">${esc(T('Il ne voit pas les vivants ni les fiches 🔒. Il n’écrit rien sans un clic. Il peut se tromper : les puces et les sources sont là pour vérifier.'))}</p>`;
        document.body.appendChild(PANEL);
        PANEL.addEventListener('click', async e => {
            if (await onPropClick(e, () => CONV, () => reloadConv())) return;
            if (onChipClick(e)) return;
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-aia-close]')) return closePanel();
            if (b.matches('[data-aia-new]')) { CONV = null; PERSON = 0; return drawThread(); }
            if (b.matches('[data-aia-hist]')) return drawHistory();
            if (b.matches('[data-aia-settings]')) return openSettings();
            if (b.matches('[data-aia-setup]')) return setup();
            if (b.matches('[data-aia-recheck]')) { await status(true); return drawThread(); }
            if (b.matches('[data-aia-suggestion]')) { const ta = PANEL.querySelector('textarea'); ta.value = b.textContent.trim(); return ask(); }
            if (b.matches('[data-aia-open]')) { try { CONV = (await get('aia_conv', {id: b.dataset.aiaOpen})).conv; } catch (err) { return toast(err.message, 'error'); } return drawThread(); }
            if (b.matches('[data-aia-del]')) {
                const id = b.dataset.aiaDel;
                try { const r = await post('aia_conv_delete', {id}); if (CONV?.id === id) CONV = null; drawHistory();
                    A().undoToast?.(T('Conversation effacée.'), {icon: '🗑', undo: async () => { await post('aia_conv_restore', {data: r.restore}); drawHistory(); }}); } catch (err) { toast(err.message, 'error'); }
            }
        });
        PANEL.querySelector('[data-aia-form]').addEventListener('submit', e => { e.preventDefault(); ask(); });
        PANEL.querySelector('textarea').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && PANEL?.classList.contains('is-open') && !document.querySelector('dialog[open]')) closePanel(); });
        return PANEL;
    }
    async function openPanel({person_id = 0, question = ''} = {}) {
        if (!isOn()) { toast(T('L’assistant IA est éteint (Réglages → 🤖 IA).')); return openSettings(); }
        const p = panelEl(); p.classList.add('is-open'); document.body.classList.add('aia-open');
        if (person_id && person_id !== PERSON) { CONV = null; }
        PERSON = Number(person_id) || PERSON;
        await status();
        drawThread();
        if (question) { p.querySelector('textarea').value = question; }
        p.querySelector('textarea').focus();
    }
    function closePanel() {
        if (!PANEL) return;
        PANEL.classList.remove('is-open'); document.body.classList.remove('aia-open');
        if (CONV && !settings().history) { post('aia_conv_delete', {id: CONV.id}).catch(() => {}); CONV = null; } // « ne pas garder » : oubliée à la fermeture
    }
    async function reloadConv() { if (!CONV) return; try { CONV = (await get('aia_conv', {id: CONV.id})).conv; } catch (_) {} drawThread(); }
    function drawThread() {
        const p = panelEl(), th = p.querySelector('[data-aia-thread]');
        p.querySelector('[data-aia-where]').innerHTML = STATUS?.ready ? `${whereLine(STATUS)} · ${esc(T('Rien ne quitte l’ordinateur.'))}` : '';
        const ready = !!STATUS?.ready;
        p.querySelector('textarea').disabled = !ready || BUSY; p.querySelector('[data-aia-form] button').disabled = !ready || BUSY;
        p.querySelector('[data-aia-suggest]').innerHTML = ready && !CONV ? SUGGEST().map(s => `<button type="button" class="aia-sugg" data-aia-suggestion>${esc(s)}</button>`).join('') : '';
        if (!ready) { th.innerHTML = offHtml(STATUS); return; }
        const intro = PERSON && !CONV ? `<p class="muted aia-about">${esc(T('À propos de la fiche n° {n} : ta question lui sera rattachée.', {n: PERSON}))}</p>` : '';
        if (!CONV) { th.innerHTML = intro + `<div class="aia-empty"><p>${esc(T('Pose une question en français ordinaire sur ton arbre. L’assistant cherche dans ta base, puis répond en citant les fiches et les sources.'))}</p></div>`; return; }
        th.innerHTML = CONV.turns.map((t, i) => {
            const props = (t.proposals || []).map(id => CONV.proposals.find(x => x.id === id)).filter(Boolean);
            const body = t.state === 'working' ? `<div class="aia-working"><span class="aia-dots"></span> ${esc(T('L’assistant cherche…'))}${t.steps?.length ? `<ul class="aia-steps">${t.steps.map(stepLi).join('')}</ul>` : ''}</div>`
                : t.state === 'error' ? notice('error', esc(t.error || T('L’assistant n’a pas pu répondre.')))
                : answerHtml(t.answer, {how: t.steps});
            return `<div class="aia-msg is-user">${esc(t.q)}</div><div class="aia-msg is-bot" data-aia-turn="${i}">${body}${props.map(proposalHtml).join('')}</div>`;
        }).join('') + (CONV.temp ? '' : `<p class="aia-keep muted"><small>${esc(T('Gardée sur cet ordinateur, dans « 🤖 Mes conversations ».'))}</small></p>`);
        th.scrollTop = th.scrollHeight;
    }
    async function ask() {
        const p = panelEl(), ta = p.querySelector('textarea'), q = ta.value.trim();
        if (!q || BUSY) return;
        BUSY = true; ta.value = '';
        drawThread();
        try {
            const r = await post('aia_chat_start', {question: q, conv_id: CONV?.id || '', person_id: CONV ? 0 : PERSON, model: model(), keep: settings().history});
            CONV = r.conv; drawThread();
            CONV = await runSteps(CONV, c => { CONV = c; drawThread(); });
        } catch (e) { toast(e.message, 'error'); ta.value = q; }
        finally { BUSY = false; drawThread(); }
    }
    async function drawHistory() {
        const th = panelEl().querySelector('[data-aia-thread]');
        panelEl().querySelector('[data-aia-suggest]').innerHTML = '';
        let r; try { r = await get('aia_convs'); } catch (e) { th.innerHTML = notice('error', esc(e.message)); return; }
        const ic = {chat: '🤖', gen: '🕵️', recit: '✍️'};
        th.innerHTML = `<h4 class="aia-h">🤖 ${esc(T('Mes conversations'))} <small class="muted">(${r.total})</small></h4><p class="muted"><small>${esc(T('Gardées sur cet ordinateur : {f}.', {f: r.folder}))}</small></p>
            ${r.rows.length ? `<ul class="aia-hist">${r.rows.map(c => `<li><button type="button" class="aia-hist-open" data-aia-open="${esc(c.id)}">${ic[c.kind] || '🤖'} ${esc(c.title)} <small class="muted">${esc(fmtDate(c.updated))}</small></button><button type="button" class="aia-ibtn" data-aia-del="${esc(c.id)}" title="${esc(T('Effacer'))}">🗑</button></li>`).join('')}</ul>`
            : `<p class="muted">${esc(T('Aucune conversation gardée.'))}</p>`}`;
    }

    /* ═════════ 🕵️ le généalogiste IA, depuis une fiche ═════════ */
    const CONF = {forte: ['is-green', () => T('forte')], moyenne: ['is-yellow', () => T('moyenne')], faible: ['is-grey', () => T('faible')], chercher: ['is-blue', () => T('à chercher')]};
    const conf = c => `<span class="ui-badge aia-conf ${CONF[c]?.[0] || 'is-grey'}">${esc((CONF[c]?.[1] || (() => c))())}</span>`;
    const NUM = n => '①②③④⑤⑥⑦⑧⑨⑩⑪⑫'[n - 1] || `${n}.`;
    async function openGen(pid) {
        if (!isOn()) { toast(T('L’assistant IA est éteint (Réglages → 🤖 IA).')); return openSettings(); }
        let conv = null; let pistes = {};
        const dlg = ext.openDialog({eyebrow: T('GÉNÉALOGISTE IA'), title: `🕵️ ${T('Cherche ce qui manque')}`, wide: true, submitLabel: T('Fermer'), onSubmit: () => true, body: '<div class="aia-gen" data-aia-gen></div>'});
        dlg.classList.add('aia-gen-dlg');
        const box = dlg.querySelector('[data-aia-gen]');
        const draw = () => {
            if (!conv) return;
            const g = conv.gen || {}, t = conv.turns[0] || {}, pr = g.person || {};
            const gaps = (g.gaps || []).map(x => `<span class="aia-gap">${esc(x.manque)}</span>`).join('');
            const leads = (g.leads || []).map((l, i) => {
                const rows = (l.pistes || []).map(id => pistes[id]).filter(Boolean).map(r => `<div class="aia-piste"><p>${esc(r.title)} <span class="muted">${esc(T('{n} %', {n: r.score}))}</span> · ${link(r.url, T('↗ voir l’acte'))}</p>
                    ${r.status === 'new' ? `<div class="aia-row"><button type="button" class="button small" data-aia-pok="${r.id}">＋ ${esc(T('Ajouter comme source'))}</button>${['BIRT', 'BAPM', 'DEAT', 'BURI'].includes(r.tag) && r.main !== false && ['oa', 'insee'].includes(r.src) ? `<button type="button" class="button small secondary" data-aia-pev="${r.id}">＋ ${esc(T('et l’événement (à vérifier)'))}</button>` : ''}<button type="button" class="button small secondary" data-aia-pno="${r.id}">${esc(T('Ignorer'))}</button></div>`
                    : r.status === 'added' ? `<p class="aia-done">✓ ${esc(T('Ajouté, source reliée'))} <button type="button" class="button small secondary" data-aia-pundo="${r.id}">↶</button></p>` : `<p class="aia-done is-no">${esc(T('Ignoré'))} <button type="button" class="button small secondary" data-aia-punno="${r.id}">↶</button></p>`}</div>`).join('');
                const prop = l.proposal ? conv.proposals.find(x => x.id === l.proposal) : null;
                return `<article class="aia-lead"><h4>${NUM(i + 1)} ${esc(l.title)} ${conf(l.confidence)}${l.by === 'app' ? ` <small class="muted">${esc(T('trouvée par l’app'))}</small>` : ''}</h4>
                    ${l.proof ? answerHtml(l.proof) : l.why ? `<p class="muted">${esc(l.why)}</p>` : ''}${rows}${prop ? proposalHtml(prop) : ''}</article>`;
            }).join('');
            const where = (g.where || []).map((w, i) => { const prop = w.proposal ? conv.proposals.find(x => x.id === w.proposal) : null;
                return `<article class="aia-lead"><h4>${NUM((g.leads || []).length + i + 1)} ${esc(T('Où trouver : {m}', {m: w.manque}))} ${conf('chercher')}</h4>
                <p>🌍 ${esc(w.archive || T('archives du lieu'))}${w.place ? ` · ${esc(w.place)}` : ''}${w.decennial?.length ? ` · ${esc(T('tables décennales {t}', {t: w.decennial.map(d => String(d).replace('-', '–')).join(', ')}))}` : ''} ${w.site ? link(w.site, '↗ ' + T('ouvrir')) : ''}</p>
                ${w.steps?.length ? `<ul class="aia-wsteps">${w.steps.map(s => `<li><b>${esc(s.series)}</b> — ${esc(s.detail)}</li>`).join('')}</ul>` : ''}${prop ? proposalHtml(prop) : ''}</article>`; }).join('');
            const links = g.links?.length ? `<p class="aia-links">${esc(T('Autres sites, à ouvrir toi-même :'))} ${g.links.map(x => link(x.url, '↗ ' + x.label)).join(' · ')}</p>` : '';
            box.innerHTML = `<header class="aia-gen-head"><h3>${esc(pr.nom || '')}</h3><p class="muted">${esc([pr.sosa ? T('Sosa {n}', {n: pr.sosa}) : '', pr.naissance ? T('née ou né {d}', {d: pr.naissance}) : '', pr.deces ? T('décès {d}', {d: pr.deces}) : ''].filter(Boolean).join(' · '))}</p>${gaps ? `<div class="aia-gaps">${gaps}</div>` : ''}</header>
                <section class="aia-did"><h4>${esc(T('Ce que j’ai fait'))}</h4><ul class="aia-steps">${(t.steps || []).map(stepLi).join('')}${t.state === 'working' ? `<li class="aia-step"><span class="aia-dots"></span> ${esc(T('en cours…'))}</li>` : ''}</ul></section>
                ${t.state === 'error' ? notice('error', esc(t.error)) : ''}
                ${g.summary ? `<p class="aia-sum">${esc(g.summary)}</p>` : ''}${leads}${where}${links}
                ${t.state === 'done' ? `<p class="ui-hint">${esc(T('Les sources sur Internet sont marquées 🌐 Internet : seuls le nom, les prénoms, les années partent, comme quand tu cliques toi-même dans « Où chercher ». Rien n’est ajouté sans ton clic.'))}</p>` : ''}`;
        };
        const reload = async () => { try { const r = await get('aia_conv', {id: conv.id}); conv = r.conv; pistes = r.conv.pistes || {}; } catch (_) {} draw(); };
        box.addEventListener('click', async e => {
            if (await onPropClick(e, () => conv, () => reload())) return;
            if (onChipClick(e)) { if (e.target.closest('[data-aia-person]')) dlg.close(); return; }
            const b = e.target.closest('[data-aia-pok], [data-aia-pev], [data-aia-pno], [data-aia-pundo], [data-aia-punno], [data-aia-setup]'); if (!b) return;
            if (b.matches('[data-aia-setup]')) { dlg.close(); return setup(); }
            const d = b.dataset;
            try {
                if (d.aiaPok || d.aiaPev) { const id = Number(d.aiaPok || d.aiaPev); const r = await post('pistes_accept', {id, mode: d.aiaPev ? 'event' : 'source'});
                    A().undoToast?.(T('Ajouté, source reliée : {t}', {t: r.title}) + (r.notes?.length ? ` (${r.notes.join(' ; ')})` : ''), {icon: '🕵️', undo: async () => { await post('pistes_undo', {id}); reload(); }}); }
                else if (d.aiaPno) { const id = Number(d.aiaPno); await post('pistes_reject', {id}); A().undoToast?.(T('Piste ignorée : elle ne reviendra pas.'), {undo: async () => { await post('pistes_unreject', {id}); reload(); }}); }
                else if (d.aiaPundo) { await post('pistes_undo', {id: Number(d.aiaPundo)}); toast(T('Ajout retiré de la fiche.')); }
                else if (d.aiaPunno) { await post('pistes_unreject', {id: Number(d.aiaPunno)}); }
                try { root.dispatchEvent(new CustomEvent('lcnda:pistes-changed')); } catch (_) {}
                reload();
            } catch (err) { toast(err.message, 'error'); }
        });
        const st = await status();
        if (!st.ready) { box.innerHTML = offHtml(st); return dlg; }
        box.innerHTML = UI().spinner ? UI().spinner(T('Le généalogiste commence…')) : esc(T('Le généalogiste commence…'));
        try {
            conv = (await post('aia_gen_start', {person_id: pid, model: model(), openarch: settings().openarch, keep: settings().history})).conv; draw();
            conv = await runSteps(conv, (c, r) => { conv = c; pistes = c.pistes || pistes; if (dlg.isConnected) draw(); });
            await reload();
        } catch (e) { box.innerHTML = notice('error', esc(e.message)); }
        return dlg;
    }

    /* ═════════ ✍️ le récit de vie par l'IA → note « 📖 Biographie à relire » ═════════ */
    async function openRecit(pid) {
        if (!isOn()) { toast(T('L’assistant IA est éteint (Réglages → 🤖 IA).')); return openSettings(); }
        let conv = null;
        const dlg = ext.openDialog({eyebrow: T('RÉCIT DE VIE PAR L’IA'), title: `✍️ ${T('Récit de vie')}`, wide: true, submitLabel: T('Fermer'), onSubmit: () => true, body: '<div class="aia-recit" data-aia-recit></div>'});
        const box = dlg.querySelector('[data-aia-recit]');
        const draw = () => {
            const t = conv?.turns?.[0]; if (!t) return;
            const prop = (t.proposals || []).map(id => conv.proposals.find(x => x.id === id)).filter(Boolean)[0];
            box.innerHTML = t.state === 'working' ? `<div class="aia-working"><span class="aia-dots"></span> ${esc(T('L’IA écrit le récit… (30 s à 1 min sur un ordinateur modeste)'))}<ul class="aia-steps">${(t.steps || []).map(stepLi).join('')}</ul></div>`
                : t.state === 'error' ? notice('error', esc(t.error))
                : `${answerHtml(t.answer, {how: t.steps})}<div class="aia-recit-save"><p>${esc(T('Le jaune marque ce qui est supposé. Ce récit n’est pas enregistré :'))}</p>
                    ${prop ? (prop.status === 'added' ? `<p class="aia-done">✓ ${esc(T('Rangé dans la note « 📖 Biographie à relire »'))} <button type="button" class="button small secondary" data-aia-undo="${esc(prop.batch)}">↶ ${esc(T('Annuler'))}</button></p>` : `<button type="button" class="button" data-aia-prop="${prop.id}">📖 ${esc(T('Le mettre dans la biographie (à relire)'))}</button>`) : ''}
                    <p class="ui-hint">${esc(T('Il va dans une note à part, « 📖 Biographie à relire » : la biographie écrite par l’app ne change pas.'))}</p></div>`;
        };
        const reload = async () => { try { conv = (await get('aia_conv', {id: conv.id})).conv; } catch (_) {} draw(); };
        box.addEventListener('click', async e => { if (await onPropClick(e, () => conv, () => reload())) return; if (onChipClick(e) && e.target.closest('[data-aia-person]')) dlg.close(); const b = e.target.closest('[data-aia-setup]'); if (b) { dlg.close(); setup(); } });
        const st = await status();
        if (!st.ready) { box.innerHTML = offHtml(st); return dlg; }
        try { conv = (await post('aia_recit_start', {person_id: pid, model: model(), keep: settings().history})).conv; draw(); conv = await runSteps(conv, c => { conv = c; draw(); }); draw(); }
        catch (e) { box.innerHTML = notice('error', esc(e.message)); }
        return dlg;
    }

    /* ═════════ Réglages → 🤖 IA ═════════ */
    function openSettings() { const st = A().state; if (!st) return; st.maintenanceTab = TAB[0]; A().setModule?.('maintenance'); }
    async function drawSettings(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (A().state?.maintenanceTab !== TAB[0] && token === undefined) return;
        const s = settings();
        ws.innerHTML = `<section class="page aia-settings">${UI().pageHeader ? UI().pageHeader({title: T('Assistant IA'), icon: '🤖', where: T('Réglages · IA'), help: esc(T('Choisis où tourne l’IA de l’assistant, du généalogiste et des récits.'))}) : `<h2>🤖 ${esc(T('Assistant IA'))}</h2>`}<div data-aia-set>${UI().spinner ? UI().spinner(T('Recherche d’Ollama sur cet ordinateur…')) : ''}</div></section>`;
        const st = await status(true);
        let log = {rows: []}, convs = {total: 0}; try { log = await get('aia_log'); } catch (_) {} try { convs = await get('aia_convs'); } catch (_) {}
        if (token !== undefined && A().state && token !== A().state.workspaceToken) return;
        const host = ws.querySelector('[data-aia-set]'); if (!host) return;
        const o = st.ollama || {};
        const seg = [['local', `🖥 ${T('Sur cet ordinateur')}`, false], ['online', `🌐 ${T('Service en ligne')}`, true], ['off', T('Éteint'), false]]
            .map(([v, l, dis]) => `<button type="button" role="radio" aria-checked="${s.mode === v}" class="${s.mode === v ? 'is-active' : ''}" data-aia-mode="${v}" ${dis ? `disabled title="${esc(T('Bientôt : Mistral (France) et les services « compatibles OpenAI », avec ta clé et un avertissement clair sur ce qui part.'))}"` : ''}>${esc(l)}${dis ? ` <small>(${esc(T('bientôt'))})</small>` : ''}</button>`).join('');
        const state = o.local_only === false ? notice('error', esc(T('L’adresse d’Ollama n’est pas sur cet ordinateur : refusée.')))
            : !o.installed ? notice('info', `<b>${esc(T('Ollama n’est pas encore sur cet ordinateur.'))}</b> ${esc(T('Installe-le une fois (gratuit), lance-le, puis « ↻ Tester la connexion ». Un ordinateur de 8 Go marche, mais lentement (30 s à 1 min par réponse).'))}`)
            : !o.running ? notice('warn', `<b>${esc(T('Ollama est installé mais ne tourne pas.'))}</b> ${esc(T('Lance l’application Ollama, puis « ↻ Tester la connexion ».'))}`)
            : st.ready ? notice('ok', esc(T('Ollama est installé et répond (le même que pour la lecture approfondie des actes).')) + (o.ram_gb ? ' ' + esc(T('Ton ordinateur a {n} Go de mémoire.', {n: o.ram_gb})) : '') + (st.tools === false ? `<br><small>${esc(T('Ce modèle ne sait pas appeler les outils directement : l’app lui parle en JSON (un peu moins sûr).'))}</small>` : ''))
            : notice('warn', esc(st.message || T('Aucun modèle d’IA n’est encore téléchargé.')));
        const cur = st.model?.tag || s.model;
        const models = (o.models || []).filter(m => m.tried || m.recommended || m.tag === 'mistral-small3.2:24b' || m.tag === 'qwen3-vl:32b-instruct' || m.present);
        const rows = models.map(m => `<tr class="${m.fits === false ? 'is-big' : ''}"><td><label><input type="radio" name="aia_model" value="${esc(m.tag)}" ${m.tag === cur ? 'checked' : ''} ${m.present ? '' : 'disabled'}> <b>${esc(m.label)}</b></label>${m.tag === 'qwen3-vl:8b-instruct' ? ` <span class="ui-badge is-green">${esc(T('conseillé'))}</span>` : ''}<br><small class="muted">${esc(T(m.pros || ''))}</small></td>
            <td>${esc(T('{n} Go', {n: m.ram_gb}))}</td><td>${esc(T('{n} Go', {n: String(m.size_gb).replace('.', ',')}))}</td><td>${m.present ? `✓ ${esc(T('déjà installé'))}` : m.fits === false ? esc(T('trop gros ici')) : `<button type="button" class="button small secondary" data-aia-setup>⤓ ${esc(T('Télécharger'))}</button>`}</td></tr>`).join('')
            + (o.others || []).map(m => `<tr><td><label><input type="radio" name="aia_model" value="${esc(m.tag)}" ${m.tag === cur ? 'checked' : ''}> <b>${esc(m.label)}</b></label> <small class="muted">${esc(T('autre modèle d’Ollama'))}</small></td><td></td><td></td><td>✓ ${esc(T('déjà installé'))}</td></tr>`).join('');
        const sw = (k, label, hint) => `<label class="checkbox-line aia-switch"><input type="checkbox" data-aia-opt="${k}" ${s[k] ? 'checked' : ''}> <span><b>${esc(label)}</b><br><small class="muted">${esc(hint)}</small></span></label>`;
        host.innerHTML = `<div class="maintenance-panel"><h3>${esc(T('Où tourne l’IA'))}</h3><div class="segmented aia-seg" role="radiogroup">${seg}</div>
                ${s.mode === 'off' ? `<p class="muted">${esc(T('L’assistant est éteint : le bouton 🤖 disparaît de la barre du haut. Rien d’autre ne change dans l’app.'))}</p>` : ''}</div>
            <div class="maintenance-panel"><h3>🖥 ${esc(T('Sur cet ordinateur (Ollama)'))}</h3>${state}
                <div class="aia-row"><button type="button" class="button small secondary" data-aia-test>↻ ${esc(T('Tester la connexion'))}</button><button type="button" class="button small secondary" data-aia-setup>🧭 ${esc(T('Installation guidée'))}</button>${!o.installed ? link(st.setup_url || 'https://ollama.com/download', '↗ ollama.com') : ''}</div>
                <div class="cplus-scroll"><table class="data-table aia-models"><thead><tr><th>${esc(T('Modèle'))}</th><th>${esc(T('Mémoire'))}</th><th>${esc(T('Taille'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
                <p class="ui-hint">${esc(T('Par défaut, le modèle déjà installé pour la lecture des actes (Qwen3-VL 8B) : rien à télécharger, il sait aussi converser.'))}</p>
                ${sw('openarch', T('Le généalogiste peut interroger Open Archives'), T('nom, prénoms, années partent vers openarch.nl, comme dans « Où chercher » ; jamais pour une personne vivante ou une fiche 🔒'))}
                ${sw('history', T('Garder les conversations'), T('dans le dossier des données de cet ordinateur, jamais dans la base ni dans les sauvegardes'))}</div>
            <div class="maintenance-panel is-disabled"><h3>🌐 ${esc(T('Service en ligne'))} <small class="muted">(${esc(T('bientôt'))})</small></h3><p class="muted">${esc(T('Plus tard : Mistral (France) et les services « compatibles OpenAI », avec ta clé personnelle gardée hors de la base, et « voir ce qui va partir » avant chaque envoi. Pas dans cette version : rien ne part.'))}</p></div>
            <div class="maintenance-panel"><h3>${esc(T('Ce qui part, ce qui reste'))}</h3><div class="cplus-scroll"><table class="data-table"><tbody>
                <tr><td>${esc(T('Vivants (déclarés ou probablement vivants)'))}</td><td>${esc(T('restent sur l’ordinateur ; jamais transmis à l’IA au-delà de « personne vivante »'))}</td></tr>
                <tr><td>${esc(T('Fiches 🔒 confidentielles, événements 🔒'))}</td><td>${esc(T('restent ; jamais transmis'))}</td></tr>
                <tr><td>${esc(T('Noms, dates, lieux, métiers, notes des décédés'))}</td><td>${esc(T('restent sur l’ordinateur (l’IA tourne ici)'))}</td></tr>
                <tr><td>${esc(T('Recherche Open Archives du généalogiste'))}</td><td>${esc(T('nom, prénoms, années → openarch.nl ; désactivable'))}</td></tr></tbody></table></div></div>
            <div class="maintenance-panel"><h3>${esc(T('Journal des envois'))}</h3><p class="muted">${esc(T('Ce qui est parti sur Internet, et quand. Avec l’IA sur l’ordinateur, seules les recherches Open Archives y figurent.'))}</p>
                ${log.rows.length ? `<ul class="aia-log">${log.rows.slice(0, 50).map(r => `<li><small class="muted">${esc(fmtDate(r.at))}</small> ${esc(r.host)} · « ${esc(r.what)} » · ${esc(T('0 vivant'))}</li>`).join('')}</ul><button type="button" class="button small secondary" data-aia-logclear>🗑 ${esc(T('Effacer le journal'))}</button>` : `<p>${esc(T('Rien n’est sorti de l’ordinateur.'))}</p>`}</div>
            <div class="maintenance-panel"><h3>🤖 ${esc(T('Mes conversations'))}</h3><p>${esc(T('{n} conversation(s) gardée(s) sur cet ordinateur.', {n: convs.total || 0}))}</p>
                <div class="aia-row"><button type="button" class="button small secondary" data-aia-openpanel>${esc(T('Ouvrir l’assistant'))}</button>${convs.total ? `<button type="button" class="button small secondary" data-aia-clearall>🗑 ${esc(T('Tout effacer'))}</button>` : ''}</div></div>`;
        host.onclick = async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.aiaMode) { const before = settings(); const n = {...before, mode: b.dataset.aiaMode}; save(n); topbar(); drawSettings(); A().undoToast?.(b.dataset.aiaMode === 'off' ? T('Assistant IA éteint.') : T('Assistant IA : sur cet ordinateur.'), {icon: '🤖', undo: () => { save(before); topbar(); drawSettings(); }}); return; }
            if (b.matches('[data-aia-test]')) return drawSettings();
            if (b.matches('[data-aia-setup]')) return setup();
            if (b.matches('[data-aia-openpanel]')) return openPanel();
            if (b.matches('[data-aia-logclear]')) { try { const r = await post('aia_log_clear', {}); drawSettings(); A().undoToast?.(T('Journal des envois effacé ({n}).', {n: r.removed}), {undo: async () => { await post('aia_log_restore', {rows: r.restore}); drawSettings(); }}); } catch (err) { toast(err.message, 'error'); } return; }
            if (b.matches('[data-aia-clearall]')) {
                const ok = A().confirmBox ? await A().confirmBox(T('Effacer toutes les conversations gardées sur cet ordinateur ?'), {title: T('Tout effacer ?'), okLabel: T('Tout effacer'), danger: true}) : root.confirm(T('Effacer toutes les conversations gardées sur cet ordinateur ?'));
                if (!ok) return;
                try { const r = await post('aia_convs_clear', {}); CONV = null; toast(T('{n} conversation(s) effacée(s).', {n: r.removed})); drawSettings(); } catch (err) { toast(err.message, 'error'); }
            }
        };
        host.onchange = e => {
            const t = e.target;
            if (t.name === 'aia_model') { const before = settings(); save({...before, model: t.value}); STATUS = null; A().undoToast?.(T('Modèle de l’assistant : {m}', {m: t.value}), {icon: '🤖', undo: () => { save(before); STATUS = null; drawSettings(); }}); return; }
            if (t.dataset.aiaOpt) { const before = settings(); save({...before, [t.dataset.aiaOpt]: t.checked}); const l = t.closest('label').querySelector('b').textContent;
                A().undoToast?.(t.checked ? T('Allumé : {l}', {l}) : T('Éteint : {l}', {l}), {undo: () => { save(before); drawSettings(); }}); }
        };
    }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance[TAB[0]] = token => drawSettings(token);

    /* ═════════ le bouton 🤖 de la barre du haut, le menu ⋯ de la fiche ═════════ */
    function topbar() {
        const bar = document.querySelector('.topbar .topbar-meta'); if (!bar) return;
        let b = document.getElementById('aia-open');
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.id = 'aia-open'; b.className = 'screen-tool aia-topbtn';
            b.title = T('Assistant IA : pose une question sur ton arbre (l’IA tourne sur cet ordinateur)'); b.setAttribute('aria-label', T('Assistant IA'));
            b.innerHTML = '<span aria-hidden="true">🤖</span>';
            b.addEventListener('click', () => (PANEL?.classList.contains('is-open') ? closePanel() : openPanel()));
            const before = bar.querySelector('#report-problem-open') || bar.querySelector('.status-dot');
            bar.insertBefore(b, before || null);
        }
        b.hidden = !isOn();
        if (!isOn() && PANEL?.classList.contains('is-open')) closePanel();
    }
    const hiddenPerson = p => !p?.id || p.kind === 'animal' || p.living_status === 'living' || Number(p.is_private) === 1;
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (hiddenPerson(p) || !isOn()) return null; return {key: 'aia-ask', icon: '🤖', label: T('Demander à propos de cette personne'), run: () => openPanel({person_id: Number(p.id)})}; });
    ext.personMoreItems.push(detail => { const p = detail?.person; if (hiddenPerson(p) || !isOn()) return null; return {key: 'aia-gen', icon: '🕵️', label: T('Généalogiste IA : chercher ce qui manque'), run: () => openGen(Number(p.id))}; });
    ext.personMoreItems.push(detail => { const p = detail?.person; if (hiddenPerson(p) || !isOn()) return null; return {key: 'aia-recit', icon: '✍️', label: T('Récit de vie par l’IA'), run: () => openRecit(Number(p.id))}; });
    (ext.dataSources = ext.dataSources || []).push({id: 'assistant_ia_gen', icon: '🕵️', label: T('Généalogiste IA : chercher ce qui manque'), group: 'Chercher', needs: ['person'], installed: () => isOn(),
        run: async (ctx, host) => { const id = Number(ctx.person?.id || ctx.person) || 0; host.innerHTML = id ? `<button type="button" class="button">🕵️ ${esc(T('Lancer le généalogiste'))}</button>` : esc(T('Choisis une personne.')); host.querySelector('button')?.addEventListener('click', () => openGen(id)); }});

    function register() {
        const app = A(); if (!app.defaultListTypes) return false;
        if (Array.isArray(app.defaultMaintenanceTabs) && !app.defaultMaintenanceTabs.some(t => t[0] === TAB[0])) { const i = app.defaultMaintenanceTabs.findIndex(t => t[0] === 'htr'); app.defaultMaintenanceTabs.splice(i < 0 ? app.defaultMaintenanceTabs.length : i + 1, 0, [TAB[0], TAB[1], T(TAB[2])]); }
        return true;
    }
    if (!register()) document.addEventListener('DOMContentLoaded', register, {once: true});
    const ready = () => { if (document.querySelector('.topbar .topbar-meta') && A().state) topbar(); else setTimeout(ready, 400); };
    ready();
    ext.assistantIA = {open: openPanel, close: closePanel, openGen, openRecit, openSettings, settings, status, answerHtml};
})(typeof window !== 'undefined' ? window : globalThis);
