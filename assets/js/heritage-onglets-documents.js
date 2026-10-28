/* LCNDA — 📄 L'onglet « Documents » (maquette docs/design/onglets-documents-catalogue.html, D1 à D5).
 * Caché au départ (Réglages → Apparence → onglets du menu). Fait comme l'onglet Personnes : la liste dans la colonne de
 * gauche, la fiche à droite. Les documents sont les MÉDIAS de la base (rien à ressaisir) : lecture par
 * api.php?action=onglets&op=documents|document (lib/onglets.php, lecture seule) ; « ✎ Modifier » ouvre la visionneuse des
 * médias de l'app (la même que Listes → Médias).
 *  - colonne : barre H10 (🔍 Chercher · Filtrer ▾ · Trier : …), bascule « A → Z | 📁 Dossiers » (C5), lettres repères ;
 *  - 📁 Dossiers : le rangement de Graphiques, tel quel (app-side-folders.js, kind 'document', clé genealogie-side-folders) :
 *    glisser, « ＋ 📁 Dossier », ✎ / 🗑 au survol, « 📁 Ranger » depuis la fiche, chaque rangement se défait (↶ Annuler) ;
 *  - réglages de la liste retenus (barre H10 : lcnda-listbar:onglets:documents ; mode et fiche ouverte : genealogie-documents-tab) ;
 *  - mode consultation 🔒 : on lit, on ouvre les dossiers, rien d'autre (la visionneuse s'ouvre en lecture seule).
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, SF = () => window.LCNDA_SIDE_FOLDERS;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const plural = (n, w, pl) => A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`;
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const PREF = 'genealogie-documents-tab', BAR_KEY = 'onglets:documents', STEP = 60;
    const readPref = () => { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } };
    const writePref = patch => { try { localStorage.setItem(PREF, JSON.stringify({...readPref(), ...patch})); } catch (_) {} };
    const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const letterOf = t => { const c = fold(String(t || '').replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    /* ─── la sorte d'un document : pastille K8 grise (PHOTO, ACTE, LETTRE…) ─── */
    const SORTS = [['photo', '📷', 'Photo'], ['acte', '📄', 'Acte'], ['lettre', '✉️', 'Lettre'], ['carte', '🗺', 'Carte'], ['livret', '📒', 'Livret'], ['document', '📄', 'Document'], ['son', '🔊', 'Son'], ['video', '🎬', 'Vidéo']];
    function sortOf(d) {
        const t = fold(`${d.title} ${d.subject}`), mt = fold(d.media_type);
        if (mt === 'audio') return 'son';
        if (mt === 'video') return 'video';
        if (d.corr || /\b(lettre|courrier|carte postale|correspondance|telegramme)\b/.test(t)) return /carte postale/.test(t) ? 'carte' : 'lettre';
        if (/\b(carte|plan|cadastr|matrice)/.test(t)) return 'carte';
        if (/\b(livret|carnet|passeport)\b/.test(t)) return 'livret';
        if (/\b(acte|registre|bail|testament|contrat|diplome|certificat|jugement|inventaire|extrait|recensement|notari)/.test(t)) return 'acte';
        if (mt === 'pdf' || mt === 'document' || /\.(pdf|docx?|odt|txt)$/i.test(d.filename || '')) return 'document';
        return 'photo';
    }
    const sortMeta = k => SORTS.find(s => s[0] === k) || SORTS[0];
    const thumbOf = d => (fold(d.media_type) === 'image' && (d.thumbnail || d.filename)) ? `<img src="media/${encodeURIComponent(d.thumbnail || d.filename)}" alt="" loading="lazy" decoding="async">` : `<span class="ong-ico" aria-hidden="true">${sortMeta(sortOf(d))[1]}</span>`;
    const lineOf = d => [d.date_text, d.place, d.cote].filter(Boolean).join(' · ');

    /* ─── les données ─── */
    let docs = null, loading = null, failed = '', cur = 0, shown = STEP, bar = null, cache = new Map();
    {   // « #documents/12 » : la fiche n° 12 (lien, ← → du navigateur)
        const m = location.hash.match(/^#documents\/(\d{1,12})\b/);
        cur = m ? Number(m[1]) : Number(readPref().cur) || 0;
    }
    async function load(force = false) {
        if (docs && !force) return docs;
        if (!loading) loading = A().api('onglets', {op: 'documents'}).then(r => { docs = (r.documents || []).map(d => ({...d, sort: sortOf(d)})); failed = ''; return docs; })
            .catch(e => { failed = e.message || 'Les documents n’ont pas pu se charger.'; docs = null; return []; }).finally(() => { loading = null; });
        return loading;
    }
    ext.documentItems = () => (docs || []).map(d => [String(d.id), `${sortMeta(d.sort)[1]} ${d.title}`]); // pour le glisser des dossiers
    const byId = id => (docs || []).find(d => d.id === Number(id)) || null;

    /* ─── filtrer, trier ─── */
    const filters = () => [
        {id: 'sort', label: 'Sorte', type: 'check', options: SORTS.map(([k, i, l]) => [k, `${i} ${l}${l.endsWith('o') ? 's' : 's'}`])},
        {id: 'tr', label: 'Transcription', type: 'radio', options: [['', 'Tous'], ['tr', '✅ Déjà transcrits'], ['notr', '📝 Pas encore transcrits']], dflt: ''},
        {id: 'from', group: 'Année', label: 'À partir de', type: 'text', placeholder: 'ex. 1900', chipPrefix: 'Depuis'},
        {id: 'to', group: 'Année', label: 'Jusqu’à', type: 'text', placeholder: 'ex. 1920', chipPrefix: 'Jusqu’à'},
        {id: 'place', label: 'Lieu', type: 'text', placeholder: 'ex. Lyon', chipPrefix: 'Lieu :'},
        {id: 'person', label: 'Personne', type: 'person', chipPrefix: 'Avec'},
        {id: 'loose', label: 'Rangement', type: 'check', text: 'Rattachés à aucune fiche', chipLabel: 'Sans fiche'}];
    const SORT_OPTS = [['az', 'A → Z'], ['za', 'Z → A'], ['recent', 'Les plus récents'], ['old', 'Les plus anciens'], ['cote', 'Par cote'], ['date', 'Par date du document']];
    function filtered() {
        const st = bar?.state || {q: '', filters: {}, sort: 'az'}, f = st.filters || {};
        const q = fold(st.q).trim(), words = q.split(/\s+/).filter(Boolean);
        const y1 = Number(String(f.from || '').match(/\d{3,4}/)?.[0]) || 0, y2 = Number(String(f.to || '').match(/\d{3,4}/)?.[0]) || 0;
        const pid = f.person && typeof f.person === 'object' ? Number(f.person.id) : 0, pname = !pid && f.person ? fold(String(f.person).replace(/^txt:/, '')) : '';
        let list = (docs || []).filter(d => {
            if (words.length) { const hay = fold([d.title, d.cote, d.date_text, d.place, d.series, ...(d.people || []).map(p => p.name)].join(' ')); if (!words.every(w => hay.includes(w))) return false; }
            if (Array.isArray(f.sort) && f.sort.length && !f.sort.includes(d.sort)) return false;
            if (f.tr === 'tr' && !d.has_tr) return false;
            if (f.tr === 'notr' && d.has_tr) return false;
            if ((y1 || y2) && (!d.year || (y1 && d.year < y1) || (y2 && d.year > y2))) return false;
            if (f.place && !fold(d.place).includes(fold(f.place))) return false;
            if (pid && !(d.people || []).some(p => p.id === pid)) return false;
            if (pname && !(d.people || []).some(p => fold(p.name).includes(pname))) return false;
            if (f.loose && d.links) return false;
            return true;
        });
        const t = d => fold(d.title), num = s => Number(String(s || '').match(/\d+/)?.[0]) || 0;
        const cmp = {az: (a, b) => t(a).localeCompare(t(b), 'fr'), za: (a, b) => t(b).localeCompare(t(a), 'fr'),
            recent: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id, old: (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id,
            cote: (a, b) => (a.cote ? 0 : 1) - (b.cote ? 0 : 1) || fold(a.cote).replace(/\d+/g, '').localeCompare(fold(b.cote).replace(/\d+/g, ''), 'fr') || num(a.cote) - num(b.cote) || t(a).localeCompare(t(b), 'fr'),
            date: (a, b) => (a.year || 99999) - (b.year || 99999) || t(a).localeCompare(t(b), 'fr')}[st.sort] || ((a, b) => t(a).localeCompare(t(b), 'fr'));
        return list.sort(cmp);
    }

    /* ─── la colonne de gauche ─── */
    const rowHtml = d => `<button type="button" class="side-menu-item ong-row${d.id === cur ? ' is-active' : ''}" data-ong-doc="${d.id}" data-letter="${esc(letterOf(d.title))}">
        <span class="ong-thumb">${thumbOf(d)}</span><span class="ong-txt"><strong>${esc(d.title)}</strong><small>${esc(lineOf(d) || (d.people_count ? plural(d.people_count, 'personne') : 'Sans date'))}</small></span>${UI().badge ? UI().badge(sortMeta(d.sort)[2], 'grey', {cls: 'ong-kind'}) : ''}</button>`;
    function sidebar(content, footer) {
        const mode = readPref().mode === 'folders' ? 'folders' : 'az';
        content.innerHTML = `<div class="ong-side" data-ong-side="documents" data-no-reorder><div class="ong-bar" data-ong-bar></div>
            <div class="segmented ong-mode" role="tablist" aria-label="Façon de ranger"><button type="button" class="${mode === 'az' ? 'is-active' : ''}" data-ong-mode="az">A → Z</button><button type="button" class="${mode === 'folders' ? 'is-active' : ''}" data-ong-mode="folders">📁 Dossiers</button></div>
            <div class="ong-letters" data-ong-letters ${mode === 'az' ? '' : 'hidden'}></div><div class="ong-list" data-ong-list>${UI().skeleton ? UI().skeleton(6) : '<div class="loading-block">Chargement…</div>'}</div></div>`;
        footer.innerHTML = '<span data-ong-count></span>';
        bar = UI().listBar ? UI().listBar({key: BAR_KEY, search: {placeholder: 'Chercher… (titre, cote, personne, lieu, année)'}, filters: filters(), sort: {options: SORT_OPTS, value: 'az'},
            onChange: () => { shown = STEP; paintList(); paintWorkspaceList(); }}) : null;
        if (bar) content.querySelector('[data-ong-bar]').appendChild(bar);
        const sig = A().state?.module, signal = A().sidebarSignal?.();
        SF()?.bind(content, {signal});
        content.addEventListener('click', e => {
            const m = e.target.closest('[data-ong-mode]'); if (m) { writePref({mode: m.dataset.ongMode}); A().renderSidebar(); return; }
            const l = e.target.closest('[data-ong-letter]'); if (l && !l.disabled) { jumpTo(l.dataset.ongLetter); return; }
            const r = e.target.closest('[data-ong-doc]'); if (r) { select(Number(r.dataset.ongDoc)); return; }
            const more = e.target.closest('[data-ong-more]'); if (more) { shown += STEP; paintList(); }
        }, {signal});
        content.addEventListener('keydown', e => {
            const r = e.target.closest?.('[data-ong-doc]'); if (!r || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            const all = [...content.querySelectorAll('[data-ong-doc]')].filter(x => x.offsetParent), i = all.indexOf(r), nx = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
            if (nx) { e.preventDefault(); nx.focus(); select(Number(nx.dataset.ongDoc), {keepFocus: true}); }
        }, {signal});
        load().then(() => { if (A().state?.module === sig) paintList(); });
    }
    function jumpTo(letter) {
        const list = filtered(), at = list.findIndex(d => letterOf(d.title) === letter); if (at < 0) return;
        if (at >= shown) { shown = Math.ceil((at + 1) / STEP) * STEP; paintList(); }
        const el = document.querySelector(`#sidebar-content [data-ong-lh="${CSS.escape(letter)}"]`) || document.querySelector(`#sidebar-content [data-ong-doc][data-letter="${CSS.escape(letter)}"]`);
        el?.scrollIntoView({block: 'start'}); el?.closest('.ong-list')?.querySelector(`[data-ong-doc][data-letter="${CSS.escape(letter)}"]`)?.focus({preventScroll: true});
    }
    function paintList() {
        const box = document.querySelector('#sidebar-content [data-ong-list]'); if (!box) return;
        const count = document.querySelector('#sidebar-footer [data-ong-count]');
        if (failed) { box.innerHTML = A().empty ? A().empty(failed, {icon: '⛔'}) : esc(failed); return; }
        if (!docs) return;
        const mode = readPref().mode === 'folders' ? 'folders' : 'az', list = filtered(), st = bar?.state || {}, active = Object.keys(st.filters || {}).filter(k => { const v = st.filters[k]; return Array.isArray(v) ? v.length : !!v; }).length;
        bar?.setCount?.(`${plural(list.length, 'document')}${list.length !== docs.length ? ` sur ${docs.length}` : ''}`);
        if (count) { const fd = SF()?.read('document')?.folders?.length || 0; count.textContent = `${plural(docs.length, 'document')}${mode === 'folders' ? ` · ${plural(fd, 'dossier')}` : active ? ` · ${plural(active, 'filtre')}` : ''}`; }
        const letters = document.querySelector('#sidebar-content [data-ong-letters]');
        if (!docs.length) { box.innerHTML = A().empty ? A().empty('Aucun document pour l’instant : les photos, actes et lettres ajoutés aux fiches arrivent ici.', {icon: '📄'}) : ''; if (letters) letters.innerHTML = ''; return; }
        if (mode === 'folders') {
            const keep = new Set(list.map(d => String(d.id)));
            box.innerHTML = SF() ? SF().sectionHtml('document', {label: 'Mes dossiers', items: [...list, ...docs.filter(d => !keep.has(String(d.id)))].map(d => [String(d.id), d.title]), isActive: id => Number(id) === cur, itemHtml: id => keep.has(String(id)) ? rowHtml(byId(id)) : ''})
                .replace('<div class="sf-loose" data-sf-loose>', `<div class="sf-loose" data-sf-loose><div class="section-label ong-loose-label">Sans dossier</div>`) : '';
            return;
        }
        if (letters) {
            const have = new Set(list.map(d => letterOf(d.title))), alpha = st.sort === 'az' || st.sort === 'za' || !st.sort;
            letters.hidden = !alpha;
            letters.innerHTML = LETTERS.map(L => `<button type="button" data-ong-letter="${L}" ${have.has(L) ? '' : 'disabled'} aria-label="Aller à la lettre ${L}">${L}</button>`).join('');
        }
        if (!list.length) { box.innerHTML = A().empty ? A().empty('Rien ne correspond : change les mots cherchés ou retire un filtre.', {icon: '🔎'}) : ''; return; }
        const alpha = !st.sort || st.sort === 'az' || st.sort === 'za';
        let last = '', html = '';
        list.slice(0, shown).forEach(d => { const L = letterOf(d.title); if (alpha && L !== last) { html += `<div class="section-label ong-lh" data-ong-lh="${esc(L)}">${esc(L)}</div>`; last = L; } html += rowHtml(d); });
        box.innerHTML = `<div class="side-menu ong-menu">${html}</div>${list.length > shown ? `<button type="button" class="ui-more" data-ong-more>Voir les ${Math.min(STEP, list.length - shown)} suivants ↓</button>` : ''}`;
    }

    /* ─── à droite : la liste en vignettes (rien de choisi) ou la fiche ─── */
    let wsShown = 24;
    function paintWorkspaceList() {
        const box = document.querySelector('#workspace [data-ong-cards]'); if (!box || cur) return;
        const list = filtered();
        if (!(docs || []).length) { box.innerHTML = A().emptyState({icon: '📄', text: 'Aucun document pour l’instant', hint: 'Les photos, actes, lettres et papiers ajoutés aux fiches (ou importés) arrivent ici, sans rien ressaisir.', action: kiosk() ? null : {label: '⤒ Importer des documents', attrs: 'data-empty-click="[data-ong-import]"'}}); return; }
        if (!list.length) { box.innerHTML = A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre dans la colonne de gauche.'}); return; }
        box.innerHTML = UI().cardsHtml ? UI().cardsHtml(list.slice(0, wsShown).map(d => ({thumb: thumbOf(d), name: d.title, open: `data-ong-doc="${d.id}"`, lines: [lineOf(d), (d.people || []).map(p => p.name).join(', ')].filter(Boolean),
            badges: [{text: sortMeta(d.sort)[2], kind: 'grey'}, ...(d.has_tr ? [{text: 'Transcrit', kind: 'green'}] : [])], when: d.created_at, whenLabel: 'Ajouté'}))) : '';
        if (list.length > wsShown && UI().moreButton) box.appendChild(UI().moreButton({remaining: list.length - wsShown, step: 24, onClick: () => { wsShown += 24; paintWorkspaceList(); }}));
    }
    async function render(token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        await load();
        if (token != null && token !== A().state?.workspaceToken) return;
        let lost = 0; // « #documents/99999 » : un document qui n'existe pas (ou plus) — la petite ligne K10 au-dessus de la liste
        if (cur && !byId(cur)) { lost = !failed && /^#documents\/\d/.test(location.hash) ? cur : 0; cur = 0; if (lost) history.replaceState(null, '', hashFor(0)); }
        if (cur) return showDoc(cur, token);
        const ro = kiosk();
        ws.innerHTML = `<section class="page ong-page" data-ong-page="documents">${UI().pageHeader ? UI().pageHeader({title: 'Documents', icon: '📄',
            help: 'Les médias et pièces d’archives de ta base, comme les personnes : la liste à gauche (A → Z ou en 📁 dossiers), la fiche à droite.',
            primary: ro ? '' : '<button type="button" class="button" data-ong-import>⤒ Importer des documents</button>',
            actions: ['<button type="button" class="button secondary" data-ong-medias>↗ Listes → Médias</button>']}) : '<h1>Documents</h1>'}
            ${failed ? `<div class="ui-msg is-error">⛔ ${esc(failed)}</div>` : ''}${lost ? `<div class="ong-lost" data-ong-lost>${A().empty(`Document introuvable (n° ${lost}) : il n’existe pas, ou plus (supprimé ?). Choisis-en un ci-dessous.`, {icon: '🔍'})}</div>` : ''}<div class="ong-cards" data-ong-cards></div></section>`;
        paintWorkspaceList();
    }
    function hashFor(id) { return id ? `#documents/${id}` : '#documents'; }
    async function select(id, {keepFocus = false} = {}) {
        if (!id) return;
        cur = id; writePref({cur: id});
        document.querySelectorAll('#sidebar-content [data-ong-doc]').forEach(b => b.classList.toggle('is-active', Number(b.dataset.ongDoc) === id));
        if (location.hash !== hashFor(id)) history.pushState(null, '', hashFor(id));
        await showDoc(id);
        if (keepFocus) document.querySelector(`#sidebar-content [data-ong-doc="${id}"]`)?.focus({preventScroll: true});
        if (matchMedia('(max-width: 850px)').matches) document.getElementById('workspace')?.scrollIntoView({block: 'start'});
    }
    function folderPath(id) {
        const data = SF()?.read('document'); if (!data) return [];
        let f = data.folders.find(x => x.id === data.of[String(id)]); const out = [];
        while (f) { out.unshift(f.name); f = f.parent ? data.folders.find(x => x.id === f.parent) : null; }
        return out;
    }
    const kindWord = d => sortMeta(d.sort || sortOf(d))[2];
    const lifeOf = p => (p.birth || p.death) ? `${p.birth || '?'}–${p.death || ''}` : '';
    function personChip(p) {
        const g = {male: 'm', female: 'f'}[p.gender] || 'u', ini = String(p.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
        const av = UI().avatarOr ? UI().avatarOr({id: p.id, name: p.name, gender: p.gender}, 34, `<span class="ong-av is-${g}">${esc(ini)}</span>`) : `<span class="ong-av is-${g}">${esc(ini)}</span>`;
        return `<button type="button" class="ong-person" data-ong-person="${p.id}" title="Ouvrir la fiche">${av}<span><b>${esc(p.name)}</b>${lifeOf(p) ? `<small>${esc(lifeOf(p))}</small>` : ''}</span><span class="ong-go" aria-hidden="true">↗</span></button>`;
    }
    async function showDoc(id, token) {
        const ws = document.getElementById('workspace'); if (!ws) return;
        const t0 = A().state?.workspaceToken;
        if (!cache.has(id)) ws.innerHTML = `<section class="page ong-page">${UI().spinner ? UI().spinner('Chargement du document…') : '<div class="loading-block">Chargement…</div>'}</section>`;
        let d;
        try { d = cache.get(id) || (await A().api('onglets', {op: 'document', id})).document; cache.set(id, d); }
        catch (e) {
            if (cur !== id || A().state?.module !== 'documents') return;
            const lost = /introuvable|n’existe/i.test(e.message || ''); // « #documents/99999 » : la petite ligne K10, pas une erreur
            ws.innerHTML = `<section class="page ong-page">${lost ? A().empty('Document introuvable : il n’existe pas, ou plus (supprimé ?). Choisis-en un dans la colonne de gauche.', {icon: '🔍'}) : A().emptyState({icon: '⛔', text: 'Ce document ne s’ouvre pas', hint: e.message || ''})}</section>`; return;
        }
        if ((token != null && token !== A().state?.workspaceToken) || t0 !== A().state?.workspaceToken || cur !== id || A().state?.module !== 'documents') return;
        const lite = byId(id) || {}, sort = lite.sort || sortOf(d), [, icon] = sortMeta(sort), ro = kiosk();
        const isImg = fold(d.media_type) === 'image' && d.filename, src = d.filename ? `media/${encodeURIComponent(d.filename)}` : '';
        const path = folderPath(id), when = UI().when || (x => esc(x));
        const readDate = d.date_text && UI().readDate ? UI().readDate(d.date_text) : null;
        const help = [kindWord({...d, sort}), d.date_text, d.places?.[0]?.name, d.pages && `${d.pages} p.`].filter(Boolean).join(' · ');
        const more = ['<button type="button" data-ong-dl>⤓ Télécharger</button>', '<button type="button" data-ong-print>🖨 Imprimer</button>', `<button type="button" data-ong-view>↗ Ouvrir le média</button>`];
        const field = (k, v, raw = false) => v ? `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>` : '';
        const ppl = d.people || [];
        ws.innerHTML = `<section class="page ong-page ong-docpage" data-ong-page="document" data-ong-id="${id}">
            ${UI().pageHeader({where: ['Documents', ...path].join(' › '), icon, title: d.title, help: esc(help || 'Document de ta base.'), detail: true,
                primary: ro ? '' : '<button type="button" class="button" data-ong-edit>✎ Modifier</button>',
                actions: ro ? [] : [SF()?.rangeButtonHtml ? SF().rangeButtonHtml('document', id, d.title) : ''].filter(Boolean), more})}
            <button type="button" class="button small secondary ong-back" data-ong-back>← Liste</button>
            <div class="ong-doc">
                <figure class="ong-view">${isImg ? `<button type="button" class="ong-big" data-ong-view title="Voir en grand"><img src="${src}" alt="" data-ong-img></button>` : `<button type="button" class="ong-big is-file" data-ong-view><span aria-hidden="true">${icon}</span><small>${esc(d.filename || 'Pas de fichier')}</small></button>`}
                    <figcaption data-ong-size>${isImg ? '' : esc(kindWord({...d, sort}))}</figcaption></figure>
                <div class="card ong-fields"><h3>Description</h3><dl>
                    ${field('Sorte', UI().badge ? UI().badge(kindWord({...d, sort}), 'grey') : kindWord({...d, sort}), true)}
                    ${field('Cote', d.cote)}
                    ${d.date_text ? `<dt>Date</dt><dd>${esc(d.date_text)}${readDate?.ok ? `<small class="ong-ok">✓ Compris : ${esc(readDate.label)}${readDate.extra ? ` ${esc(readDate.extra)}` : ''}</small>` : ''}</dd>` : ''}
                    ${field('Lieu', (d.places || []).map(p => `📍 ${esc(p.name)}`).join(', '), true)}
                    ${field('Fonds · série', [d.service, d.series].filter(Boolean).join(' › '))}
                    ${field('Pages', d.pages)}
                    ${field('Correspondant', d.correspondent)}
                    ${field('Lien', d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.url.replace(/^https?:\/\//, '').slice(0, 60))} ↗</a>` : '', true)}
                    ${field('Où il est', path.length ? `📁 ${esc(path.join(' › '))}` : '', true)}
                    ${field('Fichier', d.filename)}
                </dl>${!d.cote && !d.date_text && !ro ? `<p class="ong-hint">${A().empty ? A().empty('Pas encore de date ni de cote : « ✎ Modifier » pour les écrire.', {icon: '✎'}) : ''}</p>` : ''}</div>
            </div>
            ${d.description ? `<section class="card ong-sec"><h3>Notes</h3><p class="ong-pre">${esc(d.description)}</p></section>` : ''}
            ${d.transcription ? `<section class="card ong-sec"><div class="ong-sh"><h3>Transcription</h3><span class="spacer"></span>${ext.openTextDoc ? '<button type="button" class="button small secondary" data-ong-wp>📝 Dans le traitement de texte</button>' : ''}</div><div class="ong-tr">${esc(d.transcription)}</div></section>` : ''}
            <section class="card ong-sec"><h3>Personnes liées · ${ppl.length}</h3>${ppl.length ? `<div class="ong-people">${ppl.map(personChip).join('')}</div>` : (A().empty ? A().empty('Aucune personne reliée à ce document.', {icon: '👤'}) : '')}</section>
            ${(d.links || []).length ? `<section class="card ong-sec"><h3>Rattaché à</h3><ul class="ong-links">${d.links.map(l => `<li>${esc(l.label)}</li>`).join('')}</ul></section>` : ''}
            <p class="ong-when">${d.created_at ? when(d.created_at, {label: 'Ajouté'}) : ''}</p>
        </section>`;
        const img = ws.querySelector('[data-ong-img]');
        if (img) { const put = () => { const cap = ws.querySelector('[data-ong-size]'); if (cap && img.naturalWidth) cap.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${printFit(img.naturalWidth, img.naturalHeight)}`; }; if (img.complete) put(); else img.addEventListener('load', put, {once: true}); }
    }
    function printFit(w, h) { const L = Math.max(w, h), S = Math.min(w, h); for (const [f, l, s] of [['A4', 3508, 2480], ['A5', 2480, 1748], ['A6', 1748, 1240]]) if (L >= l && S >= s) return `assez grande pour imprimer en ${f}`; return 'petite : écran seulement'; }

    /* ─── les boutons de la page ─── */
    const asMedia = d => ({id: d.id, title: d.title, filename: d.filename, thumbnail: d.thumbnail, media_type: d.media_type, date_text: d.date_text, document_reference: d.cote, transcription: d.transcription, description: d.description});
    document.addEventListener('click', async e => {
        const page = e.target.closest?.('#workspace [data-ong-page]'); if (!page || A().state?.module !== 'documents') return;
        const b = e.target.closest('button, a'); if (!b) return;
        const d = cache.get(cur);
        if (b.matches('[data-ong-doc]')) { e.preventDefault(); return select(Number(b.dataset.ongDoc)); }
        if (b.matches('[data-ong-back]')) { cur = 0; writePref({cur: 0}); history.pushState(null, '', '#documents'); document.querySelectorAll('#sidebar-content [data-ong-doc].is-active').forEach(x => x.classList.remove('is-active')); render(); if (matchMedia('(max-width: 850px)').matches) document.getElementById('sidebar')?.scrollIntoView({block: 'start'}); return; }
        if (b.matches('[data-ong-medias]')) { if (A().state) A().state.listType = 'media'; return A().setModule('listes'); }
        if (b.matches('[data-ong-import]')) {
            if (kiosk()) return A().toast('Mode consultation : rien ne peut être ajouté.', 'error');
            const P = window.LCNDA_MEDIA_PICKER; if (!P?.openMediaPicker) return A().toast('La fenêtre des images n’est pas chargée.', 'error');
            await P.openMediaPicker({types: ['image', 'document', 'audio', 'video'], multiple: true, title: '⤒ Importer des documents', okLabel: 'Fermer'});
            await load(true); cache.clear(); A().renderSidebar(); render(); return;
        }
        if (!d) return;
        if (b.matches('[data-ong-person]')) { A().openPersonById?.(Number(b.dataset.ongPerson)); return; }
        if (b.matches('[data-ong-view]')) { if (d.filename) A().openLightbox([asMedia(d)], 0, true); return; }
        if (b.matches('[data-ong-edit]')) {
            if (!d.filename) return A().toast('Ce document n’a pas de fichier : modifie-le depuis la fiche à laquelle il est rattaché.', 'error');
            A().openLightbox([asMedia(d)], 0, kiosk());
            const lb = document.getElementById('lightbox');
            lb?.addEventListener('close', async () => { cache.delete(d.id); await load(true); if (A().state?.module === 'documents') { paintList(); if (cur === d.id) showDoc(d.id); } }, {once: true});
            return;
        }
        if (b.matches('[data-ong-dl]')) { if (!d.filename) return; const a = Object.assign(document.createElement('a'), {href: `media/${encodeURIComponent(d.filename)}`, download: d.filename}); document.body.appendChild(a); a.click(); a.remove(); return; }
        if (b.matches('[data-ong-print]')) { UI().printPage ? UI().printPage(d.title) : A().toast('L’impression n’est pas disponible.', 'error'); return; }
        if (b.matches('[data-ong-wp]')) {
            const html = String(d.transcription).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
            const data = ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(`<h1>${esc(d.title)}</h1>${html}`) : null;
            ext.openTextDoc?.(data ? {data, name: `Transcription — ${d.title}`} : {name: `Transcription — ${d.title}`});
        }
    });
    // un document rangé ou sorti d'un dossier (📁 Ranger) : la colonne est redessinée par app-side-folders.js ; le chemin en haut de la fiche suit
    window.addEventListener('storage', e => { if (e.key === 'genealogie-side-folders' && A()?.state?.module === 'documents' && cur) showDoc(cur); });

    ext.onglets = ext.onglets || {};
    ext.onglets.documents = {sidebar, render, hash: () => { const m = location.hash.match(/^#documents(?:\/(\d{1,12}))?\/?$/); if (m) cur = Number(m[1] || 0); return cur ? hashFor(cur) : '#documents'; },
        reload: async () => { cache.clear(); await load(true); }, sortOf, select};
    // l'app a pu ouvrir l'onglet avant que ce fichier soit chargé (adresse « #documents » au démarrage) : on dessine maintenant
    const late = () => { const st = A()?.state; if (st?.module !== 'documents') return; if (document.querySelector('#workspace .loading-screen')) render(); if (!document.querySelector('#sidebar-content [data-ong-side="documents"]')) A().renderSidebar?.(); };
    if (document.readyState === 'complete') setTimeout(late, 0); else addEventListener('load', () => setTimeout(late, 0), {once: true});
})();
