/* LCNDA — 🧺 l'onglet « Paniers » (maquette validée docs/design/onglet-paniers.html, réponses recommandées 1 à 7).
 * Un onglet caché au départ (Réglages → Onglets en plus → « 1 · Des parties de l'app, cachées au départ », app-onglets-plus.js) ;
 * la pastille 🧺 et « Prendre depuis… » restent (heritage-connexions.js) ; l'onglet remplace la fenêtre « ⛶ en grand » quand il est allumé.
 * Même modèle et mêmes ↶ que le panier : lib/connexions.php (cx_folders, cx_baskets, cx_basket_items) + lib/paniers.php (ops pn_*).
 *  - à gauche l'arbre 📁 / 🧺 (★ épinglés en haut, 🗄 archivés en bas, glisser un panier sur un dossier, un élément sur un panier) ;
 *  - à droite le panier : couverture, ★, résumé, étiquettes, ⏰ échéance (rappel dans ⏰ Rappels), destinations, statuts (6), note,
 *    « ↕ Ranger » (un seul contrôle, retenu par panier, l'ordre à la main jamais perdu), ☰ Liste · 🗺 Carte (ext.miniMap) · ⏳ Frise,
 *    🔎 chercher dedans puis agir sur les trouvés / cochés, ⧉ dupliquer (tout ou les cochés), ⇪ partager / ⇩ récupérer (.lcnda-panier),
 *    ⋯ : déplacer, étiquettes, couverture, échéance, archiver, comparer, historique ↶, qu'est-ce qui manque, enquête, 🏛 fiche de sortie,
 *    ✉ lettres de demande (Registre de courriers), ⤓ tableur / PDF / Word ;
 *  - 💡 des idées en haut de l'onglet et dans chaque panier (jamais dans la pastille ; « ✕ Pas utile » ne revient pas ; un réglage les éteint) ;
 *  - 🔍 « Créer un panier par une recherche… » : une phrase (app-paniers-core.js, parseSmart), des pastilles modifiables, ce que je n'ai
 *    pas compris, les listes pas installées, ✓/✗ par élément et par groupe, puis « Créer le panier » ou « ＋ Ajouter à un panier existant » ;
 *    le panier garde sa recherche (« ↻ Refaire » ne propose que les nouveautés) ; 🔄 panier vivant (« Me demander d'abord » / « Ajouter tout seul »).
 * Essai : tests/test-onglet-paniers.js
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP || {};
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const C = () => ext.paniersCore;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
    const api = (a, q) => A().api(a, q);
    const post = (op, body = {}) => A().api('cx_write', {}, {method: 'POST', body: {op, ...body}}).then(r => r?.result ?? r);
    const toast = (m, k, o) => A().toast?.(m, k, o);
    const undoToast = (m, o) => (A().undoToast ? A().undoToast(m, o) : toast(m));
    const kiosk = () => document.body.classList.contains('is-kiosk') || document.documentElement.classList.contains('base-readonly');
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const SET = 'genealogie-paniers', NOPE = 'genealogie-paniers-idees-non', CLOSED = 'genealogie-paniers-fermes', SEL = 'genealogie-paniers-ouvert';
    const settings = () => ({ideas: true, top: true, inside: true, ...readJ(SET, {})});
    const tabOn = () => { try { return !(A().menuHiddenKeys?.() || ['paniers']).includes('paniers'); } catch (_) { return false; } };
    const ICON = {person: '👤', event: '📅', act: '📜', source: '📚', citation: '📚', media: '🖼', note: '📝', text: '📝', place: '📍', investigation: '🔎', row: '📋', set: '📋', data: '📋', datum: '📌', courrier: '📮', reminder: '⏰', atelier: '📚', digest: '📒'};
    const COVERS = {g1: 'linear-gradient(135deg,#e9dcc3,#c8b79a)', g2: 'linear-gradient(160deg,#a8c3d8,#d9cfb5)', g3: 'linear-gradient(135deg,#c9e4c5,#7fb77e)', g4: 'linear-gradient(135deg,#f3c7c7,#d98c8c)',
        g5: 'linear-gradient(135deg,#d7c9f0,#9c84d4)', g6: 'linear-gradient(135deg,#ffe9a8,#e0b93a)', g7: 'linear-gradient(135deg,#cfd8e3,#7d8ea3)', g8: 'linear-gradient(135deg,#bfe3ea,#4aa3b5)'};
    const LCOLORS = ['#1a7f37', '#d4a800', '#6929c4', '#c62828', '#055dff', '#777777'];

    const st = {baskets: [], folders: [], items: new Map(), sel: readJ(SEL, null), view: 'basket', pick: false, picked: new Set(), find: '', archOpen: false, stripOpen: true, stripAll: false,
        ideas: [], s: null, treeOpen: false, token: 0, live: new Map()};
    const ws = () => document.getElementById('workspace');
    const root = () => ws()?.querySelector('[data-pn]');
    const bOf = id => st.baskets.find(b => Number(b.id) === Number(id)) || null;
    const fOf = id => st.folders.find(f => Number(f.id) === Number(id)) || null;
    const itemsOf = id => st.items.get(Number(id)) || [];
    const fKids = id => st.folders.filter(f => Number(f.parent_id) === Number(id));
    const bIn = id => st.baskets.filter(b => Number(b.folder_id) === Number(id) && !b.archived);
    const fTree = id => { const out = [Number(id)]; for (let k = 0; k < out.length; k++) fKids(out[k]).forEach(x => out.push(Number(x.id))); return out; };
    const bLabel = b => `${b.icon || '🧺'} ${b.name}`;
    const pathOf = b => (b?.path || [b?.name]).join(' › ');
    const closed = () => new Set(readJ(CLOSED, []));
    const icoOf = it => it?.data?.icon || ICON[it?.kind] || '📌';
    const cleanIt = it => ({kind: it.kind, ref_id: it.ref_id || 0, title: it.title, value: it.value || '', data: it.data || null, origin: it.origin || null});

    /* ═════ chargement ═════ */
    async function load() {
        const r = await api('cx_basket', {all: 1});
        st.baskets = r.baskets || []; st.folders = r.folders || []; st.items = new Map();
        (r.items || []).forEach(it => { const k = Number(it.basket_id); if (!st.items.has(k)) st.items.set(k, []); st.items.get(k).push(it); });
        if (!st.sel || (st.sel.t === 'b' && !bOf(st.sel.id)) || (st.sel.t === 'f' && !fOf(st.sel.id))) { const b = st.baskets.find(x => !x.archived) || st.baskets[0]; st.sel = b ? {t: 'b', id: Number(b.id)} : null; }
        return r;
    }
    const keep = r => { if (r?.baskets) st.baskets = r.baskets; if (r?.folders) st.folders = r.folders; return r; };
    const select = (t, id) => { st.sel = {t, id: Number(id)}; writeJ(SEL, st.sel); st.view = 'basket'; st.pick = false; st.picked = new Set(); st.find = ''; st.treeOpen = false; };
    async function refresh() { await load(); paint(); }

    /* ═════ l'écran ═════ */
    async function render(token) {
        const host = ws(); if (!host) return;
        st.token = token;
        st.sel = readJ(SEL, st.sel);
        try { await load(); } catch (e) { host.innerHTML = `<section class="page pn"><p class="pn-empty">${esc(e.message)}</p></section>`; return; }
        if (token !== undefined && token !== A().state?.workspaceToken) return;
        host.innerHTML = `<section class="page pn" data-pn>
            <div class="pn-tb"><h2>🧺 ${esc(T('Paniers'))}</h2>
                <button type="button" class="pn-smart" data-pn-a="search"><span aria-hidden="true">🔍</span><span><b>${esc(T('Créer un panier par une recherche…'))}</b> <span class="pn-mini">${esc(T('ex. « ce qu’a pu voir Jean MAZAUD à 10 ans »'))}</span></span></button>
                <div class="pn-tbb"><button type="button" class="pn-b is-sec is-sm" data-pn-a="newf">＋ ${esc(T('Dossier'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="newb">＋ ${esc(T('Panier'))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-a="import" title="${esc(T('Ouvrir un fichier .lcnda-panier'))}">⇩ ${esc(T('Récupérer'))}</button></div>
                <button type="button" class="pn-crumbbtn" data-pn-a="tree" aria-expanded="false"><span></span><b aria-hidden="true">▾</b></button>
            </div>
            <div class="pn-strip" data-pn-strip></div>
            <div class="pn-bd"><aside class="pn-tree" data-pn-tree aria-label="${esc(T('Dossiers et paniers'))}"></aside><div class="pn-main"><div class="pn-mscroll" data-pn-main></div><div class="pn-mfoot" data-pn-foot></div></div></div>
            <input type="file" accept=".lcnda-panier,.json,application/json" data-pn-file hidden>
        </section>`;
        bind(host.querySelector('[data-pn]'));
        paint();
        ideas().then(() => { if (st.dragging || st.pressing) { st.paintLater = true; return; } paintStrip(); if (st.view === 'basket') paintMain(); }); // pas pendant qu'on glisse : l'élément tenu disparaîtrait (le glisser resterait coincé)
        liveCheck();
    }
    function paint() { if (!root()) return; paintTree(); paintStrip(); paintMain(); }

    /* ─── l'arbre ─── */
    function paintTree() {
        const R = root(); if (!R) return;
        const cl = closed(), sel = st.sel || {};
        const dot = b => ((b.labels || []).length ? `<span class="pn-tdot" style="background:${esc(b.labels[0][1])}" aria-hidden="true"></span>` : '');
        const badge = b => { const n = (b.live?.news || []).length; return n && (b.live.mode || 'ask') === 'ask' ? `<span class="pn-pill is-blue" title="${esc(T('Nouveautés de sa recherche, à valider'))}">+${n}</span>` : ''; };
        const bRow = (b, d, cls = '') => `<div class="pn-tr is-b${cls}${!cls && sel.t === 'b' && Number(sel.id) === Number(b.id) && st.view !== 'search' ? ' is-sel' : ''}" ${cls ? '' : 'draggable="true" '}data-pn-b="${b.id}" style="--d:${d}" role="treeitem" tabindex="0">
            <span class="pn-tw0"></span><span aria-hidden="true">${esc(b.icon || '🧺')}</span><span class="pn-nm">${esc(b.name)}</span>${dot(b)}${badge(b)}<span class="pn-n">${b.count}</span></div>`;
        const fRow = (f, d) => { const open = !cl.has(Number(f.id));
            return `<li role="none"><div class="pn-tr is-f${sel.t === 'f' && Number(sel.id) === Number(f.id) && st.view !== 'search' ? ' is-sel' : ''}" draggable="true" data-pn-f="${f.id}" style="--d:${d}" role="treeitem" aria-expanded="${open}" tabindex="0">
                <button type="button" class="pn-tw" data-pn-tw="${f.id}" aria-label="${esc(open ? T('Replier') : T('Déplier'))}">${open ? '▾' : '▸'}</button><span aria-hidden="true">${esc(f.icon || (open ? '📂' : '📁'))}</span><span class="pn-nm">${esc(f.name)}</span><span class="pn-n">${f.total}</span></div>
                ${open ? `<ul role="group">${fKids(f.id).map(k => fRow(k, d + 1)).join('')}${bIn(f.id).map(b => `<li role="none">${bRow(b, d + 1)}</li>`).join('')}</ul>` : ''}</li>`; };
        const pins = st.baskets.filter(b => b.pinned && !b.archived), arch = st.baskets.filter(b => b.archived);
        const nb = st.baskets.filter(b => !b.archived).length;
        R.querySelector('[data-pn-tree]').innerHTML = `<div class="pn-treeh"><b>${esc(T('Mes paniers'))}</b><span class="pn-mini">${esc(T('{b} paniers · {f} dossiers', {b: nb, f: st.folders.length}))}</span><button type="button" class="pn-b is-ter is-sm pn-tclose" data-pn-a="tree">✕ ${esc(T('Fermer'))}</button></div>
            ${pins.length ? `<div class="pn-tsec">★ ${esc(T('Épinglés'))}</div><ul class="pn-tlist">${pins.map(b => `<li>${bRow(b, 0, ' is-pinr')}</li>`).join('')}</ul><div class="pn-tsec">${esc(T('Tous'))}</div>` : ''}
            <ul class="pn-tlist" role="tree" data-pn-root>${st.folders.filter(f => !Number(f.parent_id)).map(f => fRow(f, 0)).join('')}${bIn(0).map(b => `<li role="none">${bRow(b, 0)}</li>`).join('')}</ul>
            <div class="pn-tr is-root" data-pn-f="0" style="--d:0"><span class="pn-tw0"></span><span class="pn-mini">⤒ ${esc(T('Tout en haut (sans dossier)'))}</span></div>
            ${arch.length ? `<button type="button" class="pn-tsec is-arch" data-pn-a="archopen" aria-expanded="${st.archOpen}">${st.archOpen ? '▾' : '▸'} 🗄 ${esc(T('Archivés ({n})', {n: arch.length}))}</button>${st.archOpen ? `<ul class="pn-tlist">${arch.map(b => `<li>${bRow(b, 0, ' is-archr')}</li>`).join('')}</ul>` : ''}` : ''}
            <p class="pn-mini pn-tnote">${esc(T('⋮⋮ Glisse un panier sur un dossier pour l’y ranger, un élément sur un panier pour l’y mettre. Un dossier garde toujours au moins un panier.'))}</p>`;
        const cur = sel.t === 'b' ? bOf(sel.id) : sel.t === 'f' ? fOf(sel.id) : null;
        R.querySelector('.pn-crumbbtn span').textContent = st.view === 'search' ? `🔍 ${T('Nouvelle recherche')}` : cur ? (sel.t === 'b' ? [...(cur.path || []).slice(0, -1).map(n => `📂 ${n}`), bLabel(cur)].join(' › ') : `📂 ${cur.path.join(' › ')}`) : T('Mes paniers');
        R.classList.toggle('is-treeopen', !!st.treeOpen);
        R.querySelector('.pn-crumbbtn').setAttribute('aria-expanded', String(!!st.treeOpen));
    }

    /* ─── 💡 les idées ─── */
    const ideaCard = s => `<div class="pn-sg"><div class="pn-sgt"><span class="pn-ico" aria-hidden="true">${esc(s.icon)}</span><div><b>${esc(s.t)}</b><small>${esc(s.s)}</small></div></div>
        <p class="pn-why">${esc(T('Pourquoi : {w}', {w: s.why}))}</p><div class="pn-sga"><button type="button" class="pn-b is-pri is-sm is-wrap" data-pn-sadd="${esc(s.id)}">＋ ${esc(T('Dans « {n} »', {n: bOf(s.to)?.name || '?'}))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-sno="${esc(s.id)}">✕ ${esc(T('Pas utile'))}</button></div></div>`;
    function paintStrip() {
        const R = root(); if (!R) return; const el = R.querySelector('[data-pn-strip]'), s = settings();
        if (!s.ideas || !s.top || st.view === 'search' || !st.ideas.length) { el.innerHTML = ''; el.hidden = true; return; }
        el.hidden = false;
        const phone = (R.offsetWidth || 1000) < 720, shown = st.stripAll ? st.ideas : st.ideas.slice(0, phone ? 2 : 3);
        el.innerHTML = `<div class="pn-striph"><button type="button" class="pn-tgl" data-pn-a="strip" aria-expanded="${st.stripOpen}">${st.stripOpen ? '▾' : '▸'} 💡 ${esc(T('Des idées pour tes paniers'))} <span class="pn-nb">${st.ideas.length}</span></button>
            <span class="pn-mini pn-stripwhy">${esc(T('d’après ton arbre, les noms et destinations de tes paniers, les lieux et les dates'))}</span><button type="button" class="pn-b is-ter is-sm" data-pn-a="ideas-off">${esc(T('Masquer les suggestions'))}</button></div>
            ${st.stripOpen ? `<div class="pn-sgrid">${shown.map(ideaCard).join('')}</div>${shown.length < st.ideas.length ? `<button type="button" class="pn-more" data-pn-a="stripall">${esc(T('Voir les {n} autres idées', {n: st.ideas.length - shown.length}))}</button>` : ''}` : ''}`;
    }
    /** les idées : d'après le nom de chaque panier (recherche dans l'arbre, cx_search) et les personnes qui y sont (leurs événements) */
    async function ideas() {
        const s = settings(); st.ideas = []; if (!s.ideas) return;
        const no = new Set(readJ(NOPE, [])), inAny = new Set(); st.items.forEach(list => list.forEach(it => inAny.add(C().sameKey(it))));
        const list = [...st.baskets].filter(b => !b.archived).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 6);
        const out = [];
        for (const b of list) {
            const words = String(b.name).replace(/[()«»"0-9–-]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !/^(panier|nouveau|famille|recherches?|trier)$/i.test(w));
            if (words.length) {
                try {
                    const r = await api('cx_search', {q: words.slice(0, 3).join(' ')});
                    const its = (r.base || []).flatMap(g => (g.items || []).map(x => pickToItem(g.kind, x))).filter(x => x && !inAny.has(C().sameKey(x))).slice(0, 4);
                    const id = `n${b.id}:${its.map(x => C().sameKey(x)).join(',')}`;
                    if (its.length && !no.has(id)) out.push({id, to: b.id, icon: its[0].data?.icon || ICON[its[0].kind] || '💡', t: T('{n} choses de ton arbre qui vont avec « {b} »', {n: its.length, b: b.name}), s: its.map(x => `${x.title}${x.data?.y ? ' (' + x.data.y + ')' : ''}`).join(' · ').slice(0, 160), why: T('le nom du panier'), add: its});
                } catch (_) {}
            }
            const person = itemsOf(b.id).find(x => x.kind === 'person' && x.ref_id);
            if (person) {
                try {
                    const d = await api('person', {id: person.ref_id});
                    const evs = (d.events || []).filter(e => e.year).map(e => ({kind: 'event', ref_id: Number(e.id), title: `${e.type_label || T('Événement')} — ${person.title}`, value: [e.date_text, e.place_name].filter(Boolean).join(' · '),
                        data: {y: Number(e.year), place: e.place_name || '', who: person.title, cat: 'evt'}, origin: {kind: 'event', id: Number(e.id), label: T('Ton arbre'), person_id: person.ref_id}})).filter(x => !inAny.has(C().sameKey(x))).slice(0, 5);
                    const id = `p${b.id}:${evs.map(x => x.ref_id).join(',')}`;
                    if (evs.length && !no.has(id)) out.push({id, to: b.id, icon: '📅', t: T('Les événements de {p}', {p: person.title}), s: evs.map(x => x.title.split(' — ')[0] + (x.data.y ? ' ' + x.data.y : '')).join(' · '), why: T('une personne du panier'), add: evs});
                } catch (_) {}
            }
        }
        st.ideas = out;
    }
    async function ideaAdd(id) {
        const s = st.ideas.find(x => x.id === id); if (!s) return;
        const r = await post('basket_add', {basket_id: s.to, items: s.add.map(cleanIt)});
        await post('pn_log', {basket_id: s.to, label: T('{n} ajoutés depuis une idée', {n: r.ids.length}), undo: {op: 'basket_remove', body: {ids: r.ids}}});
        st.ideas = st.ideas.filter(x => x.id !== id); await refresh();
        undoToast(T('{n} ajoutés dans « {b} »', {n: r.ids.length, b: bOf(s.to)?.name || ''}), {icon: '💡', undo: async () => { await post('basket_remove', {ids: r.ids}); await refresh(); }});
    }
    function ideaNo(id) { writeJ(NOPE, [...new Set([...readJ(NOPE, []), id])].slice(-500)); st.ideas = st.ideas.filter(x => x.id !== id); paintStrip(); paintMain(); toast(T('Idée écartée : elle ne reviendra pas.')); }
    function ideasOff() {
        const before = readJ(SET, {}); writeJ(SET, {...settings(), ideas: false}); paintStrip(); paintMain();
        undoToast(T('Suggestions masquées (Réglages → Panier et connexions)'), {icon: '💡', undo: async () => { writeJ(SET, before); await ideas(); paintStrip(); paintMain(); }});
    }

    /* ─── un élément pris dans l'arbre ou une liste → un élément de panier ─── */
    function pickToItem(kind, x) {
        if (!x) return null;
        if (kind === 'event') return {kind: 'event', ref_id: Number(x.id), title: `${x.type || x.title} — ${x.who || ''}`.replace(/ — $/, ''), value: [x.date_text, x.place].filter(Boolean).join(' · '), data: {y: x.year ? Number(x.year) : null, place: x.place || '', who: x.who || '', cat: 'evt'}, origin: {kind: 'event', id: Number(x.id), label: T('Ton arbre'), person_id: Number(x.person_id) || 0}};
        if (kind === 'person') return {kind: 'person', ref_id: Number(x.id), title: x.title, value: String(x.meta || '').replace(/\s*·\s*#\d+$/, ''), data: {who: x.title, cat: 'pers', place: (x.why || []).find(w => w.k === 'place')?.v || ''}, origin: {kind: 'person', id: Number(x.id), label: T('Ton arbre'), person_id: Number(x.id)}};
        if (kind === 'note') return {kind: 'note', ref_id: Number(x.id), title: x.title || T('Note'), value: String(x.body || '').slice(0, 300), origin: {kind: 'note', id: Number(x.id), label: T('Tes notes')}};
        return {kind: ['act', 'media', 'source', 'place'].includes(kind) ? kind : 'datum', ref_id: Number(x.id) || 0, title: x.title || '', value: x.meta || '', data: {place: x.place || ''}, origin: {kind, id: Number(x.id) || 0, label: T('Ton arbre')}};
    }

    /* ─── la zone principale ─── */
    function paintMain() {
        const R = root(); if (!R) return;
        if (st.view === 'search') return paintSearch();
        const s = st.sel;
        if (s?.t === 'b' && bOf(s.id)) return paintBasket(bOf(s.id));
        if (s?.t === 'f' && fOf(s.id)) return paintFolder(fOf(s.id));
        R.querySelector('[data-pn-main]').innerHTML = `<div class="pn-empty">${esc(st.baskets.length ? T('Choisis un panier à gauche.') : T('Pas encore de panier : « ＋ Panier » ou « 🔍 Créer un panier par une recherche… ».'))}</div>`;
        R.querySelector('[data-pn-foot]').innerHTML = '';
    }
    const crumbsHtml = b => { const p = (b.path || []).slice(0, -1); return `<div class="pn-crumbs">${p.length ? p.map(x => '📂 ' + esc(x)).join(' › ') + ' ›' : esc(T('À la racine'))}</div>`; };
    const dueTxt = d => { const x = new Date(d + 'T12:00:00'); return Number.isFinite(x.getTime()) ? x.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}) : d; };
    const coverCss = c => (COVERS[c] ? COVERS[c] : /^data:image\//.test(c) ? `center/cover no-repeat url("${c.replace(/"/g, '')}")` : '');
    const srcHtml = it => { const o = it.origin || {}, lab = o.label || it.data?.source || ''; if (!lab && !o.url) return '';
        return `<span class="pn-src">${esc(T('Source'))} : ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${esc(lab || o.url)} ↗</a>` : esc(lab)}${it.data?.licence ? ` · <span class="pn-lic">${esc(it.data.licence)}</span>` : ''}</span>`; };
    function dupsOf(b) {
        const m = new Map(); st.baskets.forEach(x => { if (Number(x.id) === Number(b.id)) return; itemsOf(x.id).forEach(it => { const k = C().sameKey(it); if (!m.has(k)) m.set(k, []); m.get(k).push(x.name); }); });
        return m;
    }
    function itemHtml(b, it, {manual, dups}) {
        const s = C().statusOf(it), S = C().STATUSES.find(x => x[0] === s), on = st.picked.has(Number(it.id)), d = dups.get(C().sameKey(it));
        return `<li class="pn-it${s === 'utilise' ? ' is-done' : ''}${on ? ' is-on' : ''}" data-pn-i="${it.id}"${manual ? ' draggable="true"' : ' draggable="true"'}>
            ${manual ? `<span class="pn-grip" aria-hidden="true" title="${esc(T('Glisser pour changer l’ordre'))}">⋮⋮</span>` : ''}
            ${st.pick || st.find ? `<span class="pn-pk"><input type="checkbox" data-pn-pick="${it.id}" data-sel-check ${on ? 'checked' : ''} aria-label="${esc(T('Cocher'))}"></span>` : ''}
            <span class="pn-ico" aria-hidden="true">${esc(icoOf(it))}</span>
            <div class="pn-itx"><b>${esc(it.title)}</b>${it.value ? `<small>${esc(String(it.value).slice(0, 300))}</small>` : ''}${srcHtml(it)}
                ${d ? `<span class="pn-dup">⧉ ${esc(T('aussi dans « {b} »', {b: d.slice(0, 2).join(' », « ')}))}</span>` : ''}
                <input class="pn-note" type="text" value="${esc(it.note || '')}" placeholder="${esc(T('une note…'))}" data-pn-note="${it.id}" aria-label="${esc(T('Note'))}"></div>
            <div class="pn-ir"><button type="button" class="pn-stt is-${s}" data-pn-stt="${it.id}" title="${esc(T('Un clic : le statut suivant'))}">${S[1]} ${esc(T(S[2]))}</button>
                ${manual ? `<span class="pn-mv"><button type="button" data-pn-up="${it.id}" aria-label="${esc(T('Monter'))}">↑</button><button type="button" data-pn-down="${it.id}" aria-label="${esc(T('Descendre'))}">↓</button></span>` : ''}
                <button type="button" class="pn-xb" data-pn-x="${it.id}" aria-label="${esc(T('Retirer du panier'))}" title="${esc(T('Retirer du panier'))}">×</button></div></li>`;
    }
    function liveHtml(b) {
        const q = b.query, L = b.live;
        if (!q?.text) return '';
        if (!L) return `<div class="pn-qline">🔍 ${esc(T('Créé par la recherche « {q} »', {q: q.text}))} <button type="button" class="pn-b is-ter is-sm" data-pn-a="redo">↻ ${esc(T('Refaire (nouveautés à valider)'))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-a="live-on">🔄 ${esc(T('En faire un panier vivant'))}</button></div>`;
        const news = L.news || [], mode = L.mode || 'ask';
        return `<div class="pn-live"><div>🔄 <b>${esc(T('Panier vivant'))}</b> : ${esc(T('il garde sa recherche « {q} » et la refait chaque semaine (ton arbre et les listes installées).', {q: q.text}))}</div>
            <div class="pn-lmode"><span class="pn-mini">${esc(T('Quand il y a du nouveau :'))}</span><span class="pn-seg"><button type="button" data-pn-live="ask" aria-pressed="${mode === 'ask'}">${esc(T('Me demander d’abord'))}</button><button type="button" data-pn-live="auto" aria-pressed="${mode === 'auto'}">${esc(T('Ajouter tout seul'))}</button></span>
                <button type="button" class="pn-b is-ter is-sm" data-pn-a="live-run">↻ ${esc(T('Chercher les nouveautés'))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-a="live-off">${esc(T('Arrêter'))}</button></div>
            ${news.length && mode === 'ask' ? `<div class="pn-news"><b>${esc(T('+{n} nouveaux à valider', {n: news.length}))}</b><ul class="pn-rl">${news.map((x, i) => `<li class="pn-rr${x._ex ? ' is-ex' : ''}"><span class="pn-yn"><button type="button" class="is-y" data-pn-nwy="${i}" aria-pressed="${!x._ex}" aria-label="${esc(T('Garder'))}">✓</button><button type="button" class="is-n" data-pn-nwn="${i}" aria-pressed="${!!x._ex}" aria-label="${esc(T('Écarter'))}">✗</button></span><span class="pn-ico" aria-hidden="true">${esc(icoOf(x))}</span><span class="pn-rtx"><b>${esc(x.title)}</b><small>${esc(x.value || '')}</small></span></li>`).join('')}</ul>
                <div class="pn-sga"><button type="button" class="pn-b is-pri is-sm" data-pn-a="news-ok"${news.some(x => !x._ex) ? '' : ' disabled'}>＋ ${esc(T('Ajouter les {n} gardés', {n: news.filter(x => !x._ex).length}))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-a="news-no">${esc(T('Tout écarter'))}</button></div></div>` : ''}</div>`;
    }
    function paintBasket(b) {
        const R = root(), all = itemsOf(b.id), vis = C().findIn(all, st.find), sort = C().normSort(b.sort), v = b.view || 'liste', manual = sort.k === 'main' && !st.find;
        const sIdeas = settings().ideas && settings().inside ? st.ideas.filter(x => Number(x.to) === Number(b.id)) : [];
        const dups = dupsOf(b), groups = C().arrange(vis, sort), gclosed = new Set(sort.closed || []);
        const labels = (b.labels || []).map(t => `<span class="pn-tag"><i style="background:${esc(t[1])}"></i>${esc(t[0])}</span>`).join('');
        const listHtml = groups.map(g => { const shut = g.key && gclosed.has(g.key);
            return `${g.key ? `<li class="pn-ghd"><button type="button" data-pn-g="${esc(g.key)}" aria-expanded="${!shut}">${shut ? '▸' : '▾'} ${esc(g.key)} <span>${g.items.length}</span></button></li>` : ''}${shut ? '' : g.items.map(it => itemHtml(b, it, {manual, dups})).join('')}`; }).join('');
        R.querySelector('[data-pn-main]').innerHTML = `<div class="pn-bh">${crumbsHtml(b)}
            ${b.archived ? `<div class="pn-qline">🗄 ${esc(T('Panier archivé (fini) : il ne s’affiche plus dans l’arbre ni dans « Prendre depuis… ».'))} <button type="button" class="pn-b is-ter is-sm" data-pn-a="unarch">${esc(T('Désarchiver'))}</button></div>` : ''}
            <div class="pn-bhead">${coverCss(b.cover) ? `<span class="pn-cover" style="background:${esc(coverCss(b.cover))}" aria-hidden="true"></span>` : ''}<div class="pn-bht">
                <h3><span aria-hidden="true">${esc(b.icon || '🧺')}</span><span class="pn-bn">${esc(b.name)}</span><button type="button" class="pn-pinb" data-pn-a="pin" aria-pressed="${!!b.pinned}" title="${esc(b.pinned ? T('Désépingler') : T('Épingler en haut de l’arbre'))}">${b.pinned ? '★' : '☆'}</button></h3>
                <p class="pn-summ">${esc(C().summary(all, T))}</p>
                ${labels || b.due ? `<div class="pn-meta">${labels}${b.due ? `<button type="button" class="pn-tag is-due" data-pn-a="due">⏰ ${esc(T('pour le {d}', {d: dueTxt(b.due)}))}${b.remind ? ' · ' + esc(T('rappel la veille')) : ''}</button>` : ''}</div>` : ''}
            </div></div>
            <div class="pn-dests"><span class="pn-lab">${esc(T('Va d’habitude vers'))}</span>${(b.dests || []).length ? b.dests.map(d => `<span class="pn-dest">→ ${esc(d.label)}</span>`).join('') : `<span class="pn-mini">${esc(T('nulle part encore'))}</span>`}<button type="button" class="pn-b is-ter is-sm" data-pn-a="dests">✎ ${esc((b.dests || []).length ? T('changer') : T('choisir'))}</button></div>
            ${liveHtml(b)}
            <div class="pn-acts"><button type="button" class="pn-b is-pri is-sm" data-pn-a="putall">📍 ${esc(T('Mettre tout dans…'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="pick" aria-pressed="${st.pick}">☑ ${esc(T('Choisir des lignes'))}</button>
                <button type="button" class="pn-b is-sec is-sm" data-pn-a="rename">✎ ${esc(T('Renommer'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="dup">⧉ ${esc(T('Dupliquer'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="share">⇪ ${esc(T('Partager'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="more" aria-label="${esc(T('Toutes les autres actions'))}">⋯</button></div></div>
            ${sIdeas.length ? `<div class="pn-bs"><h5>💡 ${esc(T('Des idées pour ce panier'))}<span class="pn-sp"></span><button type="button" class="pn-b is-ter is-sm" data-pn-a="ideas-off">${esc(T('Masquer les suggestions'))}</button></h5>${sIdeas.map(s => `<div class="pn-bsr"><span class="pn-ico" aria-hidden="true">${esc(s.icon)}</span><div class="pn-t"><b>${esc(s.t)}</b><small>${esc(s.s)}</small><small class="pn-why">${esc(T('Pourquoi : {w}', {w: s.why}))}</small></div><span class="pn-sga"><button type="button" class="pn-b is-pri is-sm" data-pn-sadd="${esc(s.id)}">＋ ${esc(T('Ajouter'))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-sno="${esc(s.id)}">✕ ${esc(T('Pas utile'))}</button></span></div>`).join('')}</div>` : ''}
            <div class="pn-ltools"><label class="pn-srch"><span class="pn-sr">${esc(T('Chercher dans ce panier'))}</span><input type="search" data-pn-find value="${esc(st.find)}" placeholder="${esc(T('Chercher dans ce panier…'))}"></label>
                <button type="button" class="pn-b is-sec is-sm" data-pn-a="sort" aria-haspopup="true">↕ ${esc(T('Ranger : {s}', {s: C().sortLabel(sort, T)}))} ▾</button>
                ${sort.k !== 'main' ? `<button type="button" class="pn-b is-ter is-sm" data-pn-a="sort-main">↶ ${esc(T('Mon ordre à la main'))}</button>` : ''}
                <span class="pn-seg" role="group" aria-label="${esc(T('Vue'))}"><button type="button" data-pn-view="liste" aria-pressed="${v === 'liste'}">☰ ${esc(T('Liste'))}</button><button type="button" data-pn-view="carte" aria-pressed="${v === 'carte'}">🗺 ${esc(T('Carte'))}</button><button type="button" data-pn-view="frise" aria-pressed="${v === 'frise'}">⏳ ${esc(T('Frise'))}</button></span></div>
            ${st.find ? `<p class="pn-mini pn-found">${esc(T('{n} trouvés sur {m}', {n: vis.length, m: all.length}))}</p>` : ''}
            ${v === 'carte' ? `<div class="pn-map" data-pn-map><p class="pn-mini">${esc(T('La carte se prépare…'))}</p></div>` : v === 'frise' ? friseHtml(vis) : vis.length ? `<ul class="pn-items" data-pn-items>${listHtml}</ul>` : `<div class="pn-empty">${esc(all.length ? T('Rien de trouvé dans ce panier.') : T('Ce panier est vide. Prends des choses avec « Prendre depuis… », la pastille 🧺 ou une recherche.'))}</div>`}`;
        paintFoot(b, vis);
        if (v === 'carte') paintMap(b, vis);
    }
    function friseHtml(vis) {
        const dated = vis.map(it => [C().yearOf(it), it]).filter(x => x[0] != null).sort((a, b) => a[0] - b[0]), none = vis.filter(it => C().yearOf(it) == null);
        return `<ol class="pn-frise">${dated.map(([y, it]) => `<li><span class="pn-yr">${y}</span><span class="pn-fdot" aria-hidden="true"></span><span class="pn-ft">${esc(icoOf(it))} ${esc(it.title)}</span></li>`).join('')}</ol>
            ${none.length ? `<p class="pn-mini pn-apart">${esc(T('Sans date ({n}) : {l}', {n: none.length, l: none.map(x => x.title).slice(0, 8).join(' · ')}))}</p>` : ''}`;
    }
    const geoCache = new Map();
    async function placeLL(name) {
        const k = fold(name); if (!k) return null; if (geoCache.has(k)) return geoCache.get(k);
        let p = null; try { const r = await api('picker_search', {kind: 'place', q: name, limit: 3}); p = (r.groups || []).flatMap(g => g.items || []).find(x => x.lat != null) || null; } catch (_) {}
        const v = p ? {lat: Number(p.lat), lon: Number(p.lon), title: p.title || name} : null; geoCache.set(k, v); return v;
    }
    async function paintMap(b, vis) {
        const host = root()?.querySelector('[data-pn-map]'); if (!host) return;
        const pts = [], none = [], by = new Map();
        for (const it of vis) {
            let ll = it.data?.lat != null && it.data?.lon != null ? {lat: Number(it.data.lat), lon: Number(it.data.lon)} : null;
            if (!ll && C().placeOf(it)) ll = await placeLL(C().placeOf(it));
            if (!ll) { none.push(it); continue; }
            const k = `${ll.lat.toFixed(3)},${ll.lon.toFixed(3)}`; if (!by.has(k)) by.set(k, {lat: ll.lat, lon: ll.lon, list: []}); by.get(k).list.push(it);
        }
        by.forEach(g => pts.push({lat: g.lat, lon: g.lon, label: `${g.list.length > 1 ? g.list.length + ' · ' : ''}${C().placeOf(g.list[0]) || g.list[0].title}`, n: g.list.length, showLabel: true}));
        if (!root()?.querySelector('[data-pn-map]')) return;
        host.innerHTML = `${ext.miniMap ? ext.miniMap(pts, [], {height: 320, emptyText: T('Rien à placer sur la carte (aucun lieu connu).')}) : `<p>${esc(T('La carte n’est pas chargée.'))}</p>`}
            ${none.length ? `<p class="pn-mini pn-apart">${esc(T('Sans lieu ({n}) : {l}', {n: none.length, l: none.map(x => x.title).slice(0, 8).join(' · ')}))}</p>` : ''}`;
    }
    /** le pied : ce qui est coché (☑ Choisir des lignes) ou trouvé (🔎) → agir dessus */
    /** le pied : la barre de sélection commune (app-selection.js) — Tout cocher, Maj+clic, ✕ Décocher ;
     *  rien de coché pendant une recherche : les actions portent sur « Les N trouvés » (dit dans la barre) */
    let pnSel = null;
    function paintFoot(b, vis) {
        const F = root().querySelector('[data-pn-foot]');
        pnSel?.destroy(); pnSel = null;
        if (!st.pick && !st.find) { F.innerHTML = ''; F.hidden = true; return; }
        F.hidden = false; F.innerHTML = '<span data-pn-selph hidden></span>';
        const host = root().querySelector('[data-pn-items]') || root().querySelector('[data-pn-main]');
        if (!ext.selectionBar || !host) return;
        const keep = [...st.picked].filter(id => vis.some(x => Number(x.id) === id)).map(String);
        // les boutons gardent leur data-pn-a : la délégation des clics du Panier fait le travail (menus ancrés sur le bouton)
        const viaDelegation = (id, icon, label, edit = true) => ({id, icon, label, attr: `data-pn-a="${id}"`, edit, run: () => {}});
        pnSel = ext.selectionBar({host, rowSelector: '.pn-it[data-pn-i]', idOf: el => el.dataset.pnI, what: [T('coché'), T('cochés')], place: F.querySelector('[data-pn-selph]'),
            onChange: ids => { st.picked = new Set(ids.map(Number)); },
            fallback: () => (st.find && vis.length ? {ids: vis.map(x => String(x.id)), text: T('Les {n} trouvés', {n: vis.length})} : null),
            actions: [viaDelegation('sel-put', '📍', T('Mettre dans…'), false), viaDelegation('sel-move', '→', T('Prendre dans un autre panier')), viaDelegation('sel-dup', '⧉', T('Dupliquer')),
                viaDelegation('sel-status', '', T('Statut…')), viaDelegation('sel-x', '×', T('Retirer'))]});
        pnSel?.set(keep);
    }
    const selIds = () => { const b = bOf(st.sel?.id); if (!b) return []; const vis = C().findIn(itemsOf(b.id), st.find), p = [...st.picked].filter(id => vis.some(x => Number(x.id) === id)); return p.length ? p : st.find ? vis.map(x => Number(x.id)) : []; };
    const selItems = () => { const ids = new Set(selIds()); return itemsOf(st.sel?.id).filter(x => ids.has(Number(x.id))); };

    /* ─── un dossier ouvert : son contenu, « ☑ Choisir des lignes » avec cases à trois états ─── */
    function paintFolder(f) {
        const R = root(), ids = fTree(f.id), bs = st.baskets.filter(b => ids.includes(Number(b.folder_id)) && !b.archived);
        const row = (x, d) => `<li class="pn-fr" style="--d:${d}">${st.pick ? `<input type="checkbox" data-pn-fpick="f${x.id}" aria-label="${esc(T('Cocher'))}">` : ''}<span aria-hidden="true">📁</span><b>${esc(x.name)}</b><span class="pn-mini">${esc(T('{b} paniers · {n} éléments', {b: x.baskets, n: x.total}))}</span></li>`;
        const bRow = (b, d) => `<li class="pn-fr" style="--d:${d}">${st.pick ? `<input type="checkbox" data-pn-fpick="b${b.id}" aria-label="${esc(T('Cocher'))}">` : ''}<span aria-hidden="true">${esc(b.icon || '🧺')}</span><button type="button" class="pn-lnk" data-pn-open="${b.id}">${esc(b.name)}</button><span class="pn-mini">${b.count}</span></li>
            ${st.pick ? itemsOf(b.id).map(it => `<li class="pn-fi" style="--d:${d + 1}"><input type="checkbox" data-pn-fpick="i${it.id}" data-pn-fb="${b.id}" aria-label="${esc(it.title)}"><span>${esc(icoOf(it))} ${esc(it.title)}</span></li>`).join('') : ''}`;
        const walk = (id, d) => [...fKids(id).map(k => row(k, d) + walk(k.id, d + 1)), ...bIn(id).map(b => bRow(b, d))].join('');
        R.querySelector('[data-pn-main]').innerHTML = `<div class="pn-bh"><div class="pn-crumbs">${f.path.slice(0, -1).map(x => '📂 ' + esc(x)).join(' › ') || esc(T('À la racine'))}</div>
            <h3>📂 ${esc(f.name)} <span class="pn-mini">${esc(T('{b} paniers · {n} éléments', {b: f.baskets, n: f.total}))}</span></h3>
            <div class="pn-acts"><button type="button" class="pn-b is-pri is-sm" data-pn-a="fnewb">＋ ${esc(T('Panier ici'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="fnewf">＋ ${esc(T('Sous-dossier'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="pick" aria-pressed="${st.pick}">☑ ${esc(T('Choisir des lignes'))}</button><button type="button" class="pn-b is-sec is-sm" data-pn-a="frename">✎ ${esc(T('Renommer'))}</button><button type="button" class="pn-b is-ter is-sm" data-pn-a="fdel">🗑 ${esc(T('Supprimer le dossier'))}</button></div></div>
            <ul class="pn-ftree">${walk(f.id, 0) || `<li class="pn-empty">${esc(T('Dossier vide.'))}</li>`}</ul>`;
        const F = R.querySelector('[data-pn-foot]');
        if (st.pick) { F.hidden = false; F.innerHTML = `<div class="pn-cnt"><b data-pn-fcount>${esc(T('{a} cochés', {a: 0}))}</b></div><button type="button" class="pn-b is-pri is-sm" data-pn-a="fput" disabled>📍 ${esc(T('Mettre les cochés dans…'))}</button>`; }
        else { F.innerHTML = ''; F.hidden = true; }
        void bs;
    }
    /** les cases à trois états d'un dossier : cocher un panier coche ses éléments ; un panier à moitié coché est « indéterminé » */
    function folderPickSync(changed) {
        const R = root(), box = k => R.querySelector(`[data-pn-fpick="${k}"]`);
        if (changed?.dataset.pnFpick?.startsWith('b')) { const bid = changed.dataset.pnFpick.slice(1); R.querySelectorAll(`[data-pn-fb="${bid}"]`).forEach(i => { i.checked = changed.checked; }); }
        if (changed?.dataset.pnFpick?.startsWith('f')) { const ids = fTree(changed.dataset.pnFpick.slice(1)); st.baskets.filter(b => ids.includes(Number(b.folder_id))).forEach(b => { const x = box('b' + b.id); if (x) { x.checked = changed.checked; x.indeterminate = false; } R.querySelectorAll(`[data-pn-fb="${b.id}"]`).forEach(i => { i.checked = changed.checked; }); }); }
        st.baskets.forEach(b => { const x = box('b' + b.id); if (!x) return; const its = [...R.querySelectorAll(`[data-pn-fb="${b.id}"]`)], n = its.filter(i => i.checked).length; if (its.length) { x.checked = n === its.length; x.indeterminate = n > 0 && n < its.length; } });
        st.folders.forEach(f => { const x = box('f' + f.id); if (!x) return; const ids = fTree(f.id), its = st.baskets.filter(b => ids.includes(Number(b.folder_id))).flatMap(b => [...R.querySelectorAll(`[data-pn-fb="${b.id}"]`)]), n = its.filter(i => i.checked).length; if (its.length) { x.checked = n === its.length; x.indeterminate = n > 0 && n < its.length; } });
        const n = R.querySelectorAll('[data-pn-fb]:checked').length; const c = R.querySelector('[data-pn-fcount]'); if (c) c.textContent = T('{a} cochés', {a: n});
        const btn = R.querySelector('[data-pn-a="fput"]'); if (btn) btn.disabled = !n;
    }

    /* ═════ les dialogues (dans l'app : un vrai <dialog>, rien de collé) ═════ */
    /** La fenêtre commune (ext.openDialog : titre à gauche, × à droite, en bas « Annuler » puis le bouton bleu) ; les autres choix
     *  (« Y laisser un panier vide », « Pas d’échéance »…) se rangent juste avant « Annuler ». Rend {key, form} (key null = annulé). */
    function dlg({title, body = '', buttons = [['', T('Fermer'), 'is-ter']], wide = false, bindIt = null}) {
        return new Promise(res => {
            let val = null;
            const pri = buttons.find(b => b[0] && b[2] === 'is-pri') || null;
            const cancel = buttons.find(b => !b[0] || b[0] === 'cancel') || null;
            const extras = buttons.filter(b => b !== pri && b !== cancel);
            const d = ext.openDialog({eyebrow: T('PANIERS'), title, body: `<div class="pn-dlgc">${body}</div>`, wide, submitLabel: pri ? pri[1] : null, closeLabel: cancel ? cancel[1] : '',
                onSubmit: pri ? () => { val = pri[0]; } : undefined,
                onOpen: dd => {
                    dd.classList.add('pn-dlg');
                    const sub = dd.querySelector('.modal-actions [type=submit]'); if (sub && pri) sub.dataset.pnDk = pri[0];
                    const cl = dd.querySelector('.modal-actions [data-h-close]'); if (cl && cancel) { cl.dataset.pnDk = cancel[0]; }
                    const before = dd.querySelector('.modal-actions [data-h-close], .modal-actions [type=submit]');
                    extras.forEach(([k, l]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'button secondary'; b.dataset.pnDk = k; b.textContent = l; b.addEventListener('click', () => { val = k; dd.close(); }); before ? before.before(b) : dd.querySelector('.modal-actions').append(b); });
                    bindIt?.(dd);
                }});
            d.addEventListener('close', () => res({key: val, form: d.querySelector('form')}));
        });
    }
    const askText = async (title, value = '', label = '') => { const r = await dlg({title, body: `<label class="pn-f">${esc(label || title)}<input name="v" type="text" value="${esc(value)}" maxlength="120" required></label>`, buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('OK'), 'is-pri']]}); return r.key === 'ok' ? r.form.v.value.trim() : null; };
    const folderOpts = (sel = 0, withRoot = true) => `${withRoot ? `<option value="0">${esc(T('(tout en haut, sans dossier)'))}</option>` : ''}${st.folders.map(f => `<option value="${f.id}"${Number(f.id) === Number(sel) ? ' selected' : ''}>${'  '.repeat(f.depth)}📁 ${esc(f.name)}</option>`).join('')}`;
    const basketOpts = (sel = 0) => st.baskets.filter(b => !b.archived).map(b => `<option value="${b.id}"${Number(b.id) === Number(sel) ? ' selected' : ''}>${esc(pathOf(b))}</option>`).join('');

    /** ⚠ un dossier vient de perdre son dernier panier : supprimer le dossier (↶) · y laisser « À trier » · annuler ce qu'on vient de faire */
    async function askEmptied(emptied, undoFirst) {
        const rs = []; let cancelled = false;
        for (const f of emptied || []) {
            const r = await dlg({title: T('Le dossier « {n} » n’a plus de panier', {n: f.name}), body: `<p>${esc(T('Un dossier garde toujours au moins un panier. Que faire ?'))}</p>`,
                buttons: [['cancel', T('Annuler'), 'is-ter'], ['keep', T('Y laisser un panier vide « À trier »'), 'is-sec'], ['del', T('Supprimer aussi le dossier'), 'is-pri']]});
            if (r.key === 'del') rs.push(keep(await post('folder_delete', {folder_id: f.id, mode: 'all'})));
            else if (r.key === 'keep') { const x = keep(await post('basket_new', {name: T('À trier'), folder_id: f.id})); rs.push({made: x.id}); }
            else { cancelled = true; break; }
        }
        const undo = async () => { for (const r of rs.reverse()) { if (r.made) await post('basket_delete', {basket_id: r.made}).catch(() => {}); else await post('folder_undelete', r); } await undoFirst?.(); };
        if (cancelled) { await undo(); return null; }
        return undo;
    }

    /* ═════ les actions ═════ */
    async function newBasket(folder = 0) {
        const name = await askText(T('Nouveau panier'), '', T('Le nom du panier')); if (!name) return;
        const r = keep(await post('basket_new', {name, folder_id: folder})); await post('pn_log', {basket_id: r.id, label: T('Panier créé')});
        select('b', r.id); await refresh();
        undoToast(T('🧺 Panier « {n} » créé', {n: name}), {undo: async () => { await post('basket_delete', {basket_id: r.id}); await refresh(); }});
    }
    async function newFolder(parent = 0) {
        const name = await askText(T('Nouveau dossier'), '', T('Le nom du dossier')); if (!name) return;
        const r = keep(await post('folder_new', {name, parent_id: parent})); select('b', r.basket_id); await refresh();
        undoToast(T('📁 Dossier « {n} » créé, avec son panier « {b} »', {n: name, b: bOf(r.basket_id)?.name || ''}), {undo: async () => { await post('folder_delete', {folder_id: r.id, mode: 'all'}); await refresh(); }});
    }
    async function delBasket(id) {
        const b = bOf(id); if (!b) return;
        const r = keep(await post('basket_delete', {basket_id: id}));
        const undo = await askEmptied(r.emptied, async () => { await post('basket_undelete', {basket: r.basket, rows: r.rows}); });
        if (undo === null) { await refresh(); toast(T('Rien n’a changé.')); return; }
        await refresh(); undoToast(T('Panier « {n} » supprimé', {n: b.name}), {undo: async () => { await undo(); await refresh(); }});
    }
    async function moveBasket(id, folder) {
        const b = bOf(id); if (!b || Number(b.folder_id) === Number(folder)) return;
        try {
            const r = keep(await post('basket_move', {basket_id: id, folder_id: folder}));
            const undo = await askEmptied(r.emptied, async () => keep(await post('basket_move', r.before)));
            if (undo === null) { await refresh(); toast(T('Rien n’a changé.')); return; }
            await post('pn_log', {basket_id: id, label: T('Rangé dans « {p} »', {p: folder ? fOf(folder)?.name || '' : T('tout en haut')}), undo: {op: 'basket_move', body: r.before}});
            await refresh(); undoToast(T('« {n} » rangé dans « {p} »', {n: b.name, p: folder ? fOf(folder)?.name || '' : T('tout en haut')}), {icon: '📁', undo: async () => { await undo(); await refresh(); }});
        } catch (e) { toast(e.message, 'error'); }
    }
    async function moveFolder(id, parent) {
        if (Number(id) === Number(parent)) return;
        try { const r = keep(await post('folder_move', {folder_id: id, parent_id: parent})); await refresh();
            undoToast(T('« {n} » rangé dans « {p} »', {n: fOf(id)?.name || '', p: parent ? fOf(parent)?.name || '' : T('tout en haut')}), {icon: '📁', undo: async () => { await post('folder_move', r.before); await refresh(); }}); }
        catch (e) { toast(e.message, 'error'); }
    }
    async function moveItems(ids, to) {
        if (!ids.length || !bOf(to)) return;
        const from = Number(st.sel?.id), r = await post('item_move', {ids, basket_id: to});
        await post('pn_log', {basket_id: from, label: T('{n} éléments mis dans « {b} »', {n: ids.length, b: bOf(to).name}), undo: {op: 'item_unmove', body: {before: r.before}}});
        st.picked = new Set(); await refresh();
        undoToast(T('{n} éléments mis dans « {b} »', {n: ids.length, b: bOf(to)?.name || ''}), {icon: '🧺', undo: async () => { await post('item_unmove', {before: r.before}); await refresh(); }});
    }
    async function setStatus(ids, status) {
        const r = await post('pn_status', {ids, status}); const S = C().STATUSES.find(x => x[0] === status);
        await post('pn_log', {basket_id: st.sel?.id, label: T('{n} éléments : « {s} »', {n: ids.length, s: T(S[2])}), undo: {op: 'pn_status_set', body: {rows: r.before}}});
        await refresh(); return r;
    }
    async function cycleStatus(id) {
        const it = itemsOf(st.sel?.id).find(x => Number(x.id) === Number(id)); if (!it) return;
        const next = C().nextStatus(C().statusOf(it)), S = C().STATUSES.find(x => x[0] === next);
        const r = await post('item_set', {id, status: next});
        await post('pn_log', {basket_id: it.basket_id, label: T('« {t} » : statut « {s} »', {t: it.title.slice(0, 60), s: T(S[2])}), undo: {op: 'item_set', body: r.before}});
        it.status = next; it.done = next === 'utilise' ? 1 : 0; paintMain(); paintTree();
    }
    async function saveNote(id, note) {
        const it = itemsOf(st.sel?.id).find(x => Number(x.id) === Number(id)); if (!it || (it.note || '') === note) return;
        const r = await post('item_set', {id, note}); it.note = note;
        await post('pn_log', {basket_id: it.basket_id, label: T('Note sur « {t} »', {t: it.title.slice(0, 60)}), undo: {op: 'item_set', body: r.before}});
        undoToast(T('Note gardée'), {undo: async () => { await post('item_set', r.before); await refresh(); }});
    }
    async function removeItems(ids) {
        if (!ids.length) return;
        const r = await post('basket_remove', {ids});
        await post('pn_log', {basket_id: st.sel?.id, label: T('{n} éléments retirés', {n: ids.length}), undo: {op: 'basket_restore', body: {rows: r.removed}}});
        st.picked = new Set(); await refresh(); A().refreshCxCount?.(); ext.connexions?.refresh?.();
        undoToast(T('{n} éléments retirés du panier', {n: ids.length}), {undo: async () => { await post('basket_restore', {rows: r.removed}); await refresh(); }});
    }
    async function reorder(b, ids) {
        const r = await post('item_order', {basket_id: b.id, ids});
        await post('pn_log', {basket_id: b.id, label: T('Ordre changé à la main'), undo: {op: 'item_order', body: {basket_id: b.id, ids: r.before}}});
        await refresh(); undoToast(T('Ordre changé'), {undo: async () => { await post('item_order', {basket_id: b.id, ids: r.before}); await refresh(); }});
    }
    async function meta(b, o, log = '') {
        const r = await post('pn_meta', {basket_id: b.id, ...o, ...(log ? {log} : {})}); keep(r); paintTree(); paintMain(); return r;
    }
    const metaUndo = (b, o, msg) => meta(b, o, msg).then(r => { undoToast(msg, {undo: async () => { await post('pn_meta', r.before); await refresh(); }}); return r; });

    /* ─── « ↕ Ranger » ─── */
    function sortMenu(b, anchor) {
        const s = C().normSort(b.sort);
        const save = n => meta(b, {sort: {...s, ...n}});
        UI().menuAt?.(anchor, [
            ...C().SORTS.map(([k, l]) => ({icon: s.k === k ? '●' : '○', label: T(l), run: () => save({k, then: s.then === k ? '' : s.then})})), '-',
            ...(s.k !== 'main' ? [{icon: '＋', label: s.then ? T('puis par… ({s})', {s: T(C().SORTS.find(x => x[0] === s.then)[1])}) : T('puis par…'), run: () => UI().menuAt?.(anchor, [{icon: '○', label: T('(rien)'), run: () => save({then: ''})}, ...C().SORTS.filter(([k]) => k !== 'main' && k !== s.k).map(([k, l]) => ({icon: s.then === k ? '●' : '○', label: T(l), run: () => save({then: k})}))], {title: T('puis par…')})},
                {icon: s.dir > 0 ? '↓' : '↑', label: s.dir > 0 ? T('À l’envers (↓)') : T('Dans l’ordre (↑)'), run: () => save({dir: -s.dir})}, {icon: '↶', label: T('Mon ordre à la main'), run: () => save({k: 'main', then: ''})}] : []),
        ], {title: T('Ranger ce panier')});
    }

    /* ─── ⋯ toutes les autres actions ─── */
    function moreMenu(b, anchor) {
        UI().menuAt?.(anchor, [
            {icon: '📁', label: T('Déplacer vers un dossier…'), run: () => chooseFolder(b)},
            {icon: '🏷', label: T('Étiquettes…'), run: () => labelsDlg(b)},
            {icon: '🖼', label: T('Couverture…'), run: () => coverDlg(b)},
            {icon: '⏰', label: T('Échéance et rappel…'), run: () => dueDlg(b)},
            {icon: '🗄', label: b.archived ? T('Désarchiver') : T('Archiver (fini)'), run: () => metaUndo(b, {archived: !b.archived}, b.archived ? T('Panier désarchivé') : T('Panier archivé : il quitte l’arbre et « Prendre depuis… »'))},
            '-',
            {icon: '⇄', label: T('Comparer avec un autre panier…'), run: () => compareDlg(b)},
            {icon: '↶', label: T('Historique'), run: () => historyDlg(b)},
            {icon: '❓', label: T('Qu’est-ce qui manque ?'), run: () => missingDlg(b)},
            '-',
            {icon: '🔎', label: T('Créer une enquête à partir de ce panier'), run: () => toInvestigation(b)},
            {icon: '🏛', label: T('Fiche de sortie aux archives'), run: () => archivesSheet(b)},
            {icon: '✉', label: T('Lettres de demande'), run: () => lettersDlg(b)},
            '-',
            {icon: '⤓', label: T('Tableur (CSV, Excel)'), run: () => exportSheet(b, anchor)},
            {icon: '⤓', label: T('PDF (imprimer)'), run: () => exportPdf(b)},
            {icon: '⤓', label: T('Word (.docx)'), run: () => exportWord(b)},
            {icon: '🗑', label: T('Supprimer le panier'), danger: true, run: () => delBasket(b.id)},
        ], {title: bLabel(b)});
    }
    async function chooseFolder(b) {
        const r = await dlg({title: T('Ranger « {n} » dans…', {n: b.name}), body: `<label class="pn-f">${esc(T('Dossier'))}<select name="f">${folderOpts(b.folder_id)}</select></label>`, buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('Ranger'), 'is-pri']]});
        if (r.key === 'ok') moveBasket(b.id, Number(r.form.f.value));
    }
    async function labelsDlg(b) {
        const all = new Map(); st.baskets.forEach(x => (x.labels || []).forEach(t => all.set(t[0], t[1])));
        const cur = new Set((b.labels || []).map(t => t[0]));
        const r = await dlg({title: T('Étiquettes de « {n} »', {n: b.name}), body: `${all.size ? `<div class="pn-chk">${[...all].map(([n, c]) => `<label class="pn-tag"><input type="checkbox" name="l" value="${esc(n)}" data-c="${esc(c)}" ${cur.has(n) ? 'checked' : ''}><i style="background:${esc(c)}"></i>${esc(n)}</label>`).join('')}</div>` : ''}
            <div class="pn-flds"><label class="pn-f">${esc(T('Nouvelle étiquette'))}<input name="nn" type="text" maxlength="40" placeholder="${esc(T('ex. à finir'))}"></label><label class="pn-f">${esc(T('Couleur'))}<select name="nc">${LCOLORS.map(c => `<option value="${c}">${c}</option>`).join('')}</select></label></div>`,
            buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('Garder'), 'is-pri']]});
        if (r.key !== 'ok') return;
        const labels = [...r.form.querySelectorAll('[name="l"]:checked')].map(i => [i.value, i.dataset.c]);
        if (r.form.nn.value.trim()) labels.push([r.form.nn.value.trim(), r.form.nc.value]);
        metaUndo(b, {labels}, T('Étiquettes changées'));
    }
    async function coverDlg(b) {
        const r = await dlg({title: T('Couverture de « {n} »', {n: b.name}), body: `<div class="pn-covers">${Object.entries(COVERS).map(([k, c]) => `<label class="pn-cov"><input type="radio" name="c" value="${k}" ${b.cover === k ? 'checked' : ''}><span style="background:${esc(c)}"></span></label>`).join('')}<label class="pn-cov"><input type="radio" name="c" value="" ${!b.cover ? 'checked' : ''}><span class="is-none">∅</span></label></div>
            <label class="pn-f">${esc(T('ou une image (PNG, JPEG)'))}<input type="file" name="img" accept="image/png,image/jpeg,image/webp"></label>`, buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('Garder'), 'is-pri']]});
        if (r.key !== 'ok') return;
        let cover = r.form.querySelector('[name="c"]:checked')?.value || '';
        const file = r.form.img.files?.[0];
        if (file) { try { cover = await shrink(file); } catch (e) { toast(e.message, 'error'); return; } }
        metaUndo(b, {cover}, T('Couverture changée'));
    }
    function shrink(file) {
        return new Promise((ok, ko) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const s = Math.min(1, 160 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = () => ko(new Error(T('Image illisible.'))); img.src = u; });
    }
    async function dueDlg(b) {
        const r = await dlg({title: T('Échéance de « {n} »', {n: b.name}), body: `<label class="pn-f">${esc(T('Pour le'))}<input type="date" name="d" value="${esc(b.due || '')}"></label><label class="pn-chkl"><input type="checkbox" name="r" ${b.remind || !b.due ? 'checked' : ''}> ${esc(T('Un rappel la veille (dans ⏰ Rappels)'))}</label>`,
            buttons: [['clear', T('Pas d’échéance'), 'is-ter'], ['', T('Annuler'), 'is-ter'], ['ok', T('Garder'), 'is-pri']]});
        if (r.key === 'clear') return metaUndo(b, {due: '', remind: false}, T('Échéance retirée'));
        if (r.key !== 'ok' || !r.form.d.value) return;
        metaUndo(b, {due: r.form.d.value, remind: r.form.r.checked}, T('Échéance : {d}', {d: dueTxt(r.form.d.value)}));
    }
    async function destsDlg(b) {
        const DT = (ext.dropTargets || []).filter(t => t.id && t.label), cur = new Set((b.dests || []).map(d => d.id));
        const r = await dlg({title: T('Où va « {n} » d’habitude ?', {n: b.name}), body: `<p>${esc(T('Ces destinations sont choisies d’avance dans « 📍 Mettre tout dans… ».'))}</p><div class="pn-chk is-col">${DT.map(t => `<label class="pn-chkl"><input type="checkbox" name="d" value="${esc(t.id)}" data-l="${esc((t.icon ? t.icon + ' ' : '') + T(t.label))}" ${cur.has(t.id) ? 'checked' : ''}> ${esc(t.icon || '')} ${esc(T(t.label))}</label>`).join('')}</div>`,
            buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('Garder'), 'is-pri']]});
        if (r.key !== 'ok') return;
        const dests = [...r.form.querySelectorAll('[name="d"]:checked')].map(i => ({id: i.value, label: i.dataset.l}));
        const x = await post('basket_edit', {basket_id: b.id, name: b.name, icon: b.icon, color: b.color, note: b.note, folder_id: b.folder_id, dests}); await refresh();
        undoToast(T('Destinations changées'), {undo: async () => { await post('basket_edit', {basket_id: b.id, ...x.before}); await refresh(); }});
    }
    async function compareDlg(b) {
        const others = st.baskets.filter(x => Number(x.id) !== Number(b.id));
        if (!others.length) { toast(T('Il faut un autre panier pour comparer.')); return; }
        const show = id => { const o = bOf(id), c = C().compare(itemsOf(b.id), itemsOf(id)), col = (h, l) => `<div class="pn-cmpc"><b>${esc(h)} (${l.length})</b><ul>${l.map(x => `<li>${esc(icoOf(x))} ${esc(x.title)}</li>`).join('') || `<li class="pn-mini">—</li>`}</ul></div>`;
            return `<div class="pn-cmp">${col(T('Seulement ici'), c.onlyA)}${col(T('Dans les deux'), c.both)}${col(T('Seulement dans « {n} »', {n: o.name}), c.onlyB)}</div>`; };
        await dlg({title: T('⇄ Comparer « {n} »', {n: b.name}), wide: true, body: `<label class="pn-f">${esc(T('avec'))}<select name="o">${others.map(x => `<option value="${x.id}">${esc(pathOf(x))}</option>`).join('')}</select></label><div data-pn-cmp>${show(others[0].id)}</div>`,
            bindIt: d => d.querySelector('[name="o"]').addEventListener('change', e => { d.querySelector('[data-pn-cmp]').innerHTML = show(e.target.value); })});
    }
    async function historyDlg(b) {
        const r = await api('cx_basket', {basket_id: b.id, log: 1}); const log = r.log || [];
        await dlg({title: T('↶ Historique de « {n} »', {n: b.name}), body: log.length ? `<ul class="pn-shl">${log.map(l => `<li><span class="pn-t">${esc(l.label)}<small>${esc(String(l.created_at).slice(0, 16).replace('T', ' '))}</small></span>${Number(l.can_undo) ? `<button type="button" class="pn-b is-ter is-sm" data-pn-undo="${l.id}">↶ ${esc(T('Défaire'))}</button>` : ''}</li>`).join('')}</ul>` : `<p>${esc(T('Rien encore.'))}</p>`,
            bindIt: d => d.querySelectorAll('[data-pn-undo]').forEach(btn => btn.addEventListener('click', async () => { try { await post('pn_undo', {log_id: btn.dataset.pnUndo}); btn.closest('li').classList.add('is-undone'); btn.remove(); await refresh(); toast(T('↶ Défait')); } catch (e) { toast(e.message, 'error'); } }))});
    }
    async function missingDlg(b) {
        const m = C().missing(itemsOf(b.id), b, T);
        await dlg({title: T('Qu’est-ce qui manque à « {n} » ?', {n: b.name}), body: `<ul class="pn-miss">${m.map(x => `<li><span>${esc(x.t)}</span>${x.k === 'demander' ? `<button type="button" class="pn-b is-sec is-sm" data-pn-mk="letters">✉ ${esc(T('Lettres de demande'))}</button>` : x.k === 'dest' ? `<button type="button" class="pn-b is-sec is-sm" data-pn-mk="dests">✎ ${esc(T('choisir'))}</button>` : ''}</li>`).join('') || `<li>${esc(T('Rien de flagrant.'))}</li>`}</ul>`,
            bindIt: d => d.querySelectorAll('[data-pn-mk]').forEach(btn => btn.addEventListener('click', () => { d.close(); (btn.dataset.pnMk === 'letters' ? lettersDlg : destsDlg)(b); }))});
    }
    async function toInvestigation(b) {
        const r = await dlg({title: T('Créer une enquête à partir de « {n} »', {n: b.name}), body: `<p>${esc(T('Une piste par élément ; les personnes deviennent des personnes liées. Le panier ne change pas.'))}</p><label class="pn-f">${esc(T('Titre de l’enquête'))}<input type="text" name="t" value="${esc(b.name)}" maxlength="200"></label>`, buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('Créer l’enquête'), 'is-pri']]});
        if (r.key !== 'ok') return;
        try { const x = await post('pn_to_investigation', {basket_id: b.id, title: r.form.t.value, ids: selIds()});
            toast(T('🔎 Enquête créée ({n} pistes)', {n: x.pistes}), '', {action: {label: T('↗ Ouvrir'), run: () => { Object.assign(A().state, {enquetesTab: 'enquetes', currentInvestigationId: x.investigation_id}); A().setModule('enquetes'); }}}); }
        catch (e) { toast(e.message, 'error'); }
    }
    /** 🏛 la fiche de sortie aux archives : les cotes, rangées par série, des cases à cocher, la place pour noter (imprimable) */
    function sheetHtml(b) {
        const its = itemsOf(b.id).filter(it => ['demander', 'chercher', 'revoir'].includes(C().statusOf(it)) || /\b\d+\s?[A-Z]{1,3}\s?\d+|\bMi\b|\bGG\b|\bE\b/.test(String(it.value) + ' ' + String(it.origin?.label || '')));
        const list = its.length ? its : itemsOf(b.id);
        const cote = it => (String(`${it.value} ${it.origin?.label || ''} ${it.note || ''}`).match(/\b(\d{1,3}\s?(?:E|Mi|M|R|P|Q|J|W|Fi|GG|BB)\s?[\d/]+(?:[, ]+vue\s?\d+)?)/) || [])[1] || '';
        const serie = it => { const c = cote(it); const m = c.match(/^\d{1,3}\s?([A-Za-z]+)/); return m ? T('Série {s}', {s: m[1].toUpperCase()}) : T('Sans cote'); };
        const by = new Map(); list.forEach(it => { const s = serie(it); if (!by.has(s)) by.set(s, []); by.get(s).push(it); });
        const pe = v => String(v ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
        const st2 = it => C().STATUSES.find(x => x[0] === C().statusOf(it))[2];
        return `<!doctype html><html><head><meta charset="utf-8"><title>${pe(T('Fiche de sortie aux archives'))} — ${pe(b.name)}</title><style>body{font:10.5pt/1.4 system-ui,sans-serif;color:#111;margin:0}h1{font-size:15pt;margin:0 0 1mm}.h{display:flex;justify-content:space-between;gap:8mm;border-bottom:2px solid #111;padding-bottom:2mm;margin-bottom:4mm}h2{font-size:11.5pt;margin:5mm 0 1mm}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:1.4mm 2mm;text-align:left;vertical-align:top}th{background:#eee}td.c{width:7mm;text-align:center}tr{break-inside:avoid}.lines{height:22mm;background:repeating-linear-gradient(#fff 0 6.5mm,#bbb 6.5mm 6.8mm)}</style></head><body>
            <div class="h"><div><h1>🏛 ${pe(T('Fiche de sortie aux archives'))}</h1><div>🧺 ${pe(b.name)}</div></div><div>${pe(T('Dépôt'))} : ________________<br>${pe(T('Horaires'))} : ________________<br>${pe(T('Date'))} : ____ / ____ / ________</div></div>
            ${[...by].map(([s, l]) => `<h2>${pe(s)} (${l.length})</h2><table><thead><tr><th class="c">☐</th><th>${pe(T('Cote'))}</th><th>${pe(T('Quoi'))}</th><th>${pe(T('Statut'))}</th><th>${pe(T('Noté sur place'))}</th></tr></thead><tbody>${l.map(it => `<tr><td class="c">☐</td><td>${pe(cote(it) || '—')}</td><td><b>${pe(it.title)}</b><br>${pe(String(it.value || '').slice(0, 200))}</td><td>${pe(T(st2(it)))}</td><td>${pe(it.note || '')}</td></tr>`).join('')}</tbody></table>`).join('')}
            <h2>${pe(T('Notes'))}</h2><div class="lines"></div></body></html>`;
    }
    function archivesSheet(b) {
        const html = sheetHtml(b);
        if (UI().openPrintDialog) UI().openPrintDialog({title: T('Fiche de sortie aux archives'), key: 'panier-sortie', photos: false, paper: 'A4', orientation: 'portrait', html});
        else { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }
    }
    /** ✉ les lettres de demande : les éléments « à demander », chacun avec sa lettre (Registre de courriers, ext.openActLetter) */
    async function lettersDlg(b) {
        const its = itemsOf(b.id).filter(it => C().statusOf(it) === 'demander');
        const act = it => (/mariage/.test(fold(it.title)) ? 'mariage' : /deces|sepulture|inhum/.test(fold(it.title)) ? 'deces' : 'naissance');
        await dlg({title: T('✉ Lettres de demande — « {n} »', {n: b.name}), body: its.length ? `<p>${esc(T('Les éléments « à demander » : une lettre toute prête pour chacun, rangée ensuite dans le Registre de courriers.'))}</p><ul class="pn-shl">${its.map(it => `<li><span class="pn-t">${esc(it.title)}<small>${esc(it.value || '')}</small></span><button type="button" class="pn-b is-sec is-sm" data-pn-letter="${it.id}">✉ ${esc(T('Préparer la lettre'))}</button></li>`).join('')}</ul>`
            : `<p>${esc(T('Aucun élément n’est « à demander ». Change le statut d’un élément (un clic sur son statut) pour préparer sa lettre.'))}</p>`,
            buttons: [['', T('Fermer'), 'is-ter'], ['reg', T('📮 Ouvrir le Registre de courriers'), 'is-sec']],
            bindIt: d => d.querySelectorAll('[data-pn-letter]').forEach(btn => btn.addEventListener('click', () => { const it = its.find(x => Number(x.id) === Number(btn.dataset.pnLetter)); d.close();
                if (!ext.openActLetter) { toast(T('Les courriers tout prêts ne sont pas chargés.'), 'error'); return; }
                ext.openActLetter({person_id: it.kind === 'person' ? it.ref_id : Number(it.origin?.person_id) || 0, event_id: it.kind === 'event' ? it.ref_id : 0, act: act(it), what: 'recherche', precision: `${it.title}${it.value ? ' — ' + it.value : ''}`.slice(0, 300)}); }))})
            .then(r => { if (r.key === 'reg') { A().state.listType = 'courriers'; A().setModule('listes'); } });
    }
    /* ─── ⤓ exporter (les moteurs déjà là : tableur, impression, Word) ─── */
    const matrix = b => [[T('Titre'), T('Détail'), T('Statut'), T('Date'), T('Lieu'), T('Source'), T('Lien'), T('Note')], ...itemsOf(b.id).map(it => [it.title, it.value || '', T(C().STATUSES.find(x => x[0] === C().statusOf(it))[2]), C().yearOf(it) ?? '', C().placeOf(it), C().sourceOf(it), it.origin?.url || '', it.note || ''])];
    const fileName = (b, e) => `${String(b.name || 'panier').replace(/[^\p{L}\p{N}]+/gu, '-')}.${e}`;
    const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+/, '') || 'panier'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
    function exportSheet(b, anchor) {
        const SH = window.LCNDA_SHEET, q2 = v => '"' + String(A().csvSafe ? A().csvSafe(v) : (v ?? '')).replace(/"/g, '""') + '"';
        if (UI().exportRows) return UI().exportRows({quote: 'always', title: b.name || T('Panier'), name: b.name || T('Panier'), rows: () => matrix(b), info: T('{n} lignes', {n: itemsOf(b.id).length})}); // ⤓ la fenêtre d'export commune
        UI().menuAt?.(anchor, [{icon: '📄', label: T('CSV (tableur, Excel)'), run: () => download(new Blob(['﻿' + matrix(b).map(r => r.map(q2).join(';')).join('\n')], {type: 'text/csv'}), fileName(b, 'csv'))},
            ...(SH?.toXlsx ? [{icon: '📊', label: T('Fichier Excel (.xlsx)'), run: async () => { const wb = SH.newWorkbook(); wb.sheets[0].name = SH.cleanSheetName ? SH.cleanSheetName(b.name, []) : 'Panier'; wb.sheets[0].cells = SH.rowsToCells(matrix(b).map(r => r.map(v => (typeof v === 'string' && /^\s*=/.test(v) ? "'" + v : v)))); /* une case « =… » reste du texte (sinon une vraie formule dans Excel) */ download(await SH.toXlsx(wb), fileName(b, 'xlsx')); }}] : []),
            ...(ext.openRowsInSheet ? [{icon: '🧮', label: T('Ouvrir dans le tableur'), run: () => ext.openRowsInSheet({name: b.name, rows: matrix(b).map(r => r.map(v => (typeof v === 'string' && /^\s*=/.test(v) ? "'" + v : v)))})}] : [])], {title: T('Tableur')});
    }
    const pe = v => String(v ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
    function exportPdf(b) {
        const m = matrix(b);
        UI().openPrintDialog?.({title: b.name, key: 'panier', photos: false, html: `<!doctype html><html><head><meta charset="utf-8"><title>${pe(b.name)}</title><style>body{font:10pt/1.35 system-ui,sans-serif;color:#111;margin:0}h1{font-size:15pt;margin:0 0 2mm}p{color:#555;margin:0 0 4mm}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:1.2mm 2mm;text-align:left;vertical-align:top}th{background:#eee}tr{break-inside:avoid}</style></head><body><h1>${pe((b.icon || '🧺') + ' ' + b.name)}</h1><p>${pe(C().summary(itemsOf(b.id), T))}</p><table><thead><tr>${m[0].map(h => `<th>${pe(h)}</th>`).join('')}</tr></thead><tbody>${m.slice(1).map(r => `<tr>${r.map(c => `<td>${pe(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`});
    }
    async function exportWord(b) {
        const TX = window.LCNDA_TEXT; if (!TX?.toDocx || !TX?.fromText) { toast(T('Le moteur de documents n’est pas chargé.'), 'error'); return; }
        const text = [`${b.icon || '🧺'} ${b.name}`, C().summary(itemsOf(b.id), T), '', ...itemsOf(b.id).map(it => `• ${it.title}${it.value ? ' — ' + it.value : ''}${C().sourceOf(it) ? ` (${T('Source')} : ${C().sourceOf(it)})` : ''}${it.note ? ` [${it.note}]` : ''}`)].join('\n');
        try { download(await TX.toDocx(TX.fromText(text)), fileName(b, 'docx')); } catch (e) { toast(e.message, 'error'); }
    }

    /* ─── ⧉ dupliquer : tout, ou les cochés ─── */
    async function duplicate(b, ids = null, anchor = null) {
        const go = async only => { const name = await askText(T('Le nom de la copie'), `${b.name} (${T('copie')})`); if (!name) return;
            const r = keep(await post('pn_dup', {basket_id: b.id, ids: only || [], name})); st.picked = new Set(); select('b', r.id); await refresh();
            undoToast(T('Panier « {n} » créé ({c} éléments)', {n: name, c: r.count}), {icon: '⧉', undo: async () => { await post('basket_delete', {basket_id: r.id}); await refresh(); }}); };
        if (ids) return go(ids);
        const p = selIds();
        if (!p.length) return go(null);
        UI().menuAt?.(anchor, [{icon: '⧉', label: T('Tout le panier ({n})', {n: itemsOf(b.id).length}), run: () => go(null)}, {icon: '☑', label: T('Les {n} cochés dans un nouveau panier', {n: p.length}), run: () => go(p)}], {title: T('Dupliquer')});
    }

    /* ═════ ⇪ partager ═════ */
    async function shareDlg(b) {
        let rows = [], accounts = [];
        try { rows = (await post('pn_share_build', {basket_id: b.id, list: 1})).rows || []; } catch (e) { toast(e.message, 'error'); return; }
        try { accounts = (await post('pn_share_accounts', {})).accounts || []; } catch (_) {}
        let sent = [];
        if (accounts.length) { try { sent = (await post('pn_share_sent', {basket_id: b.id})).sent || []; } catch (_) {} }
        const sentWord = x => (x.status === 'retire' ? T('retiré par le destinataire') : x.status === 'lu' ? T('lu le {d}', {d: x.read}) : T('envoyé, pas encore lu'));
        const pub = rows.filter(r => !r.personal), per = rows.filter(r => r.personal && !r.blocked), blk = rows.filter(r => r.blocked);
        const line = (r, inp, sub) => `<li class="${r.blocked ? 'is-lock' : ''}">${inp}<span class="pn-t">${esc(r.title)}<small>${esc(sub)}</small></span></li>`;
        const r = await dlg({title: T('⇪ Partager « {n} »', {n: b.name}), wide: true,
            body: `<p>${esc(T('Un petit fichier .lcnda-panier : titres, dates, lieux, sources, liens et licences. Ce qui vient de ton arbre n’y va que si tu le coches, un par un ; une personne vivante ou confidentielle, jamais. Les notes ne partent pas.'))}</p>
                <div class="pn-sum"><span class="pn-pill is-ok">${esc(T('{n} publics', {n: pub.length}))}</span><span class="pn-pill is-q">${esc(T('{n} de ton arbre', {n: per.length}))}</span><span class="pn-pill is-red">${esc(T('{n} bloqués', {n: blk.length}))}</span></div>
                ${pub.length ? `<div class="pn-lh">${esc(T('Partagés (données publiques)'))}</div><ul class="pn-shl">${pub.map(x => line(x, '<input type="checkbox" checked disabled>', x.source || T('donnée publique'))).join('')}</ul>` : ''}
                ${per.length ? `<div class="pn-lh">${esc(T('De ton arbre : à cocher un par un'))}</div><ul class="pn-shl">${per.map(x => line(x, `<input type="checkbox" name="inc" value="${x.id}" aria-label="${esc(x.title)}">`, x.source || T('ton arbre'))).join('')}</ul>` : ''}
                ${blk.length ? `<div class="pn-lh">🔒 ${esc(T('Jamais partagés (vivants, confidentiels)'))}</div><ul class="pn-shl">${blk.map(x => line(x, '<input type="checkbox" disabled>', T('personne vivante ou confidentielle'))).join('')}</ul>` : ''}
                ${accounts.length ? `<div class="pn-flds"><label class="pn-f">${esc(T('Envoyer à un compte du site familial'))}<select name="acc"><option value="">${esc(T('(non, seulement le fichier)'))}</option>${accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label></div>` : ''}
                ${sent.length ? `<div class="pn-lh">✉ ${esc(T('Déjà envoyé'))}</div><ul class="pn-shl" data-pn-sent>${sent.map(x => `<li><span class="pn-t">${esc(x.account || T('compte retiré'))}<small>${esc(String(x.at).slice(0, 10))} · ${esc(T('{n} éléments', {n: x.n}))} · ${esc(sentWord(x))}</small></span></li>`).join('')}</ul>` : ''}`,
            buttons: [['', T('Annuler'), 'is-ter'], ...(accounts.length ? [['send', T('✉ Envoyer au compte'), 'is-sec']] : []), ['file', T('⤓ Enregistrer le fichier .lcnda-panier'), 'is-pri']]});
        if (!r.key) return;
        const include = [...r.form.querySelectorAll('[name="inc"]:checked')].map(i => Number(i.value));
        try {
            if (r.key === 'send') { if (!r.form.acc.value) { toast(T('Choisis un compte.'), 'error'); return; } const x = await post('pn_share_send', {basket_id: b.id, include, account_id: Number(r.form.acc.value)}); toast(T('✉ Envoyé ({n} éléments)', {n: x.counts.sent ?? (x.counts.public + x.counts.personal)}) + (x.counts.notes ? ' · ' + T('{n} note(s) non envoyée(s)', {n: x.counts.notes}) : '')); return; }
            const x = await post('pn_share_build', {basket_id: b.id, include});
            st.lastShare = x.share;
            download(new Blob([JSON.stringify(x.share, null, 1)], {type: 'application/json'}), x.fname);
            toast(T('⇪ Fichier prêt : {n} éléments ({p} de ton arbre)', {n: x.share.items.length, p: x.counts.personal}));
        } catch (e) { toast(e.message, 'error'); }
    }
    /* ═════ ⇩ récupérer : aperçu ✓/✗, doublons, dossier au choix ═════ */
    async function importText(text, name = '') {
        if (text.length > 2000000) { toast(T('Fichier refusé : vide ou trop gros (2 Mo au plus).'), 'error'); return; }
        let pv; try { pv = await post('pn_share_preview', {body: text}); } catch (e) { toast(e.message, 'error'); return; }
        const ex = new Set(pv.items.map((it, i) => (it.dup ? i : -1)).filter(i => i >= 0));
        const rowsHtml = () => pv.items.map((it, i) => `<li class="pn-rr${ex.has(i) ? ' is-ex' : ''}"><span class="pn-yn"><button type="button" class="is-y" data-pn-iy="${i}" aria-pressed="${!ex.has(i)}" aria-label="${esc(T('Garder'))}">✓</button><button type="button" class="is-n" data-pn-in="${i}" aria-pressed="${ex.has(i)}" aria-label="${esc(T('Écarter'))}">✗</button></span><span class="pn-rtx"><b>${esc(it.title)}</b><small>${esc([it.value, it.origin?.label].filter(Boolean).join(' · '))}</small>${it.dup ? `<small class="pn-dup">⧉ ${esc(T('déjà dans « {b} »', {b: it.dup}))}</small>` : ''}</span></li>`).join('');
        const r = await dlg({title: T('⇩ Récupérer « {n} »', {n: pv.name}), wide: true,
            body: `<p>${esc(T('{n} éléments. Garde ✓ ou écarte ✗ chacun ; ce qui est déjà dans tes paniers est écarté d’avance.', {n: pv.items.length}))}${name ? ` <span class="pn-mini">(${esc(name)})</span>` : ''}</p><ul class="pn-rl" data-pn-irows>${rowsHtml()}</ul>
                <div class="pn-flds"><label class="pn-f">${esc(T('Dans'))}<select name="to"><option value="new">${esc(T('un nouveau panier'))}</option>${st.baskets.filter(b => !b.archived).map(b => `<option value="${b.id}">${esc(T('le panier « {n} »', {n: pathOf(b)}))}</option>`).join('')}</select></label>
                <label class="pn-f">${esc(T('Nom'))}<input type="text" name="name" value="${esc(pv.name)}" maxlength="120"></label><label class="pn-f">${esc(T('Dossier'))}<select name="folder">${folderOpts(0)}</select></label></div>`,
            buttons: [['', T('Annuler'), 'is-ter'], ['ok', T('⇩ Récupérer les éléments gardés'), 'is-pri']],
            bindIt: d => d.querySelector('[data-pn-irows]').addEventListener('click', e => { const y = e.target.closest('[data-pn-iy]'), n = e.target.closest('[data-pn-in]'); if (!y && !n) return; const i = Number((y || n).dataset[y ? 'pnIy' : 'pnIn']); if (y) ex.delete(i); else ex.add(i); d.querySelector('[data-pn-irows]').innerHTML = rowsHtml(); })});
        if (r.key !== 'ok') return;
        const keepI = pv.items.map((_, i) => i).filter(i => !ex.has(i)), to = r.form.to.value;
        try {
            const x = keep(await post('pn_share_import', {body: text, keep: keepI, ...(to === 'new' ? {name: r.form.name.value, folder_id: Number(r.form.folder.value)} : {basket_id: Number(to)})}));
            select('b', x.basket_id); await refresh();
            undoToast(T('⇩ {n} éléments récupérés ({s} déjà dedans, sautés)', {n: x.ids.length, s: x.skipped}), {undo: async () => { if (x.new) await post('basket_delete', {basket_id: x.basket_id}); else await post('basket_remove', {ids: x.ids}); await refresh(); }});
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ═════ 🔍 la recherche qui crée un panier ═════ */
    function openSearch(target = null, q = '') {
        st.view = 'search'; st.s = {q: q || '', und: null, groups: [], miss: [], target: target ? Number(target) : null, running: false, folder: Number(bOf(target)?.folder_id || (st.sel?.t === 'f' ? st.sel.id : bOf(st.sel?.id)?.folder_id) || 0), name: ''};
        st.treeOpen = false; paintTree(); paintStrip(); paintMain();
        if (q) runSearch(q); else setTimeout(() => root()?.querySelector('[data-pn-q]')?.focus(), 30);
    }
    const EXAMPLES = ['les événements militaires à 4 km autour du château de Rochefière', 'ce qu’a pu voir Jean MAZAUD entre 10 et 12 ans dans le ciel, la mer ou sur terre', 'les naissances de la famille LACOMBE à Treignac entre 1780 et 1800'];
    function paintSearch() {
        const R = root(), s = st.s, u = s.und, tb = s.target ? bOf(s.target) : null;
        const n = s.groups.reduce((a, g) => a + g.rows.filter(r => r.on && !r.dup).length, 0), dupN = s.groups.reduce((a, g) => a + g.rows.filter(r => r.dup).length, 0);
        const chip = (k, l, on, th = null) => `<button type="button" class="pn-chip" data-pn-cat="${k}" aria-pressed="${on}"${th?.label ? ` title="${esc(`${th.icon} ${T(th.label)}`)}" data-pn-theme="${esc(th.id)}"` : ''}>${esc(l)}</button>`; // 🗂 le thème des listes de la sorte
        const und = u ? `<div class="pn-box pn-und"><h4>${esc(T('Ce que j’ai compris'))} <small>${esc(T('tout se change : touche une pastille'))}</small></h4>
            <div class="pn-crow"><span class="pn-cl">${esc(T('Qui'))}</span><div class="pn-cv"><input class="pn-in" type="text" data-pn-u="who" value="${esc(u.who?.name || u.surname || '')}" placeholder="${esc(T('personne ou nom de famille'))}" aria-label="${esc(T('Qui'))}">${u.whoInfo ? `<small>${esc(u.whoInfo)}</small>` : ''}</div></div>
            <div class="pn-crow"><span class="pn-cl">${esc(T('Quand / âge'))}</span><div class="pn-cv">${u.who ? `<span>${esc(T('entre'))}</span><input class="pn-num" type="number" min="0" max="120" data-pn-u="a1" value="${u.age?.[0] ?? ''}" aria-label="${esc(T('âge de'))}"><span>${esc(T('et'))}</span><input class="pn-num" type="number" min="0" max="120" data-pn-u="a2" value="${u.age?.[1] ?? ''}" aria-label="${esc(T('âge à'))}"><span>${esc(T('ans'))}</span>` : ''}
                <span>${esc(T('de'))}</span><input class="pn-num" type="number" data-pn-u="y1" value="${u.years?.[0] ?? ''}" aria-label="${esc(T('de l’année'))}"><span>${esc(T('à'))}</span><input class="pn-num" type="number" data-pn-u="y2" value="${u.years?.[1] ?? ''}" aria-label="${esc(T('à l’année'))}">${u.span ? `<small>${esc(u.span)}</small>` : ''}</div></div>
            <div class="pn-crow"><span class="pn-cl">${esc(T('Où + rayon'))}</span><div class="pn-cv"><input class="pn-in" type="text" data-pn-u="where" value="${esc(u.around?.name || u.place?.name || '')}" placeholder="${esc(T('un lieu, un château…'))}" aria-label="${esc(T('Où'))}"><span class="pn-rad"><button type="button" data-pn-km="-1" aria-label="${esc(T('moins loin'))}">−</button><span>${esc(T('{n} km', {n: u.km ?? 0}))}</span><button type="button" data-pn-km="1" aria-label="${esc(T('plus loin'))}">＋</button></span>${u.whereInfo ? `<small>${esc(u.whereInfo)}</small>` : ''}</div></div>
            <div class="pn-crow"><span class="pn-cl">${esc(T('Quoi'))}</span><div class="pn-cv">${u.tree ? `<span class="pn-chip is-fixed">${esc(T(u.tree.label))}</span>` : ''}${C().SMART.map(c => chip(c.k, `${c.icon} ${T(c.label)}`, u.cats.includes(c.k), C().themeOf?.(c.k))).join('')}</div></div>
            <div class="pn-crow"><span class="pn-cl">${esc(T('Sources'))}</span><div class="pn-cv"><small>${esc(s.sources || '—')}</small></div></div></div>` : '';
        const nope = u?.nope?.length ? `<div class="pn-box pn-nope"><h4>${esc(T('Ce que je n’ai pas compris (ou pas pu chercher)'))}</h4><ul>${u.nope.map(x => `<li>${esc(T(x))}</li>`).join('')}</ul></div>` : '';
        const miss = s.miss.length ? `<div class="pn-box pn-missb"><h4>${esc(T('Il manque des listes'))}</h4><ul>${s.miss.map((m, i) => `<li><span>${esc(T('La liste « {l} » n’est pas installée.', {l: m.label}))}</span><button type="button" class="pn-b is-sec is-sm" data-pn-install="${i}">⤓ ${esc(T('l’installer'))}</button></li>`).join('')}</ul></div>` : '';
        const res = s.groups.length ? `<div class="pn-box pn-res"><h4>${esc(T('Ce que j’ai trouvé'))} <small>${esc(T('✓ garder · ✗ écarter, par élément ou par groupe'))}</small></h4>${s.groups.map((g, gi) => { const all = g.rows.length && g.rows.every(r => r.on || r.dup);
            return `<div class="pn-grp"><div class="pn-gh2"><span class="pn-yn"><button type="button" class="is-y" data-pn-gy="${gi}" aria-pressed="${all}" aria-label="${esc(T('Tout garder'))}">✓</button><button type="button" class="is-n" data-pn-gn="${gi}" aria-pressed="${g.rows.length > 0 && g.rows.every(r => !r.on)}" aria-label="${esc(T('Tout écarter'))}">✗</button></span><b>${esc(g.label)}</b><span class="pn-c">${g.rows.length}</span>${g.src ? `<code>${esc(g.src)}</code>` : ''}</div>
                ${g.rows.length ? `<ul class="pn-rl">${g.rows.map((r, ri) => `<li class="pn-rr${r.on && !r.dup ? '' : ' is-ex'}" data-pn-row="${gi}:${ri}"><span class="pn-yn"><button type="button" class="is-y" data-pn-ry="${gi}:${ri}" aria-pressed="${r.on && !r.dup}" aria-label="${esc(T('Garder'))}"${r.dup ? ' disabled' : ''}>✓</button><button type="button" class="is-n" data-pn-rn="${gi}:${ri}" aria-pressed="${!r.on || !!r.dup}" aria-label="${esc(T('Écarter'))}"${r.dup ? ' disabled' : ''}>✗</button></span><span class="pn-ico" aria-hidden="true">${esc(icoOf(r.it))}</span><span class="pn-rtx"><b>${esc(r.it.title)}</b><small>${esc([r.it.value, r.it.data?.km != null ? T('{n} km', {n: r.it.data.km}) : ''].filter(Boolean).join(' · ').slice(0, 220))}</small>${r.dup ? `<small class="pn-dup">${esc(T('déjà dedans'))}</small>` : ''}</span></li>`).join('')}</ul>` : `<div class="pn-gempty">${esc(g.empty || T('Rien trouvé.'))}</div>`}</div>`; }).join('')}</div>` : '';
        R.querySelector('[data-pn-main]').innerHTML = `<div class="pn-ssh"><h3>🔍 ${esc(tb ? T('↻ Refaire la recherche de « {n} »', {n: tb.name}) : T('Créer un panier par une recherche'))}</h3><p>${esc(T('Écris ce que tu cherches, comme tu le dirais. Je montre ce que j’ai compris ; tu gardes ✓ ou écartes ✗ chaque résultat. Rien n’entre dans un panier sans ton clic.'))}</p></div>
            <form class="pn-ssin" data-pn-sform><input type="text" data-pn-q value="${esc(s.q)}" placeholder="${esc(T('ex. les batailles à 10 km de Tulle'))}" aria-label="${esc(T('Ce que tu cherches'))}"><button type="submit" class="pn-b is-pri">${esc(s.running ? T('Je cherche…') : T('Chercher'))}</button><button type="button" class="pn-b is-ter" data-pn-a="search-close">${esc(T('Fermer'))}</button></form>
            <div class="pn-ex"><span>${esc(T('Essaie :'))}</span>${EXAMPLES.map(e => `<button type="button" class="pn-chip" data-pn-exq="${esc(e)}">${esc(T(e))}</button>`).join('')}</div>
            ${und}${nope}${miss}${res}`;
        const F = R.querySelector('[data-pn-foot]');
        if (!s.groups.length) { F.innerHTML = ''; F.hidden = true; return; }
        F.hidden = false;
        F.innerHTML = tb ? `<div class="pn-cnt"><b>${esc(T('{n} nouveaux gardés', {n}))}</b><span class="pn-mini">${esc(dupN ? T('{n} déjà dedans (sautés)', {n: dupN}) : '')}</span></div><button type="button" class="pn-b is-pri" data-pn-a="s-add" data-pn-to="${tb.id}"${n ? '' : ' disabled'}>＋ ${esc(T('Ajouter les {n} à « {b} »', {n, b: tb.name}))}</button>`
            : `<div class="pn-cnt"><b>${esc(T('{n} éléments gardés', {n}))}</b></div><input type="text" class="pn-in" data-pn-sname value="${esc(s.name || u?.name || '')}" aria-label="${esc(T('Nom du panier'))}" maxlength="120"><select class="pn-in" data-pn-sfolder aria-label="${esc(T('Dossier'))}">${folderOpts(s.folder)}</select>
                <button type="button" class="pn-b is-pri" data-pn-a="s-create"${n ? '' : ' disabled'}>${esc(T('Créer le panier « {b} » ({n})', {b: s.name || u?.name || T('Panier'), n}))}</button>
                ${st.baskets.length ? `<select class="pn-in" data-pn-sto aria-label="${esc(T('Panier existant'))}">${basketOpts(s.to || bOf(st.sel?.id)?.id)}</select><button type="button" class="pn-b is-sec" data-pn-a="s-add"${n ? '' : ' disabled'}>＋ ${esc(T('Ajouter à ce panier'))}</button>` : ''}`;
    }
    const listsAll = () => ext.connexions?.kit?.listsAll?.() || (ext.dataListsEngine?.list?.() || []).filter(d => !d.link);
    async function installed(d) { if (!d.installed) return true; try { return !!(await d.installed()); } catch (_) { return false; } }
    /** les listes d'une sorte : celles de la sorte + celles ajoutées par d'autres fichiers (LCNDA_EXT.paniersSources : [{cat, list}]) */
    const listsFor = c => [...(ext.paniersSources || []).filter(x => x.cat === c.k).map(x => x.list), ...c.lists, ...(c.merged ? [c.merged] : [])]; // en dernier : la liste réunie du thème (🔀)
    /** comprendre, chercher, montrer (aussi « ↻ Refaire » : seulement ce qui n'est pas déjà dans le panier visé) */
    async function runSearch(q, und = null) {
        const s = st.s; if (!s) return;
        s.q = q; s.running = true; paintSearch();
        const u = und || C().parseSmart(q);
        u.name = u.name || nameFor(u);
        try { await resolve(u); s.und = u; await collect(u); }
        catch (e) { toast(e.message, 'error'); }
        s.running = false; if (st.view === 'search') paintSearch();
    }
    function nameFor(u) {
        if (u.tree && u.surname) return `${T(u.tree.label).replace(/^\S+\s/u, '').split(',')[0].replace(/^./, c => c.toUpperCase())} ${u.surname}${u.place ? ' ' + T('à') + ' ' + u.place.name : ''}${u.years ? ` ${u.years[0]}–${u.years[1]}` : ''}`;
        if (u.who && u.age) return T('Ce que {p} a pu voir à {a}–{b} ans', {p: u.who.name, a: u.age[0], b: u.age[1]});
        if (u.around && u.cats.length) return `${u.cats.every(k => C().SMART.find(c => c.k === k).w === 'militaire') ? T('Militaire') : C().SMART.find(c => c.k === u.cats[0]).label.replace(/^./, c => c.toUpperCase())} ${T('autour de')} ${u.around.name.replace(/^(château|chateau|église|eglise) (de |du |d’|d')?/i, '')}`;
        return String(u.text).slice(0, 80);
    }
    /** qui (une personne de l'arbre : sa naissance, ses lieux à cet âge), où (un lieu de la base, ou un château des listes) */
    async function resolve(u) {
        u.whoInfo = ''; u.whereInfo = ''; u.span = ''; u.center = null; u.person = null;
        if (u.who?.name) {
            const r = await api('picker_search', {kind: 'person', q: u.who.name, limit: 5}).catch(() => ({}));
            const p = (r.groups || []).flatMap(g => g.items || [])[0];
            if (p) {
                const d = await api('person', {id: p.id}).catch(() => null);
                const evs = d?.events || [], birth = evs.find(e => ['BIRT', 'BAPM', 'CHR'].includes(e.gedcom_tag) && e.sort_date);
                u.person = {id: Number(p.id), name: p.title, birth: birth?.sort_date || '', birthPlace: birth?.place_name || ''};
                if (birth && u.age) { const sp = C().ageSpan(birth.sort_date, u.age); u.years = [sp.y1, sp.y2]; u.spanDates = sp; u.span = T('du {a} au {b}', {a: sp.from, b: sp.to}); }
                const lived = evs.filter(e => e.place_name && e.year && u.years && Number(e.year) <= u.years[1] && Number(e.year) >= (u.years[0] - 30)).map(e => e.place_name);
                const where = lived.at(-1) || birth?.place_name || '';
                u.whoInfo = T('{p}, né le {d} à {l}', {p: p.title, d: birth?.date_text || '?', l: birth?.place_name || '?'}) + (where && where !== birth?.place_name ? ' · ' + T('à cet âge : {l}', {l: where}) : '');
                if (where && !u.around && !u.place) { u.place = {name: where, auto: true}; }
            } else u.whoInfo = T('Personne de ce nom dans ton arbre.');
        }
        const wname = u.around?.name || u.place?.name;
        if (wname) {
            let c = null;
            if (/chateau|ch[aâ]teau|tour|abbaye|eglise/i.test(fold(wname))) { // un édifice : cherché dans les listes (châteaux, monuments)
                const bare = fold(wname).replace(/^(le |la |l )?(chateau|tour|abbaye|eglise)( de | du | des | d )?/, '').trim();
                for (const id of listsFor(C().SMART.find(x => x.k === 'chat')).concat(['lp_merimee'])) {
                    const d = listsAll().find(x => x.id === id); if (!d || !(await installed(d))) continue;
                    try { const pg = await ext.dataListsEngine.fetchPage(d, {q: bare, crit: [], period: null, near: null}, 0, 5); const row = pg.rows.find(r => d.geo?.(r)?.[0] != null); if (row) { const g = d.geo(row); c = {lat: Number(g[0]), lon: Number(g[1]), title: row.name || wname, from: d.label}; break; } } catch (_) {}
                }
            }
            if (!c) { const p = await placeLL(wname.replace(/^(le |la |l')?(château|chateau|église|eglise) (de |du |d’|d')?/i, '')); if (p) c = {...p, from: T('ta base')}; }
            u.center = c;
            u.whereInfo = c ? T('centre : {t} ({f})', {t: c.title, f: T(c.from || '')}) : T('lieu introuvable : {l}', {l: wname});
            if (u.km == null && u.around) u.km = 10;
        }
        return u;
    }
    async function collect(u) {
        const s = st.s, groups = [], miss = [], srcs = new Set();
        const inTarget = new Set(s.target ? itemsOf(s.target).map(x => C().sameKey(x)) : []), seen = new Set();
        const row = it => { const k = C().sameKey(it); if (seen.has(k)) return null; seen.add(k); return {it, on: true, dup: inTarget.has(k) || (s.target && (bOf(s.target)?.live?.ex || []).includes(k))}; };
        // l'arbre : naissances, mariages, décès d'un nom, d'un lieu, d'une période (cx_search + les événements de picker_search)
        if (u.tree && u.surname) {
            srcs.add(T('ton arbre'));
            const evs = [], persons = [];
            const r0 = await api('cx_search', {q: [u.surname, u.place?.name].filter(Boolean).join(' ')}).catch(() => ({base: []}));
            (r0.base || []).forEach(g => (g.items || []).forEach(x => (g.kind === 'event' ? evs : g.kind === 'person' ? persons : []).push(x)));
            for (let off = 0; off < 600; off += 200) { const r = await api('picker_search', {kind: 'event', q: u.surname, limit: 200, offset: off}).catch(() => ({})); const its = (r.groups || []).flatMap(g => g.items || []); evs.push(...its); if (its.length < 200) break; }
            const ok = e => u.tree.tags.includes(e.tag) && (!u.years || (Number(e.year) >= u.years[0] && Number(e.year) <= u.years[1])) && (!u.place || fold(e.place).includes(fold(u.place.name))) && String(e.who || '').split(/\s+/).some(w => C().nameMatch(w, u.surname));
            const rows = []; const byId = new Set();
            evs.filter(ok).sort((a, b) => Number(a.year) - Number(b.year)).forEach(e => { if (byId.has(e.id)) return; byId.add(e.id); const r = row(pickToItem('event', e)); if (r) rows.push(r); });
            groups.push({key: 'arbre', label: `👤 ${T('Dans ton arbre')}`, src: T('personnes et événements'), rows, empty: T('Rien dans ton arbre pour ce nom, ce lieu et ces années.')});
            const acts = (r0.base || []).filter(g => g.kind === 'act').flatMap(g => g.items || []).map(x => row(pickToItem('act', x))).filter(Boolean);
            if (acts.length) groups.push({key: 'acte', label: `📜 ${T('Actes pas encore reliés')}`, src: T('actes'), rows: acts});
            void persons;
        }
        // les listes de données, une sorte après l'autre
        for (const k of u.cats) {
            const c = C().SMART.find(x => x.k === k); if (!c) continue;
            const ids = listsFor(c), all = listsAll(), ds = ids.map(id => all.find(x => x.id === id)).filter(Boolean);
            const label = `${c.icon} ${T(c.label).replace(/^./, x => x.toUpperCase())}`;
            if (!ds.length) { groups.push({key: k, label, rows: [], empty: c.missingText ? T(c.missingText) : T('Pas de liste pour cela dans l’app.')}); continue; }
            let d = null; for (const x of ds) { if (await installed(x)) { d = x; break; } }
            if (!d) { miss.push({label: T(ds[0].label), d: ds[0]}); groups.push({key: k, label, src: ds[0].id, rows: [], empty: T('La liste « {l} » n’est pas installée.', {l: T(ds[0].label)})}); continue; }
            srcs.add(T(d.label));
            const local = (c.local || c.near) && u.center;
            const state = {q: c.q && d.id === 'lp_merimee' ? '' : '', crit: [], period: u.years ? {mode: 'overlap', from: u.years[0], to: u.years[1]} : null, near: local ? {lat: u.center.lat, lon: u.center.lon, km: c.km && !u.around ? c.km : (u.km || c.km || 10), title: u.center.title} : null, sort: local ? '_km' : '', dir: 'asc'};
            if (!u.years && !local) { groups.push({key: k, label, src: d.id, rows: [], empty: T('Dis-moi quand (des années, ou l’âge d’une personne).')}); continue; }
            let rows = [];
            try { const pg = await ext.dataListsEngine.fetchPage(d, state, 0, 80); rows = pg.rows || []; } catch (e) { groups.push({key: k, label, src: d.id, rows: [], empty: e.message}); continue; }
            if (c.only) rows = rows.filter(r => Object.entries(c.only).every(([f, v]) => fold(r[f]) === fold(T(v)) || fold(r[f]) === fold(v)));
            if (c.k === 'cas') rows = rows.filter(r => /caserne|fort|rempart|citadelle|tour|chateau|enceinte|gendarmerie/.test(fold(Object.values(r).join(' '))));
            const out = rows.slice(0, 40).map(r => { const it = ext.connexions?.kit?.ldRowItem ? ext.connexions.kit.ldRowItem(d, state, r) : {kind: 'row', title: String(r.name || ''), value: '', data: {}, origin: {kind: 'list', id: d.id, label: d.label}};
                const g = d.geo?.(r), p = d.period?.(r);
                it.data = {...(it.data || {}), cat: ['bat', 'com', 'aur', 'ecl', 'cie', 'sei', 'vol', 'inn', 'mar', 'tem'].includes(k) ? 'evt' : ['cas', 'mon', 'chat', 'mh'].includes(k) ? 'lieu' : 'donnee', y: Array.isArray(p) && p[0] != null ? Number(p[0]) : (r.year ?? null), km: r._km ?? null,
                    lat: g?.[0] ?? null, lon: g?.[1] ?? null, place: r.place || r.commune || r.lieu || r.city || '', licence: d.source || '', source: d.label};
                delete it._v; return row(it); }).filter(Boolean);
            groups.push({key: k, label, src: d.id, rows: out, empty: local ? T('Rien à moins de {n} km.', {n: state.near.km}) : T('Rien ces années-là.')});
        }
        s.groups = groups; s.miss = miss; s.sources = [...srcs].join(' · ');
        return groups;
    }
    const keptItems = () => st.s.groups.flatMap(g => g.rows.filter(r => r.on && !r.dup).map(r => cleanIt(r.it)));
    const queryOf = u => ({text: u.text, und: {who: u.who, age: u.age, years: u.years, km: u.km, around: u.around, place: u.place, surname: u.surname, tree: u.tree, cats: u.cats}});
    async function searchCreate() {
        const s = st.s, R = root(), name = R.querySelector('[data-pn-sname]')?.value.trim() || s.und?.name || T('Panier'), folder = Number(R.querySelector('[data-pn-sfolder]')?.value || 0);
        const items = keptItems(); if (!items.length) return;
        const r = keep(await post('pn_create', {name, icon: C().SMART.find(c => c.k === s.und?.cats?.[0])?.icon || (s.und?.tree ? '👶' : '🔍'), folder_id: folder, query: queryOf(s.und), items}));
        select('b', r.id); await refresh();
        undoToast(T('🧺 Panier « {n} » créé ({c} éléments)', {n: name, c: r.ids.length}), {undo: async () => { await post('basket_delete', {basket_id: r.id}); await refresh(); }});
    }
    async function searchAdd(to) {
        const s = st.s, items = keptItems(); if (!items.length || !bOf(to)) return;
        const r = await post('basket_add', {basket_id: to, items});
        await post('pn_log', {basket_id: to, label: T('{n} ajoutés par la recherche « {q} » ({s} déjà dedans)', {n: r.ids.length, q: s.q.slice(0, 80), s: r.skipped}), undo: {op: 'basket_remove', body: {ids: r.ids}}});
        if (s.target && !bOf(to).query) await post('pn_meta', {basket_id: to, query: queryOf(s.und)});
        if (bOf(to)?.live) await post('pn_meta', {basket_id: to, live: {...bOf(to).live, news: [], last: new Date().toISOString().slice(0, 10)}});
        select('b', to); await refresh();
        undoToast(T('{n} ajoutés dans « {b} » ({s} déjà dedans, sautés)', {n: r.ids.length, b: bOf(to)?.name || '', s: r.skipped}), {undo: async () => { await post('basket_remove', {ids: r.ids}); await refresh(); }});
    }
    function redo(b) { const q = b.query; if (!q?.text) return; openSearch(b.id, q.text); }

    /* ═════ 🔄 le panier vivant : refait sa recherche (chaque semaine, ou sur demande) ; « Me demander d'abord » par défaut ═════ */
    async function liveRun(b, {quiet = false} = {}) {
        if (!b?.query?.text || kiosk()) return;
        const keepS = st.s, keepV = st.view;
        st.s = {q: b.query.text, groups: [], miss: [], target: b.id};
        try { const u = C().parseSmart(b.query.text); Object.assign(u, b.query.und || {}); await resolve(u); await collect(u); } catch (_) { st.s = keepS; return; }
        const news = keptItems(); st.s = keepS; st.view = keepV;
        const L = {...(b.live || {mode: 'ask'}), last: new Date().toISOString().slice(0, 10)};
        if ((L.mode || 'ask') === 'auto' && news.length) {
            const r = await post('basket_add', {basket_id: b.id, items: news});
            await post('pn_log', {basket_id: b.id, label: T('🔄 {n} nouveautés ajoutées toutes seules', {n: r.ids.length}), undo: {op: 'basket_remove', body: {ids: r.ids}}});
            await post('pn_meta', {basket_id: b.id, live: {...L, news: []}});
            if (!quiet) undoToast(T('🔄 {n} nouveautés ajoutées dans « {b} »', {n: r.ids.length, b: b.name}), {undo: async () => { await post('basket_remove', {ids: r.ids}); await refresh(); }});
        } else await post('pn_meta', {basket_id: b.id, live: {...L, news: news.slice(0, 200)}});
        await refresh();
        if (!quiet && !news.length) toast(T('Rien de nouveau pour « {b} ».', {b: b.name}));
    }
    async function liveCheck() {
        const old = Date.now() - 7 * 864e5;
        for (const b of st.baskets.filter(x => x.live && x.query?.text && !x.archived && !(Date.parse(x.live.last || '') > old)).slice(0, 3)) { try { await liveRun(b, {quiet: true}); } catch (_) {} }
    }
    async function newsDecide(b, ok) {
        const L = b.live || {}, news = L.news || [];
        const kept = ok ? news.filter(x => !x._ex).map(cleanIt) : [], ex = [...new Set([...(L.ex || []), ...news.filter(x => !ok || x._ex).map(x => C().sameKey(x))])].slice(-2000);
        let r = {ids: []};
        if (kept.length) { r = await post('basket_add', {basket_id: b.id, items: kept}); await post('pn_log', {basket_id: b.id, label: T('🔄 {n} nouveautés ajoutées', {n: r.ids.length}), undo: {op: 'basket_remove', body: {ids: r.ids}}}); }
        await post('pn_meta', {basket_id: b.id, live: {...L, news: [], ex}});
        await refresh();
        if (kept.length) undoToast(T('{n} ajoutés dans « {b} »', {n: r.ids.length, b: b.name}), {undo: async () => { await post('basket_remove', {ids: r.ids}); await refresh(); }});
    }

    /* ═════ les clics, le clavier, le glisser ═════ */
    function bind(R) {
        R.addEventListener('click', async e => {
            const t = e.target.closest('button, [data-pn-b], [data-pn-f], input[type="checkbox"]'); if (!t || !R.contains(t)) return;
            const d = t.dataset, b = bOf(st.sel?.id) && st.sel?.t === 'b' ? bOf(st.sel.id) : null, f = st.sel?.t === 'f' ? fOf(st.sel.id) : null;
            const write = () => { if (kiosk()) { toast(T('Mode consultation : rien ne peut être modifié.')); return false; } return true; };
            try {
                if (d.pnTw) { const c = closed(); const k = Number(d.pnTw); c.has(k) ? c.delete(k) : c.add(k); writeJ(CLOSED, [...c]); paintTree(); return; }
                if (d.pnB && !t.matches('button')) { select('b', d.pnB); paint(); return; }
                if (d.pnF !== undefined && !t.matches('button') && Number(d.pnF)) { select('f', d.pnF); paint(); return; }
                if (d.pnOpen) { select('b', d.pnOpen); paint(); return; }
                if (d.pnSadd) { if (write()) await ideaAdd(d.pnSadd); return; }
                if (d.pnSno) { ideaNo(d.pnSno); return; }
                if (d.pnStt) { if (write()) await cycleStatus(d.pnStt); return; }
                if (d.pnX) { if (write()) await removeItems([Number(d.pnX)]); return; }
                if (d.pnUp || d.pnDown) { if (!write()) return; const ids = C().arrange(itemsOf(b.id), {k: 'main'})[0].items.map(x => Number(x.id)), id = Number(d.pnUp || d.pnDown), i = ids.indexOf(id), j = i + (d.pnUp ? -1 : 1); if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; await reorder(b, ids); return; }
                if (d.pnFpick) { folderPickSync(t); return; }
                if (d.pnG) { const s = C().normSort(b.sort), c = new Set(s.closed); c.has(d.pnG) ? c.delete(d.pnG) : c.add(d.pnG); await meta(b, {sort: {...s, closed: [...c]}}); return; }
                if (d.pnView) { await meta(b, {view: d.pnView}); return; }
                if (d.pnLive) { await meta(b, {live: {...(b.live || {}), mode: d.pnLive}}, d.pnLive === 'auto' ? T('Panier vivant : ajouter tout seul') : T('Panier vivant : me demander d’abord')); return; }
                if (d.pnNwy || d.pnNwn) { const i = Number(d.pnNwy || d.pnNwn); b.live.news[i]._ex = !!d.pnNwn; paintMain(); return; }
                if (d.pnCat) { const u = st.s.und; u.cats = u.cats.includes(d.pnCat) ? u.cats.filter(k => k !== d.pnCat) : [...u.cats, d.pnCat]; await runSearch(st.s.q, u); return; }
                if (d.pnKm) { const u = st.s.und; u.km = Math.max(1, (u.km || 10) + Number(d.pnKm) * ((u.km || 10) >= 10 ? 5 : 1)); await runSearch(st.s.q, u); return; }
                if (d.pnExq) { await runSearch(d.pnExq); return; }
                if (d.pnInstall) { const m = st.s.miss[Number(d.pnInstall)]; try { await m.d.install?.(null); } catch (err) { toast(err.message, 'error'); } return; }
                if (d.pnGy || d.pnGn) { const g = st.s.groups[Number(d.pnGy || d.pnGn)]; g.rows.forEach(r => { r.on = !!d.pnGy; }); paintSearch(); return; }
                if (d.pnRy || d.pnRn) { const [gi, ri] = (d.pnRy || d.pnRn).split(':').map(Number); st.s.groups[gi].rows[ri].on = !!d.pnRy; paintSearch(); return; }
                const a = d.pnA; if (!a) return;
                if (a === 'tree') { st.treeOpen = !st.treeOpen; paintTree(); return; }
                if (a === 'archopen') { st.archOpen = !st.archOpen; paintTree(); return; }
                if (a === 'strip') { st.stripOpen = !st.stripOpen; paintStrip(); return; }
                if (a === 'stripall') { st.stripAll = true; paintStrip(); return; }
                if (a === 'ideas-off') { ideasOff(); return; }
                if (a === 'search') { openSearch(); return; }
                if (a === 'search-close') { st.view = 'basket'; paint(); return; }
                if (a === 'import') { if (write()) R.querySelector('[data-pn-file]').click(); return; }
                if (a === 'pick') { st.pick = !st.pick; st.picked = new Set(); paintMain(); return; }
                if (!write()) return;
                if (a === 'newf') return newFolder(f ? f.id : 0);
                if (a === 'newb') return newBasket(f ? f.id : Number(b?.folder_id || 0));
                if (a === 'fnewb') return newBasket(f.id);
                if (a === 'fnewf') return newFolder(f.id);
                if (a === 'frename') { const n = await askText(T('Renommer le dossier'), f.name); if (!n) return; const r = await post('folder_edit', {folder_id: f.id, name: n, icon: f.icon}); await refresh(); undoToast(T('Dossier renommé'), {undo: async () => { await post('folder_edit', r.before); await refresh(); }}); return; }
                if (a === 'fdel') { const r = await dlg({title: T('Supprimer le dossier « {n} »', {n: f.name}), body: `<p>${esc(T('Que faire de ce qu’il contient ?'))}</p>`, buttons: [['', T('Annuler'), 'is-ter'], ['up', T('Garder les paniers (ils remontent d’un niveau)'), 'is-sec'], ['all', T('Tout supprimer'), 'is-pri']]}); if (!r.key) return;
                    const x = await post('folder_delete', {folder_id: f.id, mode: r.key}); st.sel = null; await refresh(); undoToast(T('Dossier « {n} » supprimé', {n: f.name}), {undo: async () => { await post('folder_undelete', x); await refresh(); }}); return; }
                if (a === 'fput') { const ids = [...R.querySelectorAll('[data-pn-fb]:checked')].map(i => Number(i.dataset.pnFpick.slice(1))), its = st.baskets.flatMap(x => itemsOf(x.id)).filter(x => ids.includes(Number(x.id))); ext.connexions?.putInto?.(its, {anchor: t}); return; }
                if (!b) return;
                if (a === 'pin') return metaUndo(b, {pinned: !b.pinned}, b.pinned ? T('Panier désépinglé') : T('★ Panier épinglé en haut de l’arbre'));
                if (a === 'unarch') return metaUndo(b, {archived: false}, T('Panier désarchivé'));
                if (a === 'due') return dueDlg(b);
                if (a === 'dests') return destsDlg(b);
                if (a === 'rename') { const n = await askText(T('Renommer le panier'), b.name); if (!n || n === b.name) return; const r = await post('basket_edit', {basket_id: b.id, name: n, icon: b.icon, color: b.color, note: b.note, folder_id: b.folder_id, dests: b.dests});
                    await post('pn_log', {basket_id: b.id, label: T('Renommé (« {a} » → « {b} »)', {a: b.name, b: n}), undo: {op: 'basket_edit', body: {basket_id: b.id, ...r.before}}}); await refresh(); undoToast(T('Panier renommé'), {undo: async () => { await post('basket_edit', {basket_id: b.id, ...r.before}); await refresh(); }}); return; }
                if (a === 'dup') return duplicate(b, null, t);
                if (a === 'share') return shareDlg(b);
                if (a === 'more') return moreMenu(b, t);
                if (a === 'sort') return sortMenu(b, t);
                if (a === 'sort-main') return meta(b, {sort: {...C().normSort(b.sort), k: 'main', then: ''}});
                if (a === 'redo') return redo(b);
                if (a === 'live-on') return metaUndo(b, {live: {mode: 'ask', news: [], last: new Date().toISOString().slice(0, 10)}}, T('🔄 Panier vivant : il refait sa recherche chaque semaine'));
                if (a === 'live-off') return metaUndo(b, {live: null}, T('Panier vivant arrêté (il garde sa recherche)'));
                if (a === 'live-run') return liveRun(b);
                if (a === 'news-ok') return newsDecide(b, true);
                if (a === 'news-no') return newsDecide(b, false);
                if (a === 'putall' || a === 'sel-put') { const its = a === 'putall' ? itemsOf(b.id) : selItems(); if (!its.length) return toast(T('Rien à mettre.'));
                    ext.connexions?.putInto?.(its, {anchor: t, dests: b.dests, onDone: async () => { const todo = its.filter(x => C().statusOf(x) !== 'utilise').map(x => Number(x.id)); if (todo.length) await setStatus(todo, 'utilise'); }}); return; }
                if (a === 'sel-move') { const ids = selIds(), others = st.baskets.filter(x => Number(x.id) !== Number(b.id) && !x.archived);
                    UI().menuAt?.(t, others.map(x => ({icon: x.icon || '🧺', label: pathOf(x), run: () => moveItems(ids, x.id)})), {title: T('Dans quel panier ?')}); return; }
                if (a === 'sel-dup') return duplicate(b, selIds());
                if (a === 'sel-status') { const ids = selIds(); UI().menuAt?.(t, C().STATUSES.map(([k, ic, l]) => ({icon: ic, label: T(l), run: () => setStatus(ids, k)})), {title: T('Statut')}); return; }
                if (a === 'sel-x') return removeItems(selIds());
                if (a === 's-create') return searchCreate();
                if (a === 's-add') return searchAdd(Number(d.pnTo || R.querySelector('[data-pn-sto]')?.value || 0));
            } catch (err) { toast(err.message || String(err), 'error'); }
        });
        R.addEventListener('submit', e => { const fm = e.target.closest('[data-pn-sform]'); if (!fm) return; e.preventDefault(); const q = fm.querySelector('[data-pn-q]').value.trim(); if (q) runSearch(q); });
        R.addEventListener('change', async e => {
            const t = e.target;
            if (t.matches('[data-pn-note]')) { if (!kiosk()) try { await saveNote(Number(t.dataset.pnNote), t.value.trim()); } catch (err) { toast(err.message, 'error'); } return; }
            if (t.matches('[data-pn-file]')) { const file = t.files?.[0]; t.value = ''; if (!file) return; if (file.size > 2000000) { toast(T('Fichier refusé : vide ou trop gros (2 Mo au plus).'), 'error'); return; } importText(await file.text(), file.name); return; }
            if (t.matches('[data-pn-u]') && st.s?.und) { const u = st.s.und, k = t.dataset.pnU, v = t.value.trim();
                if (k === 'who') { if (u.tree) u.surname = v; else u.who = v ? {name: v} : null; }
                if (k === 'a1' || k === 'a2') { u.age = [Number(R.querySelector('[data-pn-u="a1"]').value) || 0, Number(R.querySelector('[data-pn-u="a2"]').value) || 0]; }
                if (k === 'y1' || k === 'y2') { const y1 = Number(R.querySelector('[data-pn-u="y1"]').value), y2 = Number(R.querySelector('[data-pn-u="y2"]').value); u.years = y1 && y2 ? [Math.min(y1, y2), Math.max(y1, y2)] : null; u.age = k ? u.age : null; }
                if (k === 'where') { if (u.around) u.around = v ? {name: v} : null; else u.place = v ? {name: v} : null; }
                await runSearch(st.s.q, u); return; }
            if (t.matches('[data-pn-sname]')) { st.s.name = t.value.trim(); paintSearch(); return; }
            if (t.matches('[data-pn-sfolder]')) { st.s.folder = Number(t.value); return; }
            if (t.matches('[data-pn-sto]')) { st.s.to = Number(t.value); }
        });
        let findT = 0;
        R.addEventListener('input', e => { if (!e.target.matches('[data-pn-find]')) return; clearTimeout(findT); const v = e.target.value; findT = setTimeout(() => { st.find = v; st.picked = new Set(); paintMain(); const i = root()?.querySelector('[data-pn-find]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200); });
        R.addEventListener('keydown', e => { const r = e.target.closest?.('.pn-tr'); if (r && (e.key === 'Enter' || e.key === ' ') && !e.target.matches('button')) { e.preventDefault();
            // l'arbre se redessine : le focus revient sur la même ligne (sinon, au clavier, on repart du haut de la page)
            const key = r.dataset.pnB !== undefined ? `[data-pn-b="${r.dataset.pnB}"]` : r.dataset.pnF !== undefined ? `[data-pn-f="${r.dataset.pnF}"]` : '';
            r.click(); if (key) [0, 120, 400].forEach(ms => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected) R.querySelector(`[data-pn-tree] .pn-tr${key}`)?.focus(); }, ms)); } });
        // ⋮⋮ glisser : un élément (ordre, ou sur un panier de l'arbre), un panier ou un dossier sur un dossier
        let drag = null;
        // bouton enfoncé sur une ligne qu'on peut glisser : on ne redessine pas non plus (le glisser commence au premier mouvement ; si la ligne est remplacée entre-temps, il ne part jamais et reste coincé)
        R.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest?.('[draggable="true"]')) st.pressing = true; }, true);
        if (!st.pressHook) { st.pressHook = true; const unpress = () => { if (!st.pressing) return; st.pressing = false; if (!st.dragging && st.paintLater) { st.paintLater = false; paintStrip(); if (st.view === 'basket') paintMain(); } };
            document.addEventListener('pointerup', unpress, true); addEventListener('blur', unpress); }
        R.addEventListener('dragstart', e => { const it = e.target.closest?.('[data-pn-i]'), bb = e.target.closest?.('.pn-tr[data-pn-b]'), ff = e.target.closest?.('.pn-tr[data-pn-f]');
            drag = it ? {t: 'i', id: Number(it.dataset.pnI)} : bb ? {t: 'b', id: Number(bb.dataset.pnB)} : ff ? {t: 'f', id: Number(ff.dataset.pnF)} : null; if (!drag) return;
            e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', `${drag.t}:${drag.id}`); } catch (_) {} (it || bb || ff).classList.add('is-dragging'); st.dragging = true;
            (it || bb || ff).addEventListener('dragend', () => { if (st.dragging) { st.dragging = false; st.pressing = false; drag = null; if (st.paintLater) { st.paintLater = false; paintStrip(); if (st.view === 'basket') paintMain(); } } }, {once: true}); }); // (même si la ligne a été redessinée entre-temps)
        R.addEventListener('dragend', () => { R.querySelectorAll('.is-dragging, .is-drop, .is-over').forEach(x => x.classList.remove('is-dragging', 'is-drop', 'is-over')); drag = null; st.dragging = false; st.pressing = false;
            if (st.paintLater) { st.paintLater = false; paintStrip(); if (st.view === 'basket') paintMain(); } });
        const targetOf = e => { if (!drag) return null; const fr = e.target.closest?.('.pn-tr[data-pn-f]'), br = e.target.closest?.('.pn-tr[data-pn-b]'), ir = e.target.closest?.('[data-pn-i]');
            if (drag.t === 'i' && br && Number(br.dataset.pnB) !== Number(st.sel?.id)) return br; if (drag.t === 'i' && ir && Number(ir.dataset.pnI) !== drag.id) return ir; if ((drag.t === 'b' || drag.t === 'f') && fr) return fr; return null; };
        R.addEventListener('dragover', e => { const x = targetOf(e); R.querySelectorAll('.is-drop, .is-over').forEach(y => { if (y !== x) y.classList.remove('is-drop', 'is-over'); }); if (!x) return; e.preventDefault(); x.classList.add(x.matches('[data-pn-i]') ? 'is-over' : 'is-drop'); });
        R.addEventListener('drop', async e => { const x = targetOf(e), dr = drag; if (!x || !dr) return; e.preventDefault(); drag = null; R.querySelectorAll('.is-drop, .is-over').forEach(y => y.classList.remove('is-drop', 'is-over')); if (kiosk()) return;
            try {
                if (dr.t === 'i' && x.matches('[data-pn-b]')) { const ids = st.picked.has(dr.id) ? [...st.picked] : [dr.id]; await moveItems(ids, Number(x.dataset.pnB)); return; }
                if (dr.t === 'i' && x.matches('[data-pn-i]')) { const b = bOf(st.sel.id), ids = C().arrange(itemsOf(b.id), {k: 'main'})[0].items.map(y => Number(y.id)).filter(y => y !== dr.id); ids.splice(ids.indexOf(Number(x.dataset.pnI)), 0, dr.id); await reorder(b, ids); return; }
                if (dr.t === 'b') { await moveBasket(dr.id, Number(x.dataset.pnF)); return; }
                if (dr.t === 'f') { await moveFolder(dr.id, Number(x.dataset.pnF)); }
            } catch (err) { toast(err.message, 'error'); } });
    }

    /* ═════ les réglages : Réglages → Panier et connexions → « 💡 Idées » (heritage-connexions.js appelle settingsHtml / bindSettings) ═════ */
    function settingsHtml() {
        const s = settings(), K = UI().toggleHtml;
        const tg = (k, label, sub) => (K ? `<div class="cx-tg">${K(T(label), {checked: !!s[k], attrs: `data-pn-set="${k}"`, sub: T(sub)})}</div>` : `<label class="checkbox-line"><input type="checkbox" data-pn-set="${k}" ${s[k] ? 'checked' : ''}> ${esc(T(label))}</label>`);
        return `<div class="maintenance-panel pn-settings"><h3>🧺 ${esc(T('Paniers'))}</h3>${tg('ideas', '💡 Montrer des idées de choses à mettre dans mes paniers', 'Les idées ne sont que des propositions : rien n’entre dans un panier sans ton clic.')}
            ${tg('top', 'en haut de l’onglet Paniers', 'toutes les idées, repliables')}${tg('inside', 'dans chaque panier ouvert', 'les siennes')}
            <p class="muted"><small>${esc(T('Jamais dans la pastille 🧺. Une idée écartée par « ✕ Pas utile » ne revient pas.'))} <button type="button" class="link-button" data-pn-set-reset>${esc(T('Revoir les idées écartées'))}</button></small></p></div>`;
    }
    function bindSettings(host) {
        host.querySelectorAll('[data-pn-set]').forEach(el => { const inp = el.matches('input') ? el : el.querySelector('input'); (inp || el).addEventListener('change', e => { const k = el.dataset.pnSet, v = !!(e.target.checked ?? inp?.checked); const before = readJ(SET, {}); writeJ(SET, {...settings(), [k]: v});
            undoToast(v ? T('Activé') : T('Éteint'), {undo: () => { writeJ(SET, before); ext.connexions?.redrawSettings?.(); }}); }); });
        host.querySelector('[data-pn-set-reset]')?.addEventListener('click', () => { writeJ(NOPE, []); toast(T('Les idées écartées pourront revenir.')); });
    }

    /* l'onglet allumé : « ⛶ en grand » du panier ouvre l'onglet (la pastille 🧺 et « Prendre depuis… » restent) */
    function hookBasketView() {
        const cx = ext.connexions; if (!cx?.openBasketView || cx.openBasketView.__pn) return !!cx;
        const orig = cx.openBasketView;
        cx.openBasketView = function (...a) { if (tabOn() && A().setModule) { A().setModule('paniers'); return Promise.resolve(); } return orig.apply(this, a); };
        cx.openBasketView.__pn = true; return true;
    }
    if (!hookBasketView()) document.addEventListener('DOMContentLoaded', () => setTimeout(hookBasketView, 0), {once: true});

    ext.paniers = {render, settingsHtml, bindSettings, refresh: () => (root() ? refresh() : null), openSearch: q => { if (A().state?.module !== 'paniers') { A().setModule?.('paniers'); setTimeout(() => openSearch(null, q), 600); } else openSearch(null, q); },
        importText, sheetHtml: id => sheetHtml(bOf(id)), _st: st};
})();
