/**
 * ✉️ Petites annonces et courriers aux journaux (Listes ; serveur : lib/periodicals.php, press_ads_*).
 *  - Règles de tarif par journal : au mot, à la ligne, au caractère ou au forfait ; minimum, premiers mots gratuits, prix
 *    adhérent, options (titre, gras, photo, encadré, domiciliation, internet), plusieurs parutions et remise, TVA, date
 *    limite, adresse d'envoi. Une capture d'écran des règles est lue (OCR) et remplit le formulaire, à corriger au besoin.
 *  - Une annonce : texte (compteurs en direct), prix calculé ligne par ligne, modèles, où on en est, réponses reçues,
 *    captures (l'annonce publiée, le justificatif), personnes, enquêtes, étiquettes.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => A().escapeHtml(v ?? '');
    const toast = (...a) => A().toast(...a);
    const api = (...a) => A().api(...a);
    const post = (action, body) => api(action, {}, {method: 'POST', body});
    const S = () => A().state;
    const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '')); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };
    const euro = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'});
    let D = null;

    const UNITS = [['word', 'au mot'], ['line', 'à la ligne'], ['char', 'au caractère'], ['fixed', 'au forfait (prix fixe)']];
    const OPTIONS = [['title', 'Titre en tête', 'title_price'], ['bold', 'Mots en gras', 'bold_price'], ['photo', 'Photo / logo', 'photo_price'], ['box', 'Encadré', 'box_price'],
        ['domiciliation', 'Réponse au journal (domiciliation)', 'domiciliation_price'], ['web', 'Aussi sur internet', 'web_price'], ['member', 'Tarif adhérent / abonné', null]];

    /* ─── Compter et calculer ─── */
    function counts(text, r = {}) {
        const t = String(text || '').trim(), words = t ? t.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length : 0;
        const chars = r.count_spaces === '0' ? t.replace(/\s/g, '').length : t.length, cpl = Math.max(10, num(r.chars_per_line) || 40);
        const lines = t ? t.split(/\n/).reduce((s, p) => s + Math.max(1, Math.ceil((r.count_spaces === '0' ? p.replace(/\s/g, '') : p).length / cpl)), 0) : 0;
        return {words, chars, lines, cpl};
    }
    /** Le prix, ligne par ligne : {total, lines: [[texte, montant]], warn: [...]} */
    function price(text, r = {}, opts = [], insertions = 1) {
        const c = counts(text, r), out = [], warn = [];
        if (!['word', 'line', 'char', 'fixed'].includes(r.unit)) return {total: null, lines: [], warn: ['Choisis ou crée les règles du journal pour calculer le prix.'], c};
        r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, /(_price|price|_units|fee|_from|_pct|chars_per_line)$/.test(k) && num(v) !== null ? String(Math.max(0, k === 'discount_pct' ? Math.min(100, num(v)) : num(v))) : v])); // pas de prix ni de nombre négatifs
        const units = r.unit === 'word' ? c.words : r.unit === 'line' ? c.lines : r.unit === 'char' ? c.chars : 1;
        const unitName = {word: 'mot', line: 'ligne', char: 'caractère', fixed: 'forfait'}[r.unit];
        const member = opts.includes('member') && num(r.member_price) !== null, p = member ? num(r.member_price) : (num(r.price) ?? 0);
        let billable = units;
        if (num(r.min_units) && billable < num(r.min_units)) { out.push([`Minimum : ${num(r.min_units)} ${unitName}s comptés (tu en as ${units})`, null]); billable = num(r.min_units); }
        const free = Math.min(billable, num(r.free_units) || 0);
        if (free) out.push([`${free} premier${free > 1 ? 's' : ''} ${unitName}${free > 1 ? 's' : ''} gratuit${free > 1 ? 's' : ''}`, null]);
        let one = r.unit === 'fixed' ? p : (billable - free) * p;
        out.push([r.unit === 'fixed' ? `Forfait${member ? ' (adhérent)' : ''}` : `${billable - free} ${unitName}${billable - free > 1 ? 's' : ''} × ${euro(p)}${member ? ' (adhérent)' : ''}`, one]);
        if (num(r.fixed_fee)) { out.push(['Frais fixes', num(r.fixed_fee)]); one += num(r.fixed_fee); }
        OPTIONS.forEach(([k, l, key]) => { if (key && opts.includes(k)) { const v = num(r[key]); if (v === null) warn.push(`Prix de l’option « ${l} » pas indiqué dans les règles.`); else { out.push([l, v]); one += v; } } });
        if (num(r.min_price) && one < num(r.min_price)) { out.push([`Prix minimum d’une parution`, num(r.min_price) - one]); one = num(r.min_price); }
        let total = one; const n = Math.max(1, Math.round(insertions || 1));
        if (n > 1) { total = one * n; out.push([`${n} parutions × ${euro(one)}`, null]); if (num(r.discount_from) && n >= num(r.discount_from) && num(r.discount_pct)) { const d = total * num(r.discount_pct) / 100; out.push([`Remise ${num(r.discount_pct)} % (dès ${num(r.discount_from)} parutions)`, -d]); total -= d; } }
        if (num(r.tax_pct) && r.tax_included !== '1') { const t = total * num(r.tax_pct) / 100; out.push([`TVA ${num(r.tax_pct)} %`, t]); total += t; }
        if (num(r.max_units) && units > num(r.max_units)) warn.push(`Trop long : ${units} ${unitName}s pour ${num(r.max_units)} au maximum.`);
        return {total, lines: out, warn, c};
    }

    /* ─── Lire les règles sur une capture (OCR) ─── */
    const ocr = () => A().loadOcrEngine();
    /** Ce qu'on reconnaît dans un texte de tarifs, en français : {clé: valeur} */
    function parseRules(raw) {
        const t = ' ' + String(raw || '').slice(0, 8000).replace(/\d{9,}/g, ' ').replace(/\s+/g, ' ').replace(/(\d)\s*,\s*(\d)/g, '$1.$2').toLowerCase() + ' ', r = {};
        const money = '(?<![\\d.])(\\d{1,7}(?:\\.\\d+)?)\\s*(?:€|euros?|eur)';
        const m = re => t.match(new RegExp(re, 'i'));
        let x;
        if ((x = m(`${money}\\s*(?:le|par|/|la|du|pour un|pour le)\\s*mot`)) || (x = m(`mot\\s*(?:supplémentaire)?\\s*[:=]?\\s*${money}`))) { r.unit = 'word'; r.price = x[1]; }
        else if ((x = m(`${money}\\s*(?:la|par|/|pour une|pour la)\\s*ligne`)) || (x = m(`ligne\\s*(?:supplémentaire)?\\s*[:=]?\\s*${money}`))) { r.unit = 'line'; r.price = x[1]; }
        else if ((x = m(`${money}\\s*(?:le|par|/)\\s*(?:signe|caract)`))) { r.unit = 'char'; r.price = x[1]; }
        else if ((x = m(`(?:forfait|prix unique|tarif unique)\\s*(?:de)?\\s*[:=]?\\s*${money}`))) { r.unit = 'fixed'; r.price = x[1]; }
        if ((x = m('(?<![\\d.])(\\d{1,7})\\s*(?:caractères|signes|lettres)\\s*(?:espaces compris\\s*)?(?:par|/|la)\\s*ligne'))) r.chars_per_line = x[1];
        if (/espaces non compris|hors espaces/.test(t)) r.count_spaces = '0';
        if ((x = m('(?<![\\d.])(\\d{1,7})\\s*(?:premiers?)\\s*(?:mots|lignes)?\\s*(?:gratuits?|offerts?)')) || (x = m('(?:gratuits?|offerts?)\\s*(?:jusqu.à|pour les)\\s*(?<![\\d.])(\\d{1,7})\\s*(?:premiers?\\s*)?(?:mots|lignes)'))) r.free_units = x[1];
        if ((x = m('minimum\\s*(?:de|:)?\\s*(?<![\\d.])(\\d{1,7})\\s*(?:mots|lignes|caractères)'))) r.min_units = x[1];
        if ((x = m(`minimum\\s*(?:de\\s*perception|de|:)?\\s*${money}`)) || (x = m(`${money}\\s*minimum`))) r.min_price = x[1];
        if ((x = m('(?:maximum|max\\.?|au plus|pas plus de)\\s*(?:de|:)?\\s*(?<![\\d.])(\\d{1,7})\\s*(?:mots|lignes|caractères)'))) r.max_units = x[1];
        if ((x = m(`(?:adhérents?|abonnés?|membres?)\\s*[:=]?\\s*${money}`))) r.member_price = x[1]; else if (/gratuite?s?\s*(?:pour les|aux)\s*(?:adhérents|abonnés|membres)/.test(t)) r.member_price = '0';
        const opt = (key, words) => { const y = m(`(?:${words})[^.€\\d]{0,40}${money}`) || m(`${money}[^.\\d]{0,20}(?:${words})`); if (y) r[key] = y[1]; };
        opt('photo_price', 'photo|logo|image|illustration'); opt('box_price', 'encadr[ée]|cadre|filet'); opt('bold_price', 'gras|caractères gras'); opt('title_price', 'titre|en-tête|accroche');
        opt('domiciliation_price', 'domiciliation|réponse au journal|sous référence|boîte'); opt('web_price', 'internet|site|en ligne|web'); opt('fixed_fee', 'frais (?:de dossier|fixes|techniques)|frais d.insertion');
        if ((x = m('tva\\s*(?:de|à)?\\s*(?<![\\d.])(\\d{1,7}(?:\\.\\d+)?)\\s*%'))) r.tax_pct = x[1];
        if (/\bttc\b|tva comprise|taxes? comprises?/.test(t)) r.tax_included = '1';
        if ((x = m('(?<![\\d.])(\\d{1,7})\\s*%\\s*(?:de\\s*)?(?:remise|réduction)[^\\d]{0,30}(?<![\\d.])(\\d{1,7})\\s*(?:parutions|insertions|numéros)'))) { r.discount_pct = x[1]; r.discount_from = x[2]; }
        else if ((x = m('(?<![\\d.])(\\d{1,7})\\s*(?:parutions|insertions|numéros)[^\\d]{0,30}(?<![\\d.])(\\d{1,7})\\s*%'))) { r.discount_from = x[1]; r.discount_pct = x[2]; }
        if ((x = m('(?:avant le|date limite|au plus tard le|clôture)\\s*:?\\s*(\\d{1,2}(?:er)?\\s+[a-zéû]+(?:\\s+\\d{4})?|\\d{1,2}[/.]\\d{1,2}(?:[/.]\\d{2,4})?)'))) r.deadline = x[1];
        if ((x = String(raw || '').slice(0, 8000).match(/(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}\.[\w.]{2,63}/))) r.send_to = x[0];
        return r;
    }

    /* ─── La liste ─── */
    ext.lists.press_ads = async token => {
        try { D = await api('press_ads'); } catch (error) { if (token === S().workspaceToken) A().$('#workspace').innerHTML = `<section class="page">${A().empty(error.message)}</section>`; return; }
        if (token !== S().workspaceToken) return;
        draw();
    };
    const rulesOf = ad => D.rules.find(r => r.id === ad.rules_id);
    const journalOf = ad => D.periodicals.find(p => Number(p.id) === ad.periodical_id)?.title || ad.journal || rulesOf(ad)?.name || '';
    function draw() {
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page h-pa">
            <header class="page-header"><div><span class="eyebrow">LISTES</span><h2>✉️ Petites annonces et courriers aux journaux</h2><p>Écris ton annonce, vois tout de suite combien elle coûtera d’après les règles du journal, et suis ce qu’elle devient.</p></div>
                <div class="page-actions"><button type="button" class="button" data-pa-new>＋ Annonce ou courrier</button><button type="button" class="button secondary" data-pa-rules-new>＋ Règles d’un journal</button><button type="button" class="button secondary" data-pa-ocr>📷 Lire une capture des règles</button></div></header>
            <h3>Mes annonces et courriers</h3>
            ${D.ads.length ? `<div class="data-table-wrap"><table class="data-table h-pr-table"><thead><tr><th>Annonce</th><th>Journal</th><th>Sorte</th><th>Où j’en suis</th><th>Parution</th><th>Prix calculé</th><th>Payé</th><th>Rattachée à</th></tr></thead><tbody>
                ${D.ads.map(a => { const pr = price(a.body, rulesOf(a)?.rules || {}, a.data?.options || [], num(a.data?.insertions) || 1); return `<tr data-pa-ad="${a.id}"><td><strong>${esc(a.title)}</strong><small>${esc(String(a.body || '').slice(0, 110))}${String(a.body || '').length > 110 ? '…' : ''}</small></td><td>${esc(journalOf(a))}</td><td>${esc(D.kinds[a.kind] || '')}</td><td><span class="h-pr-chip h-pa-${esc(a.status)}">${esc(D.statuses[a.status] || '')}</span></td><td>${esc([a.data?.publish_date, a.data?.issue_ref].filter(Boolean).join(' · '))}</td><td>${pr.total === null ? '—' : esc(euro(pr.total))}</td><td>${esc(a.data?.cost_paid || '')}</td><td>${(a.links || []).map(l => `${l.type === 'person' ? '👤' : '🔎'} ${esc(l.name)}`).join(', ')}</td></tr>`; }).join('')}
            </tbody></table></div>` : A().emptyState({icon: '📰', text: 'Aucune annonce pour l’instant', hint: 'Écris ton annonce et vois tout de suite combien elle coûtera d’après les règles du journal.', action: {label: '＋ Annonce ou courrier', attrs: 'data-pa-new'}})}
            <h3>Règles des journaux</h3>
            ${D.rules.length ? `<div class="h-pr-cards">${D.rules.map(r => `<article class="h-pr-card" data-pa-rules="${r.id}"><header><strong>${esc(r.name)}</strong><small>${esc(summary(r.rules))}</small></header>${r.rules.deadline ? `<p>📅 Date limite : ${esc(r.rules.deadline)}</p>` : ''}${r.rules.send_to ? `<p>✉️ ${esc(r.rules.send_to)}</p>` : ''}</article>`).join('')}</div>` : A().emptyState({icon: '📏', text: 'Aucune règle pour l’instant', hint: 'Ou « 📷 Lire une capture des règles » pour les remplir toutes seules.', action: {label: '＋ Règles d’un journal', attrs: 'data-pa-rules-new'}})}
        </section>`;
        const page = ws.querySelector('.h-pa');
        page.querySelectorAll('[data-pa-new]').forEach(b => b.addEventListener('click', () => adDialog(null)));
        page.querySelectorAll('[data-pa-rules-new]').forEach(b => b.addEventListener('click', () => rulesDialog(null)));
        page.querySelector('[data-pa-ocr]').addEventListener('click', () => rulesDialog(null, {ocrNow: true}));
        page.addEventListener('click', e => { const ad = e.target.closest('[data-pa-ad]'); if (ad) return adDialog(D.ads.find(a => a.id === Number(ad.dataset.paAd))); const ru = e.target.closest('[data-pa-rules]'); if (ru) rulesDialog(D.rules.find(r => r.id === Number(ru.dataset.paRules))); });
    }
    const summary = r => { if (!r?.unit) return 'tarif pas indiqué'; const u = {word: 'le mot', line: 'la ligne', char: 'le caractère', fixed: 'forfait'}[r.unit]; return [`${num(r.price) !== null ? euro(num(r.price)) : '?'} ${u}`, r.min_units && `minimum ${r.min_units} ${{word: 'mots', line: 'lignes', char: 'caractères'}[r.unit] || ''}`, r.free_units && `${r.free_units} premiers gratuits`, r.member_price && `adhérent ${euro(num(r.member_price) || 0)}`].filter(Boolean).join(' · '); };
    const reload = async () => { D = await api('press_ads'); if (S().module === 'listes' && S().listType === 'press_ads') draw(); };

    /* ─── Les règles d'un journal ─── */
    const RFIELDS = [['unit', 'Comment c’est compté', 'select'], ['price', 'Prix (€ par mot / ligne / caractère, ou forfait)'], ['member_price', 'Prix adhérent / abonné'], ['chars_per_line', 'Caractères par ligne'],
        ['count_spaces', 'Les espaces comptent', 'yesno'], ['free_units', 'Premiers mots / lignes gratuits'], ['min_units', 'Minimum compté (mots / lignes)'], ['min_price', 'Prix minimum d’une parution (€)'], ['max_units', 'Maximum (mots / lignes)'],
        ['fixed_fee', 'Frais fixes (€)'], ['title_price', 'Option titre (€)'], ['bold_price', 'Option gras (€)'], ['photo_price', 'Option photo / logo (€)'], ['box_price', 'Option encadré (€)'], ['domiciliation_price', 'Domiciliation (€)'],
        ['web_price', 'Aussi sur internet (€)'], ['discount_from', 'Remise à partir de (parutions)'], ['discount_pct', 'Remise (%)'], ['tax_pct', 'TVA (%)'], ['tax_included', 'Prix déjà TTC', 'yesno'], ['deadline', 'Date limite d’envoi'],
        ['send_to', 'Où envoyer (courriel, adresse)'], ['payment', 'Paiement (chèque, en ligne…)'], ['other', 'Autres règles (abréviations, interdits…)', 'textarea']];
    function rulesDialog(r, {ocrNow = false} = {}) {
        const v = r?.rules || {};
        const input = ([k, l, type]) => type === 'select' ? `<label>${esc(l)}<select name="r_${k}"><option value="">—</option>${UNITS.map(([u, ul]) => `<option value="${u}" ${v[k] === u ? 'selected' : ''}>${ul}</option>`).join('')}</select></label>`
            : type === 'yesno' ? `<label>${esc(l)}<select name="r_${k}"><option value="">—</option><option value="1" ${v[k] === '1' ? 'selected' : ''}>oui</option><option value="0" ${v[k] === '0' ? 'selected' : ''}>non</option></select></label>`
            : type === 'textarea' ? `<label class="span-2">${esc(l)}<textarea name="r_${k}" rows="3">${esc(v[k] || '')}</textarea></label>` : `<label>${esc(l)}<input name="r_${k}" value="${esc(v[k] || '')}"></label>`;
        const dl = ext.openDialog({eyebrow: 'RÈGLES D’UN JOURNAL', title: r ? r.name : 'Nouvelles règles', wide: true,
            body: `<div class="form-grid"><label>Nom (journal, rubrique)<input name="name" value="${esc(r?.name || '')}" required placeholder="Ouest-France, petites annonces du dimanche…"></label>
                <label>Revue de la liste « Revues »<select name="periodical_id"><option value="0">—</option>${D.periodicals.map(p => `<option value="${p.id}" ${Number(p.id) === r?.periodical_id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></div>
                <section class="h-pa-ocr"><h4>📷 Remplir à partir d’une capture d’écran des règles</h4><p class="muted">Choisis ou colle (⌘V) une capture de la page des tarifs : le texte est lu, les règles reconnues sont remplies ci-dessous <mark>en jaune</mark>. Vérifie et corrige. (La lecture demande internet la première fois.)</p>
                <div class="h-pa-ocrbar"><label class="button small">Choisir une capture<input type="file" accept="image/*" data-pa-ocrfile hidden></label><small data-pa-ocrstate></small></div>
                <details data-pa-srcbox ${r?.source_text ? 'open' : ''}><summary>Texte des règles (lu sur la capture, ou copié-collé de la page du journal)</summary><textarea name="source_text" rows="6">${esc(r?.source_text || '')}</textarea><button type="button" class="button small secondary" data-pa-reparse>Remplir à partir de ce texte</button></details></section>
                <div class="form-grid h-pa-rules">${RFIELDS.map(input).join('')}<label class="span-2">Notes<textarea name="notes" rows="2">${esc(r?.notes || '')}</textarea></label></div>`,
            onOpen: d => {
                const state = d.querySelector('[data-pa-ocrstate]'), srcBox = d.querySelector('[data-pa-srcbox]');
                const apply = text => { const found = parseRules(text); let n = 0; Object.entries(found).forEach(([k, val]) => { const el = d.querySelector(`[name="r_${k}"]`); if (!el) return; el.value = val; el.classList.add('is-ocr'); n++; }); state.textContent = n ? `${n} règle${n > 1 ? 's' : ''} reconnue${n > 1 ? 's' : ''} : vérifie les cases en jaune.` : 'Aucune règle reconnue : complète à la main (le texte lu est ci-dessous).'; };
                const read = async file => {
                    state.textContent = 'Lecture de la capture…';
                    try { const T = await ocr(); const res = await T.recognize(file, 'fra', {logger: m => { if (m.status === 'recognizing text') state.textContent = `Lecture… ${Math.round((m.progress || 0) * 100)} %`; }}); const text = res?.data?.text || '';
                        d.querySelector('[name=source_text]').value = text; srcBox.open = true; apply(text);
                        d._capture = file; } catch (err) { state.textContent = err.message; }
                };
                d.querySelector('[data-pa-ocrfile]').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) read(f); });
                d.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); read(f); } });
                d.querySelector('[data-pa-reparse]').addEventListener('click', () => apply(d.querySelector('[name=source_text]').value));
                d.querySelectorAll('[name^="r_"]').forEach(el => el.addEventListener('input', () => el.classList.remove('is-ocr')));
                if (ocrNow) setTimeout(() => d.querySelector('[data-pa-ocrfile]').click(), 100);
            },
            onSubmit: async form => {
                const rules = {}; RFIELDS.forEach(([k]) => { rules[k] = form.elements['r_' + k]?.value || ''; });
                await post('save_press_ad_rules', {id: r?.id || 0, name: form.elements.name.value, periodical_id: form.elements.periodical_id.value, rules, source_text: form.elements.source_text.value, notes: form.elements.notes.value});
                toast('Règles enregistrées.'); await reload();
            },
            onDelete: r ? async () => { if (!await A().confirmBox(`Supprimer les règles « ${r.name} » ? (les annonces restent)`, {title: 'Supprimer les règles', okLabel: 'Supprimer les règles'})) return false; await post('delete_press_item', {what: 'rules', id: r.id}); await reload(); } : null});
        return dl;
    }

    /* ─── Une annonce ─── */
    const TEMPLATES = [
        ['🔎 Recherche de descendants', 'Recherche descendants de [Prénom NOM], né(e) en [année] à [commune], fils/fille de [parents]. Toute information bienvenue. Contact : [courriel / téléphone].'],
        ['📜 Recherche de renseignements', 'Cherche renseignements, photos ou documents sur la famille [NOM] de [commune / région], [période]. Merci de contacter [courriel].'],
        ['🖼️ Photo à identifier', 'Qui reconnaît ces personnes ? Photo prise vers [année] à [lieu], famille [NOM] probable. Réponse au journal ou [courriel].'],
        ['🎖️ Soldat, militaire', 'Recherche témoignages, lettres ou photos de [Prénom NOM], [grade] au [régiment], [mort / blessé] en [année] à [lieu]. Contact : [courriel].'],
        ['🤝 Cousinade', 'Cousinade des descendants de [Prénom NOM] et [Prénom NOM] le [date] à [lieu]. Inscriptions avant le [date] : [contact].'],
        ['✉️ Courrier des lecteurs', 'Madame, Monsieur,\nLecteur de votre journal, je fais la généalogie de ma famille, originaire de [commune]. …\nAvec mes remerciements,\n[Prénom NOM], [ville]'],
    ];
    function adDialog(ad) {
        const d = ad?.data || {}, opts = d.options || [];
        ext.openDialog({eyebrow: 'ANNONCE OU COURRIER', title: ad ? ad.title : 'Nouvelle annonce', wide: true, labels: ['press_ad', ad?.labels || []],
            body: `<div class="form-grid"><label class="span-2">Titre (pour toi)<input name="title" value="${esc(ad?.title || '')}" placeholder="Recherche descendants Guerche — Ouest-France"></label>
                <label>Sorte<select name="kind">${Object.entries(D.kinds).map(([k, l]) => `<option value="${k}" ${k === (ad?.kind || 'annonce') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Où j’en suis<select name="status">${Object.entries(D.statuses).map(([k, l]) => `<option value="${k}" ${k === (ad?.status || 'draft') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                <label>Journal (liste des revues)<select name="periodical_id"><option value="0">—</option>${D.periodicals.map(p => `<option value="${p.id}" ${Number(p.id) === ad?.periodical_id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>
                <label>ou autre journal<input name="journal" value="${esc(ad?.journal || '')}" placeholder="Le Courrier de l’Ouest…"></label>
                <label class="span-2">Règles de tarif<select name="rules_id"><option value="0">— aucune (pas de calcul) —</option>${D.rules.map(r => `<option value="${r.id}" ${r.id === ad?.rules_id ? 'selected' : ''}>${esc(r.name)} — ${esc(summary(r.rules))}</option>`).join('')}</select></label></div>
                <div class="h-pa-tpl"><span class="section-label">Modèles</span>${TEMPLATES.map(([l], k) => `<button type="button" class="button small secondary" data-pa-tpl="${k}">${esc(l)}</button>`).join('')}</div>
                <label class="h-pa-text">Texte de l’annonce<textarea name="body" rows="7" placeholder="Le texte tel qu’il sera publié">${esc(ad?.body || '')}</textarea></label>
                <div class="h-pa-calc" data-pa-calc></div>
                <div class="form-grid"><fieldset class="span-2 h-pa-opts"><legend>Options</legend>${OPTIONS.map(([k, l]) => `<label class="checkbox-line"><input type="checkbox" name="opt_${k}" value="1" ${opts.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}<label>Parutions <input type="number" name="insertions" min="1" max="99" value="${esc(d.insertions || 1)}"></label></fieldset>
                <label>Envoyée le<input name="sent_date" value="${esc(d.sent_date || '')}"></label><label>Parution le / prévue le<input name="publish_date" value="${esc(d.publish_date || '')}"></label>
                <label>Numéro ou édition parue<input name="issue_ref" value="${esc(d.issue_ref || '')}" placeholder="n° 254, édition de Rennes…"></label><label>Prix payé<input name="cost_paid" value="${esc(d.cost_paid || '')}"></label>
                <label>Paiement<input name="payment" value="${esc(d.payment || '')}" placeholder="chèque n°…, carte, en ligne"></label><label>Contact au journal<input name="contact" value="${esc(d.contact || '')}"></label>
                <label class="span-2">Réponses reçues<textarea name="answers" rows="3" placeholder="Qui a répondu, quand, ce qu’on a appris…">${esc(d.answers || '')}</textarea></label>
                <label class="span-2">Notes<textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label></div>
                ${ext.mediaEditorHtml ? ext.mediaEditorHtml('press_ad', ad?.id || 0, ad?.media || [], [['', '📸 Captures : l’annonce publiée, le justificatif, les réponses', 'image/*,application/pdf']]) : ''}
                <div class="h-pa-linkslot"></div>`,
            onOpen: dl => {
                // personnes et enquêtes : le même champ que dans « Revues et magazines »
                const slot = dl.querySelector('.h-pa-linkslot'); slot.outerHTML = `<div class="h-pr-links" data-pr-links><span class="section-label">Rattachée à</span><span class="h-pr-linkchips">${(ad?.links || []).map(l => `<span class="h-pr-lchip" data-type="${l.type}" data-id="${l.id}">${l.type === 'person' ? '👤' : '🔎'} ${esc(l.name)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`).join('')}</span><span class="h-pr-addlink"><input type="search" data-pr-lq placeholder="Ajouter une personne ou une enquête…" autocomplete="off"><span class="h-pr-lsugg" hidden></span></span></div>`;
                bindLinks(dl);
                const calc = () => {
                    const f = dl.querySelector('form'), r = D.rules.find(x => x.id === Number(f.elements.rules_id.value))?.rules || {}, o = OPTIONS.map(([k]) => k).filter(k => f.elements['opt_' + k]?.checked);
                    const pr = price(f.elements.body.value, r, o, Number(f.elements.insertions.value) || 1);
                    dl.querySelector('[data-pa-calc]').innerHTML = `<div class="h-pa-counts"><span><b>${pr.c.words}</b> mots</span><span><b>${pr.c.chars}</b> caractères${r.count_spaces === '0' ? ' (sans espaces)' : ''}</span><span><b>${pr.c.lines}</b> lignes de ${pr.c.cpl}</span></div>
                        ${pr.lines.length ? `<table class="h-pa-bill">${pr.lines.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${v === null ? '' : esc(euro(v))}</td></tr>`).join('')}<tr class="is-total"><td>Total</td><td>${pr.total === null ? '—' : esc(euro(pr.total))}</td></tr></table>` : ''}
                        ${pr.warn.map(w => `<p class="h-offsite-sentence is-warn">⚠️ ${esc(w)}</p>`).join('')}${r.deadline ? `<p class="muted">📅 À envoyer avant : ${esc(r.deadline)}${r.send_to ? ` · ✉️ ${esc(r.send_to)}` : ''}</p>` : ''}${r.other ? `<details><summary>Autres règles du journal</summary><p>${esc(r.other)}</p></details>` : ''}`;
                    dl._estimate = pr.total;
                };
                dl.addEventListener('input', calc); dl.addEventListener('change', calc); calc();
                dl.querySelectorAll('[data-pa-tpl]').forEach(b => b.addEventListener('click', async () => { const ta = dl.querySelector('[name=body]'); if (ta.value.trim() && !await A().confirmBox('Remplacer le texte par ce modèle ?', {title: 'Utiliser ce modèle', okLabel: 'Remplacer le texte'})) return; ta.value = TEMPLATES[Number(b.dataset.paTpl)][1]; ta.focus(); calc(); }));
            },
            onSubmit: async form => {
                const v = A().formObject(form), links = {persons: [], investigations: []};
                form.querySelectorAll('.h-pr-lchip').forEach(c => links[c.dataset.type === 'person' ? 'persons' : 'investigations'].push(Number(c.dataset.id)));
                const lb = form.querySelector('[data-pending-labels]');
                const r = await post('save_press_ad', {id: ad?.id || 0, title: v.title, kind: v.kind, status: v.status, periodical_id: v.periodical_id, journal: v.journal, rules_id: v.rules_id, body: form.elements.body.value,
                    data: {options: OPTIONS.map(([k]) => k).filter(k => form.elements['opt_' + k]?.checked), insertions: v.insertions, sent_date: v.sent_date, publish_date: v.publish_date, issue_ref: v.issue_ref, cost_paid: v.cost_paid,
                        cost_estimate: form.closest('dialog')._estimate ?? '', payment: v.payment, contact: v.contact, answers: v.answers, notes: v.notes},
                    ...links, label_ids: lb ? (lb.dataset.ids || '').split(',').map(Number).filter(Boolean) : undefined});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'press_ad', Number((r.result || r).id));
                toast('Annonce enregistrée.'); await reload();
            },
            onDelete: ad ? async () => { if (!await A().confirmBox(`Supprimer « ${ad.title} » ?`, {title: 'Supprimer l’annonce', okLabel: 'Supprimer l’annonce'})) return false; await post('delete_press_item', {what: 'ad', id: ad.id}); await reload(); } : null});
    }
    let invCache = null;
    function bindLinks(root) {
        const box = root.querySelector('[data-pr-links]'); if (!box) return;
        const input = box.querySelector('[data-pr-lq]'), sugg = box.querySelector('.h-pr-lsugg'); let t = 0;
        box.addEventListener('click', e => {
            if (e.target.closest('[data-pr-unlink]')) { e.target.closest('.h-pr-lchip').remove(); return; }
            const s = e.target.closest('[data-add-type]'); if (!s) return;
            if (!box.querySelector(`.h-pr-lchip[data-type="${s.dataset.addType}"][data-id="${s.dataset.addId}"]`)) box.querySelector('.h-pr-linkchips').insertAdjacentHTML('beforeend', `<span class="h-pr-lchip" data-type="${s.dataset.addType}" data-id="${s.dataset.addId}">${s.dataset.addType === 'person' ? '👤' : '🔎'} ${esc(s.dataset.addName)} <button type="button" data-pr-unlink aria-label="Retirer">×</button></span>`);
            input.value = ''; sugg.hidden = true;
        });
        input.addEventListener('input', () => { clearTimeout(t); const q = input.value.trim(); if (q.length < 2) { sugg.hidden = true; return; } t = setTimeout(async () => {
            let people = [], invs = [];
            try { people = (await api('search', {type: 'persons', q, limit: 8})).data || []; } catch (_) {}
            try { if (!invCache) invCache = (await api('investigations', {status: 'all'})).investigations || []; invs = invCache.filter(i => String(i.title || '').toLowerCase().includes(q.toLowerCase())).slice(0, 6); } catch (_) {}
            sugg.innerHTML = [...people.map(p => `<button type="button" data-add-type="person" data-add-id="${p.id}" data-add-name="${esc(A().personName(p))}">👤 ${esc(A().personName(p))}</button>`), ...invs.map(i => `<button type="button" data-add-type="investigation" data-add-id="${i.id}" data-add-name="${esc(i.title)}">🔎 ${esc(i.title)}</button>`)].join('') || '<small class="muted">Rien trouvé.</small>';
            sugg.hidden = false; }, 220); });
    }
    ext.pressAdsInternals = {price, parseRules, counts}; // pour les essais
})();
