/* LCNDA — ✨ Trésors dans les Listes (groupe « ✨ Trésors de famille ») :
 *  ✉️ Lettres aux descendants · 🕯️ Bougies · 🔗 Partages temporaires · 📍 Passeport des lieux · 🏛️ Actes manquants (l'assistant « Que manque-t-il ? »).
 * Et, en haut de chaque page des Trésors, le lien vers sa liste (ou vers ce qui existait déjà : Rappels, Maisons de famille, Audios…).
 * Les données sont celles des Trésors (tresor_items) : rien n'est recopié. Une lettre scellée ne montre jamais son contenu.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.lists = ext.lists || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const T = () => ext.tresors?.T;
    const LISTS = [['tr_letters', '37d', '✉️ Lettres aux descendants'], ['tr_candles', '37e', '🕯️ Bougies'], ['tr_shares', '37f', '🔗 Partages temporaires'], ['tr_stamps', '37g', '📍 Passeport des lieux'], ['tr_gaps', '37h', '🏛️ Actes manquants']];
    function register() {
        const app = A(); if (!app?.defaultListTypes) return;
        LISTS.forEach(l => { if (!app.defaultListTypes.some(x => x[0] === l[0])) app.defaultListTypes.push(l); });
    }
    register(); document.addEventListener('DOMContentLoaded', register, {once: true});

    /* ── les aides communes ── */
    const page = async (token, title, icon, help, body) => {
        const S = A().state, ws = A().$('#workspace'), ok = () => token === S.workspaceToken && S.module === 'listes';
        if (!T()) { ws.innerHTML = `<section class="page">${A().empty('Les Trésors n’ont pas pu se charger.')}</section>`; return null; }
        let data; try { data = await body(); } catch (err) { if (ok()) ws.innerHTML = `<section class="page">${A().empty(err.message || 'La liste n’a pas pu être lue.')}</section>`; return null; }
        if (!ok()) return null;
        return {ws, head: window.LCNDA_UI.pageHeader({icon, title, help}), data};
    };
    const filterBar = (key, cur, opts) => `<div class="segmented h-trl-filter" role="group">${opts.map(([v, l, n]) => `<button type="button" data-trl-f="${key}:${v}" class="${cur === v ? 'is-active' : ''}" aria-pressed="${cur === v}">${esc(l)}${n != null ? ` <small>${n}</small>` : ''}</button>`).join('')}</div>`;
    const table = (cols, rows, sortbar) => `<div class="data-table-wrap"><table class="data-table sortable-table" data-sortbar="${esc(sortbar)}"><thead><tr>${cols.map((h, i) => `<th><button data-sort-column="${i}">${esc(h)}</button></th>`).join('')}<th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    const personLink = (tr, id, fallback = '') => { const p = id && tr.byId.get(Number(id)); return p ? `<button type="button" class="table-link" data-h-person="${p.id}">${esc(T().name(p))}</button>` : esc(fallback); };
    const who = (tr, v) => (/^\d+$/.test(String(v || '')) ? T().name(tr.byId.get(Number(v))) : String(v || '').replace(/^txt:/, '')) || '';
    const dateFr = iso => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? T().dateFr(iso.slice(0, 10)) : '');
    /** K4 : une date de création (« hier à 10 h 22 », « 17 oct. 2026 », la date complète au survol) */
    const when = d => (window.LCNDA_UI?.when ? window.LCNDA_UI.when(d) : esc(dateFr(d)));
    const openBtn = key => `<button type="button" class="button small secondary" data-trl-open="${esc(key)}">Ouvrir</button>`;
    const filters = {letters: 'tous', candles: 'allumees', shares: 'encours', stamps: 'tous'};
    /** une page de liste : dessin, filtres, « Ouvrir » vers les Trésors */
    function mount(ws, html) { ws.innerHTML = html; A().bindTableLinks?.(); }
    const today = () => new Date().toISOString().slice(0, 10);

    /* ═════════ ✉️ Lettres aux descendants ═════════ */
    ext.lists.tr_letters = async token => {
        const r = await page(token, 'Lettres aux descendants', '✉️', 'Les lettres qui ne s’ouvrent qu’à une date. Une lettre scellée ne montre que qui l’a écrite, pour qui et quand elle s’ouvrira.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('letter')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, y = String(new Date().getFullYear());
        const draw = () => {
            const f = filters.letters, n = k => list.filter(x => k === 'tous' || (k === 'scellees' ? x.sealed : k === 'ouvertes' ? !x.sealed : x.sealed && (x.open_at || '').startsWith(y))).length;
            const rows = list.filter(x => f === 'tous' || (f === 'scellees' ? x.sealed : f === 'ouvertes' ? !x.sealed : x.sealed && (x.open_at || '').startsWith(y))).sort((a, b) => (a.open_at || '').localeCompare(b.open_at || ''));
            mount(r.ws, `<section class="page collection-page h-trl">${r.head}${filterBar('letters', f, [['tous', 'Toutes', n('tous')], ['scellees', '🔒 Scellées', n('scellees')], ['annee', 'À ouvrir cette année', n('annee')], ['ouvertes', '📬 Ouvertes', n('ouvertes')]])}
                ${rows.length ? table(['Lettre', 'De', 'Pour', 'S’ouvre le', 'État'], rows.map(x => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(who(tr, x.data?.from))}</td><td>${esc(x.data?.to || '')}${x.data?.for_person ? ` ${personLink(tr, x.data.for_person)}` : ''}</td><td data-sort-value="${esc(x.open_at || '')}">${esc(dateFr(x.open_at))}</td><td>${x.sealed ? '🔒 scellée' : '📬 ouverte'}</td><td>${openBtn('lettres')}</td></tr>`), 'lettre')
                    : A().emptyState({icon: '✉️', text: 'Aucune lettre ici pour l’instant', hint: 'Écris-en une dans ✨ Trésors → Lettres aux descendants : « pour les 18 ans de Léa », « en 2050 ».'})}</section>`);
        };
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl', draw); draw();
    };

    /* ═════════ 🕯️ Bougies ═════════ */
    ext.lists.tr_candles = async token => {
        const r = await page(token, 'Bougies', '🕯️', 'Les bougies allumées pour un ancêtre, avec le mot laissé. Une bougie brûle sept jours.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('candle')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, days = ext.tresorCandle?.LIT_DAYS || 7, lit = c => (Date.now() - new Date(String(c.created_at).replace(' ', 'T') + 'Z').getTime()) / 864e5 < days;
        const draw = () => {
            const f = filters.candles, rows = list.filter(c => f === 'toutes' || lit(c));
            mount(r.ws, `<section class="page collection-page h-trl">${r.head}${filterBar('candles', f, [['allumees', '🕯️ Allumées', list.filter(lit).length], ['toutes', 'Tout le registre', list.length]])}
                ${rows.length ? table(['Pour', 'Allumée le', 'De la part de', 'Le mot', 'État'], rows.map(c => `<tr><td>${personLink(tr, c.person_id, c.title)}</td><td data-sort-value="${esc(c.created_at)}">${when(c.created_at)}</td><td>${esc(c.data?.from || '')}</td><td>${esc(c.body || '')}</td><td>${lit(c) ? '🕯️ allumée' : 'éteinte'}</td><td>${openBtn('bougie')}</td></tr>`), 'bougie')
                    : A().emptyState({icon: '🕯️', text: f === 'toutes' ? 'Aucune bougie au registre' : 'Aucune bougie allumée en ce moment', hint: 'Allume-en une dans ✨ Trésors → Allumer une bougie.'})}</section>`);
        };
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl', draw); draw();
    };

    /* ═════════ 🔗 Partages temporaires ═════════ */
    ext.lists.tr_shares = async token => {
        const r = await page(token, 'Partages temporaires', '🔗', 'Les branches envoyées à des cousins, et jusqu’à quand le fichier s’ouvre. Après la date, il ne s’ouvre plus.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('share')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, live = s => (s.open_at || '') >= today();
        const draw = () => {
            const f = filters.shares, rows = list.filter(s => f === 'tous' || (f === 'encours' ? live(s) : !live(s)));
            mount(r.ws, `<section class="page collection-page h-trl">${r.head}${filterBar('shares', f, [['encours', 'En cours', list.filter(live).length], ['expires', 'Expirés', list.filter(s => !live(s)).length], ['tous', 'Tous', list.length]])}
                ${rows.length ? table(['Branche', 'Partagée le', 'Jusqu’au', 'Personnes', 'Mot de passe', 'État'], rows.map(s => `<tr><td>${s.person_id ? personLink(tr, s.person_id, s.title) : esc(s.title)}</td><td data-sort-value="${esc(s.created_at)}">${when(s.created_at)}</td><td data-sort-value="${esc(s.open_at)}">${esc(dateFr(s.open_at))}</td><td data-sort-value="${Number(s.data?.people) || 0}">${Number(s.data?.people) || ''}</td><td>${s.data?.locked ? '🔒 oui' : '— non'}</td><td>${live(s) ? '✅ en cours' : '⌛ expiré'}</td><td>${openBtn('partage')}</td></tr>`), 'partage')
                    : A().emptyState({icon: '🔗', text: 'Aucun partage ici', hint: 'Partage une branche dans ✨ Trésors → Partager une branche (pour un temps).'})}</section>`);
        };
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl', draw); draw();
    };

    /* ═════════ 📍 Passeport des lieux ═════════ */
    ext.lists.tr_stamps = async token => {
        const r = await page(token, 'Passeport des lieux', '📍', 'Les lieux de l’arbre, et ceux où tu es allé (village, église, mairie, cimetière). Le tampon se met dans ✨ Trésors → Le passeport des lieux.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('stamp')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, pls = ext.tresorStamps?.treePlaces ? ext.tresorStamps.treePlaces(T(), tr) : [], visits = new Map(list.map(v => [v.place_id, v]));
        const draw = () => {
            const f = filters.stamps, rows = pls.filter(p => f === 'tous' || (f === 'visites' ? visits.has(p.id) : !visits.has(p.id))), nv = pls.filter(p => visits.has(p.id)).length;
            mount(r.ws, `<section class="page collection-page h-trl">${r.head}${filterBar('stamps', f, [['tous', 'Tous', pls.length], ['visites', '✅ Visités', nv], ['avoir', 'À visiter', pls.length - nv]])}
                ${rows.length ? table(['Lieu', 'Personnes de l’arbre', 'Visité', 'Le', 'Note'], rows.map(p => { const v = visits.get(p.id); return `<tr><td><b>${esc(p.name)}</b></td><td data-sort-value="${p.people?.size || 0}">${p.people?.size || ''}</td><td>${v ? '✅' : ''}</td><td data-sort-value="${esc(v?.data?.date || '')}">${esc(dateFr(v?.data?.date || ''))}</td><td>${esc(v?.data?.note || '')}</td><td>${openBtn('passeport-lieux')}</td></tr>`; }), 'lieu')
                    : A().emptyState({icon: '📍', text: f === 'visites' ? 'Aucun lieu visité pour l’instant' : 'Aucun lieu ici', hint: 'Les lieux viennent des naissances, mariages et décès de l’arbre.'})}</section>`);
        };
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl', draw); draw();
    };

    /* ═════════ 🏛️ Actes manquants : l'assistant « Que manque-t-il ? » (Recherche), en liste ═════════ */
    ext.lists.tr_gaps = async token => {
        const r = await page(token, 'Actes manquants', '🏛️', 'Les actes qui manquent à la lignée (5 générations), avec la commune, les années et le service d’archives. L’assistant complet range, filtre, imprime et ajoute au suivi.',
            () => A().api('research_gaps', {gen: 5})); if (!r) return;
        const d = r.data, items = d.items || [], KIND = {birth: 'Naissance', marriage: 'Mariage', death: 'Décès'};
        mount(r.ws, `<section class="page collection-page h-trl">${r.head}<p><button type="button" class="button" data-trl-gaps>🔍 Ouvrir l’assistant « Que manque-t-il ? »</button>${d.total ? ` <span class="muted">${A().plural(d.total, 'recherche à faire', 'recherches à faire')}${d.root_name ? ` pour les ancêtres de ${esc(d.root_name)}` : ''}</span>` : ''}</p>
            ${items.length ? table(['Ancêtre', 'Sosa', 'L’acte', 'Commune', 'Années', 'Archives'], items.slice(0, 400).map(it => `<tr><td>${it.person_id ? `<button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name || '')}</button>` : esc(it.name || '')}</td><td data-sort-value="${Number(it.sosa) || 0}">${Number(it.sosa) || ''}</td><td>${esc(KIND[it.kind] || it.what || it.kind || '')}</td><td>${esc(it.place || '')}</td><td>${esc([it.from, it.to].filter(Boolean).join('–'))}</td><td>${esc(it.archive?.label || '')}</td><td></td></tr>`), 'acte')
                : A().emptyState({icon: '🏛️', text: d.root_id ? 'Rien ne manque sur 5 générations' : 'Choisis d’abord une personne de départ', hint: d.root_id ? 'Bravo ! L’assistant peut chercher plus loin (jusqu’à 12 générations).' : 'Personnes → sa fiche → « Personne de départ ».'})}</section>`);
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl', () => {});
    };

    /** les clics d'une page de liste : filtres, « Ouvrir » (la page des Trésors), l'assistant des actes manquants */
    function clicks(e, ws, sel, draw) {
        if (!ws.querySelector(sel)) { ws.onclick = null; return; } // on a quitté la liste
        const f = e.target.closest('[data-trl-f]'); if (f) { const [k, v] = f.dataset.trlF.split(':'); filters[k] = v; draw(); return; }
        const o = e.target.closest('[data-trl-open]'); if (o) { ext.tresors?.open(o.dataset.trlOpen); return; }
        if (e.target.closest('[data-trl-gaps]')) { A().state.researchKind = 'gaps'; A().setModule('recherche'); }
    }

    /* ═════════ En haut de chaque page des Trésors : sa liste ═════════ */
    const goList = type => { A().state.listType = type; A().setModule('listes'); };
    ext.tresorRelated = {
        lettres: [['📋 Voir dans Listes › Lettres aux descendants', () => goList('tr_letters')]],
        bougie: [['📋 Voir dans Listes › Bougies', () => goList('tr_candles')]],
        partage: [['📋 Voir dans Listes › Partages temporaires', () => goList('tr_shares')]],
        'passeport-lieux': [['📋 Voir dans Listes › Passeport des lieux', () => goList('tr_stamps')]],
        passeports: [['📋 Voir dans Listes › Passeports', () => goList('passports')]],
        gazette: [['📋 Voir dans Listes › Gazettes', () => goList('gazettes')]],
        rappels: [['📋 Voir dans Listes › Rappels', () => goList('reminders')]],
        'actes-manquants': [['🔍 L’assistant complet « Que manque-t-il ? »', () => { A().state.researchKind = 'gaps'; A().setModule('recherche'); }], ['📋 Listes › Actes manquants', () => goList('tr_gaps')]],
        maisons: [['🏡 Listes › Maisons de famille', () => goList('houses')]],
        entretien: [['🎧 Les enregistrements : Listes › Audios', () => goList('audios')]],
    };
})();
