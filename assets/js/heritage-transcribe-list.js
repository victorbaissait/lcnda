/* LCNDA — Listes → Archives et sources → « 📜 Transcriptions d'actes » : toutes les transcriptions faites dans l'outil,
 * avec la barre commune des listes (H10) : 🔍 Chercher (titre, texte, personnes, lieu, cote) · Filtrer ▾ (sorte d'acte,
 * personne, lieu, période, état, avec zones, reliée à une fiche) · Liste | Fiches · Trier.
 * Un clic rouvre l'acte dans l'outil ; « ＋ Nouvelle transcription » passe par la fenêtre unique de choix d'image ;
 * la suppression se fait tout de suite, avec « ↶ Annuler ». Serveur : act_transcriptions_page (lecture seule, page par page).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'act_transcriptions_list', STEP = 50;
    const KINDS = [['bapteme', 'Baptême'], ['naissance', 'Naissance'], ['mariage', 'Mariage'], ['deces', 'Décès'], ['sepulture', 'Sépulture'], ['notarial', 'Acte notarié'], ['recensement', 'Recensement'], ['militaire', 'Registre militaire'], ['lettre', 'Lettre'], ['autre', 'Autre']];
    const kindLabel = k => (KINDS.find(x => x[0] === k) || [, k || 'Acte'])[1];
    const STATUS = {todo: ['À faire', '⚪'], doing: ['En cours', '🟡'], done: ['Finie', '🟢']};
    const plural = (n, w, many) => (A().plural ? A().plural(n, w, many) : `${n} ${n > 1 ? many || w + 's' : w}`);
    let kindCounts = null; // le nombre de chaque sorte, pour « Filtrer ▾ » (relu à chaque affichage)

    /** les réglages de la barre → les paramètres de la route */
    function params(b, offset) {
        const f = b.filters || {}, txt = v => (v && typeof v === 'object' ? v.title || '' : String(v || '').replace(/^txt:/, ''));
        const p = {q: b.q || '', sort: b.sort || 'recent', offset, limit: STEP};
        if (Array.isArray(f.kinds) && f.kinds.length) p.kinds = f.kinds.join(',');
        if (f.person && typeof f.person === 'object' && f.person.id) p.person = f.person.id;
        if (f.place) p.place = txt(f.place);
        const yr = v => (String(v || '').match(/\d{3,4}/) || [])[0] || '';
        if (yr(f.from)) p.from = yr(f.from); if (yr(f.to)) p.to = yr(f.to);
        if (f.status) p.status = f.status;
        if (f.zones) p.zones = 1; if (f.linked) p.linked = 1;
        return p;
    }
    const thumbOf = r => (r.thumb ? `<img src="media/${esc(encodeURIComponent(r.thumb))}" alt="" loading="lazy">` : '<span class="ui-card-ico">📜</span>');
    const peopleText = r => { const ps = (r.people || []).filter(p => p.name); if (!ps.length) return ''; const shown = ps.slice(0, 4).map(p => `${p.person_id ? '👤 ' : ''}${p.name}${p.role ? ` (${p.role})` : ''}`).join(', '); return ps.length > 4 ? `${shown}… (+${ps.length - 4})` : shown; };
    const firstLines = r => String(r.excerpt || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4);
    const actions = r => `<button type="button" class="icon-button" data-atl-del="${r.id}" title="Supprimer cette transcription (« ↶ Annuler » la remet)" aria-label="Supprimer « ${esc(r.title || 'Acte')} »">🗑</button>`;
    function item(r, view) {
        const st = STATUS[r.status] || STATUS.doing, what = [kindLabel(r.kind), r.date_text, r.place].filter(Boolean).join(' · ');
        if (view === 'cards') return {thumb: thumbOf(r), name: r.title || kindLabel(r.kind), open: `data-atl-open="${r.id}"`, cls: 'h-atl-card',
            // K9 : 2 lignes grises, l'état en pastille, ⋯ pour supprimer
            lines: [what, firstLines(r).length ? {html: `<span class="h-atl-text">${firstLines(r).map(esc).join('<br>')}</span>`} : 'Pas encore de texte'], badges: [{text: `${st[1]} ${st[0]}`, kind: r.status === 'done' ? 'green' : 'blue'}, {text: `${plural(r.lines, 'ligne', 'lignes')} · ${plural(r.zones, 'zone', 'zones')}`, kind: 'grey'}], when: r.updated_at, whenLabel: 'Modifié',
            menu: [`<button type="button" class="danger" data-atl-del="${r.id}">🗑 Supprimer</button>`]};
        return {thumb: thumbOf(r), name: r.title || kindLabel(r.kind), open: `data-atl-open="${r.id}"`, cls: 'h-atl-row',
            lines: [what, r.source ? `📚 ${r.source}` : '', `${st[1]} ${st[0]} · ${plural(r.lines, 'ligne transcrite', 'lignes transcrites')} · ${plural(r.zones, 'zone', 'zones')}`, peopleText(r) ? `👥 ${peopleText(r)}` : ''],
            when: r.updated_at, whenLabel: 'Modifié', actions: actions(r)};
    }

    ext.lists[KEY] = async token => {
        const S = A().state, ws = A().$('#workspace'), U = UI();
        const isCurrent = () => token === S.workspaceToken;
        try { const first = await A().api('act_transcriptions_page', {limit: 1}); kindCounts = first.kinds || {}; } catch (e) { kindCounts = {}; }
        if (!isCurrent()) return;
        const total0 = Object.values(kindCounts).reduce((a, b) => a + b, 0);
        ws.innerHTML = `<section class="page collection-page h-atl">
            <header class="page-header"><div><span class="eyebrow">LISTES · ARCHIVES ET SOURCES</span><h2>📜 Transcriptions d’actes</h2>
                <p>Les actes transcrits dans l’atelier : l’image à gauche, le texte à droite, les zones reliées, les noms repérés. Un clic rouvre l’acte dans l’outil.</p></div>
                <div class="page-actions"><button type="button" class="button" data-atl-new>＋ Nouvelle transcription</button></div></header>
            <div data-atl-bar></div><div class="h-atl-body" data-atl-body aria-live="polite"></div><div class="h-atl-more" data-atl-more></div></section>`;
        const sec = ws.querySelector('.h-atl'), body = sec.querySelector('[data-atl-body]'), moreSlot = sec.querySelector('[data-atl-more]');
        let items = [], total = 0, loading = 0, bar = null, more = null;
        const view = () => bar?.state?.view || 'list';
        const paint = () => {
            if (!items.length) {
                const b = bar?.state || {}, filtered = b.q || Object.values(b.filters || {}).some(v => (Array.isArray(v) ? v.length : !!v));
                body.innerHTML = filtered ? A().emptyState({icon: '🔍', text: 'Aucune transcription ne correspond.', hint: 'Retire un filtre, ou cherche autrement.'})
                    : A().emptyState({icon: '📜', text: 'Aucune transcription d’acte pour l’instant', hint: 'Choisis l’image d’un acte (baptême, mariage, sépulture…) et transcris-le à côté.', action: {label: '＋ Nouvelle transcription', attrs: 'data-atl-new'}});
            } else body.innerHTML = (U.itemsHtml ? U.itemsHtml(view(), items.map(r => item(r, view()))) : '');
            bar?.setCount(total, 'transcription');
            if (!more && U.moreButton) { more = U.moreButton({remaining: 0, step: STEP, feminine: true, onClick: () => load(true)}); moreSlot.appendChild(more); }
            more?.update(total - items.length);
        };
        async function load(append = false) {
            const n = ++loading, b = bar?.state || {q: '', filters: {}, sort: 'recent'};
            if (!append) body.innerHTML = U.skeleton ? U.skeleton(5) : '<p class="muted">Chargement…</p>';
            try {
                const r = await A().api('act_transcriptions_page', params(b, append ? items.length : 0));
                if (n !== loading || !isCurrent()) return;
                items = append ? [...items, ...(r.items || [])] : (r.items || []); total = r.total || 0; kindCounts = r.kinds || kindCounts; paint();
            } catch (e) { if (n === loading) body.innerHTML = U.notice ? U.notice('error', e.message) : `<p>⛔ ${esc(e.message)}</p>`; }
        }
        if (U.listBar) {
            bar = U.listBar({key: KEY, search: {placeholder: 'Chercher… (titre, texte, personne, lieu, cote)'},
                filters: [
                    {id: 'kinds', label: 'Sorte d’acte', type: 'check', options: KINDS.filter(([k]) => kindCounts[k]).map(([k, l]) => [k, `${l} (${kindCounts[k]})`, l])},
                    {id: 'person', label: 'Personne', group: 'Personne et lieu', type: 'person', chipPrefix: '👤', placeholder: 'Une personne reliée'},
                    {id: 'place', label: 'Lieu', group: 'Personne et lieu', type: 'place', chipPrefix: '📍'},
                    {id: 'from', label: 'De l’année', group: 'Période', type: 'text', placeholder: 'ex. 1750', chipPrefix: 'Depuis'},
                    {id: 'to', label: 'À l’année', group: 'Période', type: 'text', placeholder: 'ex. 1800', chipPrefix: 'Jusqu’à'},
                    {id: 'status', label: 'État', type: 'radio', options: [['', 'Tous les états'], ['todo', 'À faire', 'À faire'], ['doing', 'En cours', 'En cours'], ['done', 'Finie', 'Finies']], dflt: ''},
                    {id: 'zones', label: 'Avec des zones', group: 'Autres', type: 'check', text: 'Avec des zones sur l’image'},
                    {id: 'linked', label: 'Reliée à une fiche', group: 'Autres', type: 'check', text: 'Avec une personne reliée à sa fiche'},
                ],
                view: {dflt: 'list', what: 'transcriptions'},
                sort: {options: [['recent', 'Les plus récentes'], ['old', 'Les plus anciennes'], ['date', 'Date de l’acte'], ['az', 'A → Z'], ['za', 'Z → A']], value: 'recent'},
                count: {n: total0, label: 'transcription'},
                onChange: () => load(false)});
            sec.querySelector('[data-atl-bar]').replaceWith(bar);
        }
        await load(false);
        sec.addEventListener('click', async e => {
            const o = e.target.closest('[data-atl-open]');
            if (o) { ext.openActTranscriber?.({id: Number(o.dataset.atlOpen), onSaved: () => {}, onClose: () => { if (isCurrent()) load(false); }}); return; }
            if (e.target.closest('[data-atl-new]')) { // la fenêtre unique de choix d'image, puis l'outil
                const m = await ext.pickImage?.({eyebrow: 'TRANSCRIPTION', title: 'Image de l’acte', intro: 'Clique sur l’image de l’acte à transcrire. Une image de l’ordinateur est ajoutée aux Médias.'}); if (!m) return;
                ext.openActTranscriber?.({mediaId: m.id, filename: m.filename, title: m.imported ? '' : (m.title || ''), text: m.transcription || '', onClose: () => { if (isCurrent()) load(false); }}); return;
            }
            const d = e.target.closest('[data-atl-del]');
            if (d) { // H7 : supprimée tout de suite, « ↶ Annuler » la remet telle quelle (avec son numéro)
                const id = Number(d.dataset.atlDel);
                try {
                    const full = await A().api('act_transcription', {id});
                    await A().api('delete_act_transcription', {}, {method: 'POST', body: {id}});
                    items = items.filter(r => r.id !== id); total = Math.max(0, total - 1); paint();
                    const put = async () => { await A().api('save_act_transcription', {}, {method: 'POST', body: {id, restore: 1, title: full.title, kind: full.kind, media_id: full.media_id, date_text: full.date_text, place: full.place, source: full.source, body: full.body, data: full.data}}); if (isCurrent()) load(false); };
                    const del = async () => { await A().api('delete_act_transcription', {}, {method: 'POST', body: {id}}); if (isCurrent()) load(false); };
                    (A().undoToast || A().toast)(`Transcription « ${full.title || 'Acte'} » supprimée`, {undo: put, redo: del});
                } catch (err) { A().toast(err.message, 'error'); }
            }
        });
    };
})();
