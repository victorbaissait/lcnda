/**
 * 🗓 Journal des recherches — tout ce qui a été cherché, pour ne pas chercher deux fois au même endroit.
 * Même page à deux endroits : Recherche → « 🗓 Journal des recherches » (juste après « Dépouillement d’archive ») et
 * Listes → Archives et sources → « Journal des recherches ». Rien n'est recopié : lib/research_journal.php relit les
 * dépouillements, les cotes des visites faites, les pistes d'enquête, les battues et les demandes.
 *  - barre H10 (UI.listBar « listes:research_journal ») : chercher, filtrer (sorte, résultat, personne, service, commune), Liste | Fiches, trier ;
 *  - ⤓ Exporter en CSV (cellules passées par csvCell) ;
 *  - bloc de fiche « 🔍 Déjà cherché » (réglable et masquable comme les autres : Maintenance → Apparence → blocs des fiches) ;
 *  - ext.journal.bindAlready(form, critères) : le message ⚠️ « Déjà dans ton suivi : … » pendant la saisie (dépouillement, demande, cote de visite) ;
 *  - ext.journal.resultSelect / badge : le résultat simple (Trouvé, Rien trouvé, En partie, Pas consulté) et sa pastille K8.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const k of ['personBlocks', 'lists']) ext[k] = ext[k] || {};
    const esc = v => A().escapeHtml(v ?? '');
    const S = () => A().state;
    const KEY = 'listes:research_journal';
    const RESULTS = {found: ['Trouvé', 'green'], none: ['Rien trouvé', 'grey'], partial: ['En partie', 'yellow'], not_consulted: ['Pas consulté', 'grey']};
    const KINDS = {digest: ['📜', 'Dépouillement', 'Dépouillements'], visit: ['🗄️', 'Visite faite', 'Visites faites'], lead: ['🔍', 'Piste d’enquête', 'Pistes d’enquête'], battue: ['🧭', 'Battue', 'Battues'], request: ['📮', 'Demande', 'Demandes']};
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const badge = r => (RESULTS[r] ? (UI()?.badge ? UI().badge(RESULTS[r][0], RESULTS[r][1]) : `<span class="ui-badge is-${RESULTS[r][1]}">${esc(RESULTS[r][0])}</span>`) : '');
    /** le menu fixe du résultat (un simple menu déroulant : choix fixes) */
    const resultSelect = (name, value = '', {visit = false, attrs = ''} = {}) => `<select name="${esc(name)}" ${attrs}><option value="">— pas encore noté —</option>${Object.entries(RESULTS).filter(([k]) => visit || k !== 'not_consulted').map(([k, [l]]) => `<option value="${k}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    /** « le 12 mars 2025 », « hier à 10 h 22 » */
    const whenShort = d => { const t = UI()?.whenText?.(d) || ''; return /^\d/.test(t) ? `le ${t}` : t; };

    /* ─────────── ↗ Ouvrir : chaque sorte dans son outil ─────────── */
    function openTarget(o) {
        if (!o || !o.kind) return;
        const app = A(), st = app.state;
        document.querySelectorAll('dialog[open]').forEach(d => { if (d.querySelector('[data-rj-open]')) d.close(); });
        if (o.kind === 'digest') { if (ext.openDepouillement) return ext.openDepouillement(Number(o.id)); Object.assign(st, {researchKind: 'archive_digest', archiveDigestAdding: false}); st.archiveDigestSearch = {id: Number(o.id)}; return app.setModule('recherche'); }
        if (o.kind === 'visit') { Object.assign(st, {listType: 'archive_visits', archiveVisitFilter: 'done', archiveVisitFocus: Number(o.id)}); return app.setModule('listes'); }
        if (o.kind === 'investigation') { Object.assign(st, {currentInvestigationId: Number(o.id), enquetesTab: 'enquetes'}); return app.setModule('enquetes'); }
        if (o.kind === 'battue') { Object.assign(st, {currentBattueId: Number(o.id), enquetesTab: 'battues'}); return app.setModule('enquetes'); }
        if (o.kind === 'request') { Object.assign(st, {researchKind: 'archive_digest', archiveDigestAdding: false, archiveDigestOpenRequests: true}); st.archiveDigestSearch = {}; return app.setModule('recherche'); }
    }
    const openAttr = o => `data-rj-open="${esc(JSON.stringify(o || {}))}"`;
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-rj-open]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        let o = null; try { o = JSON.parse(b.dataset.rjOpen); } catch (_) {}
        openTarget(o);
    });
    // ＋ Nouveau dépouillement (avec, depuis une fiche, la personne déjà mise dans « Personnes cherchées »)
    const newDigest = (personId = 0) => { const st = S(); Object.assign(st, {researchKind: 'archive_digest', archiveDigestAdding: true, archiveDigestEditId: 0, archiveDigestPrefill: personId ? {sought: [Number(personId)]} : null}); A().persistUiState?.(); A().setModule('recherche'); };
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-rj-new-digest]'); if (!b) return; e.preventDefault(); newDigest(Number(b.dataset.rjPersonId) || 0); });

    /* ─────────── ⚠️ « Déjà dans ton suivi » pendant la saisie ─────────── */
    function alreadyHtml(list) {
        if (!list.length) return '';
        const line = m => `<span class="h-rj-al-line"><b>${esc(m.title)}</b>${m.cote ? ` · cote ${esc(m.cote)}` : ''}${m.service ? ` · ${esc(m.service)}` : ''} <small>(${esc([m.result_label || m.status_label, whenShort(m.date)].filter(Boolean).join(', '))})</small> <button type="button" class="button small secondary" ${openAttr(m.open)}>↗ Ouvrir</button></span>`;
        return `<div class="ui-notice ui-notice-warn h-rj-already" role="status"><span class="ui-notice-ico" aria-hidden="true">⚠️</span><span><b>Déjà dans ton suivi :</b>${list.map(line).join('')}</span></div>`;
    }
    /** bindAlready(form, () => critères | null, {after}) : la case du message se pose après `after` (sinon après la première grille du formulaire) */
    function bindAlready(form, criteria, {after = null} = {}) {
        if (!form || form.dataset.rjAlready) return null;
        form.dataset.rjAlready = '1';
        let box = form.querySelector('[data-journal-already]');
        if (!box) { box = document.createElement('div'); box.dataset.journalAlready = ''; (after || form.querySelector('.form-grid') || form.firstElementChild)?.after(box); }
        let seq = 0, timer = 0, last = '';
        const run = async () => {
            const c = criteria(); const my = ++seq;
            const sig = JSON.stringify(c || {}); if (sig === last) return; last = sig;
            if (!c || !(String(c.reference || '').trim() || (String(c.service || '').trim() && (String(c.city || '').trim() || Number(c.place_id))))) { box.innerHTML = ''; return; }
            let d; try { d = await A().api('research_already', c); } catch (_) { return; }
            if (my !== seq) return;
            box.innerHTML = alreadyHtml(d.matches || []);
        };
        const later = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
        ['input', 'change', 'picker-change'].forEach(t => form.addEventListener(t, later));
        run();
        return {refresh: () => { last = ''; return run(); }, box};
    }

    /* ─────────── Les lignes du journal ─────────── */
    const peopleText = r => (r.people || []).map(p => `${p.title}${p.role === 'found' ? ' (relevé)' : ''}`).join(', ');
    const whereText = r => [r.service, r.cote && `cote ${r.cote}`, r.commune, r.years].filter(Boolean).join(' · ');
    const searchText = r => fold([r.title, r.cote, r.service, r.commune, r.years, r.note, r.status_label, r.record_label, r.result_label, peopleText(r)].join(' '));
    function itemOf(r, view) {
        const k = KINDS[r.kind] || ['•', r.kind];
        const lines = [`${k[1]}${r.status_label ? ' · ' + r.status_label : ''}`, whereText(r) || 'Où : à préciser'];
        const who = peopleText(r);
        if (view === 'list') { if (r.result) lines.push({html: badge(r.result)}); if (who) lines.push(`👤 ${who}`); if (r.note) lines.push(r.note.length > 140 ? r.note.slice(0, 140) + '…' : r.note); }
        return {thumb: `<span class="ui-card-ico" aria-hidden="true">${k[0]}</span>`, name: r.title, open: openAttr(r.open), lines,
            badges: view === 'list' ? [] : [r.result ? {text: RESULTS[r.result]?.[0] || r.result_label, kind: RESULTS[r.result]?.[1] || 'grey'} : null, ...(r.people || []).slice(0, 2).map(p => ({text: p.title, kind: 'blue'}))].filter(Boolean),
            when: r.date, whenLabel: r.date_label || '', attrs: `data-rj-key="${esc(r.key)}"`};
    }

    function csvExport(rows) {
        const cell = v => (A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`);
        const head = ['Date', 'Sorte', 'Titre', 'Résultat', 'État', 'Service d’archives', 'Cote', 'Commune', 'Années', 'Personnes', 'Note'];
        const lines = [head.map(cell).join(';'), ...rows.map(r => [String(r.date || '').slice(0, 10), KINDS[r.kind]?.[1] || r.kind, r.title, r.result_label, r.status_label, r.service, r.cote, r.commune, r.years, peopleText(r), r.note].map(cell).join(';'))];
        const blob = new Blob(['﻿' + lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${A().safeExportFilename ? A().safeExportFilename('journal-des-recherches') : 'journal-des-recherches'}.csv`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        A().toast(`${A().plural ? A().plural(rows.length, 'ligne') : rows.length + ' lignes'} exportée${rows.length > 1 ? 's' : ''} en CSV.`);
    }

    /* ─────────── La page ─────────── */
    async function renderJournal(token, where) {
        const isCurrent = () => token === S().workspaceToken && (where === 'recherche' ? S().module === 'recherche' && S().researchKind === 'journal' : S().module === 'listes' && S().listType === 'research_journal');
        const ws = A().$('#workspace'); if (!ws || !isCurrent()) return;
        const header = UI().pageHeader({title: 'Journal des recherches', where: where === 'recherche' ? 'Recherche' : undefined,
            help: 'Tout ce que tu as déjà cherché, du plus récent au plus ancien : pour ne pas chercher deux fois au même endroit.',
            primary: '<button type="button" class="button" data-rj-new-digest>＋ Nouveau dépouillement</button>',
            actions: ['<button type="button" class="button secondary" data-rj-csv>⤓ Exporter en CSV</button>', '<button type="button" class="button secondary" data-rj-visits>🗄️ Visites d’archives</button>']});
        ws.innerHTML = `<section class="page h-rj">${header}<div data-rj-bar></div><div data-rj-list>${UI().spinner('Chargement du journal…')}</div></section>`;
        let data;
        try { data = await A().api('research_journal'); } catch (e) { if (isCurrent()) ws.querySelector('[data-rj-list]').innerHTML = `<div class="ui-notice ui-notice-error" role="alert"><span class="ui-notice-ico" aria-hidden="true">⛔</span><span>${esc(e.message || 'Chargement impossible.')}</span></div>`; return; }
        if (!isCurrent()) return;
        const all = data.rows || [];
        const count = (fn) => all.filter(fn).length;
        const uniq = key => [...new Set(all.map(r => String(r[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', {sensitivity: 'base'}));
        const services = uniq('service'), communes = uniq('commune');
        const filters = [
            {id: 'kind', label: 'Sorte', type: 'check', options: Object.entries(KINDS).map(([k, v]) => [k, `${v[0]} ${v[2]} (${count(r => r.kind === k)})`, `${v[0]} ${v[2]}`])},
            {id: 'result', label: 'Résultat', type: 'check', options: [...Object.entries(RESULTS).map(([k, v]) => [k, `${v[0]} (${count(r => r.result === k)})`, v[0]]), ['-', `Pas encore noté (${count(r => !r.result)})`, 'Résultat pas noté']]},
            {id: 'person', label: 'Personne', type: 'person', allowFree: false, chipPrefix: 'Pour'},
            {id: 'service', label: 'Service d’archives', type: 'select', dflt: '', options: [['', 'Tous les services'], ...services.map(s => [s, s, `Service : ${s}`])]},
            {id: 'commune', label: 'Commune', type: 'select', dflt: '', options: [['', 'Toutes les communes'], ...communes.map(s => [s, s, `Commune : ${s}`])]},
        ];
        let shown = 60, bar = null;
        bar = UI().listBar({key: KEY, search: {placeholder: 'Chercher… (cote, commune, service, nom)'}, filters,
            view: {dflt: 'list', what: 'recherches'}, sort: {options: [['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'},
            onChange: () => { shown = 60; if (bar) paint(); }});
        const box = ws.querySelector('[data-rj-list]');
        let filtered = [];
        ws.querySelector('[data-rj-bar]').replaceWith(bar);
        const person = S().rjPerson; if (person?.id) { S().rjPerson = null; bar.setFilter?.('person', {id: Number(person.id), title: person.title || ''}); }
        function paint() {
            const st = bar.state, q = fold(st.q).trim(), f = st.filters;
            const pid = f.person && typeof f.person === 'object' ? Number(f.person.id) : 0;
            filtered = all.filter(r => (!q || q.split(/\s+/).every(w => searchText(r).includes(w)))
                && (!(f.kind || []).length || f.kind.includes(r.kind))
                && (!(f.result || []).length || f.result.includes(r.result || '-'))
                && (!pid || (r.people || []).some(p => Number(p.id) === pid))
                && (!f.service || String(r.service || '').trim() === f.service)
                && (!f.commune || String(r.commune || '').trim() === f.commune));
            filtered = UI().sortItems(filtered, st.sort || 'recent', {name: r => r.title, date: r => r.date});
            bar.setCount(filtered.length === all.length ? A().plural(all.length, 'recherche') : `${A().plural(filtered.length, 'recherche')} sur ${all.length.toLocaleString('fr-FR')}`);
            if (!all.length) { box.innerHTML = A().emptyState({icon: '🗓', text: 'Rien de cherché pour l’instant', hint: 'Note tes dépouillements, tes visites d’archives (« ✓ Fait le … »), tes pistes d’enquête et tes battues : tout s’affichera ici, du plus récent au plus ancien.', action: {label: '＋ Nouveau dépouillement', attrs: 'data-rj-new-digest'}}); return; }
            if (!filtered.length) { box.innerHTML = A().emptyState({icon: '🔍', text: 'Rien ne correspond', hint: 'Enlève un filtre, ou cherche autrement (une cote, une commune, un nom).'}); return; }
            const view = st.view === 'cards' ? 'cards' : 'list';
            box.innerHTML = UI().itemsHtml(view, filtered.slice(0, shown).map(r => itemOf(r, view)));
            if (filtered.length > shown) { const more = UI().moreButton({remaining: filtered.length - shown, step: 60, feminine: true, onClick: () => { shown += 60; paint(); }}); box.appendChild(more); }
        }
        paint();
        ws.querySelector('[data-rj-csv]')?.addEventListener('click', () => csvExport(filtered));
        ws.querySelector('[data-rj-visits]')?.addEventListener('click', () => { S().listType = 'archive_visits'; A().setModule('listes'); });
    }
    ext.researchJournal = token => renderJournal(token, 'recherche');
    ext.lists.research_journal = token => renderJournal(token, 'listes');
    ext.journal = {RESULTS, KINDS, badge, resultSelect, bindAlready, alreadyHtml, open: openTarget, whenShort};
    // Listes → Archives et sources (juste après le planificateur de visites)
    const addList = () => { const L = A()?.defaultListTypes; if (Array.isArray(L) && !L.some(x => x[0] === 'research_journal')) { const i = L.findIndex(x => x[0] === 'archive_visits'); L.splice(i < 0 ? L.length : i + 1, 0, ['research_journal', '16b', 'Journal des recherches']); } };

    /* ─────────── Bloc de fiche « 🔍 Déjà cherché » ─────────── */
    ext.personBlocks.already_searched = (index, detail) => {
        const pid = Number(detail.person?.id || detail.id) || 0;
        if (!pid || detail.person?.kind === 'animal') return '';
        return A().card(index, '🔍 Déjà cherché', '', `<div class="h-rj-person" data-rj-person="${pid}">${UI()?.spinner ? UI().spinner('Chargement…') : ''}</div>`, 'span-12',
            `<button type="button" class="button small secondary" data-rj-person-journal="${pid}" title="Tout le journal des recherches, filtré sur cette personne">🗓 Journal</button>`);
    };
    async function fillPersonBlock(el) {
        el.dataset.rjDone = '1';
        const pid = Number(el.dataset.rjPerson);
        let d; try { d = await A().api('research_journal', {person_id: pid, limit: 200}); } catch (e) { el.innerHTML = A().empty(e.message || 'Chargement impossible.', {icon: '⛔'}); return; }
        if (!el.isConnected) return;
        const rows = d.rows || [];
        const h3 = el.closest('.card')?.querySelector('.card-head h3');
        if (h3 && rows.length && !h3.querySelector('small')) h3.insertAdjacentHTML('beforeend', ` <small>(${rows.length})</small>`);
        if (!rows.length) { el.innerHTML = A().empty('Rien de cherché pour cette personne pour l’instant.', {icon: '🔍', action: {label: '＋ Nouveau dépouillement', attrs: `data-rj-new-digest data-rj-person-id="${pid}"`}}); return; }
        const me = p => (p.people || []).find(x => Number(x.id) === pid);
        el.innerHTML = UI().rowsHtml(rows.slice(0, 12).map(r => ({thumb: `<span class="ui-card-ico" aria-hidden="true">${KINDS[r.kind]?.[0] || '•'}</span>`, name: r.title, open: openAttr(r.open),
            lines: [whereText(r) || r.status_label || '', `${KINDS[r.kind]?.[1] || ''}${me(r)?.role === 'found' ? ' · relevée dans ce registre' : ' · cherchée'}`],
            when: r.date, whenLabel: r.date_label || '',
            actions: `${badge(r.result)}<button type="button" class="button small secondary" ${openAttr(r.open)}>↗ Ouvrir</button>`})))
            + (rows.length > 12 ? `<p class="h-rj-more"><button type="button" class="button small secondary" data-rj-person-journal="${pid}">Voir les ${rows.length} recherches dans le journal →</button></p>` : '');
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-rj-person-journal]'); if (!b) return;
        e.preventDefault();
        const title = A().$('.person-page .person-hero h2')?.textContent?.trim() || '';
        Object.assign(S(), {rjPerson: {id: Number(b.dataset.rjPersonJournal), title}, listType: 'research_journal'});
        A().setModule('listes');
    });
    const scan = () => document.querySelectorAll('[data-rj-person]:not([data-rj-done])').forEach(fillPersonBlock);
    new MutationObserver(() => scan()).observe(document.documentElement, {childList: true, subtree: true});
    // le bloc se range avec les autres (Maintenance → Apparence → blocs des fiches) : juste après « Enquêtes »
    const addBlock = () => { const L = A()?.defaultPersonBlocks; if (!Array.isArray(L) || L.some(b => b[0] === 'already_searched')) return; const i = L.findIndex(b => b[0] === 'investigations'); L.splice(i < 0 ? L.length : i + 1, 0, ['already_searched', '🔍 Déjà cherché (journal des recherches)']); };
    const boot = () => { if (!A()) return; addBlock(); addList(); };
    boot(); document.addEventListener('DOMContentLoaded', boot, {once: true});
})();
