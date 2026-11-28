/**
 * 🖊 Relecture d'une branche par un cousin (écran 11 de docs/design/successoral-et-plus.html ; serveur : lib/plus_famille.php).
 *  - Réglages → Export propre → « 📤 Partager avec la famille… » : case « 🖊 Demander une relecture » (heritage-partage.js) ;
 *    la copie (lecture seule) montre alors « ✓ D'accord / ✗ Je pense que c'est faux » et un commentaire sur chaque fait, et le
 *    bouton « ⤓ Renvoyer mes remarques » (family-share-viewer.js) ;
 *  - raccourci : fiche → ⋯ → « 🖊 Faire relire cette branche… » (la même fenêtre, branche déjà choisie) ;
 *  - le retour : Listes → 🖼️ Médias et documents → « Questions aux proches » → « ⤒ Importer les réponses » reconnaît le
 *    fichier ; chaque relecture y est une ligne (envoyé / répondu / rangé) ; ✓ Accepter / ✕ Refuser / Plus tard par fait,
 *    « ↶ Annuler » ;
 *  - une remarque « faux » laissée pour plus tard reste sur le fait de la fiche (pastille 💬) jusqu'à ✎ Corriger, 📝 Noter
 *    (accepter) ou ✕ Refuser.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))); // 🌐 app-i18n.js
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, one, many) => (A()?.plural ? A().plural(n, one, many) : `${n} ${n > 1 ? (many || one + 's') : one}`);
    const api = (...a) => A().api(...a);
    const write = async (op, body = {}) => api('pfam_write', {}, {method: 'POST', body: {op, ...body}});
    const toast = (...a) => A().toast(...a);
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const STATUS = {sent: ['Envoyé', 'blue'], answered: ['Répondu', 'green'], filed: ['Rangé', 'grey']};
    const isReplyText = t => /"format"\s*:\s*"lcnda-relecture"/.test(String(t || '').slice(0, 400));
    /** la fiche ouverte est relue (faits, notes, fiabilité) */
    const refreshPerson = () => { const S = A().state; if (S.module === 'personnes' && S.currentPersonId) A().openPersonById?.(Number(S.currentPersonId)); };
    const factText = f => [i18n(f.label || 'Événement'), f.date, f.place].filter(Boolean).join(', ');
    const whoText = f => (f.people || []).map(p => p.name).join(' & ');

    /* ═════════ ⤒ Importer les réponses : la fenêtre commune (K13), ✓ / ✕ / plus tard par fait ═════════ */
    function rowHtml(a, from) {
        const dflt = a.v === 'ok' ? 'accept' : 'later';
        return `<article class="pf-rv-ans is-${a.v}" data-pf-rv="${esc(a.r)}">
            <p>${a.v === 'ok' ? '✓' : '✗'} <b>${esc(factText(a.fact))}</b> <small class="muted">— ${esc(whoText(a.fact))}</small></p>
            <p>${esc(a.v === 'ok' ? i18n('« d’accord », dit {who}.', {who: from}) : i18n('« faux », dit {who}.', {who: from}))}${a.c ? ` <q>${esc(a.c)}</q>` : ''}</p>
            <div class="pa-act" role="radiogroup" aria-label="${esc(i18n('Que faire de cette remarque ?'))}">${[['accept', a.v === 'ok' ? i18n('✓ Accepter (témoignage)') : i18n('✓ Accepter (note sur le fait, « doute »)')], ['refuse', i18n('✕ Refuser')], ['later', i18n('Plus tard')]].map(([v, l]) => `<label class="pa-act-i"><input type="radio" name="pf-rv-${esc(a.r)}" value="${v}" ${v === dflt ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></article>`;
    }
    function answersHtml(r) {
        const from = r.from || i18n('ton cousin'), wrong = r.answers.filter(a => a.v === 'wrong'), ok = r.answers.filter(a => a.v === 'ok');
        return `<div class="pf-rv-answers">${wrong.map(a => rowHtml(a, from)).join('')}
            ${ok.length ? `<details class="pf-rv-ok"${ok.length <= 3 ? ' open' : ''}><summary>✓ ${esc(i18n('{what} par {who} : ajoutés comme témoignage si tu acceptes', {what: plural(ok.length, 'fait confirmé', 'faits confirmés'), who: from}))}
                <span class="pf-rv-all">${esc(i18n('Pour tous :'))} <button type="button" class="link-button" data-pf-rv-all="accept">${esc(i18n('✓ Accepter'))}</button> · <button type="button" class="link-button" data-pf-rv-all="refuse">${esc(i18n('✕ Refuser'))}</button></span></summary>${ok.map(a => rowHtml(a, from)).join('')}</details>` : ''}</div>`;
    }
    const bindAnswers = box => box.addEventListener('click', e => { const b = e.target.closest('[data-pf-rv-all]'); if (!b) return; e.preventDefault(); b.closest('details').querySelectorAll(`input[value="${b.dataset.pfRvAll}"]`).forEach(i => { i.checked = true; }); });
    const readChoices = box => [...box.querySelectorAll('[data-pf-rv]')].map(el => ({r: el.dataset.pfRv, decision: el.querySelector('input:checked')?.value || 'later'}));
    function importAnswers({files = null, after = null} = {}) {
        return UI().openImportDialog({title: i18n('Importer les remarques d’une relecture'), accept: '.json,application/json', what: i18n('le fichier « remarques-….json »'), noun: 'remarque', feminine: true, files,
            intro: i18n('Le fichier que ton cousin t’a renvoyé avec « ⤓ Renvoyer mes remarques ».'),
            analyze: async fl => {
                const f = fl[0]; if (!f) throw new Error(i18n('Aucun fichier.'));
                if (f.size > 600 * 1024) throw new Error(i18n('Ce fichier est trop gros pour un fichier de remarques.'));
                const body = {file: await f.text()};
                const res = await write('review_analyze', body), n = res.answers.length;
                return {count: n, noun: 'remarque', feminine: true, ok: n > 0, data: {body, r: res},
                    summaryHtml: n ? i18n('<b>{what}</b> de <b>{who}</b> sur « {title} » ({date}). Pour chaque fait : accepte, refuse ou garde pour plus tard', {what: esc(plural(n, 'remarque')), who: esc(res.from || i18n('ton cousin')), title: esc(res.review.title), date: esc(res.date)})
                        : res.already ? i18n('Ces remarques ont <b>déjà été importées</b>') : i18n('Aucune remarque dans ce fichier'),
                    notices: res.unknown ? [{kind: 'warn', text: i18n('{what} sur des faits qui ne sont plus dans la base : mises de côté.', {what: plural(res.unknown, 'remarque')})}] : [],
                    preview: n ? answersHtml(res) : '', onShow: bindAnswers, goLabel: i18n('⤒ Importer les remarques')};
            },
            run: async (an, fl, box) => {
                const res = await write('review_import', {...an.data.body, choices: readChoices(box)});
                after?.(res); refreshPerson();
                const c = res.counts || {};
                const parts = [c.confirmed ? plural(c.confirmed, 'témoignage') : '', c.noted ? plural(c.noted, 'remarque notée', 'remarques notées') : '', c.later ? plural(c.later, 'remarque pour plus tard', 'remarques pour plus tard') : ''].filter(Boolean);
                return {message: parts.length ? i18n('{what} (relecture de {who})', {what: parts.join(' · '), who: res.from || i18n('ton cousin')}) : i18n('Remarques de {who} gardées avec la relecture.', {who: res.from || i18n('ton cousin')}),
                    undo: async () => { await write('review_undo_import', {id: res.id}); after?.(); refreshPerson(); }};
            }});
    }

    /* ═════════ 💬 Questions aux proches : une ligne par relecture (envoyé / répondu / rangé) ═════════ */
    async function listSection(host) {
        if (!host || host.querySelector('.pf-rv-list')) return;
        const sec = document.createElement('section'); sec.className = 'pf-rv-list'; host.appendChild(sec);
        const draw = async () => {
            let rows = []; try { rows = (await api('pfam', {op: 'reviews'})).reviews || []; } catch (e) { sec.innerHTML = A().empty(e.message, {icon: '⛔'}); return; }
            const item = r => ({name: r.title, thumb: '<span class="ui-card-ico">🖊</span>',
                lines: [[r.person ? i18n('à partir de {name}', {name: r.person.name}) : '', r.from ? i18n('relu par {who}', {who: r.from}) : ''].filter(Boolean).join(' · ') || i18n('En attente des remarques'),
                    r.counts.items ? [plural(r.counts.items, 'remarque'), r.counts.pending ? i18n('{n} à ranger', {n: String(r.counts.pending)}) : i18n('tout est rangé')].join(' · ') : i18n('Envoyé, en attente des remarques')],
                badges: [UI().badge(i18n((STATUS[r.status] || STATUS.sent)[0]), (STATUS[r.status] || STATUS.sent)[1])], when: r.updated_at, whenLabel: i18n('Modifié'),
                actions: kiosk() ? '' : `<button type="button" class="icon-button small" data-pf-rv-del="${r.id}" title="${esc(i18n('Supprimer la relecture'))}" aria-label="${esc(i18n('Supprimer'))}">🗑</button>`});
            sec.innerHTML = `<div class="pa-list-head"><h3>🖊 ${esc(i18n('Relectures de branche'))} <small class="muted">${esc(plural(rows.length, 'relecture'))}</small></h3>${kiosk() ? '' : `<button type="button" class="button small secondary" data-pf-rv-new>${esc(i18n('＋ Demander une relecture…'))}</button><button type="button" class="button small secondary" data-pf-rv-import>${esc(i18n('⤒ Importer les réponses'))}</button>`}</div>`
                + (rows.length ? UI().itemsHtml('list', rows.map(item)) : A().empty(i18n('Aucune relecture : « 📤 Partager avec la famille » avec la case « 🖊 Demander une relecture », ou fiche → ⋯ → « 🖊 Faire relire cette branche… ».'), {icon: '🖊', action: kiosk() ? null : {label: i18n('＋ Demander une relecture…'), attrs: 'data-pf-rv-new'}}));
            sec._rows = rows;
        };
        sec.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-pf-rv-new]')) return ext.openFamilyShare?.({review: true});
            if (b.matches('[data-pf-rv-import]')) return importAnswers({after: draw});
            if (b.dataset.pfRvDel) { const id = Number(b.dataset.pfRvDel), r = (sec._rows || []).find(x => x.id === id);
                try { await write('review_delete', {id}); draw(); A().undoToast?.(i18n('Relecture « {title} » supprimée', {title: r?.title || ''}), {undo: async () => { await write('review_restore', {id}); draw(); }}); } catch (err) { toast(err.message, 'error'); } }
        });
        await draw();
    }
    ext.afterQuestions = ext.afterQuestions || [];
    ext.afterQuestions.push(page => listSection(page));

    /* ═════════ fiche → ⋯ → « 🖊 Faire relire cette branche… » ═════════ */
    ext.personMoreItems = ext.personMoreItems || [];
    ext.personMoreItems.push(detail => { const p = detail?.person; if (!p?.id || p.kind === 'animal' || kiosk()) return null;
        return {key: 'relecture', icon: '🖊', label: i18n('Faire relire cette branche…'), run: () => ext.openFamilyShare?.({review: true, branch: {mode: 'descendants', person: Number(p.id), personName: [p.first_name, p.last_name].filter(Boolean).join(' ')}})}; });

    /* ═════════ la pastille 💬 sur un fait de la fiche : ✎ Corriger, 📝 Noter, ✕ Refuser ═════════ */
    async function decorate(detail) {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return;
        let d; try { d = await api('pfam', {op: 'review_pending', person_id: pid}); } catch (_) { return; }
        if (Number(A().state.currentPersonId) !== pid) return;
        (d.items || []).forEach(it => {
            const row = document.querySelector(`#workspace .event-row[data-event-id="${it.event_id}"]`); if (!row || row.querySelector(`[data-pf-rv-pill="${it.id}"]`)) return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'pf-rv-pill'; b.dataset.pfRvPill = String(it.id);
            b.textContent = '💬'; b.title = it.verdict === 'wrong' ? i18n('{who} pense que c’est faux : {c}', {who: it.from || i18n('un cousin'), c: it.comment || '—'}) : i18n('{who} est d’accord', {who: it.from || i18n('un cousin')});
            b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); menu(b, it, row); });
            (row.querySelector('.item-title-row') || row.querySelector('.event-content') || row).appendChild(b);
        });
    }
    function menu(btn, it, row) {
        const run = async decision => { try { await write('review_decide', {item_id: it.id, decision}); btn.remove();
            A().undoToast?.(decision === 'refuse' ? i18n('Remarque refusée') : it.verdict === 'wrong' ? i18n('Remarque notée sur le fait') : i18n('Témoignage ajouté'), {undo: async () => { await write('review_undecide', {item_id: it.id}); refreshPerson(); }}); refreshPerson(); }
            catch (e) { toast(e.message, 'error'); } };
        const items = [{icon: '💬', label: `${it.from || i18n('un cousin')} : ${it.verdict === 'wrong' ? i18n('« je pense que c’est faux »') : i18n('« d’accord »')}`, help: it.comment || it.review, disabled: true}, '-',
            ...(it.verdict === 'wrong' ? [{icon: '✎', label: i18n('Corriger le fait'), help: i18n('ouvre le fait ; la remarque reste jusqu’à « Noter » ou « Refuser »'), run: () => row.querySelector('[data-edit-event]')?.click()}] : []),
            {icon: '📝', label: it.verdict === 'wrong' ? i18n('Noter (note sur le fait, « doute »)') : i18n('Accepter (témoignage)'), run: () => run('accept')},
            {icon: '✕', label: i18n('Refuser'), run: () => run('refuse')}];
        if (UI().menuAt) UI().menuAt(btn, items, {title: i18n('🖊 Remarque de relecture')}); else run('accept');
    }
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(detail => { decorate(detail); });

    ext.familyReview = {isReplyText, importAnswers, listSection};
})();
