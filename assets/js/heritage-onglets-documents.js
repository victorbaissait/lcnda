/* LCNDA — 📄 L'onglet « Documents » (maquette docs/design/onglets-documents-catalogue.html, D1 à D5).
 * Caché au départ (Réglages → Apparence → onglets du menu). Fait comme l'onglet Personnes : la liste dans la colonne de
 * gauche, la fiche à droite. Les documents sont les MÉDIAS de la base (rien à ressaisir) : lecture par
 * api.php?action=onglets&op=documents|document (lib/onglets.php, lecture seule) ; « ✎ Modifier » ouvre la visionneuse des
 * médias de l'app (la même que Listes → Médias).
 *  - colonne : bascule « A → Z | 👤 Par personne | 📁 Dossiers » (C5, comme Personnes), barre H10 (🔍 Chercher · Filtrer ▾ ·
 *    Trier : …), lettres repères ; chaque ligne (les mêmes que la colonne Personnes) : vignette, titre, puis les personnes
 *    reliées (« Jean MAZAUD, Marie LACOMBE +3 ») et la pastille K8 de la sorte avec la date et le lieu ; « ⋯ » à côté de
 *    la bascule = « Sous le titre : tout (conseillé) / les personnes / la date et le lieu » ; clic droit sur une ligne (K14) ;
 *  - 👤 Par personne : les documents sous le nom de chaque personne reliée (nom de famille puis prénom), « Sans personne » à la fin ;
 *  - vivants et fiches confidentielles : le serveur ne les nomme pas en mode consultation (lib/onglets.php), ni dans la
 *    liste, ni dans la recherche, ni dans « Par personne » ;
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
    const T = (k, v) => (window.LCNDA_I18N?.t ? window.LCNDA_I18N.t(k, v) : String(k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? ''));
    /* ce qu'on lit sous le titre (réglage « ⋯ » de la colonne) : tout (conseillé), les personnes, ou la date et le lieu */
    const UNDER = [['all', 'Tout : personnes, date et lieu (conseillé)'], ['people', 'Les personnes reliées'], ['when', 'La date et le lieu']];
    const under = () => (UNDER.some(u => u[0] === readPref().under) ? readPref().under : 'all');
    const SHOW_NAMES = 2; // au-delà : « +N »
    const peopleOf = d => d.people || [];
    /** « Jean MAZAUD, Marie LACOMBE » + « +3 » : les noms se coupent (…), le « +3 » reste toujours visible */
    function whoHtml(d) {
        const pp = peopleOf(d), n = Math.max(Number(d.people_count) || 0, pp.length); if (!n) return '';
        const names = pp.slice(0, SHOW_NAMES).map(p => p.name), rest = n - names.length;
        return `<span class="ong-who" title="${esc(pp.map(p => p.name).join(', ') + (n > pp.length ? ` +${n - pp.length}` : ''))}"><span class="ong-names">${esc(names.join(', '))}</span>${rest > 0 ? `<span class="ong-plus">+${rest}</span>` : ''}</span>`;
    }
    const whenText = (d, cote = false) => [d.date_text, d.place, cote && d.cote].filter(Boolean).join(' · ');
    const kindBadge = d => (UI().badge ? UI().badge(T(sortMeta(d.sort)[2]), 'grey', {cls: 'ong-type'}) : '');
    /** les lignes grises sous le titre (colonne) : la pastille de la sorte toujours en tête de la dernière */
    function subLines(d, {cote = false} = {}) {
        const u = under(), who = whoHtml(d), when = whenText(d, cote), lines = [];
        if (u !== 'when' && who) lines.push(who);
        if (u !== 'people' || !who) lines.push(`<span class="ong-wtxt">${esc(when || T('Sans date'))}</span>`);
        lines[lines.length - 1] = kindBadge(d) + lines[lines.length - 1];
        return lines.map(l => `<small class="ong-sub">${l}</small>`).join('');
    }
    /** les mêmes lignes pour une fiche (K9) à droite */
    const cardLines = d => { const u = under(), who = whoHtml(d), when = whenText(d, true); return [u !== 'when' && who ? {html: who} : '', u !== 'people' || !who ? when : ''].filter(Boolean); };
    const personKey = p => `${fold(p.last || p.name)} ${fold(p.first)}`;

    /* ─── les données ─── */
    let docs = null, loading = null, failed = '', cur = 0, shown = STEP, bar = null, cache = new Map();
    {   // « #documents/12 » : la fiche n° 12 (lien, ← → du navigateur)
        const m = location.hash.match(/^#documents\/(\d{1,12})\b/);
        cur = m ? Number(m[1]) : Number(readPref().cur) || 0;
    }
    let stale = false; // un média ajouté ou changé ailleurs (lcnda:media-changed) : la liste et le cache sont à relire
    async function load(force = false) {
        if (docs && !force && !stale) return docs;
        if (!loading) { stale = false; loading = A().api('onglets', {op: 'documents'}).then(r => { docs = (r.documents || []).map(d => ({...d, sort: sortOf(d)})); failed = ''; return docs; })
            .catch(e => { failed = e.message || 'Les documents n’ont pas pu se charger.'; docs = null; return []; }).finally(() => { loading = null; }); }
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
    const rowHtml = (d, letter = letterOf(d.title)) => `<button type="button" class="side-menu-item ong-row ong-docrow${d.id === cur ? ' is-active' : ''}" data-ong-doc="${d.id}" data-letter="${esc(letter)}">
        <span class="ong-thumb">${thumbOf(d)}</span><span class="ong-txt"><strong>${esc(d.title)}</strong>${subLines(d, {cote: bar?.state?.sort === 'cote'})}</span></button>`;
    const MODES = [['az', 'A → Z'], ['people', '👤 Par personne'], ['folders', '📁 Dossiers']];
    const modeOf = () => (MODES.some(m => m[0] === readPref().mode) ? readPref().mode : 'az');
    function underMenu(btn) {
        const u = under();
        UI().menuAt?.(btn, UNDER.map(([k, l]) => ({icon: k === u ? '✓' : '', label: l, run: () => { writePref({under: k}); paintList(); paintWorkspaceList(); }})), {title: 'Sous le titre'});
    }
    function rowMenu(id, e) { // K14 : UI.contextMenu = le menu de l'app à l'endroit de la souris
        const d = byId(id); if (!d || !UI().contextMenu) return;
        const items = [{icon: '↗', label: 'Ouvrir', run: () => select(id)}];
        if (!kiosk() && d.filename) items.push({icon: '✎', label: 'Modifier', run: async () => { await select(id); document.querySelector('#workspace [data-ong-edit]')?.click(); }});
        if (d.filename) items.push({icon: '⤓', label: 'Télécharger', run: () => { const a = Object.assign(document.createElement('a'), {href: `media/${encodeURIComponent(d.filename)}`, download: d.filename}); document.body.appendChild(a); a.click(); a.remove(); }});
        const pp = peopleOf(d).slice(0, 8);
        if (pp.length) items.push('-', ...pp.map(p => ({icon: '👤', label: p.name, run: () => A().openPersonById?.(p.id)})));
        UI().contextMenu(e, items, {title: `« ${d.title.slice(0, 50)} »`});
    }
    function sidebar(content, footer) {
        const mode = modeOf();
        content.innerHTML = `<div class="ong-side" data-ong-side="documents" data-no-reorder>
            <div class="ong-modebar"><div class="segmented ong-mode" role="tablist" aria-label="Façon de ranger">${MODES.map(([k, l]) => `<button type="button" class="${mode === k ? 'is-active' : ''}" data-ong-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
            <button type="button" class="icon-button small ong-opts" data-ong-under aria-label="Sous le titre" title="Sous le titre">⋯</button></div>
            <div class="ong-bar" data-ong-bar></div>
            <div class="ong-letters" data-ong-letters ${mode === 'folders' ? 'hidden' : ''}></div><div class="ong-list" data-ong-list>${UI().skeleton ? UI().skeleton(6) : '<div class="loading-block">Chargement…</div>'}</div></div>`;
        footer.innerHTML = '<span data-ong-count></span>';
        bar = UI().listBar ? UI().listBar({key: BAR_KEY, search: {placeholder: 'Chercher… (titre, cote, personne, lieu, année)'}, filters: filters(), sort: {options: SORT_OPTS, value: 'az'},
            onChange: () => { shown = STEP; paintList(); paintWorkspaceList(); }}) : null;
        if (bar) content.querySelector('[data-ong-bar]').appendChild(bar);
        const sig = A().state?.module, signal = A().sidebarSignal?.();
        SF()?.bind(content, {signal});
        content.addEventListener('click', e => {
            const m = e.target.closest('[data-ong-mode]'); if (m) { writePref({mode: m.dataset.ongMode}); shown = STEP; A().renderSidebar(); return; }
            const o = e.target.closest('[data-ong-under]'); if (o) { underMenu(o); return; }
            const l = e.target.closest('[data-ong-letter]'); if (l && !l.disabled) { jumpTo(l.dataset.ongLetter); return; }
            const r = e.target.closest('[data-ong-doc]'); if (r) { select(Number(r.dataset.ongDoc)); return; }
            const more = e.target.closest('[data-ong-more]'); if (more) { shown += STEP; paintList(); }
        }, {signal});
        content.addEventListener('contextmenu', e => { // K14 : le menu de la ligne à l'endroit de la souris
            const r = e.target.closest('[data-ong-doc]'); if (!r || e.shiftKey) return;
            e.preventDefault(); rowMenu(Number(r.dataset.ongDoc), e); // → UI.contextMenu
        }, {signal});
        content.addEventListener('keydown', e => {
            const r = e.target.closest?.('[data-ong-doc]'); if (!r || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            const all = [...content.querySelectorAll('[data-ong-doc]')].filter(x => x.offsetParent), i = all.indexOf(r), nx = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
            if (nx) { e.preventDefault(); nx.focus(); select(Number(nx.dataset.ongDoc), {keepFocus: true}); }
        }, {signal});
        load().then(() => { if (A().state?.module === sig) paintList(); });
    }
    /** 👤 Par personne : [{p, letter, docs}] (nom de famille puis prénom), puis « Sans personne » */
    function groupsByPerson(list) {
        const by = new Map(), none = [];
        list.forEach(d => { const pp = peopleOf(d); if (!pp.length) { none.push(d); return; } pp.forEach(p => { if (!by.has(p.id)) by.set(p.id, {p, docs: []}); by.get(p.id).docs.push(d); }); });
        const out = [...by.values()].sort((a, b) => personKey(a.p).localeCompare(personKey(b.p), 'fr') || a.p.id - b.p.id).map(g => ({...g, letter: letterOf(g.p.last || g.p.name)}));
        if (none.length) out.push({p: null, letter: '', docs: none});
        return out;
    }
    /** ce que la colonne montre, dans l'ordre : titres de lettre, noms (Par personne), lignes */
    function entries(list, mode, st) {
        const out = [];
        if (mode === 'people') {
            let last = null;
            groupsByPerson(list).forEach(g => {
                if (g.p && g.letter !== last) { out.push({lh: g.letter}); last = g.letter; }
                out.push({ph: g});
                g.docs.forEach(d => out.push({d, letter: g.letter || '#'}));
            });
            return out;
        }
        const alpha = !st.sort || st.sort === 'az' || st.sort === 'za';
        let last = '';
        list.forEach(d => { const L = letterOf(d.title); if (alpha && L !== last) { out.push({lh: L}); last = L; } out.push({d, letter: L}); });
        return out;
    }
    function jumpTo(letter) {
        const all = entries(filtered(), modeOf(), bar?.state || {});
        let rows = 0, found = false;
        for (const e of all) { if (e.lh === letter) { found = true; break; } if (e.d) rows++; }
        if (!found) return;
        if (rows >= shown) { shown = Math.ceil((rows + 1) / STEP) * STEP; paintList(); }
        const el = document.querySelector(`#sidebar-content [data-ong-lh="${CSS.escape(letter)}"]`);
        el?.scrollIntoView({block: 'start'}); document.querySelector(`#sidebar-content .ong-list [data-ong-doc][data-letter="${CSS.escape(letter)}"]`)?.focus({preventScroll: true});
    }
    function paintList() {
        const box = document.querySelector('#sidebar-content [data-ong-list]'); if (!box) return;
        const count = document.querySelector('#sidebar-footer [data-ong-count]');
        if (failed) { box.innerHTML = A().empty ? A().empty(failed, {icon: '⛔'}) : esc(failed); return; }
        if (!docs) return;
        const mode = modeOf(), list = filtered(), st = bar?.state || {}, active = Object.keys(st.filters || {}).filter(k => { const v = st.filters[k]; return Array.isArray(v) ? v.length : !!v; }).length;
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
        const all = entries(list, mode, st);
        if (letters) {
            const have = new Set(all.filter(e => e.lh).map(e => e.lh));
            letters.hidden = !have.size;
            letters.innerHTML = LETTERS.map(L => `<button type="button" data-ong-letter="${L}" ${have.has(L) ? '' : 'disabled'} aria-label="${esc(T('Aller à la lettre {x}', {x: L}))}">${L}</button>`).join('');
        }
        if (!list.length) { box.innerHTML = A().empty ? A().empty('Rien ne correspond : change les mots cherchés ou retire un filtre.', {icon: '🔎'}) : ''; return; }
        let html = '', rows = 0;
        const total = all.filter(e => e.d).length;
        for (const e of all) {
            if (e.d && rows >= shown) break;
            if (e.lh) html += `<div class="section-label ong-lh" data-ong-lh="${esc(e.lh)}">${esc(e.lh)}</div>`;
            else if (e.ph) html += `<div class="ong-ph" data-ong-ph="${e.ph.p ? e.ph.p.id : 0}"><span>${e.ph.p ? `👤 ${esc(e.ph.p.name)}` : esc(T('Sans personne'))}</span><small>${e.ph.docs.length}</small></div>`;
            else { html += rowHtml(e.d, e.letter); rows++; }
        }
        box.innerHTML = `<div class="side-menu ong-menu">${html}</div>${total > shown ? `<button type="button" class="ui-more" data-ong-more>Voir les ${Math.min(STEP, total - shown)} suivants ↓</button>` : ''}`;
    }

    /* ─── à droite : la liste en vignettes (rien de choisi) ou la fiche ─── */
    let wsShown = 24;
    function paintWorkspaceList() {
        const box = document.querySelector('#workspace [data-ong-cards]'); if (!box || cur) return;
        const list = filtered();
        if (!(docs || []).length) { box.innerHTML = A().emptyState({icon: '📄', text: 'Aucun document pour l’instant', hint: 'Les photos, actes, lettres et papiers ajoutés aux fiches (ou importés) arrivent ici, sans rien ressaisir.', action: kiosk() ? null : {label: '⤒ Importer des documents', attrs: 'data-empty-click="[data-ong-import]"'}}); return; }
        if (!list.length) { box.innerHTML = A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre dans la colonne de gauche.'}); return; }
        box.innerHTML = UI().cardsHtml ? UI().cardsHtml(list.slice(0, wsShown).map(d => ({thumb: thumbOf(d), name: d.title, open: `data-ong-doc="${d.id}"`, lines: cardLines(d),
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
            help: 'Les médias et pièces d’archives de ta base, comme les personnes : la liste à gauche (A → Z, 👤 par personne ou en 📁 dossiers), la fiche à droite.',
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
        return `<button type="button" class="ong-person" data-ong-person="${p.id}" title="Ouvrir la fiche">${av}<span><b>${esc(p.name)}</b>${lifeOf(p) || p.role ? `<small>${esc([p.role, lifeOf(p)].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="ong-go" aria-hidden="true">↗</span></button>`;
    }
    /* 📄 un seul texte par document (maquette docs/design/dossier-et-transcriptions.html, B3) : le texte de l'Atelier de transcription,
       un bloc par acte (sorte, état, lieu, date, cote, zones) avec « 📜 Ouvrir dans l'Atelier » ; sans acte, le texte du document */
    const TXST = {todo: ['À faire', 'grey'], doing: ['En cours', 'yellow'], done: ['Finie', 'green']};
    const bdg = (t, k) => (UI().badge ? UI().badge(t, k) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    function trHtml(d, isImg, ro) {
        const acts = d.acts || [], wp = ext.openTextDoc ? `<button type="button" class="button small secondary" data-ong-wp>${esc(T('📝 Dans le traitement de texte'))}</button>` : '';
        const open = id => (!ro && isImg && ext.openActTranscriber ? `<button type="button" class="button small" data-ong-txopen="${id}">${esc(T('📜 Ouvrir dans l’Atelier'))}</button>` : '');
        if (!acts.length) return d.transcription ? `<section class="card ong-sec ong-trsec"><div class="ong-sh"><h3>📜 ${esc(T('Transcription'))}</h3><span class="spacer"></span>${open(0)}${wp}</div><div class="ong-tr">${esc(d.transcription)}</div></section>` : '';
        return acts.map((a, i) => { const st = TXST[a.status] || TXST.doing;
            const meta = [a.place, a.date_text, a.source, a.zones ? A().plural(a.zones, 'zone') : ''].filter(Boolean).join(' · ');
            return `<section class="card ong-sec ong-trsec" data-ong-act="${a.id}"><div class="ong-sh"><h3>📜 ${esc(acts.length > 1 ? a.title || T('Transcription') : T('Transcription'))}</h3>${bdg(ext.actKindLabel ? ext.actKindLabel(a.kind) : a.kind, 'grey')}${bdg(T(st[0]), st[1])}<span class="spacer"></span>${open(a.id)}${i === 0 ? wp : ''}</div>
                ${acts.length === 1 && a.title ? `<p class="ong-trtitle">${esc(a.title)}</p>` : ''}${String(a.body || '').trim() ? `<div class="ong-tr">${esc(a.body)}</div>` : `<p class="muted">${esc(T('Rien d’écrit pour l’instant.'))}</p>`}
                ${meta ? `<p class="ong-trmeta">${esc(meta)}</p>` : ''}</section>`; }).join('');
    }
    /** les noms relevés dans l'Atelier pas encore reliés à une fiche (ils se relient dans l'Atelier, ou sur la fiche qui leur ressemble) */
    function unlinked(d) {
        const names = (d.acts || []).flatMap(a => (a.people || []).filter(p => !p.person_id && p.name).map(p => [p.name, p.role]));
        return names.length ? `<p class="ong-unlinked"><span class="muted">${esc(T('Relevés dans le texte, pas encore reliés :'))}</span> ${names.slice(0, 30).map(([n, r]) => `<span class="ong-uname">${esc(n)}${r ? ` <small>${esc(r)}</small>` : ''}</span>`).join(' ')}</p>` : '';
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
                actions: ro ? [] : [isImg && ext.openActTranscriber ? `<button type="button" class="button secondary" data-ong-tx title="${esc(T('Ouvrir l’outil de transcription complet sur cette image'))}">${esc(T('📜 Atelier de transcription'))}</button>` : '', SF()?.rangeButtonHtml ? SF().rangeButtonHtml('document', id, d.title) : ''].filter(Boolean), more})}
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
            ${trHtml(d, isImg, ro)}
            <section class="card ong-sec"><h3>${esc(T('Personnes reliées'))} · ${ppl.length}</h3>${ppl.length ? `<div class="ong-people">${ppl.map(personChip).join('')}</div>` : (A().empty ? A().empty('Aucune personne reliée à ce document.', {icon: '👤'}) : '')}${unlinked(d)}</section>
            ${(d.links || []).length ? `<section class="card ong-sec"><h3>${esc(T('Relié à'))}</h3><ul class="ong-links">${d.links.map(l => `<li>${esc(l.label)}</li>`).join('')}</ul></section>` : ''}
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
        if (b.matches('[data-ong-tx], [data-ong-txopen]')) { // 📜 l'outil de transcription complet : la transcription déjà commencée sur cette image, sinon une nouvelle
            if (!d.filename) return A().toast(T('Ce document n’a pas d’image : l’Atelier de transcription a besoin d’une image.'), 'error');
            if (!ext.openActTranscriber) return A().toast(T('L’Atelier de transcription n’est pas encore chargé : réessaie dans un instant.'), 'error');
            if (b.disabled) return; b.disabled = true; // un seul clic à la fois (le serveur peut mettre un instant à répondre)
            try {
                let acts = []; try { acts = (await A().api('act_transcriptions_media', {media_id: d.id})).items || []; } catch (_) { acts = []; }
                const again = async () => { cache.delete(d.id); await load(true); if (A().state?.module === 'documents') { paintList(); if (cur === d.id) showDoc(d.id); } };
                if (b.dataset.ongTxopen && Number(b.dataset.ongTxopen)) await ext.openActTranscriber({id: Number(b.dataset.ongTxopen), onClose: again});
                else if (acts.length) await ext.openActTranscriber({id: acts[0].id, onClose: again});
                else await ext.openActTranscriber({mediaId: d.id, filename: d.filename, title: d.title || '', text: d.transcription || '', onClose: again});
            } catch (err) { console.error(err); A().toast(T('L’Atelier de transcription n’a pas pu s’ouvrir : {x}', {x: String(err?.message || err).slice(0, 200)}), 'error'); }
            finally { b.disabled = false; }
            return;
        }
        if (b.matches('[data-ong-dl]')) { if (!d.filename) return; const a = Object.assign(document.createElement('a'), {href: `media/${encodeURIComponent(d.filename)}`, download: d.filename}); document.body.appendChild(a); a.click(); a.remove(); return; }
        if (b.matches('[data-ong-print]')) { UI().printPage ? UI().printPage(d.title) : A().toast('L’impression n’est pas disponible.', 'error'); return; }
        if (b.matches('[data-ong-wp]')) {
            const html = String(d.transcription || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
            const data = ext.textDocTools?.dataOf ? ext.textDocTools.dataOf(`<h1>${esc(d.title)}</h1>${html}`) : null;
            ext.openTextDoc?.(data ? {data, name: `Transcription — ${d.title}`} : {name: `Transcription — ${d.title}`});
        }
    });
    /* 🔄 un média ajouté ou changé, d'où qu'il vienne (fiche, visionneuse, menu de choix des médias, import, « 📥 À trier »,
       dossier Scans…) : l'événement commun lcnda:media-changed (assets/js/app-media-limits.js). Onglet ouvert : la liste se
       redessine tout de suite (sans recharger la page) ; sinon elle sera relue à la prochaine ouverture. */
    let refreshTimer = 0, refreshing = null;
    async function refreshNow() {
        if (refreshing) { stale = true; return; } // un envoi de plus pendant la relecture : une relecture de plus après
        refreshing = (async () => {
            if (loading) await loading; // une lecture partie avant le changement : on la laisse finir, puis on relit
            await load(true);
            if (A()?.state?.module !== 'documents') return;
            paintList(); paintWorkspaceList();
            const id = cur;
            if (id && document.querySelector(`#workspace [data-ong-page="document"][data-ong-id="${id}"]`)) {
                try { const d = (await A().api('onglets', {op: 'document', id})).document; if (d) cache.set(id, d); } catch (_) {}
                if (cur === id && A()?.state?.module === 'documents') showDoc(id);
            }
        })();
        try { await refreshing; } finally { refreshing = null; }
        if (stale && A()?.state?.module === 'documents') refreshNow();
    }
    document.addEventListener('lcnda:media-changed', () => {
        stale = true; cache.clear();
        if (A()?.state?.module !== 'documents') return;
        clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshNow, 250);
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
