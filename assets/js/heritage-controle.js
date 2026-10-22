/* LCNDA — ✅ Contrôle de la base (F3, design A validé le 21/10/2026 ; maquette « controle-coherence-designs »).
 * Une seule page dans Maintenance → Qualité des données : la liste qui réunit les anciens écrans « Incohérences avancées »,
 * « Âges et écarts », la liste des doublons, « Lieux mal placés » et « Voyages impossibles » (leurs adresses mènent ici,
 * filtrées). Filtres en pastilles (sortes, gravités, 🙈 Exceptions), barre H10 (Chercher, Filtrer ▾ branche / Sosa /
 * descendants, Liste | Fiches, Trier), ⤓ CSV, « ▶ Une à une », « Ce n'est pas une erreur » (raison + note), « ↺ Signaler
 * de nouveau », ⚙️ Seuils du contrôle (K2), un widget « ✅ Contrôle de la base » (remplace « Incohérences et conflits » et
 * « Voyages impossibles ») et le bandeau « ⚠️ N choses à vérifier » sur la fiche. Serveur : lib/controle.php.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.maintenance = ext.maintenance || {};
    ext.dashboard = ext.dashboard || {};
    ext.graphStats = ext.graphStats || {};
    ext.afterPerson = ext.afterPerson || [];
    ext.afterUpkeep = ext.afterUpkeep || [];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const toast = (...a) => A().toast(...a);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, one, many) => A().plural ? A().plural(n, one, many) : `${fmt(n)} ${n > 1 ? many || one + 's' : one}`;
    const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

    const SORTS = {dates: ['📅', 'Dates'], ages: ['🎂', 'Âges'], parents: ['👪', 'Parents'], doublons: ['👥', 'Doublons'], lieux: ['📍', 'Lieux']};
    const LEVELS = {red: ['🔴', 'Impossible'], orange: ['🟠', 'À vérifier'], yellow: ['🟡', 'Curieux']};
    const SUBS = {misplaced: 'Lieux mal placés', journeys: 'Voyages impossibles', baptism: 'Baptême loin', conflicting: 'Lieux contradictoires'};
    const FKEY = 'lcnda-controle-filtres';
    const filt = () => ({sort: 'all', level: '', sub: '', ...ls(FKEY, {})});
    const setFilt = o => lsSet(FKEY, {...filt(), ...o});
    /** Pistes « 💡 Souvent : … » du mode une à une */
    const HINTS = {
        'after-father-death': 'une mauvaise année de décès (1862 au lieu de 1882 ?), ou un homonyme pris pour le père. Regarde l’acte de décès du père.',
        'after-mother-death': 'une erreur de date, ou la mère confondue avec une homonyme (une tante, une cousine). Regarde l’acte de naissance de l’enfant.',
        'old-mother': 'une génération confondue (la grand-mère prise pour la mère), ou une année mal lue.',
        'old-father': 'un père et un fils homonymes confondus.',
        'young-parent': 'une génération sautée, ou une année mal lue.',
        'parent-after-child': 'les parents et l’enfant inversés, ou une mauvaise année.',
        'marriage-after-death': 'une mauvaise date de décès, ou le mariage d’un homonyme.',
        'death-before-birth': 'deux dates inversées, ou une année mal recopiée.',
        'impossible-date': 'un chiffre mal lu (31 au lieu de 21) ou un mois mal recopié.',
        'lifespan': 'la naissance d’un parent prise pour la sienne, ou un homonyme.',
        'close-births': 'des jumeaux mal datés, ou un enfant rattaché aux mauvais parents.',
        'sibling-span': 'deux générations mélangées : un père et son fils homonymes.',
        'duplicate': 'la même personne saisie deux fois : compare les deux fiches avant de les fusionner.',
        'misplaced': 'une commune homonyme d’un autre département, ou des coordonnées inversées.',
        'journey': 'deux homonymes confondus dans une seule fiche.',
        'baptism-far': 'une commune homonyme d’un autre département.',
        'sosa-sex': 'le sexe de la fiche mal saisi, ou la personne mise à la mauvaise place dans l’arbre.',
        'burial-before-death': 'les deux dates inversées.',
    };
    /** Raisons proposées dans « Ce n'est pas une erreur », selon la sorte */
    const REASONS = {
        common: ['J’ai vérifié dans l’acte : c’est bien ça', 'C’est rare, mais c’est vrai (cas connu dans la famille)', 'La date est approximative (« vers… »)'],
        doublons: ['Ce sont deux personnes différentes'], lieux: ['Le lieu est juste'], journeys: ['Ce sont bien les mêmes dates et lieux'], parents: ['Enfant posthume'], ages: ['Remariage tardif'],
    };

    /* ─── petits morceaux ─── */
    const nm = p => p ? (`${p.first_name || ''} ${String(p.last_name || '').toUpperCase()}`.trim() || 'Personne sans nom') : '?';
    const yrs = p => p && (p.birth_year || p.death_year) ? `${p.birth_year || ''}–${p.death_year || ''}` : '';
    const ini = p => (String(p.first_name || '').trim()[0] || '') + (String(p.last_name || '').trim()[0] || '') || '?';
    const av = p => { const old = `<span class="pk-av ${p.gender === 'male' ? 'm' : p.gender === 'female' ? 'f' : 'u'}" aria-hidden="true">${esc(ini(p).toUpperCase())}</span>`; return UI()?.avatarOr ? UI().avatarOr({...p, name: nm(p)}, 22, old) : old; };
    const personChip = (p, extra = '') => p ? `<span class="pk-chip ctl-chip">${av(p)}<span><b>${esc(nm(p))}</b>${yrs(p) ? ` <small>${esc(yrs(p))}</small>` : ''}${p.sosa ? ` <small class="ctl-sosa">Sosa ${fmt(p.sosa)}</small>` : ''}${extra}</span><button type="button" class="go" data-open-person="${Number(p.id)}" title="Ouvrir la fiche">↗ Fiche</button></span>` : '';
    const placeChip = pl => pl ? `<span class="pk-chip ctl-chip"><span class="pk-ic pin" aria-hidden="true"><span>●</span></span><span><b>${esc(pl.name || 'Lieu')}</b>${pl.county ? ` <small>${esc(pl.county)}</small>` : ''}</span>${pl.lat || pl.lon ? `<button type="button" class="go" data-ctl-map="${Number(pl.id)}" title="Voir sur la carte">🗺</button>` : ''}</span>` : '';
    const sortBadge = s => SORTS[s] ? `<span class="ui-badge is-grey ctl-sort">${SORTS[s][0]} ${esc(SORTS[s][1])}</span>` : '';
    const levelOf = l => LEVELS[l] || LEVELS.yellow;

    function goControle(f = {}) {
        setFilt({sort: 'all', level: '', sub: '', ...f});
        const st = S(); st.maintenanceTab = 'controle'; st.ctlOne = false;
        if (st.module === 'maintenance') {
            try { const h = A().moduleHash('maintenance'); A().saveLastRoute?.(h); A().updateBrowserRoute?.(h, true, 'maintenance'); } catch (_) {}
            A().renderSidebar?.(); A().renderMaintenance?.();
        } else A().setModule('maintenance');
    }
    ext.openControle = goControle;

    let DATA = null, loading = null;
    async function load(fresh = false) {
        loading = api('controle', fresh ? {fresh: 1} : {});
        try { DATA = await loading; } finally { loading = null; }
        return DATA;
    }
    const later = new Set(); // « Plus tard » : à la fin de la file, pour cette session

    /* ═══════════ La page « ✅ Contrôle de la base » ═══════════ */
    let shown = 20, scopeIds = null, scopeKey = '';
    ext.maintenance.controle = async (token, opts = {}) => {
        const ws = A().$('#workspace');
        if (!opts.keep) ws.innerHTML = `<section class="page ctl-page">${UI().spinner('Contrôle de la base…')}</section>`;
        try { await load(!!opts.fresh); } catch (error) { ws.innerHTML = `<section class="page">${UI().notice('error', error.message)}</section>`; return; }
        if (token !== S().workspaceToken || S().module !== 'maintenance' || S().maintenanceTab !== 'controle') return;
        if (S().ctlOne) return renderOne(token);
        renderPage(token);
    };
    function counts(list) {
        const c = {all: list.length, sorts: {}, levels: {}, subs: {}};
        list.forEach(a => { c.sorts[a.sort] = (c.sorts[a.sort] || 0) + 1; c.levels[a.level] = (c.levels[a.level] || 0) + 1; if (a.sub) c.subs[a.sub] = (c.subs[a.sub] || 0) + 1; });
        return c;
    }
    const matchQ = (a, q) => {
        if (!q) return true;
        const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const hay = fold([a.title, a.detail, a.place?.name, ...(a.people || []).map(id => nm(DATA.people[id]))].join(' '));
        return fold(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
    };
    /** La liste filtrée par la barre H10 et la branche (sans les pastilles sorte / gravité). */
    function baseList(bar) {
        const st = bar?.state || {q: '', filters: {}};
        let list = DATA.alerts.filter(a => matchQ(a, st.q));
        if (scopeIds) list = list.filter(a => a.people.some(id => scopeIds.has(id)));
        return list;
    }
    function applyPills(list, f) {
        return list.filter(a => (f.sort === 'all' || a.sort === f.sort) && (!f.level || a.level === f.level) && (!f.sub || a.sub === f.sub));
    }
    function sorted(list, sort) {
        const lv = {red: 0, orange: 1, yellow: 2}, so = {parents: 0, dates: 1, ages: 2, doublons: 3, lieux: 4};
        const name = a => nm(DATA.people[a.people[0]]) || a.place?.name || a.title;
        const out = list.slice();
        if (sort === 'sort') out.sort((x, y) => so[x.sort] - so[y.sort] || lv[x.level] - lv[y.level]);
        else if (sort === 'az') out.sort((x, y) => name(x).localeCompare(name(y), 'fr'));
        else if (sort === 'za') out.sort((x, y) => name(y).localeCompare(name(x), 'fr'));
        else out.sort((x, y) => lv[x.level] - lv[y.level] || so[x.sort] - so[y.sort]);
        return out;
    }
    async function setScope(st) {
        const v = st.filters.scope || '', d = st.filters.desc;
        const key = d && d.id ? `desc:${Number(d.id)}` : v;
        if (key === scopeKey) return;
        scopeKey = key;
        scopeIds = key ? new Set(((await api('controle_scope', {scope: key})).ids || []).map(Number)) : null;
    }

    function rowHtml(a, i) {
        const [ic] = levelOf(a.level);
        const ppl = a.people.map(id => personChip(DATA.people[id])).join('');
        const checks = a.checks ? `<div class="ctl-checks">${a.checks.map(([k, t]) => `<span class="ctl-check is-${k === 'ok' ? 'ok' : k === 'no' ? 'no' : 'q'}">${k === 'ok' ? '✓' : k === 'no' ? '✗' : '?'} ${esc(t)}</span>`).join('')}</div>` : '';
        const fixBtn = a.sort === 'doublons' ? `<button type="button" class="button small secondary" data-ctl-compare="${i}">⚖️ Comparer</button>`
            : a.check === 'misplaced' ? `<button type="button" class="button small secondary" data-ctl-place="${i}">✎ ${a.suggest ? 'Corriger' : 'Placer sur la carte'}</button>`
            : a.fix?.event_id ? `<button type="button" class="button small secondary" data-ctl-fix="${i}">✎ Corriger</button>`
            : a.people[0] ? `<button type="button" class="button small secondary" data-open-person="${a.people[0]}">↗ Ouvrir</button>` : '';
        return `<article class="ctl-row is-${esc(a.level)}" data-ctl-i="${i}" data-ctx-menu>
            <div class="ctl-row-main"><h3><span class="ctl-lvl" title="${esc(levelOf(a.level)[1])}">${ic}</span> ${esc(a.title)} ${sortBadge(a.sort)}${a.score ? ` ${UI().badge(a.score + ' %', 'yellow')}` : ''}${a.returned ? ` ${UI().badge('Dates changées', 'yellow', {title: 'Tu l’avais écartée, mais une des dates en cause a changé'})}` : ''}</h3>
            ${a.detail ? `<p class="ctl-detail">${esc(a.detail)}</p>` : ''}${checks}
            ${ppl || a.place ? `<div class="ctl-chips">${ppl}${placeChip(a.place)}</div>` : ''}</div>
            <div class="ctl-row-acts">${fixBtn}<button type="button" class="button small secondary" data-ctl-dismiss="${i}">Ce n’est pas une erreur</button></div></article>`;
    }
    function excRowHtml(e, i) {
        const p = e.people.map(id => DATA.people[id]).filter(Boolean);
        const open = e.sort === 'doublons' && p.length > 1 ? `<button type="button" class="button small secondary" data-ctl-ecompare="${i}">⚖️ Comparer</button>` : p[0] ? `<button type="button" class="button small secondary" data-open-person="${p[0].id}">↗ Fiche</button>` : '';
        return `<article class="ctl-row is-exc" data-ctl-e="${i}" data-ctx-menu><div class="ctl-row-main"><h3>${esc(e.title)} ${UI().badge('Écartée', 'grey')}${e.status === 'changed' ? ' ' + UI().badge('Dates changées', 'yellow') : e.status === 'gone' ? ' ' + UI().badge('Plus d’alerte', 'green', {title: 'Le contrôle ne trouve plus ce problème'}) : ''}</h3>
            <p class="ctl-detail">« ${esc(e.reason)} »${e.note ? ` · ${esc(e.note)}` : ''} · ${UI().when ? UI().when(e.at) : esc(e.at)}</p>
            ${p.length || e.place ? `<div class="ctl-chips">${p.map(x => personChip(x)).join('')}${placeChip(e.place)}</div>` : ''}</div>
            <div class="ctl-row-acts">${open}<button type="button" class="button small secondary" data-ctl-again="${i}">↺ Signaler de nouveau</button></div></article>`;
    }
    const cardsOf = (list) => UI().cardsHtml(list.map((a, i) => ({
        thumb: `<span class="ui-card-ico">${levelOf(a.level)[0]}</span>`, name: a.title, open: a.people[0] ? `data-open-person="${a.people[0]}"` : `data-ctl-dismiss="${i}"`, openLabel: a.people[0] ? '↗ Fiche' : 'Pas une erreur',
        lines: [a.detail || '', a.people.map(id => nm(DATA.people[id])).concat(a.place ? [a.place.name] : []).join(' · ')], badges: [{text: SORTS[a.sort][1], kind: 'grey'}],
        menu: [a.fix?.event_id ? `<button type="button" data-ctl-fix="${i}">✎ Corriger</button>` : '', `<button type="button" data-ctl-dismiss="${i}">Ce n’est pas une erreur</button>`].filter(Boolean),
    })), {size: 's'});

    let bar = null, current = [];
    function renderPage(token) {
        const ws = A().$('#workspace');
        const f = filt();
        const isExc = f.sort === 'exceptions';
        const branches = DATA.branches || [];
        const prev = bar?.state;
        ws.innerHTML = `<section class="page ctl-page">${UI().pageHeader({title: 'Contrôle de la base', icon: '✅', attrs: 'data-ph-title',
            help: 'Ce qui semble impossible ou très rare dans tes fiches : souvent une faute de frappe, un homonyme ou de mauvais parents. Rien n’est changé sans toi.',
            primary: '<button type="button" class="button" data-ctl-one>▶ Une à une</button>',
            actions: ['<button type="button" class="button secondary" data-ctl-csv>⤓ Exporter en CSV</button>'],
            more: ['<button type="button" data-ctl-seuils>⚙️ Seuils du contrôle</button>', '<button type="button" data-ctl-print>🖨 Imprimer la liste</button>', '<button type="button" data-ctl-refresh>↻ Relancer le contrôle</button>', '<button type="button" data-ctl-stats>📊 Moyennes de la famille</button>']})}
            <div class="ui-filters ctl-pills" data-ctl-pills></div><div class="ctl-subpills" data-ctl-subs></div>
            <div data-ctl-bar></div><div class="ctl-checked" data-ctl-checked></div><div data-ctl-map></div><div class="ctl-list" data-ctl-list></div><div data-ctl-more></div></section>`;
        bar = UI().listBar({key: 'maintenance:controle', search: {placeholder: 'Chercher… (nom, contrôle, lieu)'},
            filters: [{id: 'scope', label: 'Branche', type: 'select', dflt: '', options: [['', 'Toute la base'], ['sosa', 'Mes ancêtres (Sosa)', 'Mes ancêtres (Sosa)'], ...branches.map(b => [`branch:${b.id}`, `${b.name} (${plural(Number(b.n), 'fiche')})`, `Branche ${b.name}`])]},
                {id: 'desc', group: 'Branche', label: 'Descendants de…', type: 'person', allowFree: false, chipPrefix: 'Descendants de'}],
            view: {dflt: 'list', what: 'alertes'}, sort: {options: [['level', 'Gravité'], ['sort', 'Sorte'], ['az', 'Nom A → Z'], ['za', 'Nom Z → A']], value: 'level'},
            onChange: async (st, {what}) => { if (what === 'filter' || what === 'clear') { await setScope(st); } shown = 20; draw(); }});
        A().$('[data-ctl-bar]').appendChild(bar);
        void prev;
        A().$('[data-ctl-checked]').innerHTML = `Contrôlé ${UI().when ? UI().when(DATA.checked_at) : esc(DATA.checked_at)}`;
        setScope(bar.state).then(draw);
        bindPage(ws, token);
        function draw() {
            if (!ws.isConnected) return;
            const f2 = filt(), exc = f2.sort === 'exceptions';
            const base = baseList(bar), c = counts(base), withSort = applyPills(base, {...f2, level: '', sub: ''});
            const lc = counts(withSort);
            const pill = (attrs, label, n, on) => `<button type="button" ${attrs} class="${on ? 'is-active' : ''}">${label}${n !== null ? ` <span class="ctl-n">(${fmt(n)})</span>` : ''}</button>`;
            A().$('[data-ctl-pills]').innerHTML = pill('data-ctl-sort="all"', 'Tout', c.all, f2.sort === 'all')
                + Object.entries(SORTS).map(([k, [ic, l]]) => pill(`data-ctl-sort="${k}"`, `${ic} ${l}`, c.sorts[k] || 0, f2.sort === k)).join('')
                + '<span class="ctl-pill-sep"></span>' + Object.entries(LEVELS).map(([k, [ic, l]]) => pill(`data-ctl-level="${k}" title="${esc(l)}"`, ic, lc.levels[k] || 0, f2.level === k)).join('')
                + '<span class="ctl-pill-sep"></span>' + pill('data-ctl-sort="exceptions"', '🙈 Exceptions', DATA.exceptions.length, exc);
            A().$('[data-ctl-subs]').innerHTML = f2.sort === 'lieux' ? `<div class="ui-filters is-small">${pill('data-ctl-sub=""', 'Tous les lieux', c.sorts.lieux || 0, !f2.sub)}${Object.entries(SUBS).filter(([k]) => c.subs[k]).map(([k, l]) => pill(`data-ctl-sub="${k}"`, esc(l), c.subs[k], f2.sub === k)).join('')}</div>` : '';
            const list = A().$('[data-ctl-list]'), more = A().$('[data-ctl-more]');
            A().$('[data-ctl-one]').disabled = exc;
            if (exc) {
                const q = bar.state.q;
                current = DATA.exceptions.filter(e => matchQ({title: e.title, detail: e.reason + ' ' + e.note, people: e.people, place: e.place}, q));
                bar.setCount(current.length, 'exception');
                list.innerHTML = current.length ? current.slice(0, shown).map(excRowHtml).join('') : A().emptyState({icon: '🙈', text: 'Aucune alerte écartée', hint: '« Ce n’est pas une erreur » sur une ligne la range ici, avec sa raison : tu pourras toujours la signaler de nouveau.'});
                A().$('[data-ctl-map]').innerHTML = '';
            } else {
                current = sorted(applyPills(base, f2), bar.state.sort);
                bar.setCount(current.length, 'chose à vérifier', 'choses à vérifier');
                const page = current.slice(0, shown);
                list.innerHTML = current.length ? (bar.state.view === 'cards' ? cardsOf(page) : page.map(rowHtml).join(''))
                    : A().emptyState({icon: '✅', text: DATA.alerts.length ? 'Rien avec ces filtres' : 'Rien à vérifier', hint: DATA.alerts.length ? 'Retire un filtre pour revoir les autres alertes.' : 'Aucune incohérence trouvée dans tes fiches. Bravo !'});
                // la carte des lieux, au-dessus de la liste, quand « 📍 Lieux » est choisi
                const pts = f2.sort === 'lieux' ? current.filter(a => a.place && (a.place.lat || a.place.lon)).slice(0, 200).map(a => ({lat: a.place.lat, lon: a.place.lon, label: a.place.name, color: a.level === 'red' ? '#c62828' : '#b5523b'})) : [];
                A().$('[data-ctl-map]').innerHTML = pts.length && ext.miniMap ? `<section class="maintenance-panel ctl-map">${ext.miniMap(pts, [], {height: 280})}</section>` : '';
            }
            more.innerHTML = '';
            const rest = current.length - shown;
            if (rest > 0) { const b = UI().moreButton({remaining: rest, step: 20, feminine: true, onClick: () => { shown += 20; draw(); }}); more.appendChild(b); }
            A().bindTableLinks();
        }
        renderPage.draw = draw;
    }
    function bindPage(ws, token) {
        const redraw = () => renderPage.draw?.();
        ws.addEventListener('click', async e => {
            const t = e.target.closest('button'); if (!t || !ws.contains(t)) return;
            const d = t.dataset;
            if (d.ctlSort !== undefined) { setFilt({sort: d.ctlSort, sub: '', level: d.ctlSort === 'exceptions' ? '' : filt().level}); shown = 20; return redraw(); }
            if (d.ctlLevel !== undefined) { const f = filt(); setFilt({level: f.level === d.ctlLevel ? '' : d.ctlLevel, sort: f.sort === 'exceptions' ? 'all' : f.sort}); shown = 20; return redraw(); }
            if (d.ctlSub !== undefined) { setFilt({sub: d.ctlSub}); shown = 20; return redraw(); }
            if (d.ctlOne !== undefined) return startOne();
            if (d.ctlCsv !== undefined) return exportCsv();
            if (d.ctlSeuils !== undefined) { S().maintenanceTab = 'controle_seuils'; return A().setModule('maintenance'); }
            if (d.ctlPrint !== undefined) return UI().printPage ? UI().printPage('Contrôle de la base', {element: '.ctl-list'}) : null;
            if (d.ctlRefresh !== undefined) return ext.maintenance.controle(++S().workspaceToken, {fresh: true});
            if (d.ctlStats !== undefined) { S().graphStatsType = 'family_averages'; S().graphMode = 'stats'; return A().setModule('graphiques'); }
            if (d.ctlFix !== undefined) return correct(current[Number(d.ctlFix)]);
            if (d.ctlPlace !== undefined) return fixPlace(current[Number(d.ctlPlace)], () => ext.maintenance.controle(++S().workspaceToken, {keep: true}));
            if (d.ctlCompare !== undefined) { const a = current[Number(d.ctlCompare)]; return compare(a.people[0], a.people[1]); }
            if (d.ctlEcompare !== undefined) { const x = current[Number(d.ctlEcompare)]; return compare(x.people[0], x.people[1]); }
            if (d.ctlDismiss !== undefined) return dismiss(current[Number(d.ctlDismiss)], () => ext.maintenance.controle(++S().workspaceToken, {keep: true}));
            if (d.ctlAgain !== undefined) return again(current[Number(d.ctlAgain)], () => ext.maintenance.controle(++S().workspaceToken, {keep: true}));
            if (d.ctlMap !== undefined) { const a = current.find(x => Number(x.place?.id) === Number(d.ctlMap)); if (a?.place) showOnMap(a.place); }
        });
    }
    function showOnMap(pl) {
        if (!ext.miniMap) return;
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">LIEU</span><h2>${esc(pl.name)}</h2></div><button class="icon-button" value="cancel" aria-label="Fermer">×</button></div><div class="h-dialog-body">${ext.miniMap([{lat: pl.lat, lon: pl.lon, label: pl.name, color: '#c62828'}], [], {height: 300})}<p>${esc(fmtCoord(pl.lat))}, ${esc(fmtCoord(pl.lon))}</p></div><div class="modal-actions"><span class="spacer"></span><button class="button" value="ok">Fermer</button></div></form>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }
    const fmtCoord = v => Number(v || 0).toLocaleString('fr-FR', {maximumFractionDigits: 4});
    function compare(a, b) {
        if (ext.openCompare) return ext.openCompare(Number(a), Number(b));
        S().maintenanceTab = 'duplicates'; A().setModule('maintenance');
    }

    /** ✎ Corriger : la fiche, puis l'événement en cause ouvert (la date à changer). */
    async function correct(a) {
        if (!a) return;
        const pid = Number(a.fix?.person_id || a.people[0]), eid = Number(a.fix?.event_id || 0);
        if (!pid) return;
        const already = S().module === 'personnes' && Number(S().currentPersonId) === pid;
        if (!already) A().openPersonById(pid);
        if (!eid) return;
        for (let i = 0; i < 60; i++) {
            const b = document.querySelector(`#workspace [data-edit-event="${eid}"]`);
            if (b && (already || i > 1)) { b.click(); return; }
            await new Promise(r => setTimeout(r, 100));
        }
        toast('Ouvre l’événement dans la fiche pour corriger sa date.');
    }
    /** Lieu mal placé : appliquer la suggestion (↶ Annuler), sinon choisir la bonne commune. */
    async function fixPlace(a, after) {
        const pl = a.place; if (!pl) return;
        const apply = async (lat, lon, insee, label) => {
            await api('fix_place', {}, {method: 'POST', body: {id: pl.id, lat, lon, insee: insee || ''}});
            A().undoToast(`Lieu corrigé : ${pl.name} (${label})`, {undo: async () => { await api('fix_place', {}, {method: 'POST', body: {id: pl.id, lat: pl.lat, lon: pl.lon}}); after?.(); }, redo: async () => { await api('fix_place', {}, {method: 'POST', body: {id: pl.id, lat, lon, insee: insee || ''}}); after?.(); }});
            after?.();
        };
        if (a.suggest) { try { await apply(a.suggest.lat, a.suggest.lon, a.suggest.insee, a.suggest.why); } catch (error) { toast(error.message, 'error'); } return; }
        const it = await A().openPicker({kind: 'place', title: `La bonne commune pour « ${pl.name} »`, eyebrow: 'PLACER SUR LA CARTE', label: 'Choisis la commune : ses coordonnées seront reprises'});
        if (!it) return;
        if (it.lat == null || it.lon == null) return toast('Ce lieu n’a pas de coordonnées : choisis une commune de la liste.', 'error');
        try { await apply(it.lat, it.lon, '', it.title || it.name || ''); } catch (error) { toast(error.message, 'error'); }
    }

    /** « Ce n'est pas une erreur » : une raison selon la sorte, une note, « me le signaler à nouveau si une date change ». */
    function dismiss(a, after) {
        if (!a) return;
        const extra = a.check === 'journey' ? REASONS.journeys : a.sort === 'doublons' || a.check === 'misplaced' ? REASONS[a.sort] : a.check === 'old-marriage' ? REASONS.ages : a.check === 'after-father-death' ? REASONS.parents : [];
        const reasons = a.sort === 'doublons' || a.check === 'misplaced' ? extra : [...REASONS.common, ...extra];
        const people = a.people.map(id => nm(DATA?.people?.[id] || {})).join(' → ');
        const dlg = document.createElement('dialog'); dlg.className = 'modal small-modal ctl-dismiss';
        dlg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">CONTRÔLE DE LA BASE</span><h2>Ce n’est pas une erreur ?</h2></div><button class="icon-button" type="button" data-x aria-label="Fermer">×</button></div>
            <div class="h-dialog-body"><p class="ctl-detail">${levelOf(a.level)[0]} ${esc(a.title)}${people ? ` · ${esc(people)}` : ''}</p>
            <fieldset class="ctl-reasons"><legend>Pourquoi ?</legend>${reasons.map((r, i) => `<label class="ctl-reason"><input type="radio" name="reason" value="${esc(r)}"${i === 0 ? ' checked' : ''}> ${esc(r)}</label>`).join('')}<label class="ctl-reason"><input type="radio" name="reason" value=""> Autre raison…</label></fieldset>
            <input name="other" placeholder="Ta raison" hidden maxlength="200">
            <label class="ctl-note">Note (facultatif)<input name="note" maxlength="1000" placeholder="acte n° 42, registre de Naves 1863"></label>
            ${a.dates?.length || a.sort === 'lieux' || a.sort === 'doublons' ? `<label class="checkbox-line"><input type="checkbox" name="watch" checked> Me le signaler à nouveau si une de ces ${a.sort === 'lieux' ? 'coordonnées' : 'dates'} change</label>` : ''}</div>
            <div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-x>Annuler</button><button type="submit" class="button">Ne plus signaler</button></div></form>`;
        document.body.appendChild(dlg);
        const form = dlg.querySelector('form');
        dlg.addEventListener('close', () => dlg.remove());
        dlg.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => dlg.close()));
        form.addEventListener('change', () => { form.elements.other.hidden = form.elements.reason.value !== ''; });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const other = form.elements.reason.value === '';
            if (other && !form.elements.other.value.trim()) return UI().fail(form.elements.other, 'Écris ta raison, ou choisis-en une.');
            const body = {key: a.key, reason: other ? form.elements.other.value.trim() : form.elements.reason.value, note: form.elements.note.value.trim(), watch: form.elements.watch?.checked ? 1 : 0};
            try {
                const r = await api('controle_dismiss', {}, {method: 'POST', body});
                dlg.close();
                const prev = r.result?.before;
                A().undoToast(`Exception gardée : ${a.title}`, {undo: async () => { await api('controle_undismiss', {}, {method: 'POST', body: {key: a.key}}); if (prev) await api('controle_dismiss', {}, {method: 'POST', body: {key: a.key, reason: prev.reason, note: prev.note || '', watch: prev.watch}}); after?.(); },
                    redo: async () => { await api('controle_dismiss', {}, {method: 'POST', body}); after?.(); }});
                after?.();
            } catch (error) { toast(error.message, 'error'); }
        });
        dlg.showModal();
    }
    async function again(x, after) {
        if (!x) return;
        try {
            const r = await api('controle_undismiss', {}, {method: 'POST', body: {key: x.key}});
            const b = r.result?.before;
            A().undoToast(`Signalée de nouveau : ${x.title}`, {undo: async () => { if (b) await api('controle_dismiss', {}, {method: 'POST', body: {key: x.key, reason: b.reason, note: b.note || '', watch: b.watch}}); after?.(); },
                redo: async () => { await api('controle_undismiss', {}, {method: 'POST', body: {key: x.key}}); after?.(); }});
            after?.();
        } catch (error) { toast(error.message, 'error'); }
    }

    /** ⤓ CSV : la liste telle qu'elle est filtrée (gravité, sorte, contrôle, détail, fiches, lieu, écartée, raison). */
    function exportCsv() {
        const cell = v => A().csvCell ? A().csvCell(v, {sep: ';'}) : `"${String(v ?? '').replace(/"/g, '""')}"`;
        const exc = filt().sort === 'exceptions';
        const rows = [['Gravité', 'Sorte', 'Contrôle', 'Détail', 'Fiches', 'Lieu', 'Écartée', 'Raison']];
        current.forEach(a => rows.push([exc ? '' : levelOf(a.level)[1], SORTS[a.sort]?.[1] || '', a.title, exc ? (a.note || '') : (a.detail || ''),
            a.people.map(id => `${nm(DATA.people[id])} (n° ${id})`).join(', '), a.place?.name || '', exc || a.returned ? 'oui' : 'non', exc ? a.reason : (a.dismissal?.reason || '')]));
        const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
        const link = document.createElement('a'); link.href = url; link.download = `controle-de-la-base-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 1500);
        toast(`${plural(current.length, 'ligne exportée', 'lignes exportées')}.`);
    }

    /* ═══════════ ▶ Une à une ═══════════ */
    let oneQueue = [], oneIdx = 0, oneStats = {fixed: 0, dismissed: 0, later: 0};
    function startOne() {
        oneQueue = current.filter(a => !later.has(a.key)).concat(current.filter(a => later.has(a.key))).map(a => a.key);
        if (!oneQueue.length) return toast('Rien à vérifier avec ces filtres.');
        oneIdx = 0; oneStats = {fixed: 0, dismissed: 0, later: 0};
        S().ctlOne = true; renderOne(S().workspaceToken);
    }
    function closeOne() { S().ctlOne = false; ext.maintenance.controle(++S().workspaceToken, {keep: true}); }
    function frise(a) {
        const ds = (a.dates || []).filter(d => d.y);
        if (ds.length < 2) return '';
        const pos = d => d.j != null ? 1970 + d.j / 365.2425 : d.y + 0.5;
        const xs = ds.map(pos), min = Math.min(...xs), max = Math.max(...xs), span = Math.max(1, max - min);
        const W = 560, pad = 48, X = v => pad + (v - min) / span * (W - 2 * pad);
        return `<svg class="ctl-frise" viewBox="0 0 ${W} 92" role="img" aria-label="Frise des dates en cause"><line x1="10" y1="46" x2="${W - 10}" y2="46" class="ctl-frise-axis"/>
            ${ds.map((d, i) => { const x = X(xs[i]), up = i % 2; return `<circle cx="${x}" cy="46" r="7" class="ctl-frise-dot${i ? ' is-hot' : ''}"/><text x="${x}" y="${up ? 22 : 74}" text-anchor="middle" class="ctl-frise-date">${esc(d.text)}</text><text x="${x}" y="${up ? 34 : 87}" text-anchor="middle" class="ctl-frise-lab">${esc(d.label)}</text>`; }).join('')}</svg>`;
    }
    function renderOne(token) {
        const ws = A().$('#workspace');
        const map = new Map(DATA.alerts.map(a => [a.key, a]));
        oneQueue = oneQueue.filter(k => map.has(k));
        if (!oneQueue.length) { S().ctlOne = false; toast('✓ Tout est passé en revue.', 'success'); return renderPage(token); }
        oneIdx = Math.max(0, Math.min(oneIdx, oneQueue.length - 1));
        const a = map.get(oneQueue[oneIdx]), [ic, lvl] = levelOf(a.level);
        const pct = Math.round(100 * (oneIdx + 1) / oneQueue.length);
        const fam = a.people.map(id => {
            const p = DATA.people[id], mine = (a.dates || []).filter(d => Number(d.person_id) === Number(id) && d.event_id);
            return `<div class="ctl-one-person${mine.length ? ' is-hot' : ''}">${personChip(p)}<div class="ctl-one-dates">${mine.length ? mine.map(d => `<label class="ctl-one-date"><span>${esc(d.label)}</span><input data-ui-date="nocal" data-ctl-date="${Number(d.event_id)}" value="${esc(d.text)}" data-was="${esc(d.text)}" aria-label="${esc(d.label)} de ${esc(nm(p))}"></label>`).join('') : `<small class="muted">${esc([p?.birth ? '° ' + p.birth : '', p?.death ? '† ' + p.death : ''].filter(Boolean).join(' · '))}</small>`}</div></div>`;
        }).join('') + (a.place ? `<div class="ctl-one-person">${placeChip(a.place)}</div>` : '');
        ws.innerHTML = `<section class="page ctl-page ctl-one">${UI().pageHeader({title: 'Une à une', icon: '▶', attrs: 'data-ph-title', help: 'Une alerte à la fois, avec la famille à côté. Les dates se corrigent ici ; l’alerte se recalcule tout de suite.',
            primary: '<button type="button" class="button secondary" data-ctl-list-back>☰ Liste</button>', actions: ['<button type="button" class="icon-button" data-ctl-one-close aria-label="Fermer" title="Fermer (Échap)">×</button>']})}
            <div class="ctl-progress"><b>Alerte ${oneIdx + 1} sur ${oneQueue.length}</b><span class="ctl-progress-bar"><i style="width:${pct}%"></i></span><small>✓ ${oneStats.fixed} corrigée${oneStats.fixed > 1 ? 's' : ''} · 🙈 ${oneStats.dismissed} écartée${oneStats.dismissed > 1 ? 's' : ''} · ⏭ ${oneStats.later} plus tard</small></div>
            <div class="ctl-one-grid"><article class="ctl-one-card is-${esc(a.level)}"><div>${UI().badge(`${ic} ${lvl}`, a.level === 'red' ? 'red' : a.level === 'orange' ? 'yellow' : 'grey', {html: false})} ${sortBadge(a.sort)}${a.score ? ' ' + UI().badge(a.score + ' %', 'yellow') : ''}</div>
                <h2>${esc(a.title)}</h2>${a.rule ? `<p class="ctl-rule">${esc(a.rule)}</p>` : ''}<p class="ctl-detail">${esc(a.detail || '')}</p>
                ${a.checks ? `<div class="ctl-checks">${a.checks.map(([k, t]) => `<span class="ctl-check is-${k === 'ok' ? 'ok' : k === 'no' ? 'no' : 'q'}">${k === 'ok' ? '✓' : k === 'no' ? '✗' : '?'} ${esc(t)}</span>`).join('')}</div>` : ''}
                ${frise(a)}${HINTS[a.check] ? UI().notice('info', `💡 Souvent : ${HINTS[a.check]}`) : ''}</article>
                <aside class="ctl-one-side"><h3>${a.place && !a.people.length ? 'Le lieu' : 'La famille'}</h3>${fam || A().empty('Aucune fiche', {icon: '👪'})}<p class="muted ctl-small">Les dates en cause se corrigent ici (comme dans un acte : « 7 mai 1925 », « vers 1784 ») ; Entrée pour enregistrer.</p></aside></div>
            <div class="ctl-one-actions"><button type="button" class="button" data-ctl-k="c" data-shortcut="C">✎ Corriger</button><button type="button" class="button secondary" data-ctl-k="n" data-shortcut="N">Ce n’est pas une erreur</button><button type="button" class="button secondary" data-ctl-k="l" data-shortcut="L">⏭ Plus tard</button>
                <span class="spacer"></span><button type="button" class="button secondary" data-ctl-k="p"${oneIdx ? '' : ' disabled'}>← Précédente</button><button type="button" class="button secondary" data-ctl-k="s"${oneIdx < oneQueue.length - 1 ? '' : ' disabled'}>Suivante →</button></div></section>`;
        A().bindTableLinks();
        const after = async () => { await load(); if (S().ctlOne && S().maintenanceTab === 'controle') renderOne(S().workspaceToken); };
        ws.querySelector('[data-ctl-one-close]').addEventListener('click', closeOne);
        ws.querySelector('[data-ctl-list-back]').addEventListener('click', closeOne);
        ws.querySelectorAll('[data-ctl-k]').forEach(b => b.addEventListener('click', () => act(b.dataset.ctlK)));
        ws.querySelectorAll('[data-ctl-date]').forEach(inp => {
            const save = async () => {
                const v = inp.value.trim(); if (v === inp.dataset.was) return;
                const chk = UI().readDate?.(v); if (v && chk && !chk.ok) return UI().fail(inp, `⛔ ${chk.text || 'Date impossible'}`);
                try {
                    const eid = Number(inp.dataset.ctlDate), was = inp.dataset.was;
                    await api('controle_fix_date', {}, {method: 'POST', body: {event_id: eid, date_text: v}});
                    inp.dataset.was = v; oneStats.fixed++;
                    const before = DATA.alerts.length; await load();
                    const still = DATA.alerts.some(x => x.key === a.key);
                    A().undoToast(still ? `Date enregistrée : ${v}` : `✓ Alerte réglée (${v})`, {undo: async () => { await api('controle_fix_date', {}, {method: 'POST', body: {event_id: eid, date_text: was}}); await after(); }, redo: async () => { await api('controle_fix_date', {}, {method: 'POST', body: {event_id: eid, date_text: v}}); await after(); }});
                    void before;
                    renderOne(S().workspaceToken);
                } catch (error) { toast(error.message, 'error'); }
            };
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
            inp.addEventListener('change', save);
        });
        function act(k) {
            if (k === 'c') { const first = ws.querySelector('[data-ctl-date]'); if (first) { first.focus(); first.select(); return; } if (a.sort === 'doublons') return compare(a.people[0], a.people[1]); if (a.check === 'misplaced') return fixPlace(a, after); return correct(a); }
            if (k === 'n') return dismiss(a, async () => { oneStats.dismissed++; await after(); });
            if (k === 'l') { later.add(a.key); oneQueue.splice(oneIdx, 1); oneQueue.push(a.key); oneStats.later++; return renderOne(S().workspaceToken); }
            if (k === 'p' && oneIdx > 0) { oneIdx--; return renderOne(S().workspaceToken); }
            if (k === 's' && oneIdx < oneQueue.length - 1) { oneIdx++; return renderOne(S().workspaceToken); }
        }
        renderOne.act = act;
    }
    document.addEventListener('keydown', e => {
        if (!S()?.ctlOne || S().module !== 'maintenance' || S().maintenanceTab !== 'controle' || !document.querySelector('.ctl-one')) return;
        if (document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { if (e.key === 'Escape') t.blur(); return; }
        const k = {c: 'c', C: 'c', n: 'n', N: 'n', l: 'l', L: 'l', ArrowLeft: 'p', ArrowRight: 's'}[e.key];
        if (e.key === 'Escape') { e.preventDefault(); return closeOne(); }
        if (k) { e.preventDefault(); renderOne.act?.(k); }
    });

    /* ═══════════ ⚙️ Seuils du contrôle (K2 : gardé tout de suite) ═══════════ */
    const SEUILS = [
        ['🎂 Âges', [['mother_warn', 'Âge de la mère 🟠', 'à vérifier à partir de', 'ans'], ['mother_max', 'Âge de la mère 🔴', 'impossible à partir de', 'ans'], ['father_warn', 'Âge du père 🟠', 'à vérifier au-delà de', 'ans'], ['father_max', 'Âge du père 🔴', 'impossible au-delà de', 'ans'],
            ['parent_min', 'Parent jeune 🟠', 'à vérifier en dessous de', 'ans'], ['marriage_min', 'Âge minimum au mariage', '🔴 en dessous', 'ans'], ['marriage_old', 'Mariage tardif', '🟡 au-delà de', 'ans'], ['longevity', 'Longévité 🟠', 'au-delà de', 'ans'], ['longevity_max', 'Longévité 🔴', 'au-delà de', 'ans']]],
        ['👪 Parents', [['father_death_days', 'Délai après la mort du père', '🔴 naissance plus tard que', 'jours'], ['birth_gap_months', 'Écart entre deux naissances', '🔴 moins de', 'mois'], ['sibling_span', 'Fratrie étalée', '🟠 sur plus de', 'ans']]],
        ['📅 Dates', [['baptism_days', 'Baptême tardif (avant 1900)', '🟡 plus de', 'jours'], ['burial_days', 'Inhumation tardive (avant 1900)', '🟡 plus de', 'jours']]],
        ['📍 Lieux et 👥 Doublons', [['baptism_km', 'Baptême loin de la naissance', '🟠 au-delà de', 'km'], ['dup_min', 'Ressemblance des doublons', 'montrer à partir de', '%']]],
    ];
    const label = k => SEUILS.flatMap(s => s[1]).find(r => r[0] === k)?.[1] || k;
    ext.maintenance.controle_seuils = async token => {
        const d = await api('controle_seuils');
        if (token !== S().workspaceToken || S().maintenanceTab !== 'controle_seuils') return;
        const vals = {...d.values}, bounds = d.bounds;
        const ws = A().$('#workspace');
        ws.innerHTML = `<section class="page ctl-seuils">${UI().pageHeader({title: 'Seuils du contrôle', icon: '⚙️', attrs: 'data-ph-title', saved: true,
            help: 'À partir de quand une chose est « à vérifier » 🟠 ou « impossible » 🔴 dans <a href="#maintenance/controle" data-ctl-go>✅ Contrôle de la base</a>. Double-clic sur un curseur : valeur de départ.',
            actions: ['<button type="button" class="button secondary" data-ctl-reset>↺ Remettre comme au départ</button>']})}
            ${SEUILS.map(([title, rows]) => `<section class="maintenance-panel ctl-seuils-sec"><h3>${esc(title)}</h3>${rows.map(([k, l, sub, unit]) => { const [def, min, max, step] = bounds[k]; return `<div class="ctl-seuil"><div><b>${esc(l)}</b><small>${esc(sub)}</small></div><input type="range" data-ctl-seuil="${k}" min="${min}" max="${max}" step="${step}" value="${vals[k]}" data-default="${def}" data-unit="${esc(unit)}" aria-label="${esc(l)}"></div>`; }).join('')}</section>`).join('')}
            <section class="maintenance-panel ctl-seuils-sec"><h3>👤 Sur la fiche</h3><div class="ctl-seuil"><div><b>Bandeau « ⚠️ N choses à vérifier »</b><small>sous l’en-tête de la fiche, replié</small></div><select data-ctl-banner><option value="all"${vals.banner === 'all' ? ' selected' : ''}>Toujours</option><option value="red"${vals.banner === 'red' ? ' selected' : ''}>Seulement 🔴</option><option value="never"${vals.banner === 'never' ? ' selected' : ''}>Jamais</option></select></div></section></section>`;
        let timer = null;
        const save = async (next, msg, prev) => {
            try {
                const r = await api('controle_seuils_save', {}, {method: 'POST', body: {values: next}});
                Object.assign(vals, r.result.values); UI().pageSaved?.();
                if (msg) A().undoToast(msg, {undo: async () => { await api('controle_seuils_save', {}, {method: 'POST', body: {values: prev}}); ext.maintenance.controle_seuils(++S().workspaceToken); }, redo: async () => { await api('controle_seuils_save', {}, {method: 'POST', body: {values: next}}); ext.maintenance.controle_seuils(++S().workspaceToken); }});
            } catch (error) { toast(error.message, 'error', {retry: () => save(next, msg, prev)}); }
        };
        ws.querySelectorAll('[data-ctl-seuil]').forEach(inp => inp.addEventListener('change', () => {
            const k = inp.dataset.ctlSeuil, prev = {...vals}, v = Number(inp.value);
            if (v === Number(prev[k])) return;
            clearTimeout(timer); timer = setTimeout(() => save({...vals, [k]: v}, `${label(k)} : ${String(prev[k]).replace('.', ',')} → ${String(v).replace('.', ',')} ${bounds[k] ? (SEUILS.flatMap(s => s[1]).find(r => r[0] === k)?.[3] || '') : ''}`, prev), 150);
        }));
        ws.querySelector('[data-ctl-banner]').addEventListener('change', e => { const prev = {...vals}; save({...vals, banner: e.target.value}, `Bandeau sur la fiche : ${e.target.selectedOptions[0].textContent}`, prev); });
        ws.querySelector('[data-ctl-reset]').addEventListener('click', async () => { const prev = {...vals}; const def = Object.fromEntries(Object.entries(bounds).map(([k, b]) => [k, b[0]])); await save({...def, banner: 'all'}, 'Seuils remis comme au départ', prev); ext.maintenance.controle_seuils(++S().workspaceToken); });
        ws.querySelector('[data-ctl-go]').addEventListener('click', e => { e.preventDefault(); goControle(filt()); });
    };

    /* ═══════════ Anciennes adresses : la page, déjà filtrée ═══════════ */
    ext.maintenance.issues = () => goControle({sort: 'all'});
    ext.maintenance.ages = () => goControle({sort: 'ages'});
    ext.maintenance.misplaced = () => goControle({sort: 'lieux', sub: 'misplaced'});
    ext.maintenance.journeys = () => goControle({sort: 'lieux', sub: 'journeys'});

    /* ═══════════ Le widget « ✅ Contrôle de la base » (remplace « Incohérences et conflits » et « Voyages impossibles ») ═══════════ */
    const widget = {load: () => api('controle_summary'), render: (index, w, span, d) => {
        if (!d) return A().card(index, 'Contrôle de la base', '', A().empty('Contrôle impossible pour l’instant.', {icon: '✅'}), span);
        const total = Number(d.total || 0);
        const body = `<div class="ctl-widget"><div class="ctl-widget-top"><button type="button" class="ctl-widget-big" data-ctl-w-go="all"><strong>${fmt(total)}</strong><span>${total > 1 ? 'choses à vérifier' : total ? 'chose à vérifier' : 'rien à vérifier'}</span></button>
            <div class="ctl-widget-pct" title="${esc(`${d.persons_ok} fiches sur ${d.persons_total} n’ont aucune alerte (les exceptions ne comptent pas)`)}"><strong>${d.pct_ok} %</strong><span>des fiches sans alerte</span><i><b style="width:${Math.max(0, Math.min(100, d.pct_ok))}%"></b></i></div></div>
            <div class="ctl-widget-line">${Object.entries(LEVELS).map(([k, [ic, l]]) => `<button type="button" data-ctl-w-level="${k}" title="${esc(l)}">${ic} ${fmt(d.by_level?.[k])}</button>`).join(' · ')} · <button type="button" data-ctl-w-go="exceptions">🙈 ${fmt(d.exceptions)} écartée${d.exceptions > 1 ? 's' : ''}</button></div>
            <div class="ctl-widget-line">${Object.entries(SORTS).map(([k, [ic, l]]) => `<button type="button" data-ctl-w-go="${k}" title="${esc(l)}">${ic} ${fmt(d.by_sort?.[k])}</button>`).join(' · ')}</div>
            ${(d.top || []).slice(0, Math.max(1, Math.min(5, Number(w?.limit) || 3))).map(t => `<div class="ctl-widget-row">${levelOf(t.level)[0]} ${t.people?.[0] && d.people?.[t.people[0]] ? `<b>${esc(nm(d.people[t.people[0]]))}</b> · ` : ''}${esc(t.title)}</div>`).join('')}</div>`;
        return A().card(index, '✅ Contrôle de la base', '', body, span, '<button class="button small secondary" type="button" data-ctl-w-go="all">Tout voir</button>');
    }};
    ext.dashboard.consistency_issues = widget;
    ext.dashboard.journeys_widget = widget; // l'ancien widget « Voyages impossibles » passe tout seul au nouveau
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ctl-w-go], [data-ctl-w-level]'); if (!b) return;
        if (b.dataset.ctlWLevel) goControle({sort: 'all', level: b.dataset.ctlWLevel}); else goControle({sort: b.dataset.ctlWGo});
    });

    /* ═══════════ Le bandeau « ⚠️ N choses à vérifier » sur la fiche (replié par défaut) ═══════════ */
    ext.afterPerson.push(async detail => {
        const pid = Number(detail?.person?.id); if (!pid || detail.person.kind === 'animal') return;
        let d; try { d = await api('controle_person', {id: pid}); } catch (_) { return; }
        if (S().module !== 'personnes' || Number(S().currentPersonId) !== pid) return;
        const hero = document.querySelector('#workspace .person-hero'); if (!hero || hero.parentElement.querySelector('[data-ctl-banner]')) return;
        let list = d.alerts || [];
        if (d.banner === 'never') return;
        if (d.banner === 'red') list = list.filter(a => a.level === 'red');
        if (!list.length) return;
        DATA = DATA || {people: {}, alerts: [], exceptions: []};
        Object.assign(DATA.people, d.people || {});
        const n = list.length, lv = counts(list).levels;
        const box = document.createElement('section'); box.className = 'ctl-banner'; box.dataset.ctlBanner = String(pid);
        box.innerHTML = `<div class="ctl-banner-head"><span>⚠️ <b>${plural(n, 'chose à vérifier', 'choses à vérifier')}</b></span>${Object.entries(LEVELS).filter(([k]) => lv[k]).map(([k, [ic]]) => `<span class="ctl-banner-n is-${k}">${ic} ${lv[k]}</span>`).join('')}<span class="spacer"></span><button type="button" class="button small secondary" data-ctl-b-toggle aria-expanded="false">Voir ▾</button></div>
            <div class="ctl-banner-body" hidden>${list.map((a, i) => `<div class="ctl-banner-row"><span>${levelOf(a.level)[0]} ${esc(a.view || a.title)}</span><span class="ctl-banner-acts">${a.sort === 'doublons' ? `<button type="button" class="button small secondary" data-ctl-b-cmp="${i}">⚖️ Comparer</button>` : a.fix?.event_id ? `<button type="button" class="button small secondary" data-ctl-b-fix="${i}">✎ Corriger</button>` : ''}<button type="button" class="button small secondary" data-ctl-b-dis="${i}">Pas une erreur</button></span></div>`).join('')}
            <button type="button" class="link-button ctl-banner-all" data-ctl-b-all>Tout voir dans « ✅ Contrôle de la base » →</button></div>`;
        hero.after(box);
        const rerender = () => A().selectPerson?.(pid);
        box.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.ctlBToggle !== undefined) { const body = box.querySelector('.ctl-banner-body'); body.hidden = !body.hidden; b.textContent = body.hidden ? 'Voir ▾' : 'Masquer ▴'; b.setAttribute('aria-expanded', String(!body.hidden)); return; }
            if (b.dataset.ctlBFix !== undefined) return correct(list[Number(b.dataset.ctlBFix)]);
            if (b.dataset.ctlBCmp !== undefined) { const a = list[Number(b.dataset.ctlBCmp)]; return compare(a.people[0], a.people[1]); }
            if (b.dataset.ctlBDis !== undefined) return dismiss(list[Number(b.dataset.ctlBDis)], rerender);
            if (b.dataset.ctlBAll !== undefined) { try { const k = 'lcnda-listbar:maintenance:controle', st = ls(k, {}) || {}; lsSet(k, {...st, q: nm(d.people[pid] || detail.person)}); } catch (_) {} goControle({sort: 'all'}); }
        });
    });

    /* ═══════════ 📊 Moyennes de la famille (venues de « Âges et écarts ») : Graphiques → Statistiques ═══════════ */
    const addStat = () => { const list = A()?.defaultGraphStatsItems; if (!list) return false; if (!list.some(x => x[0] === 'family_averages')) list.push(['family_averages', 'Moyennes de la famille (mariage, naissances)']); return true; };
    if (!addStat()) { let n = 0; const t = setInterval(() => { if (addStat() || ++n > 100) clearInterval(t); }, 50); }
    ext.graphStats.family_averages = async token => {
        const d = await api('controle_family_stats');
        if (token !== S().workspaceToken || S().module !== 'graphiques') return;
        const f1 = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('fr-FR', {maximumFractionDigits: 1});
        A().$('#workspace').innerHTML = `<section class="page">${UI().pageHeader({where: 'Graphiques · Statistiques', title: 'Moyennes de la famille', icon: '📊', help: 'Âge au mariage et écart entre les naissances, par quart de siècle. Repères en France : au XVIIIe siècle, les femmes se marient vers 25-26 ans et les hommes vers 27-28 ans ; un enfant naît en moyenne tous les 24 à 30 mois.'})}
            ${(d.periods || []).length ? `<table class="data-table"><thead><tr><th>Période</th><th>Âge au mariage des hommes</th><th>des femmes</th><th>Mariages</th><th>Écart entre naissances</th></tr></thead><tbody>${d.periods.map(r => `<tr><td>${esc(r.period)}</td><td>${r.men !== null ? f1(r.men) + ' ans' : '—'}</td><td>${r.women !== null ? f1(r.women) + ' ans' : '—'}</td><td>${fmt(r.n)}</td><td>${r.spacing !== null ? f1(r.spacing) + ' mois' : '—'}${r.spacing_n ? ` <small class="muted">(${r.spacing_n})</small>` : ''}</td></tr>`).join('')}</tbody></table>` : A().emptyState({icon: '📊', text: 'Pas assez de dates', hint: 'Il faut des mariages et des naissances datés pour calculer ces moyennes.'})}</section>`;
    };

    /* ═══════════ Entretien : « Supprimer les familles vides » (venu de l'ancien écran Incohérences) ═══════════ */
    ext.afterUpkeep.push(async () => {
        let g; try { g = await api('ghost_families'); } catch (_) { return; }
        const page = document.querySelector('#workspace .upkeep-page'); if (!page || !g?.empty || page.querySelector('[data-ctl-empty-fam]')) return;
        const n = Number(g.empty);
        page.insertAdjacentHTML('beforeend', `<section class="maintenance-panel" data-ctl-empty-fam><h3>Familles vides</h3><p><b>${plural(n, 'famille vide', 'familles vides')}</b> : ni conjoint, ni enfant, ni événement, ni note, ni média, ni source (souvent laissées par un ancien logiciel ou un import). Une copie de sécurité de la base est faite juste avant.</p><div class="page-actions"><button class="button" type="button" data-ctl-del-empty>${n < 2 ? 'Supprimer la famille vide' : `Supprimer les ${fmt(n)} familles vides`}</button></div></section>`);
        page.querySelector('[data-ctl-del-empty]').addEventListener('click', async ev => {
            const btn = ev.currentTarget;
            if (!await A().confirmBox('Elles ne contiennent aucune information. Une copie de sécurité de la base est faite juste avant.', {title: n < 2 ? 'Supprimer la famille vide ?' : `Supprimer les ${fmt(n)} familles vides ?`, okLabel: 'Supprimer les familles vides'})) return;
            btn.disabled = true;
            try { const r = await api('delete_empty_families', {}, {method: 'POST', body: {}}); toast(`${plural(Number(r.deleted), 'famille vide supprimée', 'familles vides supprimées')}. Copie de sécurité : ${r.backup}`); page.querySelector('[data-ctl-empty-fam]')?.remove(); }
            catch (error) { toast(error.message, 'error'); btn.disabled = false; }
        });
    });
})();
