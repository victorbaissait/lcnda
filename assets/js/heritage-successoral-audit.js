/* LCNDA — ⚖️ Successions : ce que l'audit des onglets a ajouté (docs/design/audit-onglets.html, §6).
 * Branché par heritage-successoral.js (renderCase → ext.succAudit.after(onglet, corps, D, R, P_)) et par le tableau des
 * dossiers (heritage-successoral-dossiers.js → ext.succAudit.assignments()). Serveur : lib/successoral_audit.php (ops « au_… »).
 *  - 👥 « Chargé du dossier » (📁 Dossier) et chargé de chaque échéance ; « Qui suis-je ? » (réglage genealogie-succ-me) donne
 *    le filtre « 👤 Mes dossiers » du tableau des dossiers ; chaque changement a son « ↶ Annuler » ;
 *  - 🛡 Conflit d'intérêts : un bandeau dans 👥 Héritiers quand un héritier figure déjà dans un autre dossier ouvert ;
 *  - 🔎 Lire la pièce (📑 Pièces) : la lecture automatique (OCR, A().loadOcrEngine) d'un acte scanné propose des noms, dates
 *    et lieux à vérifier ; « ✍️ Noter au journal » garde ce qui a été lu ;
 *  - 📜 Tableau de dévolution (🖨 Pour le notaire) : un projet à joindre à l'acte de notoriété — défunt, héritiers, liens,
 *    parts, renvois aux pièces numérotées — à imprimer ou à ouvrir dans le traitement de texte.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const get = (op, q = {}) => A().api('successoral', {op, ...q});
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); return r.result || r; };
    const toast = (...a) => A().toast(...a);
    const ME = 'genealogie-succ-me';
    const me = () => { try { return String(JSON.parse(localStorage.getItem(ME) || '""') || '').slice(0, 80); } catch (_) { return ''; } };
    let asgCache = null;
    async function assignments(force = false) {
        if (!asgCache || force) { try { asgCache = await get('au_assign'); } catch (_) { asgCache = {items: [], names: []}; } }
        return {...asgCache, me: me()};
    }
    const whoFor = (items, caseId, task = '') => items.find(x => x.case_id === Number(caseId) && x.task === task)?.who || '';

    /* ═════ 👥 Chargé du dossier / d'une échéance ═════ */
    async function chooseWho(caseId, task, label) {
        const a = await assignments(true), cur = whoFor(a.items, caseId, task), names = [...new Set([a.me, ...a.names].filter(Boolean))];
        return new Promise(resolve => {
            let done = false;
            ext.openDialog?.({eyebrow: i18n('SUCCESSIONS'), title: label, submitLabel: i18n('Enregistrer'),
                body: `<div class="form-grid one-column"><label>${esc(i18n('Qui s’en charge ?'))}<input name="who" maxlength="80" value="${esc(cur)}" list="succ-au-names" placeholder="${esc(i18n('ex. Claire LACOMBE (vide : personne)'))}"></label>
                    <datalist id="succ-au-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
                    <label class="checkbox-line"><input type="checkbox" name="isme" ${cur && cur === a.me ? 'checked' : ''}> ${esc(i18n('C’est moi (pour le filtre « Mes dossiers »)'))}</label>
                    ${a.me ? `<p class="muted">${esc(i18n('Sur cet ordinateur, « moi » = {name}.', {name: a.me}))}</p>` : ''}</div>`,
                onOpen: d => d.addEventListener('close', () => { if (!done) resolve(null); }),
                onSubmit: f => { done = true; const v = Object.fromEntries(new FormData(f)); resolve({who: String(v.who || '').trim(), isme: !!v.isme, before: cur}); }});
        });
    }
    async function assign(caseId, task, label, after) {
        const r = await chooseWho(caseId, task, label); if (!r) return;
        if (r.isme && r.who) { try { localStorage.setItem(ME, JSON.stringify(r.who)); } catch (_) {} }
        if (r.who === r.before) return;
        try { await post({op: 'au_assign', case_id: caseId, task, who: r.who}); } catch (e) { return toast(e.message, 'error'); }
        asgCache = null; await after?.();
        A().undoToast?.(r.who ? i18n('Confié à {who}', {who: r.who}) : i18n('Plus personne n’en est chargé'), {
            undo: async () => { await post({op: 'au_assign', case_id: caseId, task, who: r.before}); asgCache = null; await after?.(); },
            redo: async () => { await post({op: 'au_assign', case_id: caseId, task, who: r.who}); asgCache = null; await after?.(); }});
    }
    async function paintAssign(body, D) {
        const a = await assignments(), who = whoFor(a.items, D.id);
        if (!body.isConnected) return;
        body.querySelector('[data-succ-au-box]')?.remove();
        const box = document.createElement('div'); box.className = 'succ-au-box'; box.dataset.succAuBox = '';
        box.innerHTML = `<span>👥 ${esc(i18n('Chargé du dossier :'))} <b data-succ-au-who>${esc(who || i18n('personne'))}</b>${who && who === a.me ? ` <small class="muted">${esc(i18n('(toi)'))}</small>` : ''}</span>${D.archived ? '' : `<button type="button" class="button small secondary" data-succ-au-assign>${esc(who ? i18n('Changer') : i18n('👥 Confier le dossier…'))}</button>`}`;
        body.prepend(box);
        box.querySelector('[data-succ-au-assign]')?.addEventListener('click', () => assign(D.id, '', i18n('👥 Chargé du dossier n° {n}', {n: D.number}), () => ext.successoral?.reload?.()));
        // chaque échéance : son chargé
        body.querySelectorAll('.succ-deadlines > li').forEach(li => {
            const id = Number(li.querySelector('[data-succ-dl-done]')?.dataset.succDlDone || 0); if (!id || li.querySelector('[data-succ-au-task]')) return;
            const w = whoFor(a.items, D.id, `d:${id}`);
            li.insertAdjacentHTML('beforeend', D.archived ? (w ? `<small class="succ-who">👤 ${esc(w)}</small>` : '') : `<button type="button" class="link-button succ-who" data-succ-au-task="${id}" title="${esc(i18n('Qui s’en charge ?'))}">👤 ${esc(w || i18n('à confier'))}</button>`);
        });
        body.querySelectorAll('[data-succ-au-task]').forEach(b => b.addEventListener('click', () => assign(D.id, `d:${b.dataset.succAuTask}`, i18n('👥 Qui s’occupe de cette échéance ?'), () => ext.successoral?.reload?.())));
    }

    /* ═════ 🛡 Conflit d'intérêts : un héritier déjà dans un autre dossier ouvert ═════ */
    async function paintConflicts(body, D) {
        let r; try { r = await get('au_conflicts', {id: D.id}); } catch (_) { return; }
        const items = r.items || []; if (!items.length || !body.isConnected) return;
        body.querySelector('[data-succ-au-conflict]')?.remove();
        const box = document.createElement('div'); box.dataset.succAuConflict = ''; box.className = 'succ-au-conflict';
        box.innerHTML = `${UI().notice ? UI().notice('warn', i18n('🛡 Conflit d’intérêts possible : {n} déjà dans un autre dossier ouvert. Vérifie avant de signer un contrat.', {n: A().plural(items.length, i18n('personne'))})) : ''}
            <ul class="succ-au-clist">${items.map(x => `<li>👤 <b>${esc(x.name)}</b> — ${esc(i18n('dossier n° {n}', {n: x.number}))} <button type="button" class="table-link" data-succ-open="${x.case_id}">${esc(x.title)}</button></li>`).join('')}</ul>`;
        body.prepend(box);
    }

    /* ═════ 🔎 Lire une pièce scannée (OCR) : noms, dates, lieux proposés, à vérifier ═════ */
    const MONTHS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
    function propose(text) {
        const t = String(text || '').replace(/\s+/g, ' ');
        const uniq = a => [...new Set(a.map(x => x.trim()).filter(Boolean))].slice(0, 12);
        const dates = uniq([...t.matchAll(new RegExp(`\\b(\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\s+\\d{4}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}|(?:l['’]an\\s+)?(?:mil\\s+)?[a-zéèûô-]+\\s+cent\\s+[a-zéèûô\\s-]{3,40}?(?=[,.;]))`, 'gi'))].map(m => m[1]));
        const names = uniq([...t.matchAll(/\b([A-ZÉÈÀÂÎÔÛÇ][a-zéèêàâîôûç]+(?:-[A-ZÉÈÀÂÎÔÛÇ][a-zéèêàâîôûç]+)?\s+[A-ZÉÈÀÂÎÔÛÇ]{2,}(?:[- ][A-ZÉÈÀÂÎÔÛÇ]{2,})?)\b/g)].map(m => m[1]));
        const places = uniq([...t.matchAll(/\b(?:à|en la commune de|commune de|demeurant à|né[e]? à|décédé[e]? à)\s+([A-ZÉÈÀÂÎÔÛ][a-zA-ZéèêàâîôûçÉÈÀÂÎÔÛ'-]*[a-zéèêàâîôûç])/g)].map(m => m[1]));
        return {dates, names, places};
    }
    ext.succAuditPropose = propose; // (essais)
    async function readPiece(D, key, btn) {
        const pc = D.pieces?.[key] || {}, act = D.acts?.[key] || {};
        let media = []; try { media = (await get('au_piece_media', pc.media_id ? {media_id: pc.media_id} : {event_id: act.event_id || 0})).items || []; } catch (_) {}
        media = media.filter(m => /^image/.test(m.media_type || 'image') && m.filename);
        if (!media.length) return toast(i18n('Pas d’image de cette pièce dans la base : relie l’acte scanné à l’événement, puis recommence.'), 'error');
        const m = media[0];
        btn.disabled = true; const old = btn.textContent; btn.textContent = i18n('Lecture…');
        let text = '';
        try {
            const T = await (ext.succOcr ? Promise.resolve(ext.succOcr) : A().loadOcrEngine());
            const res = await T.recognize(`media/${encodeURIComponent(m.filename)}`, 'fra');
            text = String(res?.data?.text || '').trim();
        } catch (e) { toast(i18n('La lecture automatique n’a pas marché : {err}', {err: e?.message || e}), 'error'); }
        finally { btn.disabled = false; btn.textContent = old; }
        if (!text) return toast(i18n('Aucun texte lu sur cette image (écriture manuscrite ? essaie l’Atelier de transcription).'), 'error');
        const p = propose(text);
        const chips = (l, list) => `<div class="succ-au-prop"><b>${esc(l)}</b> ${list.length ? list.map(x => `<label class="succ-au-chip"><input type="checkbox" checked value="${esc(x)}" data-au-k="${esc(l)}"> ${esc(x)}</label>`).join(' ') : `<span class="muted">${esc(i18n('rien de trouvé'))}</span>`}</div>`;
        ext.openDialog?.({eyebrow: i18n('PIÈCE'), title: i18n('🔎 Lecture automatique — à vérifier'), wide: true, submitLabel: i18n('✍️ Noter au journal'),
            body: `<p class="muted">${esc(i18n('Ce que la machine a cru lire sur « {t} ». Décoche ce qui est faux : rien n’est changé dans les fiches.', {t: m.title || key}))}</p>
                ${chips(i18n('Noms'), p.names)}${chips(i18n('Dates'), p.dates)}${chips(i18n('Lieux'), p.places)}
                <details><summary>${esc(i18n('Le texte lu'))}</summary><pre class="succ-au-ocr">${esc(text.slice(0, 6000))}</pre></details>`,
            onSubmit: async f => {
                const kept = {}; f.querySelectorAll('[data-au-k]:checked').forEach(c => { (kept[c.dataset.auK] = kept[c.dataset.auK] || []).push(c.value); });
                const line = Object.entries(kept).map(([k, v]) => `${k} : ${v.join(', ')}`).join(' ; ');
                if (!line) return;
                await post({op: 'journal', case_id: D.id, id: D.id, kind: 'other', text: i18n('Lecture automatique de la pièce « {p} » (à vérifier) — {line}', {p: act.label || key, line}).slice(0, 2000)});
                toast(i18n('Noté au journal du dossier.'), 'success');
            }});
    }
    function paintPieceButtons(body, D) {
        if (D.archived) return;
        body.querySelectorAll('tr[data-succ-piece]').forEach(tr => {
            const key = tr.dataset.succPiece, has = D.pieces?.[key]?.media_id || D.acts?.[key]?.media;
            if (!has || tr.querySelector('[data-succ-au-read]')) return;
            const cell = tr.querySelector('.succ-p-act') || tr.lastElementChild;
            cell?.insertAdjacentHTML('beforeend', `<button type="button" class="button small secondary" data-succ-au-read="${esc(key)}" title="${esc(i18n('Lire le texte de l’acte scanné et proposer noms, dates et lieux'))}">${esc(i18n('🔎 Lire la pièce'))}</button>`);
        });
        body.querySelectorAll('[data-succ-au-read]').forEach(b => b.addEventListener('click', () => readPiece(D, b.dataset.succAuRead, b)));
    }

    /* ═════ 📜 Tableau de dévolution (projet, à joindre à l'acte de notoriété) ═════ */
    function devolutionHtml(D, R, P_) {
        const list = P_?.list || [], num = new Map(list.map((p, i) => [p.key, i + 1]));
        const common = (P_?.groups || []).find(g => g.key === 'common')?.items.map(i => i.key) || [];
        const refs = id => [...new Set([...common, ...(P_?.perHeir?.[id] || [])])].map(k => num.get(k)).filter(Boolean).sort((a, b) => a - b).map(n => `P${n}`).join(', ');
        const heirs = (R?.rows || []).filter(r => r.share && r.share !== '0');
        const dead = D.graph?.persons?.[D.deceased_id] || {};
        const stP = {have: i18n('reçue'), asked: i18n('demandée'), missing: i18n('à obtenir')};
        return `<section class="succ-devo"><h1>${esc(i18n('Tableau généalogique de dévolution'))}</h1>
            <p class="succ-devo-sub">${esc(i18n('PROJET — à vérifier et compléter par le notaire. Calcul indicatif établi d’après les fiches de la base.'))}</p>
            <table class="succ-devo-kv"><tr><th>${esc(i18n('Défunt'))}</th><td><b>${esc(D.deceased || '')}</b>${dead.birth?.year ? `, ${esc(i18n('né(e) en {y}', {y: dead.birth.year}))}` : ''}</td></tr>
                <tr><th>${esc(i18n('Décès'))}</th><td>${esc([D.death_date_text || dead.death?.text, D.death_place_text || dead.death?.place].filter(Boolean).join(', ') || '—')}</td></tr>
                <tr><th>${esc(i18n('Notaire'))}</th><td>${esc([D.notary, D.notary_ref].filter(Boolean).join(' · ') || '—')}</td></tr>
                <tr><th>${esc(i18n('Dossier'))}</th><td>${esc(D.number)}</td></tr></table>
            <h2>${esc(i18n('Les héritiers'))}</h2>
            <table class="succ-devo-t"><thead><tr><th>N°</th><th>${esc(i18n('Héritier'))}</th><th>${esc(i18n('Lien avec le défunt'))}</th><th>${esc(i18n('Qualité'))}</th><th>${esc(i18n('Part'))}</th><th>${esc(i18n('Pièces (renvois)'))}</th><th>${esc(i18n('Vérifié'))}</th></tr></thead>
            <tbody>${heirs.map((h, i) => `<tr><td>${i + 1}</td><td><b>${esc(h.name)}</b>${h.years ? ` <small>(${esc(h.years)})</small>` : ''}</td><td>${esc(h.kin || '')}</td><td>${esc(h.role === 'spouse' ? i18n('conjoint survivant') : h.via === 'repr' ? i18n('par représentation') : i18n('de son chef'))}</td><td>${esc(h.share)}</td><td>${esc(refs(h.id))}</td><td>☐</td></tr>`).join('') || `<tr><td colspan="7">${esc(i18n('Aucun héritier calculé pour l’instant.'))}</td></tr>`}</tbody></table>
            <h2>${esc(i18n('Les pièces'))}</h2><ol class="succ-devo-p">${list.map(p => `<li value="${num.get(p.key)}"><b>P${num.get(p.key)}</b> — ${esc(p.what)}${p.act ? ` <small>(${esc(p.act)})</small>` : ''} · ${esc(stP[p.state] || p.state)}</li>`).join('')}</ol>
            <p class="succ-devo-foot">${esc(i18n('Établi le {d}. Document de travail : il ne remplace ni l’acte de notoriété ni le certificat d’hérédité.', {d: new Date().toLocaleDateString('fr-FR')}))}</p></section>`;
    }
    ext.succDevolutionHtml = devolutionHtml; // (essais)
    const DEVO_CSS = 'body{font-family:Georgia,serif;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:14px 0 6px;border-bottom:1px solid #111}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}.succ-devo-kv th{width:22%;background:#f2f2f2}.succ-devo-t th{background:#eee}.succ-devo-sub{color:#a00;font-size:11px;margin:2px 0 10px}.succ-devo-p{font-size:12px;padding-left:18px}.succ-devo-foot{font-size:10px;color:#555;margin-top:12px}';
    function paintDevolution(body, D, R, P_) {
        if (body.querySelector('[data-succ-au-devo]')) return;
        const box = document.createElement('section'); box.className = 'succ-box'; box.dataset.succAuDevo = '';
        box.innerHTML = `<div class="succ-box-head"><h3>📜 ${esc(i18n('Projet de tableau de dévolution'))}</h3><div class="succ-acts"><button type="button" class="button secondary" data-succ-au-devoprint>${esc(i18n('🖨 Imprimer le tableau'))}</button><button type="button" class="button secondary" data-succ-au-devowp>${esc(i18n('📝 Dans le traitement de texte'))}</button></div></div>
            <p class="ui-hint">${esc(i18n('À joindre à l’acte de notoriété : chaque héritier, son lien, sa part, et les pièces qui le prouvent (P1, P2…).'))}</p>`;
        body.appendChild(box);
        box.querySelector('[data-succ-au-devoprint]').addEventListener('click', () => UI().openPrintDialog?.({title: i18n('Tableau de dévolution — {n}', {n: D.number}), key: 'succ-devolution', zone: i18n('Tableau de dévolution'),
            html: () => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(D.number)}</title><style>${DEVO_CSS}</style></head><body>${devolutionHtml(D, R, P_)}</body></html>`}));
        box.querySelector('[data-succ-au-devowp]').addEventListener('click', () => {
            const html = devolutionHtml(D, R, P_).replace(/<section[^>]*>|<\/section>/g, '');
            ext.openTextDoc?.({data: ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(html) : null, name: i18n('Tableau de dévolution {n}', {n: D.number})});
        });
    }

    ext.succAudit = {
        assignments, propose,
        after(tab, body, D, R, P_) {
            if (!body || !D) return;
            if (tab === 'dossier') paintAssign(body, D);
            if (tab === 'heirs') paintConflicts(body, D);
            if (tab === 'pieces') paintPieceButtons(body, D);
            if (tab === 'notary' && R && !R.error) paintDevolution(body, D, R, P_);
        }};
})();
