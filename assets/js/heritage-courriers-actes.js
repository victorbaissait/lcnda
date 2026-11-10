/**
 * 📮 Courriers tout prêts : « Demander l'acte » — serveur : lib/courriers_actes.php (structure n°84).
 * ext.openActLetter({person_id, event_id, act, what}) : la lettre rédigée (copie intégrale, extrait avec ou sans filiation,
 * recherche aux archives, transcription, dispense), la règle des délais (75 ans…) dite en clair, le destinataire avec son
 * adresse modifiable (mairie, Archives départementales, Service central d'état civil à Nantes, archives diocésaines),
 * l'expéditeur et les modèles des réglages (⚙️, K2, 💾 Réglages enregistrés). Sorties : 📝 traitement de texte (LCNDA_TEXT),
 * 🖨 Imprimer ou ⤓ PDF (L1), ✉️ courriel prêt (mailto : rien n'est envoyé par l'app), 📁 copie dans les médias ; puis
 * « 📮 Ranger dans les courriers suivis » (Registre de courriers, relance → aussi dans 🗓 Ma semaine de recherche), ↶ Annuler.
 * Entrées : fiche (⋯ → « 📮 Demander un acte… »), « Que manque-t-il ? » (« 📮 Demander l'acte »), Registre de courriers
 * (« 📮 Demander un acte » en haut, « Préparer la lettre » des actes récents, « 📮 Revoir la lettre » d'un courrier rangé).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const P = () => window.LCNDA_PICKER;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const api = (...a) => A().api(...a);
    const write = (op, body = {}) => api('cl_write', {}, {method: 'POST', body: {op, ...body}});
    const toast = (...a) => A().toast(...a);
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const KEY = 'genealogie-courriers-lettres', PRESETS = 'genealogie-courriers-lettres-presets';
    const ACTS = [['naissance', 'Naissance'], ['mariage', 'Mariage'], ['deces', 'Décès']];
    const WHATS = [['integrale', 'Copie intégrale'], ['extrait_filiation', 'Extrait avec filiation'], ['extrait_sans', 'Extrait sans filiation'], ['recherche', 'Recherche aux archives'], ['transcription', 'Transcription (acte à l’étranger)'], ['dispense', 'Dossier de dispense de mariage']];
    const RELS = [['descendant', 'Je suis son descendant direct'], ['moi', 'C’est mon propre acte'], ['ascendant', 'Je suis son ascendant direct'], ['conjoint', 'Je suis son conjoint'], ['representant', 'Je suis son représentant légal'], ['autre', 'Autre lien (cousin…) ou aucun']];
    const RECIPS = [['mairie', 'Mairie de la commune'], ['ad', 'Archives départementales'], ['scec', 'Service central d’état civil (Nantes)'], ['diocese', 'Archives diocésaines'], ['autre', 'Autre destinataire']];
    const ls = {get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }};
    const cfg = () => { const v = ls.get(KEY, {}) || {}; const s = v.sender && typeof v.sender === 'object' ? v.sender : {};
        return {sender: {name: String(s.name || '').slice(0, 120), address: String(s.address || '').slice(0, 400), city: String(s.city || '').slice(0, 80), email: String(s.email || '').slice(0, 160), phone: String(s.phone || '').slice(0, 40)},
            delay: Math.max(0, Math.min(365, Number(v.delay) || 45)), byEmail: !!v.byEmail, templates: v.templates && typeof v.templates === 'object' ? Object.fromEntries(Object.entries(v.templates).filter(([k, t]) => WHATS.some(w => w[0] === k) && typeof t === 'string').map(([k, t]) => [k, t.slice(0, 8000)])) : {}}; };
    const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const letterHtml = (title, text) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:22mm 20mm}body{font:12pt/1.5 Georgia,"Times New Roman",serif;color:#111;margin:0}.l{white-space:pre-wrap;max-width:170mm;margin:0 auto}</style></head><body><div class="l" data-k-page>${esc(text)}</div></body></html>`;

    /** La lettre en document du traitement de texte (paragraphes) */
    const docData = text => { const html = String(text).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''); return ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(html) : null; };

    async function openActLetter(o = {}) {
        if (kiosk()) { toast('En mode consultation, on ne prépare pas de courrier.', 'error'); return null; }
        let st = {person_id: Number(o.person_id) || 0, event_id: Number(o.event_id) || 0, act: o.act || 'naissance', what: o.what || 'integrale', relation: o.relation || '', recipient: o.recipient || '', recipient_address: '', recipient_email: '', precision: o.precision || '', by_email: cfg().byEmail};
        let b = null, edited = false, mediaId = 0, lastLetter = '';
        const conf = cfg();
        const build = async () => b = await write('build', {...st, sender: cfg().sender, template: cfg().templates[st.what] || ''});
        if (st.person_id || st.event_id) { try { await build(); st.person_id = b.context.person.id; st.act = b.act; st.relation = b.relation; st.recipient = b.recipient_kind; } catch (e) { toast(e.message, 'error'); return null; } }
        const dlg = ext.openDialog({eyebrow: 'COURRIER TOUT PRÊT', title: '📮 Demander l’acte', wide: true, submitLabel: '📮 Ranger dans les courriers suivis',
            body: `<div class="cl-grid"><div class="cl-side">
                <span class="pk-lab">Personne</span>${P().pickerField({name: 'person_id', kind: 'person', animals: false, value: b ? {id: b.context.person.id, title: b.context.person.name, kind: 'person'} : null})}
                <div class="form-grid"><label>Acte<select name="act">${opt(ACTS, st.act)}</select></label><label>Ce que tu demandes<select name="what">${opt(WHATS, st.what)}</select></label></div>
                <label>Ton lien avec la personne<select name="relation">${opt(RELS, st.relation || 'descendant')}</select></label>
                <div data-cl-legal></div>
                <label>Destinataire<select name="recipient">${opt(RECIPS, st.recipient || 'mairie')}</select></label>
                <label>Adresse du destinataire<textarea name="recipient_address" rows="4" maxlength="600"></textarea></label>
                <p class="ui-hint" data-cl-addr-hint>Vérifie l’adresse : complète le code postal ou corrige-la si besoin.</p>
                <label>Courriel du destinataire (facultatif)<input name="recipient_email" type="email" maxlength="160" placeholder="etat-civil@mairie.fr"></label>
                <label>Tes précisions (facultatif)<textarea name="precision" rows="2" maxlength="2000" placeholder="Ex. : je ne connais pas la date exacte, entre 1880 et 1885.">${esc(st.precision)}</textarea></label>
                <div class="cl-send" role="radiogroup" aria-label="Envoi"><label class="checkbox-line"><input type="radio" name="by_email" value="0" ${st.by_email ? '' : 'checked'}> ✉️ Par la poste</label><label class="checkbox-line"><input type="radio" name="by_email" value="1" ${st.by_email ? 'checked' : ''}> 📧 Par courriel</label></div>
                <p class="cl-from" data-cl-from></p>
                <fieldset class="cl-follow"><legend>Suivi du courrier</legend><div class="form-grid"><label>Envoyé le<input type="date" name="date_envoi" value="${today()}"></label><label>Relance dans<input type="number" name="relance_jours" min="0" max="365" value="${conf.delay}" data-unit="jours"></label></div>
                    <label class="checkbox-line" data-cl-remind hidden><input type="checkbox" name="remind_open" checked> <span>Me rappeler quand l’acte sera libre d’accès</span></label></fieldset>
            </div><div class="cl-main">
                <label>Objet<input name="objet" maxlength="300"></label>
                <label>La lettre (tu peux la retoucher)<textarea name="letter" rows="22" class="cl-letter" maxlength="20000"></textarea></label>
                <p class="ui-hint" data-cl-edited hidden>Tu as retouché la lettre : elle ne change plus toute seule. <button type="button" class="link-button" data-cl-regen>↺ Remettre la lettre du modèle</button></p>
                <div class="cl-out"><button type="button" class="button small secondary" data-cl-out="wp">📝 Traitement de texte</button><button type="button" class="button small secondary" data-cl-out="print">🖨 Imprimer ou ⤓ PDF</button><button type="button" class="button small secondary" data-cl-out="mail">✉️ Courriel prêt</button><button type="button" class="button small secondary" data-cl-out="media">📁 Copie dans les médias</button><button type="button" class="button small secondary" data-cl-out="copy">📋 Copier</button></div>
                <p class="ui-hint" data-cl-media hidden></p>
            </div></div>`,
            onOpen: d => {
                d.classList.add('cl-dialog');
                const f = d.querySelector('form'), $ = s => d.querySelector(s);
                // ⚙️ dans l'en-tête de la fenêtre (K2) : mon adresse, les modèles, 💾 réglages enregistrés
                const head = d.querySelector('.modal-head'); head?.querySelector('[data-h-close]')?.insertAdjacentHTML('beforebegin', '<button type="button" class="icon-button" data-cl-settings title="Mon adresse et mes modèles de lettres" aria-label="Réglages des courriers">⚙️</button>');
                const fromLine = () => { const s = cfg().sender; $('[data-cl-from]').innerHTML = `De : <b>${esc(s.name || 'ton nom')}</b>${s.address ? ` · ${esc(s.address.split('\n')[0])}…` : ' · <span class="muted">adresse à remplir</span>'} <button type="button" class="link-button" data-cl-settings>⚙️ Mon adresse et mes modèles…</button>`; };
                const paint = (regen = true) => {
                    if (!b) { $('[data-cl-legal]').innerHTML = UI().notice ? UI().notice('info', 'Choisis la personne : la lettre s’écrit toute seule.') : ''; return; }
                    const L = b.legal, kind = L.status === 'warn' ? 'warn' : L.status === 'info' ? 'info' : 'ok';
                    $('[data-cl-legal]').innerHTML = `${UI().notice(kind, L.says.join(' '))}<details class="cl-rule"><summary>La règle</summary><p>${esc(L.rule)}</p></details>${b.context.missing ? UI().notice('info', 'Cet acte n’est pas encore dans ta généalogie : la lettre le dit et laisse la mairie chercher. Ajoute tes précisions (années, lieu probable).') : ''}`;
                    f.act.value = b.act; f.what.value = b.asked; f.relation.value = b.relation; f.recipient.value = b.recipient_kind;
                    if (!st.recipient_address) f.recipient_address.value = b.recipient.address;
                    if (!f.recipient_email.value && b.recipient.email) f.recipient_email.value = b.recipient.email;
                    $('[data-cl-addr-hint]').textContent = b.recipient_kind === 'ad' && !b.recipient.known ? 'Ces archives ne sont pas encore dans « Services d’archives » : complète l’adresse (elle est sur leur site).' : b.recipient_kind === 'scec' ? 'L’adresse du Service central d’état civil est déjà complète.' : 'Vérifie l’adresse : complète le code postal ou corrige-la si besoin.';
                    $('[data-cl-remind]').hidden = !(L.open_at && !L.public);
                    if (regen && !edited) { f.letter.value = b.letter; f.objet.value = b.objet; lastLetter = b.letter; }
                    $('[data-cl-edited]').hidden = !edited;
                };
                fromLine(); paint();
                const refresh = async (keepAddress = true) => {
                    st = {...st, act: f.act.value, what: f.what.value, relation: f.relation.value, recipient: f.recipient.value, recipient_address: keepAddress ? f.recipient_address.value : '', recipient_email: f.recipient_email.value, precision: f.precision.value, by_email: f.querySelector('[name="by_email"]:checked')?.value === '1'};
                    if (!st.person_id) { paint(); return; }
                    try { await build(); if (!keepAddress) f.recipient_address.value = b.recipient.address; paint(); } catch (e) { toast(e.message, 'error'); }
                };
                d.addEventListener('picker-change', e => { if (e.detail?.name !== 'person_id') return; st.person_id = Number(e.detail.value) || 0; st.event_id = 0; st.relation = ''; st.recipient_address = ''; f.recipient_address.value = ''; f.relation.value = ''; refresh(false); });
                f.addEventListener('change', e => {
                    const n = e.target.name;
                    if (n === 'recipient') { f.recipient_email.value = ''; refresh(false); }
                    else if (n === 'what') { st.recipient = ''; f.recipient.value = ''; f.recipient_email.value = ''; refresh(false); }
                    else if (n === 'act') { st.event_id = 0; refresh(); }
                    else if (['relation', 'precision', 'by_email', 'recipient_address'].includes(n)) refresh();
                });
                f.letter.addEventListener('input', () => { edited = f.letter.value !== lastLetter; $('[data-cl-edited]').hidden = !edited; });
                d.addEventListener('click', async e => {
                    if (e.target.closest('[data-cl-settings]')) { openSettings(() => { fromLine(); refresh(); }); return; }
                    if (e.target.closest('[data-cl-regen]')) { const before = f.letter.value; edited = false; paint(); A().undoToast?.('Lettre remise comme le modèle', {undo: () => { f.letter.value = before; edited = true; $('[data-cl-edited]').hidden = false; }}); return; }
                    const out = e.target.closest('[data-cl-out]')?.dataset.clOut; if (!out) return;
                    if (!b) { toast('Choisis d’abord la personne.', 'error'); return; }
                    const text = f.letter.value, title = f.objet.value || b.objet;
                    if (out === 'copy') { try { await navigator.clipboard.writeText(text); } catch (_) { f.letter.select(); document.execCommand('copy'); } toast('Lettre copiée.'); return; }
                    if (out === 'print') { UI().openPrintDialog({title, key: 'courrier', html: letterHtml(title, text), paper: 'A4', orientation: 'portrait'}); return; }
                    if (out === 'wp') { const data = docData(text); if (!ext.openTextDoc) { toast('Le traitement de texte n’est pas disponible.', 'error'); return; } ext.openTextDoc(data ? {data, name: title} : {name: title}); return; }
                    if (out === 'mail') {
                        const to = f.recipient_email.value.trim(), body = edited ? text : b.mail_body;
                        const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
                        const a = document.createElement('a'); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
                        toast(to ? 'Ton logiciel de courriel s’ouvre avec la lettre : relis-la et envoie-la toi-même.' : 'Ton logiciel de courriel s’ouvre : ajoute l’adresse du destinataire. Rien n’est envoyé par l’app.');
                        return;
                    }
                    if (out === 'media') {
                        const T = window.LCNDA_TEXT; const btn = e.target.closest('button');
                        if (!T?.toDocx || !T?.fromText) { toast('Copie impossible : le moteur de documents n’est pas chargé.', 'error'); return; }
                        btn.disabled = true;
                        try {
                            const doc = T.fromText(text); const blob = await T.toDocx(doc); const u8 = new Uint8Array(await blob.arrayBuffer());
                            const r = await api('textdoc_to_media', {}, {method: 'POST', body: {file: T.toB64 ? T.toB64(u8) : btoa(String.fromCharCode(...u8)), format: 'docx', title}});
                            mediaId = Number((r.result || r).media_id) || 0;
                            const h = $('[data-cl-media]'); h.hidden = false; h.textContent = '📁 Une copie (.docx) est rangée dans les médias ; elle sera reliée au courrier.';
                            toast('Copie rangée dans les médias.', '', {action: {label: '↗ Ouvrir', run: () => P()?.openMedia?.(mediaId)}});
                        } catch (err) { toast(i18n('Copie impossible : {nm}', {nm: err.message}), 'error'); }
                        finally { btn.disabled = false; }
                    }
                });
            },
            onSubmit: async form => {
                if (!st.person_id) { const pk = form.querySelector('.pk'); return UI().fail(pk?.querySelector('input:not([type=hidden])') || pk, 'Choisis la personne de l’acte.'); }
                if (!form.letter.value.trim()) return UI().fail(form.letter, 'La lettre est vide.');
                if (form.recipient_email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.recipient_email.value.trim())) return UI().fail(form.recipient_email, 'Cette adresse de courriel n’est pas complète.');
                const body = {...st, act: form.act.value, what: form.what.value, relation: form.relation.value, recipient: form.recipient.value, recipient_address: form.recipient_address.value, recipient_email: form.recipient_email.value.trim(),
                    precision: form.precision.value, by_email: form.querySelector('[name="by_email"]:checked')?.value === '1' ? 1 : 0, sender: cfg().sender, template: cfg().templates[form.what.value] || '',
                    letter: form.letter.value, objet: form.objet.value, date_envoi: form.date_envoi.value, relance_jours: Number(form.relance_jours.value) || 0, remind_open: !form.querySelector('[data-cl-remind]').hidden && form.remind_open.checked ? 1 : 0, media_id: mediaId};
                const r = await write('file', body);
                const after = () => { if (A().state?.listType === 'courriers' && A().state?.module === 'listes') A().renderList?.(); window.dispatchEvent(new CustomEvent('lcnda:courrier-filed', {detail: r})); };
                after();
                A().undoToast(r.relance_date ? i18n('Courrier rangé dans les courriers suivis (relance le {dt})', {dt: window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? window.LCNDA_I18N.fmtDate(new Date(r.relance_date + 'T12:00:00'), {day: 'numeric', month: 'long'}) : new Date(r.relance_date + 'T12:00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}) : i18n('Courrier rangé dans les courriers suivis'), {undo: async () => { await write('unfile', {courrier_id: r.courrier_id}); after(); }});
                o.onFiled?.(r);
            }});
        return dlg;
    }

    /** ⚙️ Mon adresse et mes modèles (K2 : chaque changement est gardé, « Fermer » seul, 💾 Réglages enregistrés) */
    function openSettings(onChange) {
        const c = cfg();
        let tplKey = 'integrale', defaults = null;
        const dg = ext.openDialog({eyebrow: 'RÉGLAGES', title: '⚙️ Mes courriers', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
            body: `<div class="cl-set"><div><span class="section-label">✉️ L’expéditeur (toi)</span>
                <label>Ton nom (signature)<input name="s_name" maxlength="120" value="${esc(c.sender.name)}" placeholder="Prénom Nom"></label>
                <label>Ton adresse<textarea name="s_address" rows="3" maxlength="400" placeholder="12 rue des Lilas\n19000 Tulle">${esc(c.sender.address)}</textarea></label>
                <div class="form-grid"><label>Ta ville (« À Tulle, le… »)<input name="s_city" maxlength="80" value="${esc(c.sender.city)}"></label><label>Ton téléphone<input name="s_phone" maxlength="40" value="${esc(c.sender.phone)}"></label></div>
                <label>Ton courriel<input name="s_email" type="email" maxlength="160" value="${esc(c.sender.email)}"></label>
                <span class="section-label">📅 Suivi</span>
                <label>Relancer au bout de<input type="number" name="delay" min="0" max="365" value="${c.delay}" data-unit="jours"></label>
                <label class="ui-toggle"><input type="checkbox" name="byEmail" ${c.byEmail ? 'checked' : ''}><i></i>Proposer l’envoi par courriel d’abord</label>
                <div data-cl-presets></div></div>
                <div><span class="section-label">📝 Les modèles de lettres</span>
                <label>Modèle<select name="tpl">${opt(WHATS, tplKey)}</select></label>
                <textarea name="tpl_text" rows="16" maxlength="8000" class="cl-letter"></textarea>
                <p class="ui-hint" data-cl-tpl-state></p><button type="button" class="link-button" data-cl-tpl-reset>↺ Remettre ce modèle comme au départ</button>
                <details class="cl-rule"><summary>Les repères qu’on peut utiliser</summary><ul data-cl-ph></ul></details></div></div>`,
            onOpen: async d => {
                d.classList.add('cl-dialog');
                const f = d.querySelector('form');
                try { defaults = (await api('cl_templates')).templates || null; } catch (_) {}
                const showTpl = () => { const cur = cfg().templates[tplKey]; f.tpl_text.value = cur || defaults?.[tplKey] || ''; d.querySelector('[data-cl-tpl-state]').textContent = cur ? '✎ Modèle retouché (gardé tout seul).' : 'Modèle de départ.'; };
                const ph = {'{expediteur}': 'ton nom et ton adresse', '{destinataire}': 'l’adresse du destinataire', '{lieu_date}': '« À Tulle, le 9 novembre 2026 »', '{objet}': 'l’objet', '{demande}': '« une copie intégrale de l’acte de naissance »', '{acte}': 'naissance, mariage ou décès', '{personne}': 'le nom de la personne', '{filiation}': '« , fils de … et de … »', '{evenement}': '« né le 7 mai 1925 à Tulle (Corrèze) »', '{conjoint}': 'le conjoint', '{lien_phrase}': 'ton lien', '{pieces_phrase}': 'les pièces jointes', '{precision}': 'tes précisions', '{retour_phrase}': 'l’enveloppe timbrée', '{signature}': 'ta signature'};
                d.querySelector('[data-cl-ph]').innerHTML = Object.entries(ph).map(([k, v]) => `<li><code>${esc(k)}</code> : ${esc(v)}</li>`).join('');
                showTpl();
                const save = () => { const v = ls.get(KEY, {}) || {};
                    v.sender = {name: f.s_name.value.trim(), address: f.s_address.value.trim(), city: f.s_city.value.trim(), email: f.s_email.value.trim(), phone: f.s_phone.value.trim()};
                    v.delay = Math.max(0, Math.min(365, Number(f.delay.value) || 45)); v.byEmail = f.byEmail.checked;
                    v.templates = v.templates || {}; const t = f.tpl_text.value.trim(); if (t && t !== (defaults?.[tplKey] || '').trim()) v.templates[tplKey] = t; else delete v.templates[tplKey];
                    ls.set(KEY, v); onChange?.(); };
                const reload = () => { const n = cfg(); f.s_name.value = n.sender.name; f.s_address.value = n.sender.address; f.s_city.value = n.sender.city; f.s_email.value = n.sender.email; f.s_phone.value = n.sender.phone; f.delay.value = n.delay; f.byEmail.checked = n.byEmail; showTpl(); onChange?.(); };
                f.tpl.addEventListener('change', () => { tplKey = f.tpl.value; showTpl(); });
                d.querySelector('[data-cl-tpl-reset]').addEventListener('click', () => { const v = ls.get(KEY, {}) || {}; const before = JSON.stringify(v); if (v.templates) delete v.templates[tplKey]; ls.set(KEY, v); showTpl(); onChange?.(); A().undoToast?.('Modèle remis comme au départ', {undo: () => { try { localStorage.setItem(KEY, before); } catch (_) {} showTpl(); onChange?.(); }}); });
                UI().autoSaveDialog?.(d, {keys: [KEY], save, reload, reset: () => { try { localStorage.removeItem(KEY); } catch (_) {} }});
                // 💾 Réglages enregistrés : l'adresse, le délai et les modèles, sous un nom
                const slot = d.querySelector('[data-cl-presets]');
                if (slot && UI().presetsFrame) {
                    const list = () => { const v = ls.get(PRESETS, []); return Array.isArray(v) ? v.filter(x => x && typeof x.name === 'string').slice(0, 40) : []; };
                    const put = l => ls.set(PRESETS, l.slice(0, 40)), now = () => new Date().toISOString();
                    const frame = UI().presetsFrame({id: 'courriers-lettres', what: 'ton adresse, le délai de relance et tes modèles de lettres', list: () => list().map(x => ({name: x.name, date: x.date})),
                        apply: i => { const x = list()[i]; if (!x) return false; ls.set(KEY, x.data || {}); reload(); },
                        save: name => { const l = list(), it = {name, date: now(), data: ls.get(KEY, {})}, i = l.findIndex(x => x.name === name); if (i >= 0) l[i] = it; else l.push(it); put(l); },
                        replace: i => { const l = list(); if (!l[i]) return false; l[i] = {...l[i], date: now(), data: ls.get(KEY, {})}; put(l); },
                        rename: (i, name) => { const l = list(); if (!l[i]) return false; l[i].name = name; put(l); },
                        duplicate: i => { const l = list(), x = l[i]; if (!x) return false; l.splice(i + 1, 0, {name: UI().freeName ? UI().freeName(x.name, l.map(y => y.name)) : `${x.name} (copie)`, date: now(), data: x.data}); put(l); },
                        exportOne: i => { const x = list()[i]; if (x) A().exportSettingFile?.('courriers-lettres', x.name, {data: x.data}); return false; },
                        remove: i => { const l = list(), x = l[i]; if (!x) return false; if (A().undoLocalChange) A().undoLocalChange(i18n('Réglage « {nm} » supprimé', {nm: x.name}), [PRESETS], () => { l.splice(i, 1); put(l); }, () => frame.isConnected && frame.refresh()); else { l.splice(i, 1); put(l); } },
                        importOne: async () => { const got = await A().importSettingFile?.('courriers-lettres', {names: list().map(x => x.name), check: x => x && typeof x.data === 'object'}); if (!got) return false; const l = list(); l.push({name: got.nom, date: now(), data: got.donnees.data}); put(l); }});
                    slot.appendChild(frame);
                }
            }});
        return dg;
    }

    /* ═════════════════════════════ Les branchements ═════════════════════════════ */
    // 📋 Registre de courriers : « 📮 Demander un acte » en haut ; « 📮 Revoir la lettre » sur les courriers rangés par l'outil
    ext.afterCourriers = ext.afterCourriers || [];
    ext.afterCourriers.push(async () => {
        if (kiosk()) return;
        const page = document.querySelector('#workspace .page'); if (!page) return;
        const add = page.querySelector('#add-courrier-item');
        if (add && !page.querySelector('[data-cl-new]')) add.insertAdjacentHTML('beforebegin', '<button type="button" class="button" data-cl-new title="Une lettre toute prête pour demander un acte (mairie, archives, Nantes…)">📮 Demander un acte</button> ');
        let ids = [];
        try { ids = (await api('cl_ids')).ids || []; } catch (_) { return; }
        const set = new Set(ids);
        page.querySelectorAll('[data-edit-courrier-item]').forEach(btn => { const id = Number(btn.dataset.editCourrierItem); if (!set.has(id) || btn.parentElement.querySelector(`[data-cl-see="${id}"]`)) return; btn.insertAdjacentHTML('beforebegin', `<button type="button" class="button small secondary" data-cl-see="${id}">📮 Revoir la lettre</button> `); });
    });
    async function seeLetter(id) {
        try {
            const c = (await api('cl_letter', {id})).courrier;
            ext.openDialog({eyebrow: 'COURRIER RANGÉ', title: c.objet || 'Courrier', wide: true, submitLabel: 'Fermer', onSubmit: () => true,
                body: `<p class="muted">À ${esc(c.destinataire)}${c.date_envoi ? ` · ${i18n('envoyé le {dt}', {dt: esc(c.date_envoi)})}` : ''}${c.relance_date ? ` · ${i18n('relance le {dt}', {dt: esc(c.relance_date)})}` : ''}</p><pre class="cl-letter cl-read">${esc(c.letter)}</pre>
                    <div class="cl-out"><button type="button" class="button small secondary" data-cl-r="wp">📝 Traitement de texte</button><button type="button" class="button small secondary" data-cl-r="print">🖨 Imprimer ou ⤓ PDF</button>${c.person_id ? '<button type="button" class="button small secondary" data-cl-r="again">📮 Refaire une demande</button>' : ''}</div>`,
                onOpen: d => d.addEventListener('click', e => { const k = e.target.closest('[data-cl-r]')?.dataset.clR; if (!k) return;
                    if (k === 'wp') { const data = docData(c.letter); ext.openTextDoc?.(data ? {data, name: c.objet} : {name: c.objet}); }
                    if (k === 'print') UI().openPrintDialog({title: c.objet, key: 'courrier', html: letterHtml(c.objet, c.letter), paper: 'A4', orientation: 'portrait'});
                    if (k === 'again') { d.close(); openActLetter({person_id: c.person_id, event_id: c.event_id, act: c.data?.act, what: c.data?.what}); } })});
        } catch (e) { toast(e.message, 'error'); }
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-cl-new]')) { e.preventDefault(); openActLetter({}); return; }
        const see = e.target.closest?.('[data-cl-see]'); if (see) { e.preventDefault(); seeLetter(Number(see.dataset.clSee)); return; }
        const ask = e.target.closest?.('[data-cl-ask]'); if (ask) { e.preventDefault(); openActLetter({person_id: Number(ask.dataset.clAsk) || 0, event_id: Number(ask.dataset.clEvent) || 0, act: ask.dataset.clAct || '', what: ask.dataset.clWhat || ''}); }
    });
    // 👤 la fiche : ⋯ → « 📮 Demander un acte… » (app-sections.js lit ext.personMoreItems)
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal' || kiosk()) return null; return {icon: '📮', label: 'Demander un acte…', run: () => openActLetter({person_id: Number(p.id)})}; });

    ext.openActLetter = openActLetter;
    ext.courrierSettings = openSettings;
})();
