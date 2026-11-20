/**
 * 🛡 Fiabilité par personne (écran 10 de docs/design/successoral-et-plus.html ; serveur : lib/plus_famille.php, GET pfam&op=…).
 * Une note sur 100 qui réunit la fiabilité de chaque fait, les dates estimées, les sources et la 🛡 solidité des liens, avec
 * ses raisons en clair. Entrées :
 *  - fiche : bloc « 🛡 Fiabilité » sous « Sources » (masquable et déplaçable dans Réglages → Fiches personnes et animaux) ;
 *  - Listes → Personnes : colonne « 🛡 Fiabilité » (⚙️ Colonnes, triable) et filtre « À revoir avant publication » (app-listes.js) ;
 *  - Réglages → Export propre : contrôle « à revoir avant publication » avant le GEDCOM « Pour partager » et « 🌐 Pour Geneanet » ;
 *  - tableau de bord : widget « 🛡 Fiches les moins fiables » (nombre de lignes réglable, 5 au départ) ;
 *  - Réglages → ⚙️ Seuils du contrôle : le seuil « à revoir » (50 au départ).
 * Aussi les aides communes des autres fichiers plus-famille-*.js (window.LCNDA_EXT.plusFamille).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.dashboard = ext.dashboard || {};
    ext.personBlocks = ext.personBlocks || {};
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const api = (...a) => A().api(...a);
    const get = (op, q = {}) => api('pfam', {op, ...q});
    const write = async (op, body = {}) => api('pfam_write', {}, {method: 'POST', body: {op, ...body}});
    const toast = (...a) => A().toast(...a);
    const undo = (msg, o) => (A().undoToast ? A().undoToast(msg, o) : toast(msg));
    const badge = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const RO = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const LEVELS = {high: ['Très sûr', 'green'], good: ['Assez sûr', 'blue'], medium: ['Moyen', 'yellow'], review: ['Peu sûr', 'red']};
    const SOL = {proved: 'prouvé', probable: 'probable', supposed: 'supposé', unsourced: 'sans source', refuted: 'réfuté'};
    const levelOf = (score, min = 50) => (score < min ? 'review' : score >= 80 ? 'high' : score >= 65 ? 'good' : 'medium');
    /** la pastille de la note (« 68 ») : couleur du niveau */
    const pill = (score, min = 50) => (score == null ? '' : `<span class="pf-rel-pill is-${levelOf(score, min)}" title="${esc(i18n('Fiabilité : {n} sur 100', {n: String(score)}))}">${esc(String(score))}</span>`);
    const factWord = f => `${i18n(f.label || 'Événement')}${f.date ? ` ${f.date}` : ''}`;
    const openPerson = id => A().openPersonById?.(Number(id));

    /* ═════════ le bloc de la fiche ═════════ */
    ext.personBlocks.reliability = (index, detail) => {
        const pid = Number(detail?.person?.id) || 0;
        if (!pid || detail.person.kind === 'animal') return '';
        return A().card(index, i18n('🛡 Fiabilité'), '', `<div class="pf-rel" data-pf-rel="${pid}">${UI().spinner ? UI().spinner(i18n('Calcul de la note…')) : '…'}</div>`, 'span-12',
            `<button type="button" class="button small secondary" data-pf-rel-how title="${esc(i18n('Comment la note est calculée'))}">${esc(i18n('? Comment c’est calculé'))}</button>`);
    };
    function relHtml(d) {
        const c = d.facts.count, parts = [c.certain ? plural(c.certain, 'fait certain', 'faits certains') : '', c.deduced ? plural(c.deduced, 'fait déduit', 'faits déduits') : '',
            c.estimated ? plural(c.estimated, 'fait estimé', 'faits estimés') : '', c.doubt ? plural(c.doubt, 'fait en doute', 'faits en doute') : '', c.unknown ? plural(c.unknown, 'fait non évalué', 'faits non évalués') : ''].filter(Boolean);
        const facts = d.facts.n ? [parts.join(', '), d.facts.doubt.length ? i18n('en doute : {what}', {what: d.facts.doubt.map(factWord).join(', ')}) : '',
            (est => est.length ? i18n('date estimée : {what}', {what: est.map(factWord).join(', ')}) : '')(d.facts.estimated.filter(f => !d.facts.doubt.some(x => x.id === f.id)))].filter(Boolean).join(' · ') : i18n('aucun fait noté (naissance, mariage, décès…)');
        const s = d.sources;
        const sources = s.n ? [i18n(s.sourced > 1 ? '{a} sur {n} ont une source' : '{a} sur {n} a une source', {a: plural(s.sourced, 'fait', 'faits'), n: String(s.n)}),
            s.unsourced.length ? i18n('sans source : {what}', {what: s.unsourced.slice(0, 4).map(factWord).join(', ') + (s.unsourced.length > 4 ? '…' : '')}) : ''].filter(Boolean).join(' · ')
            : (s.person ? i18n('une source sur la fiche, mais sur aucun fait') : i18n('aucune source'));
        const who = p => i18n(p.gender === 'female' ? 'mère' : p.gender === 'male' ? 'père' : 'parent');
        const links = d.links.parents.length ? d.links.parents.map(p => i18n('{who} : lien {lvl}', {who: `${who(p)} (${esc(p.name)})`, lvl: i18n(SOL[p.level] || p.level)})).join(' · ') : i18n('pas de parents dans la base : cette part ne compte pas');
        const tips = d.tips.map(t => t.kind === 'source' ? `<button type="button" class="link-button" data-pf-rel-ev="${t.event.id}">${esc(i18n('ajouter une source à : {what}', {what: factWord(t.event)}))}</button>`
            : t.kind === 'doubt' ? `<button type="button" class="link-button" data-pf-rel-ev="${t.event.id}">${esc(i18n('vérifier {what}, marqué « doute »', {what: factWord(t.event)}))}</button>`
            : t.kind === 'link' ? `<button type="button" class="link-button" data-pf-rel-link="${d.person_id}:${t.parent.id}">${esc(i18n('confirmer le lien avec {name} (⚖️ dossier de preuve)', {name: t.parent.name}))}</button>`
            : esc(i18n('ajouter ses faits (naissance, mariage, décès) avec leur source'))).join(', ');
        const [lab, kind] = LEVELS[d.level] || LEVELS.medium;
        const row = (ic, title, text, score) => `<div class="pf-rel-row"><span class="pf-rel-ic" aria-hidden="true">${ic}</span><div><b>${esc(i18n(title))}</b> ${text}</div>${score == null ? '<span class="pf-rel-sc is-off">—</span>' : `<span class="pf-rel-sc">${score}</span>`}</div>`;
        return `<div class="pf-rel-top"><div class="pf-rel-big is-${d.level}"><strong>${d.score}</strong><small>${esc(i18n('sur 100'))}</small></div>
            <div class="pf-rel-who"><div>${badge(i18n(lab), kind)} ${d.review ? badge(i18n('À revoir avant publication'), 'red') : ''}${d.hidden ? ` <small class="muted">${esc(i18n('(vivant ou fiche confidentielle : ne part pas à la publication)'))}</small>` : ''}</div>
            <i class="pf-rel-bar" aria-hidden="true"><b style="width:${Math.max(2, Math.min(100, d.score))}%"></b><em style="left:${d.threshold}%" title="${esc(i18n('Seuil « à revoir » : {n}', {n: String(d.threshold)}))}"></em></i></div></div>
            ${row('📌', 'Ses faits :', esc(facts), d.facts.score)}${row('📚', 'Ses sources :', esc(sources), d.sources.score)}${row('🛡', 'Ses liens :', links, d.links.score)}
            ${tips ? `<p class="pf-rel-tip">💡 <b>${esc(i18n('Pour gagner des points :'))}</b> ${tips}.</p>` : ''}
            <p class="ui-hint">${esc(i18n('La note n’est pas le score de complétude (qui compte ce qui est rempli) : une fiche peut être bien remplie et peu sûre.'))}</p>`;
    }
    async function fillRel(el) {
        el.dataset.pfDone = '1';
        try { const d = await get('rel_person', {id: el.dataset.pfRel}); if (el.isConnected) el.innerHTML = relHtml(d); }
        catch (e) { if (el.isConnected) el.innerHTML = A().empty(e.message || i18n('Calcul impossible.'), {icon: '⛔'}); }
    }
    function howDialog() {
        ext.openDialog?.({eyebrow: i18n('🛡 FIABILITÉ'), title: i18n('Comment la note est calculée'), submitLabel: i18n('Fermer'), onSubmit: () => true,
            body: `<p>${esc(i18n('Trois parts, sur 100 chacune, puis une moyenne :'))}</p><ul class="pf-rel-how">
                <li><b>📌 ${esc(i18n('Ses faits (40 %)'))}</b> — ${esc(i18n('la fiabilité de chaque fait : certain 100, déduit 80, estimé 55, doute 15, non évalué 60 ; une date « vers… », « avant… » compte comme estimée.'))}</li>
                <li><b>📚 ${esc(i18n('Ses sources (35 %)'))}</b> — ${esc(i18n('la part des faits qui ont une source citée ou un acte en image.'))}</li>
                <li><b>🛡 ${esc(i18n('Ses liens (25 %)'))}</b> — ${esc(i18n('la solidité du lien avec chaque parent : prouvé 100, probable 75, supposé 45, sans source 20, réfuté 0. Sans parents dans la base, cette part ne compte pas.'))}</li></ul>
                <p>${esc(i18n('Sous le seuil (50 au départ), la fiche est « à revoir avant publication ». Le seuil se règle dans Réglages → ⚙️ Seuils du contrôle.'))}</p>
                <p class="ui-hint">${esc(i18n('Rien n’est changé dans ta base : la note est recalculée dès qu’un fait ou une source change.'))}</p>`});
    }
    document.addEventListener('click', e => {
        if (e.target.closest?.('[data-pf-rel-how]')) { e.preventDefault(); howDialog(); return; }
        const ev = e.target.closest?.('[data-pf-rel-ev]'); if (ev) { e.preventDefault(); const b = document.querySelector(`#workspace [data-edit-event="${ev.dataset.pfRelEv}"]`); if (b) b.click(); else document.querySelector(`#workspace .event-row[data-event-id="${ev.dataset.pfRelEv}"]`)?.scrollIntoView({block: 'center', behavior: 'smooth'}); return; }
        const ln = e.target.closest?.('[data-pf-rel-link]'); if (ln) { e.preventDefault(); const [c, p] = ln.dataset.pfRelLink.split(':').map(Number); ext.preuve?.openLink?.(c, p); return; }
        const w = e.target.closest?.('[data-pf-w-person]'); if (w) { e.preventDefault(); openPerson(w.dataset.pfWPerson); return; }
        if (e.target.closest?.('[data-pf-w-all]')) { e.preventDefault(); showReviewList(); }
    });
    const scan = () => document.querySelectorAll('[data-pf-rel]:not([data-pf-done])').forEach(fillRel);
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});

    /* ═════════ Listes → Personnes : la colonne et le filtre (app-listes.js les appelle) ═════════ */
    const relCell = row => (row.reliability == null ? '—' : pill(Number(row.reliability), thresholdCache));
    let thresholdCache = 50;
    /** ouvrir Listes → Personnes, filtrée sur « À revoir avant publication » */
    function showReviewList() {
        try { const k = 'lcnda-listbar:listes:persons', v = JSON.parse(localStorage.getItem(k) || 'null') || {}; v.f = {...(v.f || {}), reliability: 'review'}; localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        const S = A().state; S.listType = 'persons';
        if (S.module === 'listes') { A().renderSidebar?.(); A().renderList?.(); } else A().setModule('listes');
    }

    /* ═════════ le widget « 🛡 Fiches les moins fiables » ═════════ */
    function widgetBody(d, limit) {
        if (!d) return A().empty(i18n('La fiabilité n’a pas pu être calculée.'), {icon: '⛔'});
        thresholdCache = d.threshold;
        if (!d.count) return A().empty(d.published ? i18n('Aucune fiche à revoir avant publication, bravo !') : i18n('Pas encore de fiche à publier.'), {icon: '🎉'});
        return `<p class="pf-w-sum">${esc(i18n('{n} sous {min} sur 100', {n: plural(d.count, 'fiche à revoir', 'fiches à revoir'), min: String(d.threshold)}))}</p><ul class="pf-w-list">${d.top.slice(0, limit).map(x => `<li><button type="button" class="pf-w-row" data-pf-w-person="${x.id}">${pill(x.score, d.threshold)}<span><b>${esc(x.name)}</b>${x.years ? ` <small class="muted">(${esc(x.years)})</small>` : ''}</span>${badge(i18n('À revoir'), 'red')}</button></li>`).join('')}</ul>`;
    }
    ext.dashboard.reliability_widget = {
        load: () => get('rel_summary', {limit: 20}).catch(() => null),
        render: (index, widget, span, data) => {
            const limit = Math.max(1, Math.min(20, Number(widget?.limit) || 5));
            return A().card(index, i18n('🛡 Fiches les moins fiables'), data ? data.count : '', `<div data-pf-widget data-limit="${limit}">${widgetBody(data, limit)}</div>`, span,
                `<button type="button" class="button small secondary" data-pf-w-all title="${esc(i18n('Listes → Personnes, filtrée sur « À revoir avant publication »'))}">${esc(i18n('Tout voir ↗'))}</button>`);
        },
    };

    /* ═════════ le contrôle avant l'export « Pour partager » et « 🌐 Pour Geneanet » ═════════ */
    /** gate(form) → true : on exporte ; false : la question est posée dans la fenêtre (le bouton choisi relance l'export) */
    async function gate(form, again) {
        if (form.dataset.pfRelOk === '1') { setTimeout(() => { delete form.dataset.pfRelOk; }, 0); return true; }
        let d; try { d = await get('rel_export_check', {limit: 3}); } catch (_) { return true; }
        thresholdCache = d.threshold;
        if (!d.count) { delete form.dataset.relSkip; return true; }
        form.querySelector('.pf-gate')?.remove();
        const box = document.createElement('div'); box.className = 'pf-gate'; box.setAttribute('role', 'alert');
        box.innerHTML = `<p>🛡 ${esc(i18n(d.count > 1 ? '{n} sont à revoir avant publication (note sous {min}).' : '{n} est à revoir avant publication (note sous {min}).', {n: plural(d.count, 'fiche'), min: String(d.threshold)}))}
            ${d.top.length ? `<small class="muted">${esc(d.top.map(x => `${x.name} (${x.score})`).join(', '))}${d.count > d.top.length ? '…' : ''}</small>` : ''}</p>
            <div class="pf-gate-acts"><button type="button" class="button small secondary" data-pf-g="see">${esc(i18n('Les voir'))}</button><button type="button" class="button small" data-pf-g="skip">${esc(i18n('Les laisser de côté'))}</button><button type="button" class="button small secondary" data-pf-g="go">${esc(i18n('Exporter quand même'))}</button></div>`;
        const anchor = form.querySelector('.page-actions, .modal-actions') || form.lastElementChild;
        if (anchor && anchor.parentElement === form) form.insertBefore(box, anchor); else form.appendChild(box);
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-pf-g]'); if (!b) return;
            if (b.dataset.pfG === 'see') return showReviewList();
            form.dataset.relSkip = b.dataset.pfG === 'skip' ? '1' : '0'; form.dataset.pfRelOk = '1'; box.remove();
            (again || (() => form.requestSubmit()))();
        });
        box.querySelector('[data-pf-g="skip"]').focus();
        return false;
    }
    ext.exportGate = {...(ext.exportGate || {}), geneanet: form => gate(form)};
    // le GEDCOM configurable (Réglages → Export) : le contrôle passe avant le téléchargement, seulement avec « Pour partager »
    document.addEventListener('submit', async e => {
        const form = e.target; if (!form?.matches?.('#gedcom-export-form') || !form.elements.share?.checked) return;
        if (form.dataset.pfRelOk === '1') { setTimeout(() => { delete form.dataset.pfRelOk; }, 0); return; }
        e.preventDefault(); e.stopImmediatePropagation();
        if (await gate(form)) { form.dataset.relSkip = '0'; form.dataset.pfRelOk = '1'; form.requestSubmit(); }
    }, true);

    /* ═════════ au catalogue : bloc de fiche (après « Sources ») et widget ═════════ */
    const reg = () => {
        const app = A(); if (!app?.defaultPersonBlocks) return false;
        const L = app.defaultPersonBlocks;
        if (!L.some(b => b[0] === 'reliability')) { const i = L.findIndex(b => b[0] === 'sources'); L.splice(i < 0 ? L.length : i + 1, 0, ['reliability', '🛡 Fiabilité']); }
        if (app.defaultDashboardBlocks && !app.defaultDashboardBlocks.some(x => x[0] === 'reliability_widget')) {
            const D = app.defaultDashboardBlocks, i = D.findIndex(x => x[0] === 'fragile_widget');
            D.splice(i < 0 ? D.length : i + 1, 0, ['reliability_widget', '🛡 Fiches les moins fiables']);
            if (app.defaultDashboardBlockSpans) app.defaultDashboardBlockSpans.reliability_widget = '6';
            if (app.defaultDashboardBlockLimits) app.defaultDashboardBlockLimits.reliability_widget = 5; // nombre de lignes réglable (5 au départ)
        }
        return true;
    };
    if (!reg()) document.addEventListener('DOMContentLoaded', reg, {once: true});
    // la fiche s'ouvre après un changement de fait : le bloc se recalcule (le serveur garde le calcul tant que rien ne change)
    ext.afterPerson = ext.afterPerson || [];

    ext.plusFamille = {...(ext.plusFamille || {}), i18n, esc, plural, api, get, write, toast, undo, badge, RO, relCell, pill, relHtml, gate, showReviewList, levelOf};
})();
