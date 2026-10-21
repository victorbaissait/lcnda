/* LCNDA — 🎤 SCÈNE : « Concerts et représentations », toutes les dates (maquette V de docs/design/profils-et-oeuvres.html).
 * La barre H10 (UI.listBar : 🔍 Chercher · Filtrer ▾ · Liste | Fiches | Carte | Frise | 📊 Statistiques · Trier ▾), puis :
 *  - Liste / Fiches : les colonnes et vignettes du panneau « ⚙️ Champs affichés » ;
 *  - Carte : un repère par lieu, sa taille = le nombre de soirs ; clic → la liste filtrée sur cette ville ;
 *  - Frise : les soirs année par année, colorés par tournée ;
 *  - Statistiques façon setlist.fm : titres les plus joués (1re et dernière fois), soirs par année / pays / ville / salle,
 *    durée moyenne, titres par soir, setlist type d'une tournée, jamais joués en public, comparer deux soirs,
 *    rôles du soir et remplacements (théâtre), chefs et solistes (orchestre), qui monte le plus souvent sur scène.
 * Tout se calcule sur la liste filtrée : la même page sert à un chanteur, un humoriste, un acteur, un orchestre.
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, SC = ART?.scene; if (!ART?.define || !SC) return;
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI || {}, P = () => window.LCNDA_PICKER || window.LCNDA_APP, ext = () => window.LCNDA_EXT || {};
    const U = ART.util, esc = U.esc, fold = SC.fold;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const STEP = 30;
    const COLORS = ['#7b2ff7', '#055dff', '#1aa34a', '#e1a500', '#d0182f', '#0a9bb5', '#8a5a2b', '#d9488f', '#555'];
    const readJ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch (_) { return d; } };
    const writeJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

    /* ═════════ Les coordonnées des lieux (lib/scene.php) ═════════ */
    const COORDS = new Map();
    SC.coords = async ids => {
        const want = [...new Set(ids.map(Number).filter(n => n > 0))], miss = want.filter(id => !COORDS.has(id));
        for (let i = 0; i < miss.length; i += 300) {
            const part = miss.slice(i, i + 300);
            try { const r = await A().api('scene', {op: 'places', ids: part.join(',')}); (r?.places || []).forEach(p => COORDS.set(Number(p.id), p)); } catch (_) { /* carte indisponible : on garde les lieux sans coordonnées */ }
            part.forEach(id => { if (!COORDS.has(id)) COORDS.set(id, null); });
        }
        return new Map(want.map(id => [id, COORDS.get(id)]));
    };
    /** une carte : un repère par lieu (taille = nombre de soirs), et le trajet dans l'ordre si demandé */
    SC.mapHtml = async (list, {route = false, height = 420} = {}) => {
        const byPlace = new Map();
        list.forEach(c => { const p = U.place(c.data?.place); if (!p?.plid) return; const x = byPlace.get(p.plid) || {plid: p.plid, title: p.title, n: 0, list: []}; x.n++; x.list.push(c); byPlace.set(p.plid, x); });
        const free = list.filter(c => !U.place(c.data?.place)?.plid).length;
        if (!byPlace.size) return {html: `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Aucun lieu de ta base pour ces soirs${free ? ` (${plural(free, 'soir')} sans lieu choisi dans la base)` : ''}.</span></p>`, pts: []};
        const co = await SC.coords([...byPlace.keys()]);
        const max = Math.max(...[...byPlace.values()].map(x => x.n));
        const pts = [...byPlace.values()].map(x => ({...x, c: co.get(x.plid)})).filter(x => x.c && Number.isFinite(Number(x.c.lat)) && Number.isFinite(Number(x.c.lon)));
        const top = new Set([...pts].sort((a, b) => b.n - a.n).slice(0, 6).map(x => x.plid));
        const points = pts.map(x => ({lat: Number(x.c.lat), lon: Number(x.c.lon), label: `${x.c.name || x.title} · ${plural(x.n, 'soir')}`, n: x.n, color: '#7b2ff7', showLabel: top.has(x.plid)}));
        const coordsOf = id => { const p = co.get(id); return p && Number.isFinite(Number(p.lat)) ? [Number(p.lat), Number(p.lon)] : null; };
        const paths = route ? [{coords: list.map(c => coordsOf(U.place(c.data?.place)?.plid)).filter(Boolean).filter((c, i, a) => !i || c[0] !== a[i - 1][0] || c[1] !== a[i - 1][1]), color: '#7b2ff7', dashed: true, width: 2}] : [];
        const mm = ext().miniMap;
        const noCoord = byPlace.size - pts.length;
        const note = [noCoord && `${plural(noCoord, 'lieu')} sans coordonnées`, free && `${plural(free, 'soir')} sans lieu de ta base`].filter(Boolean).join(' · ');
        const html = mm ? `<div class="sc-mapbox" data-sc-mapbox>${mm(points, paths.filter(p => p.coords.length > 1), {height, emptyText: 'Ces lieux n’ont pas encore de coordonnées (ouvre-les dans « Lieux » pour les placer).'})}</div>` : '<p class="muted">Carte indisponible.</p>';
        return {html: `${html}<small class="ar-g">Taille du repère = nombre de soirs · clic sur un repère → la liste de ce lieu${note ? ` · ${esc(note)}` : ''}</small>`, pts, max};
    };
    /** après l'insertion : repères à la bonne taille et cliquables */
    SC.mapAfter = (box, pts, max, onPick) => {
        box.querySelectorAll('.h-map-point').forEach((g, i) => { const x = pts[i]; if (!x) return; const c = g.querySelector('circle'); if (c) c.setAttribute('r', String(Math.round(7 + 11 * Math.sqrt(x.n / Math.max(1, max))))); g.dataset.scPlid = x.plid; g.style.cursor = 'pointer'; g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); });
        box.onclick = e => { const g = e.target.closest?.('[data-sc-plid]'); if (g) onPick?.(Number(g.dataset.scPlid)); };
        box.onkeydown = e => { const g = e.target.closest?.('[data-sc-plid]'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick?.(Number(g.dataset.scPlid)); } };
    };
    /** la carte d'une tournée (vue « Itinéraire » de la fiche) */
    SC.fillMap = async (C, el) => {
        const [what, id] = String(el.dataset.scMap || '').split(':');
        if (what !== 'tour') return;
        const list = SC.tourDates(C.store, Number(id)); const r = await SC.mapHtml(list, {route: true, height: 520});
        if (!el.isConnected) return; el.innerHTML = r.html; SC.mapAfter(el, r.pts, r.max, plid => { const c = list.find(x => U.place(x.data.place)?.plid === plid); if (c) C.open(c.id); });
    };

    /* ═════════ Le tri ═════════ */
    const num = v => { const n = Number(String(v ?? '').replace(/[^\d,.]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    SC.sortConcerts = (list, how) => { const l = [...list], k = SC.dateKey;
        const cmp = {old: (a, b) => k(a) - k(b) || a.id - b.id, recent: (a, b) => k(b) - k(a) || b.id - a.id, city: (a, b) => SC.cityOf(a).localeCompare(SC.cityOf(b), 'fr') || k(a) - k(b),
            songs: (a, b) => SC.rowsOf(b).length - SC.rowsOf(a).length || k(a) - k(b), audience: (a, b) => num(b.data.audience) - num(a.data.audience) || k(a) - k(b), az: (a, b) => String(a.title).localeCompare(String(b.title), 'fr'), za: (a, b) => String(b.title).localeCompare(String(a.title), 'fr')}[how] || ((a, b) => k(b) - k(a));
        return l.sort(cmp); };
    /** les personnes d'un soir (sur scène, invités, rôles du soir, chef, solistes) : {key, name, ref} */
    SC.peopleOf = c => { const d = c.data || {}, out = [];
        const add = (v, role, where) => { const p = U.person(v); if (!p) return; out.push({key: p.pid ? `p${p.pid}` : `n${fold(p.txt)}`, name: p.title || p.txt || '', ref: p.pid ? {pid: p.pid, title: p.title} : {pname: p.txt}, role: role || '', where}); };
        ART.normPeople(d.on_stage).forEach(r => add(r, r.role, 'scene')); ART.normPeople(d.soloists).forEach(r => add(r, r.role || 'soliste', 'soliste'));
        if (d.conductor) add(d.conductor, 'chef', 'chef');
        SC.rowsOf(c).forEach(r => ART.normPeople(r.guests).forEach(g => add(g, g.role || 'invité', 'invite')));
        (Array.isArray(d.cast_night) ? d.cast_night : []).forEach(r => add(r.who, r.role, 'role'));
        return out; };

    /* ═════════ La liste ═════════ */
    const VIEWS = [['list', 'Liste'], ['cards', 'Fiches'], ['map', 'Carte'], ['frise', 'Frise'], ['stats', '📊 Statistiques']];
    const base = ART.paintList;
    ART.paintList = (C, body) => (C.S.kind === 'concert' ? paintScene(C, body) : base(C, body));
    function paintScene(C, body) {
        const {store} = C, def = ART.defs.concert, all = SC.concerts(store), idx = SC.titleIndex(store);
        const VKEY = `lcnda-scene-view:${C.pid}`;
        let view = readJ(VKEY, null) || 'list', shown = STEP;
        if (!VIEWS.some(v => v[0] === view)) view = 'list';
        const S2 = C._scStats = C._scStats || {tab: 'year', more: false, tour: null, a: null, b: null};
        // — les filtres, rangés par rubriques —
        const tourKey = c => { const r = U.ref(c.data?.tour); return r?.iid ? `i${r.iid}` : r?.txt ? `t${fold(r.txt)}` : ''; };
        const tours = new Map(); all.forEach(c => { const k = tourKey(c); if (!k) return; const x = tours.get(k) || {k, title: U.refTitle(c.data.tour), n: 0}; x.n++; tours.set(k, x); });
        const cities = new Map(); all.forEach(c => { const t = SC.cityOf(c); if (!t) return; const k = fold(t); const x = cities.get(k) || {k, title: t, n: 0}; x.n++; cities.set(k, x); });
        const decades = [...new Set(all.map(c => Math.floor((SC.dayOf(c.data?.date)?.y || Number(c.year) || 0) / 10) * 10).filter(Boolean))].sort();
        const hasWho = (c, v) => { const id = v && typeof v === 'object' ? Number(v.id) : 0, t = !id ? fold(String(v || '').replace(/^txt:/, '')) : ''; return SC.peopleOf(c).some(p => (id && p.ref.pid === id) || (t && fold(p.name).includes(t))); };
        const hasWork = (c, v) => { const id = v && typeof v === 'object' ? Number(v.id) : 0, t = !id ? fold(String(v || '').replace(/^txt:/, '')) : ''; return SC.rowsOf(c).some(r => (id && SC.rowKey(r, idx) === `i${id}`) || (t && fold(U.refTitle(r.work)).includes(t))); };
        const FLAGS = [['setlist', 'Avec une setlist'], ['nosetlist', 'Sans setlist'], ['capt', 'Avec une captation'], ['first', 'Avec une 1re fois'], ['subst', 'Avec un remplacement'], ['sold', 'Complet']];
        const flagTest = (c, k) => ({setlist: () => SC.rowsOf(c).length > 0, nosetlist: () => !SC.rowsOf(c).length, capt: () => !!(ART.mediaOf(c.data?.sound) || ART.mediaOf(c.data?.video) || c.data?.capt_note), first: () => SC.rowsOf(c).some(r => r.first),
            subst: () => ART.arr(c.data?.cast_night).some(r => r.status === 'remplacant' || r.status === 'doublure'), sold: () => !!c.data?.sold_out}[k] || (() => true))();
        const filters = [
            ...(def.filters ? def.filters(store) : []).map(f => ({...f, group: 'Sorte de soirée'})),
            ...(tours.size ? [{id: 'tour', label: 'Tournée', group: 'Tournée', type: 'check', options: [...tours.values()].sort((a, b) => b.n - a.n).map(t => [t.k, `${t.title} (${t.n})`, t.title]), test: (c, v) => !v?.length || v.includes(tourKey(c))}] : []),
            ...(cities.size ? [{id: 'city', label: 'Ville', group: 'Lieu', type: 'check', options: [...cities.values()].sort((a, b) => b.n - a.n || a.title.localeCompare(b.title, 'fr')).slice(0, 60).map(t => [t.k, `${t.title} (${t.n})`, t.title]), test: (c, v) => !v?.length || v.includes(fold(SC.cityOf(c)))}] : []),
            ...(decades.length > 1 ? [{id: 'dec', label: 'Années', group: 'Époque', type: 'check', options: decades.map(d => [String(d), `${d} – ${d + 9}`]), test: (c, v) => !v?.length || v.includes(String(Math.floor((SC.dayOf(c.data?.date)?.y || Number(c.year) || 0) / 10) * 10))}] : []),
            {id: 'work', label: 'Avec ce titre joué', group: 'Joué ce soir-là', kind: 'artwork', chipPrefix: '🎵', picker: {filter: {art_kind: [...new Set([...SC.kindsFor('concert'), ...SC.kindsFor('theatre')])].join(','), art_person: C.pid}}, test: (c, v) => !v || hasWork(c, v)},
            {id: 'who', label: 'Avec cette personne (sur scène, invitée, dans un rôle)', group: 'Joué ce soir-là', type: 'person', chipPrefix: '👤', test: (c, v) => !v || hasWho(c, v)},
            {id: 'flags', label: 'Détails', group: 'Détails', type: 'check', options: FLAGS, test: (c, v) => !v?.length || v.every(k => flagTest(c, k))}];
        const seg = document.createElement('span'); seg.className = 'segmented sc-views'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Affichage');
        const paintSeg = () => { seg.innerHTML = VIEWS.map(([k, l]) => `<button type="button" data-scv="${k}" class="${view === k ? 'is-active' : ''}" aria-pressed="${view === k}">${esc(l)}</button>`).join(''); };
        Object.defineProperty(seg, 'value', {get: () => (view === 'cards' ? 'cards' : 'list')});
        paintSeg();
        const head = document.createElement('div'); head.className = 'ar-listhead'; const out = document.createElement('div'); out.className = 'ar-listout sc-out';
        body.append(head, out);
        const bar = UI().listBar({key: `artistes:concert:${C.pid}`, search: {placeholder: 'Chercher… (ville, salle, morceau joué, tournée, personne)'}, filters, view: seg,
            sort: {options: def.sorts, value: 'recent'}, onChange: () => { shown = STEP; draw(); }});
        head.appendChild(bar);
        const cfg = document.createElement('button'); cfg.type = 'button'; cfg.className = 'icon-button ar-colbtn'; cfg.title = 'Choisir les colonnes (« ⚙️ Champs affichés », onglet « La liste »)'; cfg.textContent = '⚙️';
        cfg.addEventListener('click', () => ART.openFieldsPanel?.(C, 'concert', 'liste')); bar.querySelector('.ui-listbar-row')?.appendChild(cfg);
        seg.addEventListener('click', e => { const b = e.target.closest('[data-scv]'); if (!b) return; e.stopPropagation(); view = b.dataset.scv; writeJ(VKEY, view); paintSeg(); shown = STEP; draw(); });
        const searchText = c => [c.title, c.data.date, SC.cityOf(c), U.placeTitle(c.data.place), c.data.venue, c.data.festival, c.data.show, c.data.lineup, U.refTitle(c.data.tour), U.refTitle(c.data.staging),
            ...SC.rowsOf(c).map(r => `${U.refTitle(r.work)} ${r.note || ''}`), ...SC.peopleOf(c).map(p => p.name), c.data.notes].join(' ');
        function filtered() {
            const st = bar.state, q = fold(st.q || '');
            let list = all;
            if (q) { const words = q.split(/\s+/).filter(Boolean); list = list.filter(c => { const t = fold(searchText(c)); return words.every(w => t.includes(w)); }); }
            filters.forEach(f => { const v = st.filters[f.id]; if (f.test) list = list.filter(c => f.test(c, v)); });
            return SC.sortConcerts(list, st.sort || 'recent');
        }
        C.listIds = () => filtered().map(i => i.id);
        const tourColor = new Map([...tours.keys()].map((k, i) => [k, COLORS[i % COLORS.length]]));
        const summary = list => { const ys = list.map(c => SC.dayOf(c.data?.date)?.y || Number(c.year)).filter(Boolean), tn = new Set(list.map(tourKey).filter(Boolean)).size;
            return [plural(list.length, 'soir'), ys.length && [Math.min(...ys), Math.max(...ys)].filter((v, i, a) => a.indexOf(v) === i).join(' – '), tn && plural(tn, 'tournée')].filter(Boolean).join(' · '); };
        let token = 0;
        function draw() {
            const list = filtered(), my = ++token;
            bar.setCount(`${summary(list)}${list.length !== all.length ? ` (sur ${all.length})` : ''}`);
            if (!all.length) { out.innerHTML = A().emptyState({icon: '🎤', text: 'Aucun concert ni spectacle pour l’instant', hint: 'Un soir = une fiche : la date, le lieu, la setlist (titres, rappels, reprises, invités), qui était sur scène et dans la salle.', action: {label: '＋ Nouveau concert ou représentation', attrs: 'data-ar-cmd="new"'}}); return; }
            if (!list.length) { out.innerHTML = A().emptyState({icon: '🔎', text: 'Rien ne correspond', hint: 'Change les mots cherchés ou retire un filtre.'}); return; }
            if (view === 'list' || view === 'cards') return drawList(list);
            if (view === 'frise') return drawFrise(list);
            if (view === 'map') { out.innerHTML = (UI().spinner ? UI().spinner('Carte des lieux…') : '<p class="muted">Carte des lieux…</p>');
                SC.mapHtml(list, {height: 500, route: (bar.state.filters.tour || []).length === 1}).then(r => { if (my !== token || !out.isConnected) return; out.innerHTML = `<div class="sc-mapwrap">${r.html}</div>${placeList(list)}`; SC.mapAfter(out, r.pts, r.max, pickPlace); }); return; }
            const plids = list.map(c => U.place(c.data?.place)?.plid).filter(Boolean);
            if (plids.some(id => !COORDS.has(Number(id)))) { out.innerHTML = UI().spinner ? UI().spinner('Statistiques…') : ''; SC.coords(plids).then(() => { if (my === token && out.isConnected) drawStats(list, my); }); return; }
            return drawStats(list, my);
        }
        const toCity = k => { view = 'list'; writeJ(VKEY, view); paintSeg(); shown = STEP; if (bar.setFilter && filters.some(f => f.id === 'city')) bar.setFilter('city', [k]); else draw(); };
        const pickPlace = plid => { const c = all.find(x => U.place(x.data.place)?.plid === plid); if (c) toCity(fold(SC.cityOf(c))); };
        const placeList = list => { const m = new Map(); list.forEach(c => { const t = SC.cityOf(c) || '?'; m.set(t, (m.get(t) || 0) + 1); });
            return `<div class="sc-places">${[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([t, n]) => `<button type="button" class="ar-ochip is-link" data-sc-city="${esc(fold(t))}"><i>📍</i>${esc(t)} <small class="ar-g">${n}</small></button>`).join('')}</div>`; };
        function drawList(list) {
            const page = list.slice(0, shown);
            if (view === 'cards') {
                const L = ART.layout(store, 'concert', 'vignettes'), lines = L.fields.filter(f => f.on && f.type !== 'photos' && f.key !== 'title');
                // K9 : la vignette unique (UI.cardsHtml) ; champs choisis : 2 en lignes grises, la suite en pastilles
                out.innerHTML = window.LCNDA_UI.cardsHtml(page.map(it => { const ctx = ART.ctx(store, it), t = lines.map(f => ART.text(ctx, it, f)).filter(Boolean);
                    return {thumb: U.cover(it), name: it.title, open: `data-ar-row-open="${it.id}"`, lines: t.slice(0, 2), badges: t.slice(2, 6).map(x => ({text: x, kind: 'grey'}))}; }));
            } else {
                const L = ART.layout(store, 'concert', 'liste'), cols = L.fields.filter(f => f.on);
                out.innerHTML = `<div class="ar-scroll"><table class="ar-t ar-list sc-list"><thead><tr>${cols.map(f => `<th>${esc(f.type === 'photos' ? '' : (f.short || f.label))}</th>`).join('')}</tr></thead><tbody>${page.map(it => { const ctx = ART.ctx(store, it);
                    return `<tr data-ar-row-open="${it.id}" class="is-click" tabindex="0">${cols.map(f => `<td class="c-${esc(f.type)}">${f.key === 'date' ? esc(SC.dayLabel(SC.dayOf(it.data.date), 'short') || it.data.date || '') : f.key === 'tour' && tourKey(it) ? `<span class="sc-dot" style="background:${tourColor.get(tourKey(it))}"></span>${esc(U.refTitle(it.data.tour))}` : ART.listCell(ctx, it, f)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
            }
            if (list.length > shown) out.appendChild(UI().moreButton({remaining: list.length - shown, step: STEP, onClick: () => { shown += STEP; draw(); }}));
        }
        function drawFrise(list) {
            const by = new Map(); SC.sortConcerts(list, 'old').forEach(c => { const y = SC.dayOf(c.data?.date)?.y || Number(c.year) || 0; if (!by.has(y)) by.set(y, []); by.get(y).push(c); });
            const max = Math.max(1, ...[...by.values()].map(l => l.length));
            const legend = [...tours.values()].filter(t => list.some(c => tourKey(c) === t.k)).map(t => `<span class="sc-leg"><span class="sc-dot" style="background:${tourColor.get(t.k)}"></span>${esc(t.title)}</span>`).join('');
            out.innerHTML = `${legend ? `<div class="sc-legend">${legend}<span class="sc-leg"><span class="sc-dot" style="background:#bbb"></span>hors tournée</span></div>` : ''}<div class="sc-frise">${[...by.entries()].map(([y, l]) => `<div class="sc-fy"><div class="sc-fyh"><b>${y || 'Sans date'}</b><small class="ar-g">${esc(plural(l.length, 'soir'))}</small><span class="sc-fbar" style="width:${Math.round(l.length / max * 100)}%"></span></div><div class="sc-fdots">${l.map(c => { const col = tourColor.get(tourKey(c)) || '#bbb', d = SC.dayOf(c.data?.date);
                return `<button type="button" class="sc-fdot" data-ar-open="${c.id}" style="--c:${col}" title="${esc([SC.dayLabel(d) || c.data.date, SC.cityOf(c), c.data.venue, U.refTitle(c.data.tour)].filter(Boolean).join(' · '))}"><span>${esc(d?.d ? `${d.d}/${d.m}` : d?.m ? SC.dayLabel(d, 'short').split(' ')[0] : '•')}</span><small>${esc(SC.cityOf(c).slice(0, 18))}</small></button>`; }).join('')}</div></div>`).join('')}</div>`;
        }
        /* — 📊 les statistiques — */
        function drawStats(list, my) {
            const st = SC.playStats(store, list), top = [...st.values()].sort((a, b) => b.n - a.n || String(a.title).localeCompare(String(b.title), 'fr'));
            const withSl = list.filter(c => SC.rowsOf(c).length), gWords = (() => { const ks = new Set(list.map(c => c.data.skind || 'concert')); return ks.size === 1 ? SC.genre([...ks][0]) : {item: 'titre', items: 'titres'}; })();
            const dateCell = x => x ? `<button type="button" class="ar-linkbtn u" data-ar-open="${x.c.id}" title="${esc(x.c.title)}">${esc(SC.dayLabel(SC.dayOf(x.c.data.date), 'num') || x.c.year || '?')}</button>` : '';
            const shownTop = top.slice(0, S2.more ? 60 : 10);
            const blk = (cls, title, bodyH, headX = '') => `<section class="ar-blk sc-blk ${cls}"><div class="ar-bh"><b>${title}</b><span class="spacer"></span>${headX}</div><div class="ar-bb">${bodyH}</div></section>`;
            const bTop = blk('w-4', `🔝 ${esc(SC.cap(gWords.items))} les plus joués`, top.length ? `<div class="ar-scroll"><table class="ar-t sc-top"><thead><tr><th>${esc(SC.cap(gWords.item))}</th><th>Fois</th><th>1re</th><th>Dernière</th></tr></thead><tbody>${shownTop.map(x => `<tr><td>${x.ref?.iid ? U.refChip(x.ref, '🎵') : esc(x.title)}${x.cover ? ' <small class="ar-g">(reprise)</small>' : ''}</td><td><b>${x.n}</b></td><td>${dateCell(x.first)}</td><td>${dateCell(x.last)}</td></tr>`).join('')}</tbody></table></div>${top.length > 10 ? `<button type="button" class="ar-linkbtn u" data-sc-more>${S2.more ? 'Moins ↑' : `Voir les ${Math.min(50, top.length - 10)} suivants ↓`}</button>` : ''}` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📅</span><span class="empty-line-text">Aucune setlist notée sur ces soirs.</span></p>', `<small class="ar-g">sur ${esc(plural(withSl.length, 'soir'))}</small>`);
            // soirs par année / pays / ville / salle
            const countBy = fn => { const m = new Map(); list.forEach(c => { const k = fn(c); if (!k) return; m.set(k, (m.get(k) || 0) + 1); }); return m; };
            const years = countBy(c => SC.dayOf(c.data?.date)?.y || Number(c.year) || 0), byCity = countBy(c => SC.cityOf(c)), byVenue = countBy(c => [c.data.venue, SC.cityOf(c)].filter(Boolean).join(', ') && c.data.venue ? `${c.data.venue}${SC.cityOf(c) ? `, ${SC.cityOf(c)}` : ''}` : '');
            const byCountry = countBy(c => { const p = U.place(c.data?.place); const co = p?.plid ? COORDS.get(p.plid) : null; return co?.country || ''; });
            let chart = '';
            if (S2.tab === 'year') { const ys = [...years.keys()].filter(Boolean).sort((a, b) => a - b); if (ys.length) { const y0 = ys[0], y1 = ys[ys.length - 1], mx = Math.max(...years.values()), span = [];
                for (let y = y0; y <= y1 && span.length < 120; y++) span.push(y);
                const best = ys.reduce((a, b) => (years.get(b) > years.get(a) ? b : a), ys[0]);
                chart = `<div class="sc-strip" role="img" aria-label="Soirs par année">${span.map(y => `<i style="height:${Math.max(2, Math.round((years.get(y) || 0) / mx * 100))}%" title="${y} : ${esc(plural(years.get(y) || 0, 'soir'))}" class="${years.get(y) ? '' : 'is-zero'}"></i>`).join('')}</div><div class="sc-axis"><span>${y0}</span><span>${best} · ${years.get(best)}</span><span>${y1}</span></div>`; } }
            else { const m = {country: byCountry, city: byCity, venue: byVenue}[S2.tab], l = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), mx = Math.max(1, ...l.map(x => x[1]));
                chart = l.length ? `<div class="sc-hbars">${l.map(([k, n]) => `<div class="sc-hb"><span>${esc(k)}</span><i style="width:${Math.round(n / mx * 100)}%"></i><b>${n}</b></div>`).join('')}</div>` : `<p class="muted">${S2.tab === 'country' ? 'Les pays viennent des lieux de ta base (ouvre la carte une fois).' : 'Rien à compter.'}</p>`; }
            const durs = list.map(SC.durMin).filter(v => v != null), avgD = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
            const perEve = withSl.length ? (withSl.reduce((a, c) => a + SC.rowsOf(c).filter(SC.isSong).length, 0) / withSl.length) : null;
            const bestCity = [...byCity.entries()].sort((a, b) => b[1] - a[1])[0], spect = list.reduce((a, c) => a + num(c.data.audience), 0);
            const bYear = blk('w-4', '📅 Soirs par année', `${chart}<div class="ui-filters sc-tabs" role="group">${[['year', 'Années', years.size], ['country', 'Pays', byCountry.size], ['city', 'Villes', byCity.size], ['venue', 'Salles', byVenue.size]].map(([k, l, n]) => `<button type="button" class="${S2.tab === k ? 'is-active' : ''}" data-sc-tab="${k}">${l}${k === 'year' ? '' : ` ${n}`}</button>`).join('')}</div>
                <dl class="ar-dl ar-dl-s sc-dl">${avgD != null ? `<dt>Durée moyenne</dt><dd>${esc(SC.hm(avgD))}</dd>` : ''}${perEve != null ? `<dt>${esc(SC.cap(gWords.items))} par soir</dt><dd>${esc(perEve.toLocaleString('fr-FR', {maximumFractionDigits: 1}))} en moyenne</dd>` : ''}${bestCity ? `<dt>Ville la plus visitée</dt><dd>${esc(bestCity[0])} (${esc(plural(bestCity[1], 'fois', 'fois'))})</dd>` : ''}${spect ? `<dt>Spectateurs</dt><dd>${esc(spect.toLocaleString('fr-FR'))} en tout</dd>` : ''}</dl>`);
            const bMap = blk('w-4', '🗺 Carte des lieux', `<div data-sc-statmap>${UI().spinner ? UI().spinner('Carte…') : ''}</div>`);
            // setlist type d'une tournée
            const tourItems = store.of('tour'), tourBest = (() => { const m = new Map(); list.forEach(c => { const r = U.ref(c.data?.tour); if (r?.iid) m.set(r.iid, (m.get(r.iid) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; })();
            const tId = S2.tour && store.get(S2.tour) ? S2.tour : tourBest, tIt = tId ? store.get(tId) : null, tDates = tIt ? SC.tourDates(store, tIt.id) : [];
            const pk = (name, v, art) => P().pickerField({name, hiddenName: false, kind: 'artwork', allowFree: false, allowCreate: false, value: v ? {id: v.id, title: v.title, kind: 'artwork', art_kind: art} : null, filter: {art_kind: art, art_person: C.pid}});
            const bType = blk('w-8', '🚌 Setlist type d’une tournée', tourItems.length ? `<div class="sc-pkline" data-sc-pk="tour">${pk('sc_tour', tIt, 'tour')}</div>${tIt ? `<p class="ar-g">${esc(tIt.title)} · ${esc(plural(tDates.length, 'date'))}</p>${SC.typeHtml(store, tDates)}` : '<p class="muted">Choisis une tournée.</p>'}` : '<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📍</span><span class="empty-line-text">Pas encore de fiche « Tournée » : une tournée regroupe ses dates (carte de l’itinéraire, setlist type). Choisis-la sur la fiche d’un soir (« Tournée » ＋ Créer).</span></p>');
            // jamais joués en public
            const allPlayed = SC.playStats(store), kinds = new Set([...SC.kindsFor('concert'), ...SC.kindsFor('humour')]);
            const never = (store.items || []).filter(it => kinds.has(it.kind) && !allPlayed.has(`i${it.id}`));
            const recorded = never.filter(it => (store.items || []).some(r => r.kind === 'recording' && U.ref(r.data?.work)?.iid === it.id));
            const nl = [...recorded, ...never.filter(x => !recorded.includes(x))];
            const bNever = blk('w-4', '🤫 Jamais joués en public', nl.length ? `<p>${recorded.length ? `${esc(plural(recorded.length, 'morceau enregistré', 'morceaux enregistrés'))} mais jamais sur scène${never.length > recorded.length ? `, et ${esc(plural(never.length - recorded.length, 'autre fiche'))}` : ''} :` : `${esc(plural(never.length, 'fiche'))} jamais dans une setlist :`}</p><div class="ar-chipsrow">${nl.slice(0, 24).map(it => U.refChip({iid: it.id, title: it.title, kind: it.kind})).join('')}${nl.length > 24 ? ` <small class="ar-g">… et ${nl.length - 24} de plus</small>` : ''}</div>` : '<p class="muted">Tout ce qui est dans le catalogue a été joué au moins une fois.</p>');
            // comparer deux soirs
            const wl = withSl.length ? withSl : list, ca = (S2.a && store.get(S2.a)) || SC.sortConcerts(wl, 'old')[0], cb = (S2.b && store.get(S2.b)) || SC.sortConcerts(wl, 'recent')[0];
            const keysOf = c => { const m = new Map(); SC.rowsOf(c || {}).forEach(r => { if (!SC.isSong(r)) return; const k = SC.rowKey(r, idx); if (k && !m.has(k)) m.set(k, r); }); return m; };
            const ka = keysOf(ca), kb = keysOf(cb), both = [...ka.keys()].filter(k => kb.has(k)), onlyA = [...ka.keys()].filter(k => !kb.has(k)), onlyB = [...kb.keys()].filter(k => !ka.has(k));
            const names = (l, m) => l.map(k => esc(U.refTitle(m.get(k).work))).join(' · ') || '<span class="ar-none">—</span>';
            const lab = c => c ? esc([SC.dayLabel(SC.dayOf(c.data.date), 'short'), SC.cityOf(c)].filter(Boolean).join(' · ') || c.title) : '';
            const bCmp = blk('w-12', '⚖️ Comparer deux soirs', `<div class="sc-cmp-pk"><span data-sc-pk="a">${pk('sc_a', ca, 'concert')}</span><span data-sc-pk="b">${pk('sc_b', cb, 'concert')}</span></div>${ca && cb && ca.id !== cb.id ? `<div class="sc-cmp"><div><b>Tous les deux (${both.length})</b><br>${names(both, ka)}</div><div><b class="sc-a">Seulement ${lab(ca)} (${onlyA.length})</b><br>${names(onlyA, ka)}</div><div><b class="sc-b">Seulement ${lab(cb)} (${onlyB.length})</b><br>${names(onlyB, kb)}</div></div>` : '<p class="muted">Choisis deux soirs différents.</p>'}`);
            // rôles du soir (théâtre), chefs et solistes (orchestre), qui monte sur scène
            const roles = new Map(); list.forEach(c => ART.arr(c.data.cast_night).forEach(r => { const k = fold(r.role || '') || '?'; const x = roles.get(k) || {role: r.role || '?', n: 0, subst: 0, who: new Map()}; x.n++; if (r.status === 'remplacant' || r.status === 'doublure') x.subst++; const nm = U.nameOf(r.who); if (nm) x.who.set(nm, (x.who.get(nm) || 0) + 1); roles.set(k, x); }));
            const bRoles = roles.size ? blk('w-6', '🎭 Rôles du soir et remplacements', `<div class="ar-scroll"><table class="ar-t"><thead><tr><th>Rôle</th><th>Représentations</th><th>Remplacements</th><th>Le plus souvent joué par</th></tr></thead><tbody>${[...roles.values()].sort((a, b) => b.n - a.n).slice(0, 20).map(x => `<tr><td>${esc(x.role)}</td><td><b>${x.n}</b></td><td>${x.subst || ''}</td><td>${esc([...x.who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, k]) => `${n} (${k})`).join(' · '))}</td></tr>`).join('')}</tbody></table></div>`) : '';
            const ppl = new Map(); list.forEach(c => { const seen = new Set(); SC.peopleOf(c).forEach(p => { const k = `${p.where === 'chef' ? 'c' : p.where === 'soliste' ? 's' : 'x'}|${p.key}`; if (seen.has(k)) return; seen.add(k); const x = ppl.get(k) || {...p, n: 0}; x.n++; ppl.set(k, x); }); });
            const plist = where => [...ppl.values()].filter(p => where(p)).sort((a, b) => b.n - a.n).slice(0, 8);
            const ctx0 = ART.ctx(store, {});
            const chips = l => l.map(p => `${U.personChip(p.ref, '', ctx0)}<small class="ar-g">${p.n}</small>`).join(' ');
            const chefs = plist(p => p.where === 'chef'), solos = plist(p => p.where === 'soliste'), stage = plist(p => p.where !== 'chef' && p.where !== 'soliste' && p.ref.pid !== C.pid);
            const bOrch = chefs.length || solos.length ? blk('w-6', '🎼 Chefs et solistes les plus fréquents', `${chefs.length ? `<div><small class="ar-g">Chefs :</small> ${chips(chefs)}</div>` : ''}${solos.length ? `<div><small class="ar-g">Solistes :</small> ${chips(solos)}</div>` : ''}`) : '';
            const bStage = stage.length ? blk('w-6', '👥 Le plus souvent sur scène', `<div class="ar-chipsrow">${chips(stage)}</div><small class="ar-g">musiciens, invités, partenaires (nombre de soirs)</small>`) : '';
            out.innerHTML = `<div class="ar-blocks sc-stats">${bTop}${bYear}${bMap}${bType}${bNever}${bRoles}${bOrch}${bStage}${bCmp}</div><p class="ar-note">Tout est calculé sur la liste filtrée (tournée, ville, années, sorte de soirée…). Même outil pour un humoriste (sketches les plus joués), un acteur (représentations par rôle, remplacements), un orchestre (œuvres, chefs et solistes).</p>`;
            SC.mapHtml(list, {height: 300}).then(r => { const el = out.querySelector('[data-sc-statmap]'); if (my !== token || !el) return; el.innerHTML = r.html; SC.mapAfter(el, r.pts, r.max, pickPlace);
});
        }
        out.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.scTab) { C._scStats.tab = b.dataset.scTab; draw(); return; }
            if (b.dataset.scMore !== undefined) { C._scStats.more = !C._scStats.more; draw(); return; }
            if (b.dataset.scCity) toCity(b.dataset.scCity);
        });
        out.addEventListener('picker-change', e => { const host = e.target.closest?.('[data-sc-pk]'); if (!host) return; const id = Number(e.detail?.item?.id) || null; C._scStats[host.dataset.scPk] = id; draw(); });
        out.addEventListener('keydown', e => { const r = e.target.closest('[data-ar-row-open]'); if (r && e.key === 'Enter' && e.target === r) C.open(Number(r.dataset.arRowOpen)); });
        draw();
    }
    SC.paintScene = paintScene;
})();
