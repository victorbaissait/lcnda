/* LCNDA — 🧩 Compléter quatre outils existants (maquette validée docs/design/complements-existants.html), partie 1 :
 *  ⚙️ les réglages (un par choix de la maquette, l'option conseillée par défaut : « on laisse la liberté de réglages ») ;
 *  A 🏛 études de notaire — Listes → Archives et sources → Services d'archives → « ⚖️ Études de notaire » (ou une liste à part,
 *    réglage), ⚖️ Successions → ⋯ → « 🏛 Études de notaire » ; la fiche d'une étude gagne ses notaires et clercs, ses dossiers,
 *    ses courriers et le ⏳ délai constaté (jamais un délai légal) ; 📁 Dossier → « 🏛 Étude de notaire » (menu de choix, sorte
 *    archive_service limitée aux études, puis les noms déjà tapés) ; 🧩 regrouper les notaires tapés à la main (proposé, ↶) ;
 *  B ⚠️ homonyme avant de contacter un héritier : un bandeau dans ✉️ Écrire, 📞 Échanges, 📋 Questionnaire, un résumé en
 *    tête des courriers en série ; jamais bloquant ; « ✕ Ce n'est pas la même personne » retenu partout (↶ Annuler).
 * Serveur : lib/complements.php (GET compl, POST compl_write). Rien en mode simple ; en consultation, ni dossier ni écriture.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, C = () => window.LCNDA_COMPL_CORE;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const plural = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const kiosk = () => document.body?.classList.contains('is-kiosk');
    const simple = () => document.documentElement.classList.contains('ms-open');
    const badge = (t, k = 'grey', o = {}) => (UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso || ''); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); try { return window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(d, {day: 'numeric', month: 'short', year: 'numeric'}) : d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}); } catch (_) { return iso; } };
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const get = (op, q = {}) => A().api('compl', {op, ...q});
    const post = async body => { const r = await A().api('compl_write', {}, {method: 'POST', body}); try { window.dispatchEvent(new CustomEvent('lcnda:compl-changed', {detail: {op: body?.op}})); } catch (_) {} return r.result || r; };
    /** une écriture avec des fichiers (multipart : le .zip de la visite, les photos du jour) */
    async function postFiles(fields, files = {}) {
        const fd = new FormData(); fd.append('csrf', S().csrf);
        Object.entries(fields).forEach(([k, v]) => fd.append(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')));
        Object.entries(files).forEach(([k, list]) => [].concat(list).forEach(f => fd.append(k, f, f.name || 'fichier')));
        const headers = {'X-CSRF-Token': S().csrf, ...(typeof window.LCNDA_GENEALOGY === 'string' ? {'X-Genealogy': window.LCNDA_GENEALOGY} : {}), ...(window.LCNDA_I18N && window.LCNDA_I18N.lang !== 'fr' ? {'X-LCNDA-Lang': window.LCNDA_I18N.lang} : {})};
        let r; try { r = await fetch('api.php?action=compl_write', {method: 'POST', body: fd, headers}); } catch (_) { throw new Error(i18n('Le serveur ne répond pas.')); }
        const j = await r.json().catch(() => ({error: i18n('Réponse illisible du serveur')}));
        if (!r.ok || j.error) throw new Error(j.error || `Erreur ${r.status}`);
        try { window.dispatchEvent(new CustomEvent('lcnda:compl-changed', {detail: {op: fields.op}})); } catch (_) {}
        return j.result || j;
    }

    /* ═════ ⚙️ Les réglages ═════ */
    let SET = null;
    const cfg = () => SET || C().DEFAULTS;
    async function loadSet(force = false) { if (SET && !force) return SET; try { SET = C().settings((await get('settings')).settings); } catch (_) { SET = SET || {...C().DEFAULTS}; } return SET; }
    function openSettings(part) {
        const g = C().SPEC.find(x => x.part === part); if (!g) return;
        const ro = kiosk();
        return ext.openDialog({eyebrow: i18n('Réglages de cet outil'), title: i18n(g.title), submitLabel: i18n('Fermer'), onSubmit: () => true,
            body: `<div class="compl-set">${g.items.map(it => `<fieldset class="compl-set-f"><legend>${esc(i18n(it.label))}</legend>${it.options.map(([v, l], i) => `<label class="checkbox-line"><input type="radio" name="${esc(it.key)}" value="${esc(v)}"${String(cfg()[it.key]) === String(v) ? ' checked' : ''}${ro ? ' disabled' : ''}> ${esc(i18n(l))}${i === 0 ? ` <small class="muted">${esc(i18n('(conseillé)'))}</small>` : ''}</label>`).join('')}</fieldset>`).join('')}
                <p class="ui-hint">${esc(i18n('Chaque choix se change ici ; l’option conseillée est celle du départ.'))}</p></div>`,
            onOpen: d => d.addEventListener('change', async e => {
                const t = e.target; if (t.type !== 'radio' || ro) return;
                const it = g.items.find(x => x.key === t.name), opt = it?.options.find(o => String(o[0]) === t.value);
                try { const r = await post({op: 'settings_save', settings: {[t.name]: t.value}}); SET = C().settings(r.settings); } catch (err) { toast(err.message, 'error'); return; }
                toast(i18n('Réglage enregistré : {what}', {what: `${i18n(it.label)} → ${i18n(opt?.[1] || '')}`}), 'success');
                window.dispatchEvent(new CustomEvent('lcnda:compl-settings', {detail: {key: t.name}}));
            })});
    }

    /* ═════ A 🏛 Études de notaire ═════ */
    const ROLES = {notary: ['👔', 'notaire'], clerk: ['🗂', 'clerc'], other: ['👤', 'autre']};
    const STATES = {ouvert: 'Ouvert', recherche: 'En recherche', trouves: 'Héritiers trouvés', remis: 'Remis au notaire', clos: 'Clos', archive: 'Archivé'};
    const etudesView = () => S().listType === 'notary_offices' || (S().listType === 'archive_services' && S().complEtudes && !Number(S().archiveServiceId));
    const isHere = token => token === S().workspaceToken && S().module === 'listes' && etudesView();
    const delayBadge = dl => {
        if (!dl || cfg().delay_stat === 'none') return '';
        if (dl.days != null) return badge(i18n('{n} j', {n: dl.days}), 'blue', {title: i18n('sur {n} réponses', {n: dl.n})});
        return badge(i18n('pas assez de réponses'), 'grey', {title: i18n('{n} sur {m} nécessaires', {n: dl.n, m: dl.min_needed || cfg().delay_min})});
    };
    const notariesTxt = e => (e.people || []).filter(p => !p.former).map(p => (p.role === 'clerk' ? i18n('clerc : {name}', {name: p.name}) : p.name)).join(' · ');
    async function renderEtudes(token) {
        const ws = document.getElementById('workspace'); if (!ws || !isHere(token)) return;
        await loadSet();
        const sep = cfg().etude_where === 'separate';
        ws.innerHTML = `<section class="page h-asv compl-et">${UI().pageHeader({title: i18n('Études de notaire'), icon: '🏛', where: i18n('Listes · Archives et sources'),
            help: esc(i18n('Une étude est un service d’archives de la sorte « Étude de notaire » : ses notaires et clercs, ses dossiers, ses courriers.')),
            primary: kiosk() ? '' : `<button type="button" class="button" data-ce-new>${esc(i18n('＋ Nouvelle étude'))}</button>`,
            actions: sep ? [] : [`<button type="button" class="button secondary" data-ce-back>${esc(i18n('← Tous les services'))}</button>`],
            more: [kiosk() ? '' : `<button type="button" data-ce-group>${esc(i18n('🧩 Regrouper et créer leurs fiches…'))}</button>`, `<button type="button" data-ce-set>${esc(i18n('⚙️ Réglages de cet outil'))}</button>`]})}
            <div data-ce-banner></div><div data-ce-bar></div><div data-ce-list>${UI().spinner(i18n('Chargement…'))}</div></section>`;
        let d; try { d = await get('etudes'); } catch (e) { if (isHere(token)) ws.querySelector('[data-ce-list]').innerHTML = UI().notice('error', e.message); return; }
        if (!isHere(token)) return;
        const all = d.etudes || [];
        const typed = d.typed || [];
        if (typed.length && cfg().group_banner === 'show' && !kiosk() && !simple() && sessionStorage.getItem('lcnda-ce-later') !== '1') {
            const n = typed.length;
            ws.querySelector('[data-ce-banner]').innerHTML = `<div class="ui-notice ui-notice-info compl-ce-banner" role="status"><span class="ui-notice-ico" aria-hidden="true">🧩</span><span><b>${esc(i18n(n > 1 ? '{n} notaires tapés à la main dans tes dossiers n’ont pas encore de fiche.' : '{n} notaire tapé à la main dans tes dossiers n’a pas encore de fiche.', {n}))}</b>
                <span class="compl-ce-typed" data-i18n-off>${typed.slice(0, 6).map(t => `« ${esc(t.text)} » (${esc(t.cases.map(c => c.number).join(', '))})`).join(', ')}${typed.length > 6 ? '…' : ''}</span>
                <span class="compl-ce-acts"><button type="button" class="button small" data-ce-group>${esc(i18n('🧩 Regrouper et créer leurs fiches…'))}</button><button type="button" class="button small secondary" data-ce-later>${esc(i18n('Plus tard'))}</button></span></span></div>`;
        }
        const depts = [...new Set(all.map(e => e.dept_code).filter(Boolean))].sort();
        let shown = 60;
        const bar = UI().listBar({key: 'listes:etudes', search: {placeholder: i18n('Chercher une étude, un notaire, une ville…')},
            filters: depts.length ? [{id: 'dept', label: i18n('Département'), type: 'select', dflt: '', options: [['', i18n('Tous')], ...depts.map(x => [x, x, i18n('Département : {d}', {d: x})])]}] : [],
            view: {dflt: 'list', what: 'études'}, sort: {options: [['az', 'A → Z'], ['za', 'Z → A'], ['fast', i18n('Répond le plus vite')], ['cases', i18n('Le plus de dossiers')]], value: 'az'}, onChange: () => { shown = 60; paint(); }});
        ws.querySelector('[data-ce-bar]').replaceWith(bar);
        const box = ws.querySelector('[data-ce-list]');
        const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        function paint() {
            const st = bar.state, q = fold(st.q).trim();
            let rows = all.filter(e => (!q || q.split(/\s+/).every(w => fold([e.name, e.short_name, e.city, e.aliases, ...(e.people || []).map(p => p.name)].join(' ')).includes(w))) && (!st.filters.dept || e.dept_code === st.filters.dept));
            rows = st.sort === 'fast' ? [...rows].sort((a, b) => (a.delay?.days ?? 1e9) - (b.delay?.days ?? 1e9)) : st.sort === 'cases' ? [...rows].sort((a, b) => (b.cases_open || 0) - (a.cases_open || 0)) : UI().sortItems(rows, st.sort || 'az', {name: e => e.name});
            bar.setCount(rows.length === all.length ? plural(all.length, 'étude') : `${plural(rows.length, 'étude')} / ${all.length}`);
            if (!all.length) { box.innerHTML = A().emptyState({icon: '🏛', text: i18n('Aucune étude de notaire pour l’instant'), hint: i18n('Une étude est un service d’archives de la sorte « Étude de notaire » : crée-la ici, ou regroupe les notaires tapés à la main dans tes dossiers.'), action: kiosk() ? null : {label: i18n('＋ Nouvelle étude'), attrs: 'data-empty-click="[data-ce-new]"'}}); return; }
            if (!rows.length) { box.innerHTML = A().emptyState({icon: '🔍', text: i18n('Rien ne correspond'), hint: i18n('Enlève un filtre, ou cherche autrement.')}); return; }
            const view = st.view === 'cards' ? 'cards' : 'list';
            box.innerHTML = UI().itemsHtml(view, rows.slice(0, shown).map(e => ({thumb: '<span class="ui-card-ico" aria-hidden="true">⚖️</span>', name: e.name, open: `data-ce-open="${e.id}"`,
                lines: [[e.city ? `${e.city}${e.dept_code ? ` (${e.dept_code})` : ''}` : '', notariesTxt(e)].filter(Boolean).join(' · ') || i18n('Aucun notaire noté'),
                    kiosk() ? '' : [i18n('{a} en cours · {b} clos', {a: e.cases_open || 0, b: e.cases_closed || 0}), plural(e.courriers || 0, 'courrier') + (e.waiting ? ` · ${i18n('{n} en attente', {n: e.waiting})}` : '')].join(' · ')],
                badges: kiosk() ? [] : [delayBadge(e.delay)].filter(Boolean), attrs: `data-ce-row="${e.id}"`,
                actions: `${kiosk() ? '' : delayBadge(e.delay)}${e.phone ? `<a class="button small secondary" href="tel:${esc(String(e.phone).replace(/[^\d+]/g, ''))}">📞 ${esc(i18n('Appeler'))}</a>` : ''}${e.email ? `<a class="button small secondary" href="mailto:${esc(e.email)}">✉️ ${esc(i18n('Courriel'))}</a>` : ''}<button type="button" class="button small secondary" data-ce-open="${e.id}">${esc(i18n('↗ Ouvrir'))}</button>`})));
            if (rows.length > shown) box.appendChild(UI().moreButton({remaining: rows.length - shown, step: 60, onClick: () => { shown += 60; paint(); }}));
        }
        paint();
    }
    const refreshEtudes = () => { if (S().module === 'listes' && (etudesView() || S().listType === 'archive_services')) A().renderList?.(); };
    function openEtudes() {
        loadSet().then(() => {
            document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
            if (cfg().etude_where === 'separate') { Object.assign(S(), {listType: 'notary_offices', archiveServiceId: 0}); }
            else Object.assign(S(), {listType: 'archive_services', archiveServiceId: 0, complEtudes: true});
            if (S().module === 'listes') { A().renderSidebar?.(); A().renderList?.(); } else A().setModule('listes');
        });
    }
    function newEtude(prefill = {}) {
        if (!ext.archiveServices?.edit) return;
        return ext.archiveServices.edit(null, {kind: 'notary', ...prefill}).then(sv => { if (sv) { Object.assign(S(), {listType: 'archive_services', archiveServiceId: sv.id, complEtudes: true}); A().renderList?.(); } return sv; });
    }

    /** la fiche d'une étude (sur la fiche du service) : 👔 notaires et clercs, ⚖️ ses dossiers, 📮 ses courriers, ⏳ le délai constaté */
    async function decorateSheet(ws, s) {
        if (!ws || s?.kind !== 'notary') return;
        await loadSet();
        let d; try { d = await get('etude', {id: s.id}); } catch (e) { return; }
        if (!ws.isConnected || Number(S().archiveServiceId) !== Number(s.id)) return;
        const ro = kiosk();
        const people = d.people || [];
        const peopleHtml = people.length ? UI().rowsHtml(people.map(p => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${ROLES[p.role]?.[0] || '👤'}</span>`, name: p.name, cls: p.former ? 'is-former' : '',
            lines: [[i18n(ROLES[p.role]?.[1] || 'autre'), p.person_id ? i18n('fiche de personne n° {n}', {n: p.person_id}) : i18n('nom seulement'), p.phone && i18n('ligne directe {tel}', {tel: p.phone}), p.former ? i18n('ancien depuis le {d}', {d: fmtDate(p.until)}) : p.since ? i18n('depuis le {d}', {d: fmtDate(p.since)}) : ''].filter(Boolean).join(' · ')],
            actions: `${p.person_id ? `<button type="button" class="button small secondary" data-h-person="${p.person_id}">${esc(i18n('↗ Fiche'))}</button>` : ''}${ro ? '' : `<button type="button" class="icon-button small" data-ce-pedit="${p.id}" title="${esc(i18n('✎ Modifier'))}" aria-label="${esc(i18n('✎ Modifier'))}">✎</button><button type="button" class="icon-button small" data-ce-pdel="${p.id}" title="${esc(i18n('Retirer'))}" aria-label="${esc(i18n('Retirer'))}">🗑</button>`}`})))
            : A().empty(i18n('Aucun notaire ni clerc noté.'), {icon: '👔'});
        let html = `<section class="card h-asv-card compl-ce-people"><header class="card-head"><div class="card-title"><h3>👔 ${esc(i18n('Notaires et clercs'))}</h3></div>${ro ? '' : `<button type="button" class="button small secondary" data-ce-padd>${esc(i18n('＋ Ajouter'))}</button>`}</header><div class="card-body">${peopleHtml}</div></section>`;
        if (!ro && d.cases) {
            html += `<section class="card h-asv-card compl-ce-cases"><header class="card-head"><div class="card-title"><h3>⚖️ ${esc(i18n('Ses dossiers'))} <small class="muted">${esc(i18n('lus dans les dossiers, rien n’est recopié'))}</small></h3></div></header><div class="card-body">${d.cases.length ? UI().rowsHtml(d.cases.map(c => ({thumb: '<span class="ui-card-ico" aria-hidden="true">⚖️</span>', name: `${c.number} · ${c.title}`, open: `data-ce-case="${c.id}"`,
                lines: [[i18n(STATES[c.state] || c.state), c.notary_ref && i18n('réf. du notaire {ref}', {ref: c.notary_ref}), c.notary].filter(Boolean).join(' · ')], actions: `<button type="button" class="button small secondary" data-ce-case="${c.id}">${esc(i18n('↗ Ouvrir'))}</button>`}))) : A().empty(i18n('Aucun dossier relié à cette étude.'), {icon: '⚖️'})}</div></section>`;
            const cour = d.courriers || [], dl = d.delay || {};
            const row = k => `<tr><td>${esc(fmtDate(k.date_envoi) || '—')}</td><td>${esc([k.case_number, k.objet].filter(Boolean).join(' · '))}</td>
                <td>${k.recu_le ? `${esc(i18n('reçue le {d}', {d: fmtDate(k.recu_le)}))} <button type="button" class="icon-button small" data-ce-recu-edit="${k.id}" data-ce-recu-v="${esc(k.recu_le)}" title="${esc(i18n('✎ Modifier'))}" aria-label="${esc(i18n('✎ Modifier'))}">✎</button>`
                    : `${k.waiting ? badge(dl.days != null && k.waiting.level ? i18n('{n} j · d’habitude {m} j', {n: k.waiting.days, m: dl.days}) : i18n('en attente · {n} j', {n: k.waiting.days}), k.waiting.level || 'grey') : esc(i18n('en attente'))} <button type="button" class="button small secondary" data-ce-recu="${k.id}">${esc(i18n('✓ Réponse reçue'))}</button>`}</td>
                <td>${k.days != null ? esc(i18n('{n} j', {n: k.days})) : '—'}</td></tr>`;
            const delayTxt = cfg().delay_stat === 'none' ? '' : dl.days != null
                ? UI().notice('info', i18n(cfg().delay_stat === 'median' ? '⏳ Délai de réponse constaté : {days} j en médiane (de {min} à {max} j). Réponses comptées : {n}, celles de ce registre dont la date est notée. C’est ce que tu as observé, rien d’autre : ce n’est ni un délai légal, ni une promesse de l’étude.' : '⏳ Délai de réponse constaté : {days} j en moyenne (de {min} à {max} j). Réponses comptées : {n}, celles de ce registre dont la date est notée. C’est ce que tu as observé, rien d’autre : ce n’est ni un délai légal, ni une promesse de l’étude.', {days: dl.days, min: dl.min, max: dl.max, n: dl.n}))
                : UI().notice('info', i18n('⏳ Pas assez de réponses datées pour un délai constaté ({n} sur {m} nécessaires).', {n: dl.n || 0, m: dl.min_needed || cfg().delay_min}));
            html += `<section class="card h-asv-card compl-ce-cour"><header class="card-head"><div class="card-title"><h3>📮 ${esc(i18n('Ses courriers'))}</h3></div><button type="button" class="button small secondary" data-ce-cnew>${esc(i18n('＋ Courrier à l’étude'))}</button></header><div class="card-body">
                ${cour.length ? `<div class="h-asv-tablewrap"><table class="data-table compl-ce-ctable"><thead><tr><th>${esc(i18n('Envoyé'))}</th><th>${esc(i18n('Objet'))}</th><th>${esc(i18n('Réponse'))}</th><th>${esc(i18n('Délai'))}</th></tr></thead><tbody>${cour.slice(0, 6).map(row).join('')}</tbody></table></div>
                ${cour.length > 6 ? `<p><button type="button" class="link-button" data-ce-registre>${esc(i18n('＋ {n} courriers plus anciens · tout voir dans le Registre', {n: cour.length - 6}))}</button></p>` : ''}` : A().empty(i18n('Aucun courrier relié à cette étude.'), {icon: '📮'})}${delayTxt}</div></section>`;
        }
        ws.querySelector('.compl-ce-sheet')?.remove();
        const wrap = document.createElement('div'); wrap.className = 'compl-ce-sheet'; wrap.innerHTML = html;
        const anchor = ws.querySelector('.h-asv-grid');
        anchor ? anchor.after(wrap) : ws.querySelector('.page')?.appendChild(wrap);
        A().bindTableLinks?.();
        wrap.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-ce-padd]')) return personDialog(s);
            const pe = t.closest('[data-ce-pedit]'); if (pe) return personDialog(s, people.find(p => p.id === Number(pe.dataset.cePedit)));
            const pd = t.closest('[data-ce-pdel]'); if (pd) { const p = people.find(x => x.id === Number(pd.dataset.cePdel)); try { await post({op: 'etude_person_delete', id: p.id}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(i18n('« {name} » retiré de l’étude', {name: p.name}), {undo: async () => { await post({op: 'etude_person_restore', id: p.id}); decorateSheet(ws, s); }}); return decorateSheet(ws, s); }
            const cs = t.closest('[data-ce-case]'); if (cs) { e.preventDefault(); return ext.successoral?.openCase?.(Number(cs.dataset.ceCase), 'dossier'); }
            if (t.closest('[data-ce-cnew]')) return courrierDialog(s, d.cases || [], () => decorateSheet(ws, s));
            if (t.closest('[data-ce-registre]')) { S().listType = 'courriers'; return A().setModule('listes'); }
            const rc = t.closest('[data-ce-recu]'); if (rc) return recu(Number(rc.dataset.ceRecu), today(), () => decorateSheet(ws, s));
            const re = t.closest('[data-ce-recu-edit]'); if (re) return recuDialog(Number(re.dataset.ceRecuEdit), re.dataset.ceRecuV, () => decorateSheet(ws, s));
        });
    }
    async function recu(id, day, after) {
        let r; try { r = await post({op: 'courrier_recu', id, recu_le: day}); } catch (e) { return toast(e.message, 'error'); }
        A().undoToast(day ? i18n('Réponse reçue le {d}', {d: fmtDate(day)}) : i18n('Courrier remis en attente'), {undo: async () => { await post({op: 'courrier_recu', id, undo: 1, prev: r.prev}); after?.(); }});
        after?.();
    }
    function recuDialog(id, cur, after) {
        ext.openDialog({eyebrow: '📮', title: i18n('Réponse reçue le'), submitLabel: i18n('Enregistrer'),
            body: `<div class="form-grid one-column"><label>${esc(i18n('Réponse reçue le'))}<input type="date" name="d" value="${esc(cur || '')}" max="${today()}"></label><p class="ui-hint">${esc(i18n('Vide : le courrier repasse « en attente ».'))}</p></div>`,
            onSubmit: async f => { await recu(id, f.d.value, after); }});
    }
    function personDialog(s, p = null) {
        const r = p || {role: 'notary'};
        ext.openDialog({eyebrow: `🏛 ${s.name}`, title: p ? i18n('Modifier « {name} »', {name: p.name}) : i18n('Ajouter un notaire ou un clerc'), submitLabel: p ? i18n('Enregistrer') : i18n('＋ Ajouter'),
            body: `<div class="form-grid"><label class="span-2">${esc(i18n('Nom'))}<input name="name" maxlength="160" value="${esc(r.name || '')}" placeholder="Me Anne VIALLE"></label>
                <label>${esc(i18n('Rôle'))}<select name="role">${Object.entries(ROLES).map(([k, [ic, l]]) => `<option value="${k}"${r.role === k ? ' selected' : ''}>${ic} ${esc(i18n(l))}</option>`).join('')}</select></label>
                <div><span class="pk-lab">${esc(i18n('Fiche de personne (facultatif)'))}</span>${P().pickerField({name: 'person_id', kind: 'person', animals: false, value: r.person_id || null})}</div>
                <label>${esc(i18n('Téléphone'))}<input name="phone" maxlength="60" value="${esc(r.phone || '')}"></label>
                <label>${esc(i18n('Depuis'))}<input type="date" name="since" value="${esc(r.since || '')}"></label>
                <label>${esc(i18n('Jusqu’à (ancien)'))}<input type="date" name="until" value="${esc(r.until || '')}"></label>
                <label class="span-2">${esc(i18n('Note'))}<input name="note" maxlength="500" value="${esc(r.note || '')}"></label></div>
                <p class="ui-hint">${esc(i18n('Un notaire qui change d’étude reste nommé dans ses anciens dossiers : mets une date de fin, il passe « ancien ».'))}</p>`,
            onSubmit: async f => {
                const v = n => f.querySelector(`[name=${n}]`)?.value || '';
                if (!v('name').trim() && !Number(v('person_id'))) return UI().fail(f.elements.name, i18n('Donne le nom du notaire ou du clerc.'));
                await post({op: 'etude_person_save', service_id: s.id, id: p?.id || 0, name: v('name'), role: v('role'), person_id: Number(v('person_id')) || 0, phone: v('phone'), since: v('since'), until: v('until'), note: v('note')});
                toast(i18n('Enregistré'), 'success'); A().renderList?.();
            }});
    }
    function courrierDialog(s, cases, after) {
        ext.openDialog({eyebrow: `🏛 ${s.name}`, title: i18n('Courrier à l’étude'), submitLabel: i18n('📋 Ranger dans le Registre de courriers'),
            body: `<div class="form-grid"><label class="span-2">${esc(i18n('Objet'))}<input name="objet" maxlength="300" required placeholder="${esc(i18n('état des recherches'))}"></label>
                <label>${esc(i18n('Envoyé le'))}<input type="date" name="date_envoi" value="${today()}"></label><label>${esc(i18n('Relance dans (jours)'))}<input type="number" name="relance" min="0" max="365" value="30"></label>
                ${cases.length ? `<label class="span-2">${esc(i18n('Dossier'))}<select name="case_id"><option value="">—</option>${cases.filter(c => !c.closed).map(c => `<option value="${c.id}">${esc(`${c.number} · ${c.title}`)}</option>`).join('')}</select></label>` : ''}</div>`,
            onSubmit: async f => {
                if (!f.objet.value.trim()) return UI().fail(f.objet, i18n('L’objet du courrier est obligatoire.'));
                const r = await post({op: 'etude_courrier_save', service_id: s.id, objet: f.objet.value, date_envoi: f.date_envoi.value, relance: Number(f.relance.value) || 0, case_id: Number(f.case_id?.value) || 0});
                A().undoToast(i18n('Courrier rangé au Registre'), {undo: async () => { await A().api('delete_courrier', {}, {method: 'POST', body: {id: r.id}}); after?.(); }});
                after?.();
            }});
    }

    /* ── A2 📁 Dossier → « Étude de notaire » (menu de choix : les études, puis les noms déjà tapés) ── */
    const etudeField = (name, value) => P().pickerField({name, kind: 'archive_service', allowCreate: true, allowFree: true, filter: {as_kind: 'notary'}, value, placeholder: i18n('Une étude, ou un nom gardé en texte…')});
    const valueOf = info => (info?.etude ? info.etude : info?.text ? `txt:${info.text}` : null);
    /** dans « ✎ Modifier » / « ＋ Ouvrir un dossier » (heritage-successoral.js caseDialog) */
    function caseField(d) {
        if (kiosk() || simple()) return '';
        const id = Number(d?.id) || 0;
        if (id) setTimeout(async () => { const box = document.querySelector(`[data-ce-casefield="${id}"]`); if (!box) return; let info; try { info = await get('etude_case', {case_id: id}); } catch (_) { return; } const pk = box.querySelector('.pk'); if (pk && valueOf(info)) P().pickerSet(pk, valueOf(info)); box.dataset.ceInit = JSON.stringify(P().pickerValue(pk) ?? ''); }, 0);
        return `<div class="succ-2 compl-ce-casef" data-ce-casefield="${id}" data-ce-init="&quot;&quot;"><div><span class="pk-lab">🏛 ${esc(i18n('Étude de notaire'))}</span>${etudeField('compl_etude', null)}</div><p class="ui-hint">${esc(i18n('Choisis l’étude ; le nom tapé dans le champ du notaire reste dans le dossier.'))}</p></div>`;
    }
    async function caseSubmit(form, caseId) {
        const box = form.querySelector('[data-ce-casefield]'); if (!box || !caseId) return;
        const pk = box.querySelector('.pk'); const v = pk ? P().pickerValue(pk) : null;
        if (JSON.stringify(v ?? '') === box.dataset.ceInit) return;
        const s = String(v ?? '');
        try { await post({op: 'etude_case_set', case_id: caseId, service_id: /^\d+$/.test(s) ? Number(s) : 0, ...(s.startsWith('txt:') ? {text: s.slice(4)} : {})}); } catch (e) { toast(e.message, 'error'); }
    }
    /** 📁 Dossier : la boîte « 🏛 Étude de notaire » (enregistrée tout de suite, ↶ Annuler, ligne au 🕓 Journal) */
    async function afterTab(tab, body, D) {
        if (tab !== 'dossier' || !D || kiosk() || simple() || !body?.isConnected) return;
        await loadSet();
        let info; try { info = await get('etude_case', {case_id: D.id}); } catch (_) { return; }
        if (!body.isConnected) return;
        const ro = D.archived || D.state === 'archive';
        const box = document.createElement('section'); box.className = 'succ-box compl-ce-case'; box.dataset.ceCase = String(D.id);
        const notaries = (info.people || []).filter(p => p.role === 'notary');
        box.innerHTML = `<div class="succ-box-head"><h3>🏛 ${esc(i18n('Étude de notaire'))}</h3>${info.etude ? `<button type="button" class="button small secondary" data-ce-goetude="${info.etude.id}">${esc(i18n('↗ Ouvrir'))}</button>` : ''}</div>
            <div class="succ-2"><div><span class="pk-lab">${esc(i18n('Étude de notaire'))}</span>${ro ? esc(info.etude?.title || info.text || '—') : etudeField('', valueOf(info))}${!info.etude && info.text ? ` ${badge(i18n('texte'), 'grey', {title: i18n('nom gardé en texte, sans fiche d’étude')})}` : ''}</div>
            ${info.etude && cfg().notary_pick === 'optional' ? `<label>${esc(i18n('Notaire chargé du dossier'))}<select data-ce-notary${ro ? ' disabled' : ''}><option value="">—</option>${notaries.map(p => `<option value="${p.id}"${info.people_id === p.id ? ' selected' : ''}>👔 ${esc(p.name)}${p.former ? ` (${esc(i18n('ancien'))})` : ''}</option>`).join('')}</select><small class="muted">${esc(i18n('Choisi parmi les notaires de l’étude, ou laissé vide.'))}</small></label>` : ''}</div>`;
        const grid = body.querySelector('.succ-grid2');
        if (grid) grid.after(box); else body.prepend(box);
        const save = async extra => {
            const pk = box.querySelector('.pk'), v = String(pk ? P().pickerValue(pk) ?? '' : '');
            const sid = /^\d+$/.test(v) ? Number(v) : 0;
            const pid = sid && sid === Number(info.etude?.id) ? Number(box.querySelector('[data-ce-notary]')?.value) || 0 : 0;
            let r; try { r = await post({op: 'etude_case_set', case_id: D.id, service_id: sid, people_id: pid, ...(v.startsWith('txt:') ? {text: v.slice(4)} : {}), ...extra}); } catch (e) { return toast(e.message, 'error'); }
            const who = r.etude ? r.etude.title + (pid ? ` (${notaries.find(p => p.id === pid)?.name || ''})` : '') : v.startsWith('txt:') ? `« ${v.slice(4)} »` : '—';
            A().undoToast(i18n('✓ Notaire du dossier : {who}. Ligne au 🕓 Journal du dossier.', {who}), {undo: async () => { await post({op: 'etude_case_set', case_id: D.id, service_id: r.prev.service_id, people_id: r.prev.people_id, text: r.prev.text, undo: 1}); ext.successoral?.openCase?.(D.id, 'dossier'); }});
            box.remove(); afterTab(tab, body, D);
        };
        box.addEventListener('picker-change', () => save({}));
        box.querySelector('[data-ce-notary]')?.addEventListener('change', () => save({}));
        box.querySelector('[data-ce-goetude]')?.addEventListener('click', e => ext.archiveServices?.open?.(Number(e.currentTarget.dataset.ceGoetude)));
    }

    /* ── A3 🧩 Regrouper les notaires tapés à la main (proposé, jamais automatique ; rien n'est changé avant « Appliquer ») ── */
    async function groupDialog() {
        if (kiosk()) return toast(i18n('Mode consultation : rien ne peut être modifié.'));
        let d; try { d = await get('etudes_group'); } catch (e) { return toast(e.message, 'error'); }
        let etudes = []; try { etudes = (await get('etudes')).etudes || []; } catch (_) {}
        const why = w => w.map(x => x.k === 'name' ? i18n('même nom « {n} »', {n: x.v}) : x.k === 'city' ? i18n('même ville') : x.k === 'dead_city' ? i18n('même ville que le défunt') : x.k === 'initial' ? i18n('initiale {i}', {i: x.v}) : x.k === 'unique' ? i18n('une seule étude de ce nom') : '').filter(Boolean).join(' · ');
        const cases = t => t.cases.map(c => c.number).join(', ');
        const sel = cur => `<select data-ce-gto aria-label="${esc(i18n('Autre étude'))}"><option value="">${esc(i18n('Laisser en texte'))}</option>${etudes.map(e => `<option value="${e.id}"${Number(cur) === e.id ? ' selected' : ''}>→ ${esc(e.name)}</option>`).join('')}</select>`;
        const nT = d.groups.reduce((a, g) => a + g.texts.length, 0) + d.none.reduce((a, g) => a + g.texts.length, 0);
        const body = `<p class="ui-hint">${esc(i18n('{n} noms tapés à la main · rien n’est changé avant « Appliquer ».', {n: nT}))}</p>
            ${d.groups.map(g => `<section class="compl-ce-g"><h4>→ ${esc(g.etude.name)} <small class="muted">${esc(i18n('existe'))}</small></h4>${g.texts.map(t => `<div class="compl-ce-gr" data-ce-gtext="${esc(t.text)}" data-ce-gcases="${t.cases.map(c => c.id).join(',')}">
                ${UI().checkHtml(`« ${t.text} »`, {checked: t.checked, attrs: 'data-ce-gon', sub: `${cases(t)} · ${why(t.why)}${t.ambiguous ? ' · ' + i18n('plusieurs études possibles') : ''}`})}${sel(g.etude.id)}</div>`).join('')}</section>`).join('')}
            ${d.none.length ? `<section class="compl-ce-g"><h4>${esc(i18n('Sans proposition'))}</h4>${d.none.flatMap(g => g.texts).map(t => `<div class="compl-ce-gr" data-ce-gtext="${esc(t.text)}" data-ce-gcases="${t.cases.map(c => c.id).join(',')}">
                ${UI().checkHtml(`« ${t.text} »`, {checked: false, attrs: 'data-ce-gon', sub: cases(t)})}<select data-ce-gto aria-label="${esc(i18n('Que faire'))}"><option value="">${esc(i18n('Laisser en texte'))}</option><option value="new">${esc(i18n('＋ Créer une étude'))}</option>${etudes.map(e => `<option value="${e.id}">→ ${esc(e.name)}</option>`).join('')}</select></div>`).join('')}</section>` : ''}
            ${d.courriers.length ? `<section class="compl-ce-g"><h4>📮 ${esc(i18n('Courriers qui ressemblent à une étude'))} <small class="muted">${esc(i18n('pour le délai constaté'))}</small></h4>${d.courriers.map(k => `<div class="compl-ce-gr" data-ce-gcour="${k.id}" data-ce-gsvc="${k.etude.id}">${UI().checkHtml(`${k.destinataire} → ${k.etude.name}`, {checked: false, attrs: 'data-ce-gon', sub: [fmtDate(k.date_envoi), k.objet].filter(Boolean).join(' · ')})}</div>`).join('')}</section>` : ''}
            <p class="ui-hint">${esc(i18n('Les rapprochements ne regardent que le nom de famille (sans « Me », « Maître », « SCP », « Étude », accents) et la ville quand elle est écrite. Deux études du même nom dans deux villes ne sont jamais réunies. Le nom tapé reste dans chaque dossier.'))}</p>`;
        ext.openDialog({eyebrow: '🧩', title: i18n('Notaires tapés à la main'), wide: true, submitLabel: i18n('Appliquer'), body: (nT || d.courriers.length) ? body : A().empty(i18n('Aucun notaire tapé à la main sans fiche.'), {icon: '🧩'}),
            onOpen: dlg => {
                const go = dlg.querySelector('[type=submit]');
                const count = () => { const on = [...dlg.querySelectorAll('[data-ce-gtext]')].filter(r => r.querySelector('[data-ce-gon]')?.checked && r.querySelector('[data-ce-gto]')?.value); const nc = on.reduce((a, r) => a + r.dataset.ceGcases.split(',').filter(Boolean).length, 0); if (go) { go.textContent = i18n('Appliquer à {n} noms ({m} dossiers)', {n: on.length, m: nc}); go.disabled = !on.length && ![...dlg.querySelectorAll('[data-ce-gcour] [data-ce-gon]:checked')].length; } };
                dlg.addEventListener('change', e => { const r = e.target.closest('[data-ce-gtext]'); if (r && e.target.matches('[data-ce-gto]')) { const c = r.querySelector('[data-ce-gon]'); if (c && e.target.value) c.checked = true; } count(); });
                count();
            },
            onSubmit: async dlg => {
                const links = {}, create = [], courriers = []; // dlg : le formulaire de la fenêtre
                dlg.querySelectorAll('[data-ce-gtext]').forEach(r => { if (!r.querySelector('[data-ce-gon]')?.checked) return; const to = r.querySelector('[data-ce-gto]')?.value || ''; const ids = r.dataset.ceGcases.split(',').map(Number).filter(Boolean); if (to === 'new') create.push({text: r.dataset.ceGtext, case_ids: ids}); else if (/^\d+$/.test(to)) (links[to] = links[to] || []).push(...ids); });
                dlg.querySelectorAll('[data-ce-gcour]').forEach(r => { if (r.querySelector('[data-ce-gon]')?.checked) courriers.push({id: Number(r.dataset.ceGcour), service_id: Number(r.dataset.ceGsvc)}); });
                const r = await post({op: 'etudes_group_apply', links: Object.entries(links).map(([sid, ids]) => ({service_id: Number(sid), case_ids: ids})), create, courriers});
                A().undoToast(i18n('✓ {n} dossiers reliés à leur étude. Le nom tapé est gardé dans chaque dossier.', {n: r.cases}), {undo: async () => { await post({op: 'etudes_group_undo'}); refreshEtudes(); }});
                refreshEtudes();
            }});
    }

    /* ═════ B ⚠️ Homonyme avant de contacter ═════ */
    const yearsOf = x => (x?.year ? String(x.year) : '');
    const born = x => { const f = x.gender === 'female'; return x.place && x.year ? i18n(f ? 'née à {place} en {y}' : 'né à {place} en {y}', {place: x.place, y: x.year}) : x.year ? i18n(f ? 'née en {y}' : 'né en {y}', {y: x.year}) : x.place ? i18n(f ? 'née à {place}, date inconnue' : 'né à {place}, date inconnue', {place: x.place}) : i18n('date inconnue'); };
    const otherLine = o => (o.private ? i18n('fiche n° {n} (confidentielle)', {n: o.id}) : [o.name, born(o), i18n('fiche n° {n}', {n: o.id})].filter(Boolean).join(', '));
    const closeness = (me, o) => [o.unknown_date ? i18n('naissance : date inconnue') : o.dy === 0 ? i18n('même année de naissance') : i18n('naissance à {n} an(s) près', {n: o.dy}), o.same_commune ? i18n('même commune') : o.same_dept ? i18n('même département') : ''].filter(Boolean).join(', ');
    function compareHtml(it, o) {
        const me = it.person;
        const mark = (a, b) => (!a || !b ? '?' : String(a).toLowerCase() === String(b).toLowerCase() ? '=' : '≈');
        const rows = [[i18n('Nom, prénom'), me.name, o.private ? '—' : o.name, o.private ? '?' : '='], [i18n('Naissance'), [me.birth || me.year, me.place].filter(Boolean).join(', '), o.private ? '—' : [o.birth || o.year, o.place].filter(Boolean).join(', ') || i18n('date inconnue'), o.unknown_date ? '?' : o.dy === 0 ? '=' : '≈'],
            [i18n('Parents'), me.parents || i18n('inconnus'), o.private ? '—' : o.parents || i18n('inconnus'), mark(me.parents, o.parents)], [i18n('Adresse'), me.city || '—', o.private ? '—' : o.city || '—', mark(me.city, o.city)],
            [i18n('Ailleurs'), '', o.cases.length ? o.cases.map(c => c.number).join(', ') : o.added ? i18n('arbre seulement · ajouté le {d}', {d: fmtDate(o.added)}) : i18n('arbre seulement'), '']];
        return `<div class="compl-hom-cmp"><table class="data-table"><thead><tr><th>${esc(i18n('Critère'))}</th><th>${esc(i18n('Celui du dossier'))}</th><th>${esc(i18n('L’autre fiche'))}</th><th></th></tr></thead><tbody data-i18n-off>${rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="compl-hom-mk">${esc(r[3])}</td></tr>`).join('')}</tbody></table>
            <p class="compl-hom-acts"><button type="button" class="button small secondary" data-h-person="${o.id}">${esc(i18n('↗ Ouvrir la fiche n° {n}', {n: o.id}))}</button><button type="button" class="button small secondary" data-compl-hom-merge>${esc(i18n('👥 Peut-être les mêmes : ouvrir la fusion'))}</button></p></div>`;
    }
    function bannerHtml(it, i, small) {
        const o = it.others[0], me = it.person, more = it.others.length - 1;
        return `<div class="ui-notice ui-notice-warn compl-hom-one" role="status" data-compl-hom-i="${i}"><span class="ui-notice-ico" aria-hidden="true">⚠️</span><span>
            <b>${esc(i18n('Une autre fiche porte le même nom'))}</b> <span data-i18n-off>${esc(otherLine(o))}</span> · ${esc(i18n('pas dans ce dossier.'))}${more > 0 ? ` <i>${esc(i18n('et {n} autres', {n: more}))}</i>` : ''}
            ${small ? '' : `<br><small>${esc(i18n('Celui à qui tu écris : {who}.', {who: [me.name, me.year || me.place ? born(me) : '', me.parents && i18n('enfant de {p}', {p: me.parents})].filter(Boolean).join(', ')}))} ${esc(closeness(me, o))}.</small>`}
            <span class="compl-hom-btns"><button type="button" class="button small" data-compl-hom-ok>${esc(i18n(small ? '✓ C’est lui' : '✓ C’est bien lui que je contacte'))}</button><button type="button" class="button small secondary" data-compl-hom-see aria-expanded="false">${esc(i18n(small ? '👁 Voir' : '👁 Voir l’autre'))}</button><button type="button" class="button small secondary" data-compl-hom-no>${esc(i18n(small ? 'Pas la même personne' : 'Ce n’est pas la même personne'))}</button></span>
            <div data-compl-hom-cmp hidden></div></span></div>`;
    }
    /** pose le bandeau dans une fenêtre (courrier, appel, questionnaire) ; ids() : les héritiers visés ; jamais bloquant */
    function attachHomonyms(dlg, D, {where = 'letter', ids = () => [], small = window.innerWidth < 600} = {}) {
        if (!dlg || !D?.id || kiosk() || simple()) return;
        const host = document.createElement('div'); host.className = 'compl-hom'; host.dataset.complHom = where;
        (dlg.querySelector('.h-dialog-body') || dlg.querySelector('form') || dlg).prepend(host);
        let items = [], seq = 0, okd = new Set(), expanded = false;
        const draw = () => {
            const list = items.filter(x => !okd.has(x.person.id));
            const n = ids().length;
            if (!list.length) { host.innerHTML = ''; return; }
            if ((where === 'serial' || n > 1) && !expanded) {
                host.innerHTML = `<div class="ui-notice ui-notice-warn compl-hom-sum" role="status"><span class="ui-notice-ico" aria-hidden="true">⚠️</span><span><b>${esc(i18n('{n} héritiers sur {m} ont un homonyme dans la base', {n: list.length, m: n}))}</b>
                    <span data-i18n-off>${list.map(x => `${esc(x.person.name)} (${esc(otherLine(x.others[0]))})`).join(' · ')}</span>
                    <span class="compl-hom-btns"><button type="button" class="button small secondary" data-compl-hom-all>${esc(i18n('Voir les détails'))}</button><button type="button" class="button small secondary" data-compl-hom-go>${esc(i18n('Envoyer quand même aux {n}', {n}))}</button></span></span></div>`;
                return;
            }
            host.innerHTML = items.map((x, i) => okd.has(x.person.id) ? '' : bannerHtml(x, i, small)).join('');
        };
        const run = async () => {
            const list = ids().filter(Boolean); const my = ++seq;
            if (!list.length) { items = []; draw(); return; }
            let r; try { r = await get('homonym_check', {case_id: D.id, person_ids: list.join(','), where}); } catch (_) { return; }
            if (my !== seq || !host.isConnected) return;
            items = r.items || []; draw();
        };
        host.addEventListener('click', async e => {
            const t = e.target;
            if (t.closest('[data-compl-hom-all]')) { expanded = true; return draw(); }
            if (t.closest('[data-compl-hom-go]')) { okd = new Set(items.map(x => x.person.id)); return draw(); }
            const box = t.closest('[data-compl-hom-i]'); if (!box) return;
            const it = items[Number(box.dataset.complHomI)], o = it?.others[0]; if (!o) return;
            if (t.closest('[data-compl-hom-see]')) { const c = box.querySelector('[data-compl-hom-cmp]'); c.hidden = !c.hidden; t.closest('button').setAttribute('aria-expanded', String(!c.hidden)); if (!c.hidden) c.innerHTML = it.others.map(x => compareHtml(it, x)).join(''); return; }
            if (t.closest('[data-compl-hom-merge]')) { dlg.close?.(); S().maintenanceTab = 'duplicates'; return A().setModule('maintenance'); }
            if (t.closest('[data-compl-hom-ok]')) {
                try { await post({op: 'homonym_ok', case_id: D.id, person_id: it.person.id, other_id: o.id}); } catch (err) { return toast(err.message, 'error'); }
                okd.add(it.person.id); draw();
                return toast(i18n(cfg().hom_after_ok === 'case' ? 'Noté au 🕓 Journal : homonyme vu, destinataire confirmé. L’alerte ne reviendra plus dans ce dossier.' : 'Noté au 🕓 Journal : homonyme vu, destinataire confirmé. L’alerte reviendra au prochain contact.'));
            }
            if (t.closest('[data-compl-hom-no]')) {
                let r; try { r = await post({op: 'homonym_no', case_id: D.id, person_id: it.person.id, other_id: o.id}); } catch (err) { return toast(err.message, 'error'); }
                A().undoToast(i18n('✓ Retenu : {a} ({y1}) et {b} ({y2}) sont deux personnes. L’alerte ne reviendra plus pour eux deux.', {a: it.person.name, y1: yearsOf(it.person) || '?', b: o.private ? `#${o.id}` : o.name, y2: yearsOf(o) || '?'}), {undo: async () => { await post({op: 'homonym_no_undo', case_id: D.id, a: r.a, b: r.b, had: r.had ? 1 : 0, dismissed: r.dismissed ? 1 : 0}); run(); }});
                return run();
            }
        });
        dlg.addEventListener('change', e => { if (e.target.closest?.('[data-succ-to], [data-sp2-qto]')) run(); });
        dlg.addEventListener('picker-change', () => run());
        run();
        return {refresh: run};
    }

    /* ═════ Les branchements ═════ */
    ext.complEtudes = {renderList: renderEtudes, decorateSheet, open: openEtudes, newEtude, caseField, caseSubmit, after: afterTab, group: groupDialog,
        listButton: () => `<button type="button" class="button secondary" data-compl-etudes>⚖️ ${esc(i18n('Études de notaire'))}</button>`,
        boardMore: () => (kiosk() ? [] : [`<button type="button" data-compl-etudes>🏛 ${esc(i18n('Études de notaire'))}</button>`])};
    ext.succHomonym = {attach: attachHomonyms};
    ext.compl = {get, post, postFiles, cfg, loadSet, openSettings, esc, i18n, fmtDate, today, kiosk, simple, badge};
    ext.lists.notary_offices = token => renderEtudes(token);
    // la liste à part (réglage) : Listes → Archives et sources, juste après les Services d'archives
    const prevShown = ext.listShown;
    ext.listShown = k => (k === 'notary_offices' ? cfg().etude_where === 'separate' : prevShown ? prevShown(k) : true);
    const addList = () => { const L = A()?.defaultListTypes; if (!Array.isArray(L) || L.some(x => x[0] === 'notary_offices')) return; const i = L.findIndex(x => x[0] === 'archive_services'); L.splice(i >= 0 ? i + 1 : L.length, 0, ['notary_offices', '16d', '🏛 Études de notaire']); };
    document.addEventListener('click', e => {
        const t = e.target;
        if (t.closest?.('[data-compl-etudes]')) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return openEtudes(); }
        if (!t.closest?.('.compl-et')) return;
        const op = t.closest('[data-ce-open]'); if (op) { e.preventDefault(); Object.assign(S(), {listType: 'archive_services', archiveServiceId: Number(op.dataset.ceOpen), complEtudes: true}); return A().renderList?.(); }
        if (t.closest('[data-ce-new]')) return newEtude();
        if (t.closest('[data-ce-back]')) { S().complEtudes = false; return A().renderList?.(); }
        if (t.closest('[data-ce-group]')) { t.closest('details')?.removeAttribute('open'); return groupDialog(); }
        if (t.closest('[data-ce-set]')) { t.closest('details')?.removeAttribute('open'); return openSettings('A'); }
        if (t.closest('[data-ce-later]')) { try { sessionStorage.setItem('lcnda-ce-later', '1'); } catch (_) {} t.closest('.compl-ce-banner')?.remove(); }
    });
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-compl-etude]'); if (b) { e.preventDefault(); e.stopPropagation(); ext.archiveServices?.open?.(Number(b.dataset.complEtude)); } }, true);
    window.addEventListener('lcnda:compl-settings', () => { if (S()?.module === 'listes' && ['archive_services', 'notary_offices'].includes(S().listType)) { A().renderSidebar?.(); A().renderList?.(); } });
    const boot = () => { if (!A()) return; addList(); loadSet(); };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true}); setTimeout(boot, 0);
})();
