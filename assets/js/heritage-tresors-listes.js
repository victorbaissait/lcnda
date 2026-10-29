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
    const page = async (token, title, icon, help, body, o = {}) => {
        const S = A().state, ws = A().$('#workspace'), ok = () => token === S.workspaceToken && S.module === 'listes';
        if (!T()) { ws.innerHTML = `<section class="page">${A().empty('Les Trésors n’ont pas pu se charger.')}</section>`; return null; }
        let data; try { data = await body(); } catch (err) { if (ok()) ws.innerHTML = `<section class="page">${A().empty(err.message || 'La liste n’a pas pu être lue.')}</section>`; return null; }
        if (!ok()) return null;
        return {ws, head: window.LCNDA_UI.pageHeader({icon, title, help: typeof help === 'function' ? help(data) : help, ...(o.primary ? {primary: o.primary} : {})}), data};
    };
    const personLink = (tr, id, fallback = '') => { const p = id && tr.byId.get(Number(id)); return p ? `<button type="button" class="table-link" data-h-person="${p.id}">${esc(T().name(p))}</button>` : esc(fallback); };
    const who = (tr, v) => (/^\d+$/.test(String(v || '')) ? T().name(tr.byId.get(Number(v))) : String(v || '').replace(/^txt:/, '')) || '';
    const dateFr = iso => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? T().dateFr(iso.slice(0, 10)) : '');
    /** K4 : une date de création (« hier à 10 h 22 », « 17 oct. 2026 », la date complète au survol) */
    const when = d => (window.LCNDA_UI?.when ? window.LCNDA_UI.when(d) : esc(dateFr(d)));
    const openBtn = key => `<button type="button" class="button small secondary" data-trl-open="${esc(key)}">Ouvrir</button>`;
    function mount(ws, html) { ws.innerHTML = html; A().bindTableLinks?.(); }
    const today = () => new Date().toISOString().slice(0, 10);
    const fold = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cmpTxt = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'fr', {sensitivity: 'base', numeric: true});
    /** compare deux valeurs d'une colonne : nombres d'abord comme des nombres, le vide toujours à la fin */
    const cmpVal = (a, b) => { const ea = a == null || a === '', eb = b == null || b === ''; if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; const na = Number(a), nb = Number(b); return !Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'boolean' ? na - nb : cmpTxt(a, b); };
    const lbEmpty = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
    /** un filtre du menu de choix (personne, lieu) : {id, title} ou « txt:… » → l'id et le texte */
    const pickOf = v => (v && typeof v === 'object' ? {id: Number(v.id) || 0, text: fold(v.title || '')} : {id: /^\d+$/.test(String(v || '')) ? Number(v) : 0, text: fold(String(v || '').replace(/^txt:/, ''))});
    const byPerson = (v, id, text = '') => { const k = pickOf(v); return (k.id && Number(id) === k.id) || (!!k.text && fold(text).includes(k.text)); };
    const counted = (items, opts, test) => opts.map(([v, l, chip]) => [v, l, chip, items.filter(x => test(x, v)).length]);

    /** H10 — une liste des Trésors : la barre commune (🔍 Chercher · Filtrer ▾ · Trier ▾) au-dessus du tableau.
     *  o = {ws, head, key, items, noun: [un, plusieurs], fem, search: {placeholder, text(item)}, filters: [{…filtre de UI.listBar, test(item, valeur)}],
     *       sorts: [[id, libellé, cmp(a, b)]], cols: [{label, key, val(item), sort: [idCroissant, idDécroissant]}], row(item) → <tr>, empty: {…emptyState}, max}
     *  Liste tout à fait vide : la grande boîte K10 seule, sans barre. Un clic sur un titre de colonne trie et met « Trier » à jour. */
    function barList(o) {
        const UI = window.LCNDA_UI, KEY = `listes:${o.key}`, total = o.items.length, cls = o.cls || 'h-trl';
        if (!total || !UI?.listBar) { mount(o.ws, `<section class="page collection-page ${cls}">${o.head}${A().emptyState(o.empty)}</section>`); return null; }
        mount(o.ws, `<section class="page collection-page ${cls}">${o.head}<div data-trl-bar></div><div data-trl-body></div></section>`);
        const colIds = c => [c.sort?.[0] || `col:${c.key}:asc`, c.sort?.[1] || `col:${c.key}:desc`];
        const colLabel = id => { const m = /^col:([^:]+):(asc|desc)$/.exec(id || ''); const c = m && o.cols.find(x => x.key === m[1]); return c ? `${c.label} : ${m[2] === 'asc' ? (c.num ? 'du plus petit au plus grand' : 'A → Z') : (c.num ? 'du plus grand au plus petit' : 'Z → A')}` : ''; };
        const saved = UI.listBarState?.(KEY) || {}, options = o.sorts.map(([v, l]) => [v, l]);
        if (colLabel(saved.sort)) options.push([saved.sort, colLabel(saved.sort)]);
        const defs = o.filters.map(({test, ...f}) => f);
        const isOn = (f, v) => !lbEmpty(v) && !((f.type === 'radio' || f.type === 'select') && String(v) === String(f.dflt ?? ''));
        const ws = o.ws, body = ws.querySelector('[data-trl-body]');
        const bar = UI.listBar({key: KEY, search: {placeholder: o.search.placeholder}, filters: defs, sort: {options, value: o.sorts[0][0]}, onChange: () => paint()});
        ws.querySelector('[data-trl-bar]').replaceWith(bar);
        function paint() {
            const st = bar.state, words = fold(st.q).split(/\s+/).filter(Boolean);
            let rows = o.items.filter(it => (!words.length || words.every(w => fold(o.search.text(it)).includes(w))) && o.filters.every(f => !isOn(f, st.filters[f.id]) || f.test(it, st.filters[f.id])));
            const named = o.sorts.find(x => x[0] === st.sort), m = /^col:([^:]+):(asc|desc)$/.exec(st.sort || ''), col = m && o.cols.find(c => c.key === m[1]);
            if (named?.[2]) rows = [...rows].sort(named[2]);
            else if (col) rows = [...rows].sort((a, b) => { const r = cmpVal(col.val(a), col.val(b)); return m[2] === 'desc' && r && !(col.val(a) === '' || col.val(b) === '') ? -r : r; });
            const one = o.noun[0], many = o.noun[1] || '';
            bar.setCount(rows.length === total ? A().plural(total, one, many) : `${A().plural(rows.length, one, many)} sur ${total.toLocaleString('fr-FR')}`);
            const shown = o.max ? rows.slice(0, o.max) : rows;
            const mark = c => { const [up, down] = colIds(c); return st.sort === up ? '<span class="sort-mark"> ↑</span>' : st.sort === down ? '<span class="sort-mark"> ↓</span>' : ''; };
            body.innerHTML = rows.length ? `<div class="data-table-wrap"><table class="data-table h-trl-table"><thead><tr>${o.cols.map(c => `<th><button type="button" data-trl-col="${esc(c.key)}" title="Trier par cette colonne">${esc(c.label)}${mark(c)}</button></th>`).join('')}<th></th></tr></thead><tbody>${shown.map(o.row).join('')}</tbody></table></div>${o.max && rows.length > o.max ? A().empty(`Les ${o.max} premières lignes sont montrées.`, {icon: 'ℹ️', hint: o.moreHint || ''}) : ''}`
                : A().emptyState({icon: '🔍', text: o.noneText || 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre.', action: {label: 'Tout effacer', attrs: 'data-trl-clear'}});
            A().bindTableLinks?.();
        }
        body.addEventListener('click', e => {
            const c = e.target.closest('[data-trl-col]'); if (c) { const col = o.cols.find(x => x.key === c.dataset.trlCol); if (!col) return; const [up, down] = colIds(col), next = bar.state.sort === up ? down : up; bar.setSort(next, colLabel(next) || ''); return; }
            if (e.target.closest('[data-trl-clear]')) bar.clear(true);
        });
        paint();
        return bar;
    }
    ext.tresorListBar = barList; // aussi pour Listes › 📰 Gazettes (heritage-tresors-widgets.js)
    ext.tresorListHelpers = {fold, cmpTxt, cmpVal, counted, byPerson, pickOf};

    /* ═════════ ✉️ Lettres aux descendants ═════════ */
    ext.lists.tr_letters = async token => {
        const r = await page(token, 'Lettres aux descendants', '✉️', 'Les lettres qui ne s’ouvrent qu’à une date. Une lettre scellée ne montre que qui l’a écrite, pour qui et quand elle s’ouvrira.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('letter')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, y = String(new Date().getFullYear());
        const state = (x, k) => (k === 'scellees' ? x.sealed : k === 'ouvertes' ? !x.sealed : x.sealed && (x.open_at || '').startsWith(y));
        const pour = x => `${x.data?.to || ''} ${x.data?.for_person ? T().name(tr.byId.get(Number(x.data.for_person))) : ''}`;
        barList({ws: r.ws, head: r.head, key: 'tr_letters', items: list, noun: ['lettre'], fem: true, noneText: 'Aucune lettre ne correspond',
            // une lettre scellée : jamais son texte — seulement le titre, « De », « Pour » et la date
            search: {placeholder: 'Chercher… (titre, de la part de, pour qui, date)', text: x => [x.title, who(tr, x.data?.from), pour(x), x.open_at, dateFr(x.open_at)].join(' ')},
            filters: [{id: 'state', label: 'État', type: 'check', options: counted(list, [['scellees', '🔒 Scellées'], ['annee', 'À ouvrir cette année'], ['ouvertes', '📬 Ouvertes']], state), test: (x, v) => v.some(k => state(x, k))},
                {id: 'from', label: 'De', type: 'person', chipPrefix: 'De :', test: (x, v) => byPerson(v, /^\d+$/.test(String(x.data?.from || '')) ? x.data.from : 0, who(tr, x.data?.from))},
                {id: 'to', label: 'Pour', type: 'person', chipPrefix: 'Pour :', test: (x, v) => byPerson(v, x.data?.for_person, pour(x))}],
            sorts: [['open', 'Date d’ouverture', (a, b) => cmpVal(a.open_at, b.open_at)], ['recent', 'Les plus récentes', (a, b) => cmpTxt(b.created_at, a.created_at)], ['old', 'Les plus anciennes', (a, b) => cmpTxt(a.created_at, b.created_at)],
                ['az', 'A → Z', (a, b) => cmpTxt(a.title, b.title)], ['za', 'Z → A', (a, b) => cmpTxt(b.title, a.title)]],
            cols: [{label: 'Lettre', key: 'title', val: x => x.title, sort: ['az', 'za']}, {label: 'De', key: 'from', val: x => who(tr, x.data?.from)}, {label: 'Pour', key: 'to', val: x => pour(x).trim()},
                {label: 'S’ouvre le', key: 'open', val: x => x.open_at || '', sort: ['open', null]}, {label: 'État', key: 'state', val: x => (x.sealed ? 1 : 0)}],
            row: x => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(who(tr, x.data?.from))}</td><td>${esc(x.data?.to || '')}${x.data?.for_person ? ` ${personLink(tr, x.data.for_person)}` : ''}</td><td>${esc(dateFr(x.open_at))}</td><td>${x.sealed ? '🔒 scellée' : '📬 ouverte'}</td><td>${openBtn('lettres')}</td></tr>`,
            empty: {icon: '✉️', text: 'Aucune lettre pour l’instant', hint: 'Écris-en une dans ✨ Trésors → Lettres aux descendants : « pour les 18 ans de Léa », « en 2050 ».', action: {label: '✉️ Ouvrir les lettres dans ✨ Trésors', attrs: 'data-trl-open="lettres"'}}});
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl');
    };

    /* ═════════ 🕯️ Bougies ═════════ */
    ext.lists.tr_candles = async token => {
        const r = await page(token, 'Bougies', '🕯️', 'Les bougies allumées pour un ancêtre, avec le mot laissé. Une bougie brûle sept jours.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('candle')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, days = ext.tresorCandle?.LIT_DAYS || 7, lit = c => (Date.now() - new Date(String(c.created_at).replace(' ', 'T') + 'Z').getTime()) / 864e5 < days;
        const forWho = c => (c.person_id && tr.byId.get(Number(c.person_id)) ? T().name(tr.byId.get(Number(c.person_id))) : c.title || '');
        barList({ws: r.ws, head: r.head, key: 'tr_candles', items: list, noun: ['bougie'], fem: true, noneText: 'Aucune bougie ne correspond',
            search: {placeholder: 'Chercher… (pour qui, de la part de, le mot)', text: c => [forWho(c), c.data?.from, c.body].join(' ')},
            // le choix de départ d'avant (« Allumées ») reste celui de départ, mais il se voit en pastille : un clic sur × montre tout le registre
            filters: [{id: 'state', label: 'État', type: 'check', value: ['allumees'], options: counted(list, [['allumees', '🕯️ Allumées'], ['eteintes', 'Éteintes']], (c, k) => (k === 'allumees') === lit(c)), test: (c, v) => v.some(k => (k === 'allumees') === lit(c))},
                {id: 'for', label: 'Pour', type: 'person', chipPrefix: 'Pour :', test: (c, v) => byPerson(v, c.person_id, forWho(c))}],
            sorts: [['recent', 'Les plus récentes', (a, b) => cmpTxt(b.created_at, a.created_at)], ['old', 'Les plus anciennes', (a, b) => cmpTxt(a.created_at, b.created_at)], ['az', 'A → Z', (a, b) => cmpTxt(forWho(a), forWho(b))], ['za', 'Z → A', (a, b) => cmpTxt(forWho(b), forWho(a))]],
            cols: [{label: 'Pour', key: 'for', val: forWho, sort: ['az', 'za']}, {label: 'Allumée le', key: 'at', val: c => c.created_at, sort: ['old', 'recent']}, {label: 'De la part de', key: 'from', val: c => c.data?.from || ''}, {label: 'Le mot', key: 'word', val: c => c.body || ''}, {label: 'État', key: 'state', val: c => (lit(c) ? 0 : 1)}],
            row: c => `<tr><td>${personLink(tr, c.person_id, c.title)}</td><td>${when(c.created_at)}</td><td>${esc(c.data?.from || '')}</td><td>${esc(c.body || '')}</td><td>${lit(c) ? '🕯️ allumée' : 'éteinte'}</td><td>${openBtn('bougie')}</td></tr>`,
            empty: {icon: '🕯️', text: 'Aucune bougie au registre', hint: 'Allume-en une dans ✨ Trésors → Allumer une bougie.', action: {label: '🕯️ Allumer une bougie', attrs: 'data-trl-open="bougie"'}}});
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl');
    };

    /* ═════════ 🔗 Partages temporaires ═════════ */
    ext.lists.tr_shares = async token => {
        const r = await page(token, 'Partages temporaires', '🔗', 'Les branches envoyées à des cousins, et jusqu’à quand le fichier s’ouvre. Après la date, il ne s’ouvre plus.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('share')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, live = s => (s.open_at || '') >= today(), pname = s => (s.person_id && tr.byId.get(Number(s.person_id)) ? T().name(tr.byId.get(Number(s.person_id))) : '');
        barList({ws: r.ws, head: r.head, key: 'tr_shares', items: list, noun: ['partage'], noneText: 'Aucun partage ne correspond',
            search: {placeholder: 'Chercher… (branche, personne)', text: s => [s.title, pname(s)].join(' ')},
            filters: [{id: 'state', label: 'État', type: 'check', value: ['encours'], options: counted(list, [['encours', '✅ En cours'], ['expires', '⌛ Expirés']], (s, k) => (k === 'encours') === live(s)), test: (s, v) => v.some(k => (k === 'encours') === live(s))},
                {id: 'pw', label: 'Mot de passe', type: 'check', options: counted(list, [['oui', '🔒 Avec un mot de passe', 'Avec un mot de passe'], ['non', 'Sans mot de passe']], (s, k) => (k === 'oui') === !!s.data?.locked), test: (s, v) => v.some(k => (k === 'oui') === !!s.data?.locked)}],
            sorts: [['recent', 'Les plus récents', (a, b) => cmpTxt(b.created_at, a.created_at)], ['old', 'Les plus anciens', (a, b) => cmpTxt(a.created_at, b.created_at)], ['az', 'A → Z', (a, b) => cmpTxt(a.title, b.title)], ['za', 'Z → A', (a, b) => cmpTxt(b.title, a.title)],
                ['until', 'Jusqu’au', (a, b) => cmpVal(a.open_at, b.open_at)]],
            cols: [{label: 'Branche', key: 'title', val: s => s.title, sort: ['az', 'za']}, {label: 'Partagée le', key: 'at', val: s => s.created_at, sort: ['old', 'recent']}, {label: 'Jusqu’au', key: 'until', val: s => s.open_at || '', sort: ['until', null]},
                {label: 'Personnes', key: 'people', val: s => Number(s.data?.people) || 0, num: true}, {label: 'Mot de passe', key: 'pw', val: s => (s.data?.locked ? 0 : 1)}, {label: 'État', key: 'state', val: s => (live(s) ? 0 : 1)}],
            row: s => `<tr><td>${s.person_id ? personLink(tr, s.person_id, s.title) : esc(s.title)}</td><td>${when(s.created_at)}</td><td>${esc(dateFr(s.open_at))}</td><td>${Number(s.data?.people) || ''}</td><td>${s.data?.locked ? '🔒 oui' : '— non'}</td><td>${live(s) ? '✅ en cours' : '⌛ expiré'}</td><td>${openBtn('partage')}</td></tr>`,
            empty: {icon: '🔗', text: 'Aucun partage pour l’instant', hint: 'Partage une branche dans ✨ Trésors → Partager une branche (pour un temps).', action: {label: '🔗 Partager une branche', attrs: 'data-trl-open="partage"'}}});
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl');
    };

    /* ═════════ 📍 Passeport des lieux ═════════ */
    ext.lists.tr_stamps = async token => {
        const r = await page(token, 'Passeport des lieux', '📍', 'Les lieux de l’arbre, et ceux où tu es allé (village, église, mairie, cimetière). Le tampon se met dans ✨ Trésors → Le passeport des lieux.',
            async () => { const [tr, list] = await Promise.all([T().tree(), T().items('stamp')]); return {tr, list}; }); if (!r) return;
        const {tr, list} = r.data, pls = ext.tresorStamps?.treePlaces ? ext.tresorStamps.treePlaces(T(), tr) : [], visits = new Map(list.map(v => [v.place_id, v]));
        const dept = p => tr.places?.[p.id]?.county || '', depts = [...new Set(pls.map(dept).filter(Boolean))].sort(cmpTxt), npp = p => p.people?.size || 0;
        barList({ws: r.ws, head: r.head, key: 'tr_stamps', items: pls, noun: ['lieu', 'lieux'], noneText: 'Aucun lieu ne correspond',
            search: {placeholder: 'Chercher un lieu… (nom, département, note)', text: p => [p.name, dept(p), visits.get(p.id)?.data?.note].join(' ')},
            filters: [{id: 'visit', label: 'Visite', type: 'check', options: counted(pls, [['visites', '✅ Visités'], ['avoir', 'À visiter']], (p, k) => (k === 'visites') === visits.has(p.id)), test: (p, v) => v.some(k => (k === 'visites') === visits.has(p.id))},
                ...(depts.length ? [{id: 'dept', label: 'Département', type: 'check', options: counted(pls, depts.map(d => [d, d]), (p, d) => dept(p) === d), test: (p, v) => v.includes(dept(p))}] : [])],
            sorts: [['people', 'Le plus de personnes de l’arbre', (a, b) => npp(b) - npp(a) || cmpTxt(a.name, b.name)], ['az', 'A → Z', (a, b) => cmpTxt(a.name, b.name)], ['za', 'Z → A', (a, b) => cmpTxt(b.name, a.name)],
                ['visit', 'Date de visite', (a, b) => cmpVal(visits.get(a.id)?.data?.date || '', visits.get(b.id)?.data?.date || '')]],
            cols: [{label: 'Lieu', key: 'name', val: p => p.name, sort: ['az', 'za']}, {label: 'Personnes de l’arbre', key: 'people', val: npp, num: true, sort: [null, 'people']}, {label: 'Visité', key: 'visited', val: p => (visits.has(p.id) ? 0 : 1)},
                {label: 'Le', key: 'date', val: p => visits.get(p.id)?.data?.date || '', sort: ['visit', null]}, {label: 'Note', key: 'note', val: p => visits.get(p.id)?.data?.note || ''}],
            row: p => { const v = visits.get(p.id); return `<tr><td><b>${esc(p.name)}</b>${dept(p) ? ` <small class="muted">${esc(dept(p))}</small>` : ''}</td><td>${npp(p) || ''}</td><td>${v ? '✅' : ''}</td><td>${esc(dateFr(v?.data?.date || ''))}</td><td>${esc(v?.data?.note || '')}</td><td>${openBtn('passeport-lieux')}</td></tr>`; },
            empty: {icon: '📍', text: 'Aucun lieu dans l’arbre pour l’instant', hint: 'Les lieux viennent des naissances, mariages et décès de l’arbre.'}});
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl');
    };

    /* ═════════ 🏛️ Actes manquants : l'assistant « Que manque-t-il ? » (Recherche), en liste ═════════ */
    ext.lists.tr_gaps = async token => {
        const r = await page(token, 'Actes manquants', '🏛️', d => `Les actes qui manquent à la lignée (5 générations)${d.root_name ? ` de ${esc(d.root_name)}` : ''}, avec la commune, les années et le service d’archives. L’assistant complet range, filtre, imprime et ajoute au suivi.`,
            () => A().api('research_gaps', {gen: 5}), {primary: '<button type="button" class="button" data-trl-gaps>🔍 Ouvrir l’assistant « Que manque-t-il ? »</button>'}); if (!r) return;
        const d = r.data, items = d.items || [], KIND = {birth: 'Naissance', marriage: 'Mariage', death: 'Décès'};
        const kindOf = it => KIND[it.kind] || it.what || it.kind || '', arch = it => it.archive?.label || '', archs = [...new Set(items.map(arch).filter(Boolean))].sort(cmpTxt);
        const years = it => Number(it.from) || Number(it.to) || '';
        barList({ws: r.ws, head: r.head, key: 'tr_gaps', items, noun: ['acte'], noneText: 'Aucun acte ne correspond', max: 400, moreHint: 'L’assistant complet « Que manque-t-il ? » montre tout.',
            search: {placeholder: 'Chercher… (ancêtre, commune, archives)', text: it => [it.name, it.place, arch(it)].join(' ')},
            filters: [{id: 'kind', label: 'L’acte', type: 'check', options: counted(items, [['birth', 'Naissance'], ['marriage', 'Mariage'], ['death', 'Décès']], (it, k) => it.kind === k), test: (it, v) => v.includes(it.kind)},
                {id: 'place', label: 'Commune', type: 'place', chipPrefix: 'À', test: (it, v) => { const k = pickOf(v); return (k.id && Number(it.place_id) === k.id) || (!!k.text && fold(it.place).includes(k.text)); }},
                ...(archs.length ? [{id: 'arch', label: 'Service d’archives', type: 'check', options: counted(items, archs.map(a => [a, a]), (it, a) => arch(it) === a), test: (it, v) => v.includes(arch(it))}] : [])],
            sorts: [['sosa', 'Sosa', (a, b) => cmpVal(Number(a.sosa) || '', Number(b.sosa) || '')], ['az', 'A → Z', (a, b) => cmpTxt(a.name, b.name)], ['za', 'Z → A', (a, b) => cmpTxt(b.name, a.name)], ['years', 'Années', (a, b) => cmpVal(years(a), years(b))]],
            cols: [{label: 'Ancêtre', key: 'name', val: it => it.name || '', sort: ['az', 'za']}, {label: 'Sosa', key: 'sosa', val: it => Number(it.sosa) || '', num: true, sort: ['sosa', null]}, {label: 'L’acte', key: 'kind', val: kindOf}, {label: 'Commune', key: 'place', val: it => it.place || ''},
                {label: 'Années', key: 'years', val: years, num: true, sort: ['years', null]}, {label: 'Archives', key: 'arch', val: arch}],
            row: it => `<tr><td>${it.person_id ? `<button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name || '')}</button>` : esc(it.name || '')}</td><td>${Number(it.sosa) || ''}</td><td>${esc(kindOf(it))}</td><td>${esc(it.place || '')}</td><td>${esc([it.from, it.to].filter(Boolean).join('–'))}</td><td>${esc(arch(it))}</td><td></td></tr>`,
            empty: d.root_id ? {icon: '🏛️', text: 'Rien ne manque sur 5 générations', hint: 'Bravo ! L’assistant peut chercher plus loin (jusqu’à 12 générations).', action: {label: '🔍 Ouvrir l’assistant', attrs: 'data-trl-gaps'}} : {icon: '🏛️', text: 'Choisis d’abord une personne de départ', hint: 'Personnes → sa fiche → « Personne de départ ».'}});
        r.ws.onclick = e => clicks(e, r.ws, '.h-trl');
    };

    /** les clics d'une page de liste : « Ouvrir » (la page des Trésors), l'assistant des actes manquants */
    function clicks(e, ws, sel) {
        if (!ws.querySelector(sel)) { ws.onclick = null; return; } // on a quitté la liste
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
